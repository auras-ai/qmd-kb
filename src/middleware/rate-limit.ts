import { MiddlewareHandler } from "hono";
import type { Env, AuthContext } from "../lib/types";

type AppEnv = { Bindings: Env; Variables: { auth: AuthContext } };

// In-memory rate limit store (resets on Worker restart, which is fine for Workers)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export const rateLimiter = (): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const auth = c.get("auth") as AuthContext;

    // Only rate limit API key access
    if (auth.type !== "api_key") return next();

    const key = auth.key;
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const storeKey = key.id;

    let entry = rateLimitStore.get(storeKey);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(storeKey, entry);
    }

    entry.count++;

    if (entry.count > key.rate_limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(key.rate_limit));
      c.header("X-RateLimit-Remaining", "0");
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    c.header("X-RateLimit-Limit", String(key.rate_limit));
    c.header(
      "X-RateLimit-Remaining",
      String(key.rate_limit - entry.count)
    );
    return next();
  };
};
