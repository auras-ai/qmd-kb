import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, AuthContext } from "./lib/types";
import health from "./routes/health";
import collections from "./routes/collections";
import documents from "./routes/documents";
import query from "./routes/query";
import apiKeys from "./routes/api-keys";
import { authMiddleware, requireAdmin } from "./middleware/auth";
import { ADMIN_HTML } from "./admin-html";

type AppEnv = { Bindings: Env; Variables: { auth: AuthContext } };

const app = new Hono<AppEnv>();

// CORS
app.use(
  "/api/*",
  cors({
    origin: ["https://qmd.qazar.cloud", "https://auth.qazar.cloud"],
    credentials: true,
  })
);

// Health (no auth)
app.route("/", health);

// API routes
app.route("/api/v1/collections", collections);
app.route("/api/v1/documents", documents);
app.route("/api/v1/query", query);
app.route("/api/v1/api-keys", apiKeys);

// Admin UI
app.get("/admin", authMiddleware(), requireAdmin(), (c) => {
  return c.html(ADMIN_HTML);
});

// Root redirect
app.get("/", (c) => c.redirect("/health"));

export default app;
