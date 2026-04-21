import { Context, MiddlewareHandler } from "hono";
import type { Env, AuthContext, AuthUser, ApiKey } from "../lib/types";

const AUTH_VERIFY_URL = "https://auth.qazar.cloud/api/verify";
const ADMIN_EMAIL = "admin@qazar.cloud";

type Variables = { auth: AuthContext };
type AppEnv = { Bindings: Env; Variables: Variables };

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyApiKey(
  db: D1Database,
  token: string
): Promise<ApiKey | null> {
  const keyHash = await hashKey(token);
  const row = await db
    .prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked = 0")
    .bind(keyHash)
    .first<ApiKey>();
  if (!row) return null;

  // Update usage
  await db
    .prepare(
      "UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = datetime('now') WHERE id = ?"
    )
    .bind(row.id)
    .run();

  return row;
}

async function verifySso(
  cookie: string
): Promise<AuthUser | null> {
  try {
    const resp = await fetch(AUTH_VERIFY_URL, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { email?: string };
    if (!data.email) return null;

    let role: AuthUser["role"] = "viewer";
    if (data.email === ADMIN_EMAIL) role = "admin";

    return { email: data.email, role };
  } catch {
    return null;
  }
}

function isApiRequest(c: Context): boolean {
  const accept = c.req.header("Accept") || "";
  const contentType = c.req.header("Content-Type") || "";
  return (
    accept.includes("application/json") ||
    contentType.includes("application/json") ||
    c.req.path.startsWith("/api/")
  );
}

export const authMiddleware = (): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization") || "";

    // Try Bearer token (API key)
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token.startsWith("qmd_")) {
        const apiKey = await verifyApiKey(c.env.DB, token);
        if (!apiKey) {
          return c.json({ error: "Invalid or revoked API key" }, 401);
        }
        c.set("auth", { type: "api_key", key: apiKey } as AuthContext);
        return next();
      }
    }

    // Try SSO cookie
    const cookie = c.req.header("Cookie") || "";
    if (cookie) {
      const user = await verifySso(cookie);
      if (user) {
        c.set("auth", { type: "sso", user } as AuthContext);
        return next();
      }
    }

    // Not authenticated
    if (isApiRequest(c)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Browser request → redirect to SSO
    const returnUrl = encodeURIComponent(c.req.url);
    return c.redirect(
      `https://auth.qazar.cloud/login?return_to=${returnUrl}`,
      302
    );
  };
};

export const requireRole = (
  ...roles: AuthUser["role"][]
): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const auth = c.get("auth") as AuthContext;

    if (auth.type === "api_key") {
      // API keys can only read/query, not admin/editor ops
      const perms: string[] = JSON.parse(auth.key.permissions);
      const method = c.req.method;
      if (
        roles.includes("admin") ||
        (roles.includes("editor") && !perms.includes("write"))
      ) {
        return c.json({ error: "Insufficient permissions" }, 403);
      }
      return next();
    }

    if (auth.type === "sso") {
      if (!roles.includes(auth.user.role)) {
        // Treat editors as having viewer access too
        if (roles.includes("viewer")) return next();
        return c.json({ error: "Insufficient permissions" }, 403);
      }
      return next();
    }

    return c.json({ error: "Unauthorized" }, 401);
  };
};

export const requireAdmin = (): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const auth = c.get("auth") as AuthContext;

    if (auth.type === "sso" && auth.user.role === "admin") {
      return next();
    }

    return c.json({ error: "Admin access required" }, 403);
  };
};

export { hashKey };
