import { Hono } from "hono";
import type { Env, AuthContext, ApiKey } from "../lib/types";
import { authMiddleware, requireAdmin, hashKey } from "../middleware/auth";

type AppEnv = { Bindings: Env; Variables: { auth: AuthContext } };

const apiKeys = new Hono<AppEnv>();

apiKeys.use("*", authMiddleware());

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `qmd_${key}`;
}

// List API keys (admin only, returns masked keys)
apiKeys.get("/", requireAdmin(), async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, key_prefix, name, permissions, rate_limit, usage_count, last_used_at, created_by, created_at, revoked FROM api_keys ORDER BY created_at DESC"
  ).all<Omit<ApiKey, "key_hash">>();

  return c.json({ api_keys: rows.results });
});

// Create API key (admin only)
apiKeys.post("/", requireAdmin(), async (c) => {
  const body = await c.req.json<{
    name: string;
    permissions?: string[];
    rate_limit?: number;
  }>();

  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  const auth = c.get("auth") as AuthContext;
  const createdBy = auth.type === "sso" ? auth.user.email : "api";

  const rawKey = generateApiKey();
  const keyHash = await hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12); // "qmd_" + first 8 hex chars
  const id = crypto.randomUUID();
  const permissions = JSON.stringify(body.permissions ?? ["read", "query"]);
  const rateLimit = body.rate_limit ?? 100;

  await c.env.DB.prepare(
    `INSERT INTO api_keys (id, key_hash, key_prefix, name, permissions, rate_limit, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, keyHash, keyPrefix, body.name, permissions, rateLimit, createdBy)
    .run();

  return c.json(
    {
      id,
      key: rawKey, // Only returned once at creation
      key_prefix: keyPrefix,
      name: body.name,
      permissions: body.permissions ?? ["read", "query"],
      rate_limit: rateLimit,
    },
    201
  );
});

// Revoke API key (admin only)
apiKeys.delete("/:id", requireAdmin(), async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    "SELECT id FROM api_keys WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "API key not found" }, 404);
  }

  await c.env.DB.prepare("UPDATE api_keys SET revoked = 1 WHERE id = ?")
    .bind(id)
    .run();

  return c.json({ revoked: true });
});

export default apiKeys;
