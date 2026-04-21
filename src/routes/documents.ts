import { Hono } from "hono";
import type { Env, AuthContext, Document } from "../lib/types";
import { authMiddleware, requireRole } from "../middleware/auth";
import { rateLimiter } from "../middleware/rate-limit";

type AppEnv = { Bindings: Env; Variables: { auth: AuthContext } };

const documents = new Hono<AppEnv>();

documents.use("*", authMiddleware());
documents.use("*", rateLimiter());

async function contentHash(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractTitle(content: string, path: string): string {
  const match = content.match(/^#\s+(.+)/m);
  if (match) return match[1].trim();
  // Use filename without extension
  const parts = path.split("/");
  const filename = parts[parts.length - 1];
  return filename.replace(/\.\w+$/, "");
}

// List documents
documents.get("/", async (c) => {
  const collection = c.req.query("collection");
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100);
  const offset = (page - 1) * limit;

  let query = "SELECT id, collection_id, path, title, content_hash, metadata, word_count, created_at, updated_at FROM documents";
  let countQuery = "SELECT COUNT(*) as total FROM documents";
  const params: unknown[] = [];

  if (collection) {
    query += " WHERE collection_id = ?";
    countQuery += " WHERE collection_id = ?";
    params.push(collection);
  }

  query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";

  const countParams = [...params];
  params.push(limit, offset);

  const [rows, countResult] = await Promise.all([
    c.env.DB.prepare(query)
      .bind(...params)
      .all(),
    c.env.DB.prepare(countQuery)
      .bind(...countParams)
      .first<{ total: number }>(),
  ]);

  return c.json({
    documents: rows.results,
    total: countResult?.total ?? 0,
    page,
    limit,
  });
});

// Get document by ID
documents.get("/:id", async (c) => {
  const id = c.req.param("id");
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?")
    .bind(id)
    .first<Document>();

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  return c.json({ document: doc });
});

// Upload document (admin/editor)
documents.post(
  "/",
  requireRole("admin", "editor"),
  async (c) => {
    const body = await c.req.json<{
      collection: string;
      path: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>();

    if (!body.collection || !body.path || !body.content) {
      return c.json(
        { error: "collection, path, and content are required" },
        400
      );
    }

    // Verify collection exists
    const coll = await c.env.DB.prepare(
      "SELECT id FROM collections WHERE id = ? OR name = ?"
    )
      .bind(body.collection, body.collection)
      .first<{ id: string }>();

    if (!coll) {
      return c.json({ error: "Collection not found" }, 404);
    }

    const id = crypto.randomUUID();
    const hash = await contentHash(body.content);
    const title = extractTitle(body.content, body.path);
    const wc = wordCount(body.content);
    const meta = body.metadata ? JSON.stringify(body.metadata) : null;

    await c.env.DB.prepare(
      `INSERT INTO documents (id, collection_id, path, title, content, content_hash, metadata, word_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, coll.id, body.path, title, body.content, hash, meta, wc)
      .run();

    const doc = await c.env.DB.prepare(
      "SELECT * FROM documents WHERE id = ?"
    )
      .bind(id)
      .first<Document>();

    return c.json({ document: doc }, 201);
  }
);

// Update document (admin/editor)
documents.put(
  "/:id",
  requireRole("admin", "editor"),
  async (c) => {
    const id = c.req.param("id");
    const existing = await c.env.DB.prepare(
      "SELECT * FROM documents WHERE id = ?"
    )
      .bind(id)
      .first<Document>();

    if (!existing) {
      return c.json({ error: "Document not found" }, 404);
    }

    const body = await c.req.json<{
      content?: string;
      path?: string;
      metadata?: Record<string, unknown>;
    }>();

    const newContent = body.content ?? existing.content;
    const newPath = body.path ?? existing.path;
    const hash = await contentHash(newContent);
    const title = extractTitle(newContent, newPath);
    const wc = wordCount(newContent);
    const meta = body.metadata
      ? JSON.stringify(body.metadata)
      : existing.metadata;

    await c.env.DB.prepare(
      `UPDATE documents SET path = ?, title = ?, content = ?, content_hash = ?,
       metadata = ?, word_count = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(newPath, title, newContent, hash, meta, wc, id)
      .run();

    const doc = await c.env.DB.prepare(
      "SELECT * FROM documents WHERE id = ?"
    )
      .bind(id)
      .first<Document>();

    return c.json({ document: doc });
  }
);

// Delete document (admin/editor)
documents.delete(
  "/:id",
  requireRole("admin", "editor"),
  async (c) => {
    const id = c.req.param("id");

    const existing = await c.env.DB.prepare(
      "SELECT id FROM documents WHERE id = ?"
    )
      .bind(id)
      .first();

    if (!existing) {
      return c.json({ error: "Document not found" }, 404);
    }

    await c.env.DB.prepare("DELETE FROM documents WHERE id = ?")
      .bind(id)
      .run();

    return c.json({ deleted: true });
  }
);

export default documents;
