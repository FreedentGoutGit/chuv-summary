// CIM-10 client — local CSV search + LIRMM BioPortal API for descriptions (via Cloudflare proxy).

const CSV_PATH = './media/CIM-10.csv';

let _lirmmKey  = '';
let _proxyUrl  = '';
let _csvData   = null;   // Array<{ uri, code, label, labelNorm, synsNorm }>
let _csvLoading = null;  // Promise while loading

export function init(lirmmKey, proxyUrl) {
  _lirmmKey = lirmmKey || '';
  _proxyUrl = proxyUrl || '';
  // Start loading CSV immediately in the background
  _ensureCSV().catch(() => {});
}

export function isConfigured() {
  return !!(_lirmmKey && _proxyUrl);
}

export function isSearchReady() {
  return _csvData !== null;
}

/**
 * Search CIM-10 CSV for entries matching query (code prefix or keyword).
 * Works without isConfigured() — only the CSV is needed.
 * @returns {Promise<Array<{ uri, code, label }>>}  up to 10 results
 */
export async function search(query) {
  await _ensureCSV();
  if (!query || query.trim().length < 2) return [];

  const q      = _norm(query.trim());
  const tokens = q.split(/\s+/).filter(Boolean);
  const exact  = [];
  const prefix = [];
  const text   = [];

  for (const entry of _csvData) {
    const codeNorm = _norm(entry.code);

    if (codeNorm === q) {
      exact.push(entry);
    } else if (codeNorm.startsWith(q)) {
      prefix.push(entry);
    } else if (text.length < 50) {
      const combined = entry.labelNorm + ' ' + entry.synsNorm;
      if (tokens.every(t => combined.includes(t))) text.push(entry);
    }
  }

  return [...exact, ...prefix, ...text]
    .slice(0, 10)
    .map(({ uri, code, label }) => ({ uri, code, label }));
}

/**
 * Fetch full description for a CIM-10 URI via the Cloudflare Worker proxy.
 * @param {string} uri  e.g. "http://chu-rouen.fr/cismef/CIM-10#F43.22"
 * @returns {Promise<{ title, description, inclusions, code, version }|null>}
 */
export async function lookup(uri) {
  if (!isConfigured()) return null;
  try {
    const url = `${_proxyUrl.replace(/\/$/, '')}/?uri=${encodeURIComponent(uri)}`;
    const res = await fetch(url, {
      headers: { 'X-LIRMM-API-Key': _lirmmKey },
    });
    const data = await res.json();
    if (data.log?.length) {
      console.groupCollapsed(`[CIM-10] worker log for « ${uri.split('#')[1]} »`);
      data.log.forEach(line => console.log(line));
      console.groupEnd();
    }
    if (!data.success) {
      console.warn('[CIM-10] lookup error:', data.error);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[CIM-10] fetch failed:', err.message);
    return null;
  }
}

// ── Internals ─────────────────────────────────────────────

async function _ensureCSV() {
  if (_csvData) return;
  if (_csvLoading) return _csvLoading;
  _csvLoading = _loadCSV().then(() => { _csvLoading = null; });
  return _csvLoading;
}

async function _loadCSV() {
  const res  = await fetch(CSV_PATH);
  const text = await res.text();
  const lines = text.split('\n');
  const data  = [];

  for (let i = 1; i < lines.length; i++) { // skip header row
    const line = lines[i].trim();
    if (!line) continue;
    const fields = _parseCSVLine(line);
    const uri   = fields[0]?.trim();
    const label = fields[1]?.trim();
    const syns  = fields[2]?.trim() || '';
    if (!uri || !label) continue;
    const code = uri.split('#')[1] || '';
    data.push({ uri, code, label, labelNorm: _norm(label), synsNorm: _norm(syns) });
  }

  _csvData = data;
}

/** Minimal CSV parser — handles quoted fields containing commas and escaped quotes (""). */
function _parseCSVLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      fields.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function _norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
