export interface Env {
  DB: D1Database;
  OLLAMA_URL: string;
  OLLAMA_AUTH_TOKEN: string;
  VISION_MODEL: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  collection_id: string;
  path: string;
  title: string | null;
  content: string;
  content_hash: string;
  metadata: string | null;
  word_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  permissions: string;
  rate_limit: number;
  usage_count: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  revoked: number;
}

export interface AuthUser {
  email: string;
  role: "admin" | "editor" | "viewer";
}

export interface QueryRequest {
  query: string;
  collection?: string;
  mode?: "hybrid" | "bm25" | "semantic";
  limit?: number;
  rerank?: boolean;
}

export interface QueryResult {
  id: string;
  path: string;
  score: number;
  snippet: string;
  collection: string;
}

export interface QueryResponse {
  results: QueryResult[];
  query_expansion?: string;
  total_results: number;
}

export type AuthContext =
  | { type: "sso"; user: AuthUser }
  | { type: "api_key"; key: ApiKey };
