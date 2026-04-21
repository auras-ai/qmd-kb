# QMD Knowledge DB — Build Task

## What this is
An API service at **qmd.qazar.cloud** that stores documentation as a searchable knowledge base. External AI agents (Claude, ChatGPT, etc.) can query it via HTTP API. Protected with QAZAR Auth SSO.

## Architecture
- **Cloudflare Worker** (Hono + TypeScript) — the API
- **D1 Database** — stores documents, collections, metadata
- **QMD CLI** (`qmd` v2.1.0, installed globally) — handles BM25 + vector search + LLM re-ranking
- **Ollama** at `https://ollama.qazar.cloud` (Basic Auth: `ollama:YOUR_OLLAMA_TOKEN`) — Gemma4:e2b for query expansion and re-ranking
- **QAZAR Auth SSO** at `https://auth.qazar.cloud` — authentication

## QMD CLI Reference
QMD is a local search engine. Key commands:
```
qmd collection add /path/to/docs --name mydocs
qmd embed                    # Generate vector embeddings
qmd search "query"           # BM25 full-text search
qmd vsearch "query"          # Vector semantic search
qmd query "query"            # Hybrid search + LLM reranking (best quality)
qmd get "path/file.md"       # Retrieve a document
qmd status                   # Index health
```

QMD stores its index at `~/.cache/qmd/index.sqlite` and uses local GGUF models for embeddings, reranking, and query expansion.

## API Design

### Authentication
All endpoints (except `/health` and `/api/v1/agent/query` with API key) require QAZAR Auth SSO.
For programmatic/agent access, support Bearer token auth via a separate API key mechanism:
- Admin generates API keys via the admin UI
- API keys are stored in D1 with permissions and rate limits
- Agents use `Authorization: Bearer qmd_xxx` header

### Endpoints

#### Documents
- `POST /api/v1/documents` — Upload a document (markdown). Body: `{ collection, path, content, metadata? }`. Auth: admin/editor
- `PUT /api/v1/documents/:id` — Update a document. Auth: admin/editor
- `DELETE /api/v1/documents/:id` — Delete a document. Auth: admin/editor
- `GET /api/v1/documents/:id` — Get a document by ID. Auth: any authenticated
- `GET /api/v1/documents` — List documents with pagination + filter by collection. Auth: any authenticated

#### Collections
- `POST /api/v1/collections` — Create a collection. Body: `{ name, description }`. Auth: admin
- `GET /api/v1/collections` — List collections. Auth: any authenticated
- `DELETE /api/v1/collections/:id` — Delete collection + all docs. Auth: admin

#### Search & Query
- `POST /api/v1/query` — Main search endpoint. Body: `{ query, collection?, mode?: "hybrid"|"bm25"|"semantic", limit?, rerank? }`. Auth: any authenticated or API key
  - Returns: `{ results: [{ id, path, score, snippet, collection }], query_expansion?, total_results }`
  - Uses QMD `query` command for hybrid search (BM25 + vector + LLM reranking)
  - Falls back to QMD `search` for BM25-only mode
  - Falls back to QMD `vsearch` for semantic-only mode

#### API Keys (admin only)
- `POST /api/v1/api-keys` — Generate a new API key. Body: `{ name, permissions: ["read","query"], rate_limit? }`. Auth: admin
- `GET /api/v1/api-keys` — List API keys (returns masked keys). Auth: admin
- `DELETE /api/v1/api-keys/:id` — Revoke an API key. Auth: admin

#### Health
- `GET /health` — Returns `{ status: "ok", qmd_status, doc_count, collection_count }`

#### Admin UI
- `GET /admin` — SPA dashboard for managing documents, collections, API keys
- Protected with QAZAR Auth SSO, only `admin@qazar.cloud` allowed

### How Search Works
1. Document is stored in D1 (metadata) and written to a temp directory for QMD indexing
2. When a query comes in:
   - The API calls `qmd query "search term" --json` as a subprocess
   - QMD runs its hybrid pipeline (expansion → BM25 + vector → RRF fusion → LLM reranking)
   - The API parses the JSON output and returns structured results
3. For agent queries, the response includes relevant snippets with scores

### D1 Schema
```sql
-- Collections
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Documents
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  metadata TEXT, -- JSON
  word_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(collection_id, path)
);
CREATE INDEX idx_docs_collection ON documents(collection_id);
CREATE INDEX idx_docs_path ON documents(path);

-- API Keys
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL, -- first 8 chars for identification
  name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '["read","query"]', -- JSON array
  rate_limit INTEGER DEFAULT 100, -- requests per hour
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked INTEGER NOT NULL DEFAULT 0
);
```

### QMD Integration Strategy
Since QMD is a CLI tool, the Worker calls it as a subprocess via a sidecar or sync mechanism:

**Option chosen: Sync Worker → Local QMD Daemon**
1. Documents are stored in D1
2. A sync script (`scripts/sync-qmd.sh`) exports documents from D1 to a local directory, then runs `qmd collection add`, `qmd embed`
3. For queries, the Worker calls the local QMD daemon via HTTP (`qmd mcp --http --daemon` on localhost:8181)
4. The QMD daemon is exposed internally (not public) and the Worker proxies query requests to it

**Alternative: Shell out from Worker**
Since Workers can't run subprocesses, use a lightweight Node.js proxy service that:
- Receives query requests from the Worker
- Runs `qmd query "..." --json` as subprocess
- Returns the JSON result

For the initial build, use the proxy approach:
- Create `scripts/qmd-proxy.mjs` — HTTP server that wraps `qmd query` calls
- Run it on the server alongside the Worker (or as a separate process)
- The Worker calls `http://localhost:8182/query` to get search results

### File Structure
```
qmd-kb/
├── wrangler.jsonc          # Cloudflare Worker config (EXISTS)
├── tsconfig.json           # TypeScript config (EXISTS)
├── package.json            # Dependencies (EXISTS)
├── src/
│   ├── index.ts            # Main Hono app + routes
│   ├── middleware/
│   │   ├── auth.ts         # QAZAR Auth SSO + API key validation
│   │   └── rate-limit.ts   # Simple in-memory rate limiter for API keys
│   ├── routes/
│   │   ├── documents.ts    # CRUD for documents
│   │   ├── collections.ts  # CRUD for collections
│   │   ├── query.ts        # Search/query endpoint
│   │   ├── api-keys.ts     # API key management
│   │   └── health.ts       # Health check
│   ├── lib/
│   │   ├── qmd-client.ts   # Client to call the QMD proxy/daemon
│   │   └── types.ts        # TypeScript types
│   └── db/
│       └── migrations/
│           └── 001_initial.sql
├── scripts/
│   ├── qmd-proxy.mjs       # Local HTTP proxy for QMD CLI
│   └── sync-qmd.sh         # Export D1 docs → QMD collection
├── admin/
│   └── index.html          # Simple admin SPA (or embedded in Worker)
└── README.md
```

## QAZAR Auth SSO Integration
Same pattern as QuickShares:
- Middleware calls `https://auth.qazar.cloud/api/verify` with forwarded cookies
- Browser requests → 302 redirect to SSO login
- API requests → 401 JSON
- Admin routes check `email === "admin@qazar.cloud"`

## Secrets to Set
```bash
CLOUDFLARE_API_TOKEN=YOUR_CF_API_TOKEN npx wrangler secret put OLLAMA_AUTH_TOKEN
# Value: YOUR_OLLAMA_TOKEN
```

## Build & Deploy
```bash
cd /home/ubuntu/projects/qmd-kb
npm install
CLOUDFLARE_API_TOKEN=... npx wrangler deploy
```

## Existing Config
- wrangler.jsonc: D1 database `qmd-kb-db` (ID: `ac7197ee-bf22-4be5-b8e4-51f37395c29c`), route `qmd.qazar.cloud`
- DNS already configured
- Ollama at `https://ollama.qazar.cloud` with Basic Auth

## What to implement
1. Create all source files in `src/` as described above
2. Create the D1 migration SQL
3. Create the QMD proxy script
4. Create the sync script
5. Create a minimal admin HTML page (can be inline in the Worker or a separate file)
6. Set up proper types
7. Run `npm install` and `npx wrangler deploy` to test
8. Show the final summary of all files and what they do
