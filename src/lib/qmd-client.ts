const QMD_PROXY_URL = "http://localhost:8182";

export interface QmdSearchResult {
  path: string;
  score: number;
  snippet: string;
  title?: string;
}

export interface QmdQueryResponse {
  results: QmdSearchResult[];
  query_expansion?: string;
}

export interface QmdStatusResponse {
  status: string;
  document_count: number;
  collections: string[];
}

export async function qmdQuery(
  query: string,
  mode: "hybrid" | "bm25" | "semantic" = "hybrid",
  collection?: string,
  limit?: number
): Promise<QmdQueryResponse> {
  const params = new URLSearchParams({ query, mode });
  if (collection) params.set("collection", collection);
  if (limit) params.set("limit", String(limit));

  const resp = await fetch(`${QMD_PROXY_URL}/query?${params}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`QMD proxy error: ${resp.status} ${text}`);
  }
  return resp.json();
}

export async function qmdStatus(): Promise<QmdStatusResponse> {
  const resp = await fetch(`${QMD_PROXY_URL}/status`);
  if (!resp.ok) {
    return { status: "unavailable", document_count: 0, collections: [] };
  }
  return resp.json();
}

export async function qmdSync(
  collection: string,
  docsDir: string
): Promise<{ success: boolean; message: string }> {
  const resp = await fetch(`${QMD_PROXY_URL}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collection, docs_dir: docsDir }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    return { success: false, message: text };
  }
  return resp.json();
}
