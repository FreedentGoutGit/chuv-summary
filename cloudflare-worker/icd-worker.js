/**
 * Cloudflare Worker — CIM-10 / LIRMM BioPortal API proxy
 *
 * Bypasses CORS on bioportal.lirmm.fr. Keeps your LIRMM API key server-side.
 *
 * Deploy:
 *   1. Go to cloudflare.com → Workers & Pages → Create Worker
 *   2. Paste this entire file and click Deploy
 *   3. Copy the worker URL and paste it in Settings → "URL proxy CIM-10"
 *
 * Request format (from browser):
 *   GET https://your-worker.workers.dev/?uri=http%3A%2F%2Fchu-rouen.fr%2Fcismef%2FCIM-10%23F43.22
 *   Headers:
 *     X-LIRMM-API-Key: your_lirmm_api_key
 *
 * Response:
 *   { success: true, title: "...", description: "...", inclusions: [...], code: "F43.22", version: "CIM-10" }
 *   { success: false, error: "...", log: [...] }
 */

const LIRMM_BASE = 'https://data.bioportal.lirmm.fr';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'X-LIRMM-API-Key',
  'Content-Type': 'application/json',
};

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'GET') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  const apiKey = request.headers.get('X-LIRMM-API-Key');
  const uri    = new URL(request.url).searchParams.get('uri')?.trim();

  if (!apiKey) return json({ success: false, error: 'Missing X-LIRMM-API-Key header' });
  if (!uri)    return json({ success: false, error: 'Missing ?uri= parameter' });

  const log = [];
  try {
    const classUrl = `${LIRMM_BASE}/ontologies/CIM-10/classes/${encodeURIComponent(uri)}?apikey=${apiKey}`;
    log.push(`[1] GET ${classUrl.replace(apiKey, '***')}`);

    let res;
    try { res = await fetch(classUrl, { headers: { Accept: 'application/json' } }); }
    catch (e) { throw new Error(`Fetch failed: ${e.message}`); }
    log.push(`[2] → HTTP ${res.status}`);

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch {}
      log.push(`[3] error body: ${body}`);
      return json({ success: false, error: `LIRMM API: HTTP ${res.status}`, log });
    }

    let data;
    try { data = await res.json(); }
    catch (e) { throw new Error(`JSON parse error: ${e.message}`); }
    log.push(`[3] raw: ${JSON.stringify(data)}`);

    const code = uri.split('#')[1] || uri;

    const title = data.prefLabel || data['skos:prefLabel'] || code;

    const rawDef = data.definition ?? data['skos:definition'];
    const description = Array.isArray(rawDef) ? rawDef[0] : (rawDef || '');

    const rawSyns = data.synonym ?? data['skos:altLabel'] ?? [];
    const inclusions = (Array.isArray(rawSyns) ? rawSyns : [rawSyns]).filter(Boolean);

    return json({ success: true, title, description, inclusions, code, version: 'CIM-10', log });

  } catch (err) {
    log.push(`[ERR] ${err.message}`);
    return json({ success: false, error: err.message, log });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
