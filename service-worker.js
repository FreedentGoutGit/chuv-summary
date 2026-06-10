// service-worker.js — PWA offline caching

const CACHE_NAME = 'medreport-v6';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './frontend/css/base.css',
  './frontend/css/layout.css',
  './frontend/css/components.css',
  './frontend/css/form.css',
  './frontend/css/editor.css',
  './frontend/css/modal.css',
  './frontend/js/app.js',
  './frontend/js/form-renderer.js',
  './frontend/js/file-handler.js',
  './frontend/js/editor.js',
  './frontend/js/settings.js',
  './api/llm-client.js',
  './api/icd-client.js',
  './api/prompt-builder.js',
];

// Domains that must never be cached (API calls with secrets)
const NO_CACHE_PATTERNS = [
  'api.openai.com',
  'api.anthropic.com',
  'api.mistral.ai',
  'icdaccessmanagement.who.int',
  'id.who.int',
];

// ── Install: precache app shell ─────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ──────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache API calls
  if (NO_CACHE_PATTERNS.some(p => url.hostname.includes(p))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for template JSON files and the CIM-10 CSV
  if (
    (url.pathname.includes('/templates/') && url.pathname.endsWith('.json')) ||
    (url.pathname.includes('/media/')     && url.pathname.endsWith('.csv'))
  ) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (app shell)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
