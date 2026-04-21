import { Hono } from "hono";
import type { Env, AuthContext, QueryRequest, QueryResponse } from "../lib/types";
import { authMiddleware } from "../middleware/auth";
import { rateLimiter } from "../middleware/rate-limit";
import { qmdQuery } from "../lib/qmd-client";

type AppEnv = { Bindings: Env; Variables: { auth: AuthContext } };

const query = new Hono<AppEnv>();

query.use("*", authMiddleware());
query.use("*", rateLimiter());

query.post("/", async (c) => {
  const body = await c.req.json<QueryRequest>();

  if (!body.query || typeof body.query !== "string") {
    return c.json({ error: "query string is required" }, 400);
  }

  const mode = body.mode ?? "hybrid";
  const limit = Math.min(body.limit ?? 10, 50);

  try {
    const qmdResult = await qmdQuery(body.query, mode, body.collection, limit);

    // Map QMD results to our response format, enriching with D1 data
    const results = [];
    for (const r of qmdResult.results.slice(0, limit)) {
      // Try to find the document in D1 by path
      const doc = await c.env.DB.prepare(
        "SELECT d.id, d.path, d.collection_id, c.name as collection_name FROM documents d JOIN collections c ON d.collection_id = c.id WHERE d.path = ? LIMIT 1"
      )
        .bind(r.path)
        .first<{ id: string; path: string; collection_id: string; collection_name: string }>();

      results.push({
        id: doc?.id ?? r.path,
        path: r.path,
        score: r.score,
        snippet: r.snippet,
        collection: doc?.collection_name ?? "unknown",
      });
    }

    const response: QueryResponse = {
      results,
      query_expansion: qmdResult.query_expansion,
      total_results: results.length,
    };

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";

    // If QMD proxy is down, fall back to basic D1 full-text search
    if (message.includes("QMD proxy error") || message.includes("fetch failed")) {
      const likeQuery = `%${body.query}%`;
      let sql = `SELECT d.id, d.path, d.title, d.collection_id, c.name as collection_name,
                 substr(d.content, 1, 300) as snippet
                 FROM documents d JOIN collections c ON d.collection_id = c.id
                 WHERE d.content LIKE ?`;
      const params: unknown[] = [likeQuery];

      if (body.collection) {
        sql += " AND (c.name = ? OR c.id = ?)";
        params.push(body.collection, body.collection);
      }

      sql += " LIMIT ?";
      params.push(limit);

      const rows = await c.env.DB.prepare(sql)
        .bind(...params)
        .all<{ id: string; path: string; title: string; collection_name: string; snippet: string }>();

      const response: QueryResponse = {
        results: rows.results.map((r) => ({
          id: r.id,
          path: r.path,
          score: 0.5,
          snippet: r.snippet,
          collection: r.collection_name,
        })),
        total_results: rows.results.length,
      };

      return c.json(response);
    }

    return c.json({ error: message }, 500);
  }
});

export default query;
