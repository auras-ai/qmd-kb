export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QMD Knowledge DB - Admin</title>
<style>
  :root { --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3a; --text: #e2e4ea; --muted: #8b8fa3; --accent: #6c8aff; --danger: #ff5c5c; --success: #4ade80; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 1.25rem; font-weight: 600; }
  .header h1 span { color: var(--accent); }
  .nav { display: flex; gap: 0.5rem; }
  .nav button { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 0.4rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
  .nav button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .container { max-width: 1100px; margin: 2rem auto; padding: 0 1.5rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .card h2 { font-size: 1rem; margin-bottom: 1rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
  .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; }
  .stat .value { font-size: 2rem; font-weight: 700; color: var(--accent); }
  .stat .label { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th { text-align: left; padding: 0.6rem; color: var(--muted); border-bottom: 1px solid var(--border); font-weight: 500; font-size: 0.8rem; text-transform: uppercase; }
  td { padding: 0.6rem; border-bottom: 1px solid var(--border); }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; }
  .badge-active { background: rgba(74, 222, 128, 0.15); color: var(--success); }
  .badge-revoked { background: rgba(255, 92, 92, 0.15); color: var(--danger); }
  .btn { padding: 0.4rem 0.8rem; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
  input, textarea, select { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 0.5rem 0.75rem; border-radius: 6px; width: 100%; font-size: 0.9rem; }
  textarea { min-height: 120px; font-family: monospace; }
  .form-group { margin-bottom: 1rem; }
  .form-group label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 0.3rem; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
  .hidden { display: none; }
  .mono { font-family: monospace; font-size: 0.85rem; }
  .key-display { background: var(--bg); padding: 0.75rem; border-radius: 6px; font-family: monospace; word-break: break-all; border: 1px solid var(--success); margin-top: 0.5rem; }
  .toast { position: fixed; bottom: 1.5rem; right: 1.5rem; padding: 0.75rem 1.25rem; border-radius: 8px; font-size: 0.9rem; z-index: 100; animation: fadeIn 0.2s; }
  .toast-success { background: var(--success); color: #000; }
  .toast-error { background: var(--danger); color: #fff; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>
</head>
<body>
<div class="header">
  <h1><span>QMD</span> Knowledge DB</h1>
  <div class="nav">
    <button class="active" onclick="showTab('dashboard')">Dashboard</button>
    <button onclick="showTab('collections')">Collections</button>
    <button onclick="showTab('documents')">Documents</button>
    <button onclick="showTab('apikeys')">API Keys</button>
  </div>
</div>
<div class="container">
  <!-- Dashboard -->
  <div id="tab-dashboard">
    <div class="stats" id="stats"></div>
  </div>
  <!-- Collections -->
  <div id="tab-collections" class="hidden">
    <div class="card">
      <h2>Create Collection</h2>
      <div class="form-row">
        <div class="form-group"><label>Name</label><input id="coll-name" placeholder="my-docs"></div>
        <div class="form-group"><label>Description</label><input id="coll-desc" placeholder="Description..."></div>
      </div>
      <div class="actions"><button class="btn btn-primary" onclick="createCollection()">Create</button></div>
    </div>
    <div class="card"><h2>Collections</h2><table><thead><tr><th>Name</th><th>Description</th><th>Created</th><th></th></tr></thead><tbody id="coll-table"></tbody></table></div>
  </div>
  <!-- Documents -->
  <div id="tab-documents" class="hidden">
    <div class="card">
      <h2>Upload Document</h2>
      <div class="form-row">
        <div class="form-group"><label>Collection</label><select id="doc-coll"></select></div>
        <div class="form-group"><label>Path</label><input id="doc-path" placeholder="docs/guide.md"></div>
      </div>
      <div class="form-group"><label>Content (Markdown)</label><textarea id="doc-content" placeholder="# Title..."></textarea></div>
      <div class="actions"><button class="btn btn-primary" onclick="uploadDoc()">Upload</button></div>
    </div>
    <div class="card"><h2>Documents</h2><table><thead><tr><th>Path</th><th>Title</th><th>Words</th><th>Updated</th><th></th></tr></thead><tbody id="doc-table"></tbody></table></div>
  </div>
  <!-- API Keys -->
  <div id="tab-apikeys" class="hidden">
    <div class="card">
      <h2>Generate API Key</h2>
      <div class="form-row">
        <div class="form-group"><label>Name</label><input id="key-name" placeholder="my-agent"></div>
        <div class="form-group"><label>Rate Limit (req/hour)</label><input id="key-rate" type="number" value="100"></div>
      </div>
      <div class="actions"><button class="btn btn-primary" onclick="createKey()">Generate</button></div>
      <div id="key-result" class="hidden"></div>
    </div>
    <div class="card"><h2>API Keys</h2><table><thead><tr><th>Name</th><th>Prefix</th><th>Usage</th><th>Rate Limit</th><th>Status</th><th></th></tr></thead><tbody id="key-table"></tbody></table></div>
  </div>
</div>
<script>
const API = '/api/v1';
function toast(msg, type='success') { const t = document.createElement('div'); t.className = 'toast toast-'+type; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3000); }
async function api(path, opts={}) { const r = await fetch(API+path, { credentials: 'include', headers: {'Content-Type':'application/json', ...opts.headers}, ...opts }); const d = await r.json(); if (!r.ok) throw new Error(d.error||'Request failed'); return d; }

function showTab(name) {
  document.querySelectorAll('[id^=tab-]').forEach(el => el.classList.add('hidden'));
  document.getElementById('tab-'+name).classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  if (name==='dashboard') loadDashboard();
  if (name==='collections') loadCollections();
  if (name==='documents') loadDocuments();
  if (name==='apikeys') loadKeys();
}

async function loadDashboard() {
  try {
    const h = await fetch('/health').then(r=>r.json());
    document.getElementById('stats').innerHTML =
      '<div class="stat"><div class="value">'+h.doc_count+'</div><div class="label">Documents</div></div>' +
      '<div class="stat"><div class="value">'+h.collection_count+'</div><div class="label">Collections</div></div>' +
      '<div class="stat"><div class="value">'+h.qmd_status+'</div><div class="label">QMD Status</div></div>';
  } catch(e) { toast(e.message, 'error'); }
}

async function loadCollections() {
  const d = await api('/collections');
  document.getElementById('coll-table').innerHTML = d.collections.map(c =>
    '<tr><td><strong>'+c.name+'</strong></td><td>'+( c.description||'-')+'</td><td class="mono">'+c.created_at.slice(0,10)+'</td><td><button class="btn btn-danger btn-sm" onclick="deleteColl(\\''+c.id+'\\')">Delete</button></td></tr>'
  ).join('');
}
async function createCollection() {
  const name = document.getElementById('coll-name').value;
  const desc = document.getElementById('coll-desc').value;
  if (!name) return toast('Name required','error');
  await api('/collections', { method:'POST', body: JSON.stringify({name, description:desc}) });
  toast('Collection created'); loadCollections();
}
async function deleteColl(id) { if (!confirm('Delete collection and all documents?')) return; await api('/collections/'+id, {method:'DELETE'}); toast('Deleted'); loadCollections(); }

async function loadDocuments() {
  const d = await api('/documents');
  document.getElementById('doc-table').innerHTML = d.documents.map(doc =>
    '<tr><td class="mono">'+doc.path+'</td><td>'+(doc.title||'-')+'</td><td>'+( doc.word_count||0)+'</td><td class="mono">'+doc.updated_at.slice(0,10)+'</td><td><button class="btn btn-danger btn-sm" onclick="deleteDoc(\\''+doc.id+'\\')">Delete</button></td></tr>'
  ).join('');
  // Populate collection dropdown
  const colls = await api('/collections');
  document.getElementById('doc-coll').innerHTML = colls.collections.map(c => '<option value="'+c.id+'">'+c.name+'</option>').join('');
}
async function uploadDoc() {
  const collection = document.getElementById('doc-coll').value;
  const path = document.getElementById('doc-path').value;
  const content = document.getElementById('doc-content').value;
  if (!collection||!path||!content) return toast('All fields required','error');
  await api('/documents', { method:'POST', body: JSON.stringify({collection, path, content}) });
  toast('Document uploaded'); loadDocuments();
}
async function deleteDoc(id) { if (!confirm('Delete document?')) return; await api('/documents/'+id, {method:'DELETE'}); toast('Deleted'); loadDocuments(); }

async function loadKeys() {
  const d = await api('/api-keys');
  document.getElementById('key-table').innerHTML = d.api_keys.map(k =>
    '<tr><td>'+k.name+'</td><td class="mono">'+k.key_prefix+'...</td><td>'+k.usage_count+'</td><td>'+k.rate_limit+'/hr</td><td><span class="badge '+(k.revoked?'badge-revoked':'badge-active')+'">'+(k.revoked?'Revoked':'Active')+'</span></td><td>'+(k.revoked?'':'<button class="btn btn-danger btn-sm" onclick="revokeKey(\\''+k.id+'\\')">Revoke</button>')+'</td></tr>'
  ).join('');
}
async function createKey() {
  const name = document.getElementById('key-name').value;
  const rate_limit = parseInt(document.getElementById('key-rate').value);
  if (!name) return toast('Name required','error');
  const d = await api('/api-keys', { method:'POST', body: JSON.stringify({name, rate_limit}) });
  document.getElementById('key-result').classList.remove('hidden');
  document.getElementById('key-result').innerHTML = '<p style="color:var(--success);font-weight:600;">Key created! Copy it now (shown only once):</p><div class="key-display">'+d.key+'</div>';
  toast('API key created'); loadKeys();
}
async function revokeKey(id) { if (!confirm('Revoke this API key?')) return; await api('/api-keys/'+id, {method:'DELETE'}); toast('Revoked'); loadKeys(); }

loadDashboard();
</script>
</body>
</html>`;
