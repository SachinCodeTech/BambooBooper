// ══════════════════════════════════════════════════════════════
// BAMBOO BOOPER — Service Worker v15
// CodeTech · Lead Developer: Sachin Sheth
// ══════════════════════════════════════════════════════════════
//
//  v15 improvements:
//  - Faster install: parallel asset caching with allSettled
//  - Better cache versioning: auto-purge on update
//  - Network-first for HTML (always fresh on network, cached offline)
//  - Cache-first for all static assets (CSS, icons, JS)
//  - CDN stale-while-revalidate
//  - Full reset support via CLEAR_ALL_CACHES message
//
// ══════════════════════════════════════════════════════════════

const CACHE_NAME   = 'bamboo-booper-v15';
const GAME_VERSION = '1.0';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icon-192.png',
  '/icon-192-maskable.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
];

// ── INSTALL ────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW v15] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        Promise.allSettled(
          CORE_ASSETS.map(url =>
            cache.add(url).catch(e => console.warn('[SW v15] Skipped:', url))
          )
        )
      )
      .then(() => {
        console.log('[SW v15] Installed. Activating immediately...');
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW v15] Activating...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('bamboo-booper-') && k !== CACHE_NAME)
          .map(k => { console.log('[SW v15] Purging:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
      .then(() => console.log('[SW v15] Active.'))
  );
});

// ── FETCH ──────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  try {
    const u = new URL(request.url);
    if (!u.protocol.startsWith('http')) return;
  } catch { return; }

  // ── HTML Navigation: network-first, cache fallback ──────────
  // This ensures users always get fresh HTML when online,
  // but the game still loads offline from cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(response => {
          if (response && response.ok) {
            // Cache fresh copy for offline use
            caches.open(CACHE_NAME).then(cache => {
              cache.put('/index.html', response.clone());
              cache.put(request, response.clone());
            });
            return response;
          }
          throw new Error('Bad response');
        })
        .catch(async () => {
          // Offline: serve from cache
          const cached = await caches.match('/index.html');
          if (cached) return cached;
          const offline = await caches.match('/offline.html');
          return offline || emergencyPage();
        })
    );
    return;
  }

  // ── CDN (jsPDF etc): stale-while-revalidate ─────────────────
  if (request.url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const net = fetch(request)
            .then(r => { if (r?.ok) cache.put(request, r.clone()); return r; })
            .catch(() => null);
          return cached || net;
        })
      )
    );
    return;
  }

  // ── Static assets: cache-first ──────────────────────────────
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(r => {
        if (r?.ok && r.type !== 'opaque')
          caches.open(CACHE_NAME).then(c => c.put(request, r.clone()));
        return r;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});

// ── Emergency fallback ─────────────────────────────────────────
function emergencyPage() {
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="theme-color" content="#071a0b">' +
    '<style>*{margin:0;padding:0}body{background:#071a0b;color:#fff;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'min-height:100vh;font-family:system-ui;text-align:center;padding:24px}' +
    'h1{color:#7eed9a;margin:16px 0 8px;font-size:20px}' +
    'p{color:rgba(255,255,255,.7);font-size:14px;margin-bottom:24px}' +
    'button{padding:14px 32px;background:#3dba5e;color:#fff;border:none;' +
    'border-radius:28px;font-size:16px;font-weight:700;cursor:pointer}</style>' +
    '</head><body><div style="font-size:72px">🐼</div>' +
    '<h1>Bamboo Booper</h1>' +
    '<p>Connect to internet once to load the game.<br>Then it works fully offline.</p>' +
    '<button onclick="location.reload()">🔄 Retry</button>' +
    '</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
  );
}

// ── Message handler ────────────────────────────────────────────
self.addEventListener('message', event => {
  // Standard update trigger
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW v15] Activating now.');
    self.skipWaiting();
  }
  // Full cache wipe — called by in-app Reset button
  if (event.data?.type === 'CLEAR_ALL_CACHES') {
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => {
        console.log('[SW v15] All caches cleared by app request.');
        event.ports[0]?.postMessage({ success: true });
      });
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: 'v15', cache: CACHE_NAME });
  }
});
