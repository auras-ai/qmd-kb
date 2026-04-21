import { Hono } from "hono";
import type { Env, AuthContext, Collection } from "../lib/types";
import { authMiddleware, requireAdmin } from "../middleware/auth";
import { rateLimiter } from "../middleware/rate-limit";

type AppEnv = { Bindings: Env; Variables: { auth: AuthContext } };

const collections = new Hono<AppEnv>();

collections.use("*", authMiddleware());
collections.use("*", rateLimiter());

// List collections
collections.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM collections ORDER BY created_at DESC"
  ).all<Collection>();

  return c.json({ collections: rows.results });
});

// Create collection (admin only)
collections.post("/", requireAdmin(), async (c) => {
  const body = await c.req.json<{ name: string; description?: string }>();
  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO collections (id, name, description) VALUES (?, ?, ?)"
  )
    .bind(id, body.name, body.description || null)
    .run();

  const collection = await c.env.DB.prepare(
    "SELECT * FROM collections WHERE id = ?"
  )
    .bind(id)
    .first<Collection>();

  return c.json({ collection }, 201);
});

// Delete collection + all docs (admin only)
collections.delete("/:id", requireAdmin(), async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    "SELECT id FROM collections WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!existing) {
    return c.json({ error: "Collection not found" }, 404);
  }

  // Delete documents first, then collection
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM documents WHERE collection_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM collections WHERE id = ?").bind(id),
  ]);

  return c.json({ deleted: true });
});

export default collections;
