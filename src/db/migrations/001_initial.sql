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
  metadata TEXT,
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
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '["read","query"]',
  rate_limit INTEGER DEFAULT 100,
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked INTEGER NOT NULL DEFAULT 0
);
