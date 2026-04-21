#!/usr/bin/env node

/**
 * QMD Proxy — lightweight HTTP server wrapping the qmd CLI.
 * The Cloudflare Worker calls this on localhost:8182 for search queries.
 *
 * Usage:  node scripts/qmd-proxy.mjs
 * Env:    QMD_PORT (default 8182)
 */

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { URL } from "node:url";

const exec = promisify(execFile);
const PORT = parseInt(process.env.QMD_PORT || "8182", 10);
const QMD_BIN = process.env.QMD_BIN || "qmd";

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function runQmd(args, timeoutMs = 30000) {
  try {
    const { stdout, stderr } = await exec(QMD_BIN, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    throw new Error(`qmd ${args.join(" ")} failed: ${err.message}`);
  }
}

async function handleQuery(url) {
  const query = url.searchParams.get("query");
  const mode = url.searchParams.get("mode") || "hybrid";
  const collection = url.searchParams.get("collection");
  const limit = url.searchParams.get("limit") || "10";

  if (!query) {
    return { status: 400, body: { error: "query parameter required" } };
  }

  let cmd;
  const args = [];

  switch (mode) {
    case "bm25":
      cmd = "search";
      break;
    case "semantic":
      cmd = "vsearch";
      break;
    case "hybrid":
    default:
      cmd = "query";
      break;
  }

  args.push(cmd, query, "--json", "--limit", limit);

  if (collection) {
    args.push("--collection", collection);
  }

  const { stdout } = await runQmd(args);

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // QMD may output line-delimited JSON or a different format
    const lines = stdout
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l));
    parsed = { results: lines };
  }

  // Normalize result format
  const results = (parsed.results || parsed || []).map((r) => ({
    path: r.path || r.file || "",
    score: r.score || r.rank_score || 0,
    snippet: r.snippet || r.content || r.text || "",
    title: r.title || "",
  }));

  return {
    status: 200,
    body: {
      results,
      query_expansion: parsed.query_expansion || null,
    },
  };
}

async function handleStatus() {
  try {
    const { stdout } = await runQmd(["status", "--json"]);
    const parsed = JSON.parse(stdout);
    return {
      status: 200,
      body: {
        status: "ok",
        document_count: parsed.document_count || parsed.documents || 0,
        collections: parsed.collections || [],
      },
    };
  } catch {
    return {
      status: 200,
      body: { status: "unavailable", document_count: 0, collections: [] },
    };
  }
}

async function handleSync(body) {
  const { collection, docs_dir } = body;
  if (!collection || !docs_dir) {
    return {
      status: 400,
      body: { error: "collection and docs_dir required" },
    };
  }

  try {
    await runQmd(
      ["collection", "add", docs_dir, "--name", collection],
      120000
    );
    await runQmd(["embed"], 300000);
    return {
      status: 200,
      body: { success: true, message: `Synced collection: ${collection}` },
    };
  } catch (err) {
    return { status: 500, body: { success: false, message: err.message } };
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Content-Type", "application/json");

  try {
    let result;

    if (url.pathname === "/query" && req.method === "GET") {
      result = await handleQuery(url);
    } else if (url.pathname === "/status" && req.method === "GET") {
      result = await handleStatus();
    } else if (url.pathname === "/sync" && req.method === "POST") {
      const body = await parseBody(req);
      result = await handleSync(body);
    } else {
      result = { status: 404, body: { error: "Not found" } };
    }

    res.writeHead(result.status);
    res.end(JSON.stringify(result.body));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`QMD proxy listening on http://127.0.0.1:${PORT}`);
});
