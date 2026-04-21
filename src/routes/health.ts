import { Hono } from "hono";
import type { Env } from "../lib/types";
import { qmdStatus } from "../lib/qmd-client";

type AppEnv = { Bindings: Env };

const health = new Hono<AppEnv>();

health.get("/health", async (c) => {
  const [qmdStat, docCount, collCount] = await Promise.all([
    qmdStatus().catch(() => ({
      status: "unavailable",
      document_count: 0,
      collections: [],
    })),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM documents")
      .first<{ count: number }>()
      .catch(() => ({ count: 0 })),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM collections")
      .first<{ count: number }>()
      .catch(() => ({ count: 0 })),
  ]);

  return c.json({
    status: "ok",
    qmd_status: qmdStat.status,
    doc_count: docCount?.count ?? 0,
    collection_count: collCount?.count ?? 0,
  });
});

export default health;
