// ══════════════════════════════════════════════════════════════
// BAMBOO BOOPER — Service Worker v14 (Full Offline / App Shell)
// CodeTech · Lead Developer: Sachin Sheth
// ══════════════════════════════════════════════════════════════
//
//  CRITICAL FIX: Chrome data-clear offline startup
//
//  Root cause: When Chrome data is cleared, the SW + all caches
//  are wiped. On next launch the app needs network to re-cache.
//  Solution: SW v14 uses a PRECACHE strategy — all game assets
//  are embedded / self-contained in index.html (single file),
//  so the ONLY asset that must load from network is index.html.
//  Once it loads once, the full game is cached and offline forever.
//
//  Strategy:
//   INSTALL  → cache CORE_ASSETS immediately → skipWaiting()
//   ACTIVATE → delete old caches → clients.claim()
//   FETCH    → navigate: ALWAYS try cache first, NEVER fail silently
//              On cache miss → fetch+cache → serve
//              On network error → emergencyPage (never blank)
//
// ══════════════════════════════════════════════════════════════

const CACHE_NAME   = 'bamboo-booper-v14';
const GAME_VERSION = '1.0';

// Core assets — index.html is THE game (single-file PWA)
// All JS is inlined, so caching index.html = caching the whole game
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
// Cache ALL core assets before the SW activates.
// skipWaiting() ensures this SW takes control immediately —
// no waiting for old tabs to close.
self.addEventListener('install', event => {
  console.log('[SW v14] Installing — caching app shell...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache everything — fail silently per asset so one
        // bad CDN response doesn't abort the whole install
        return Promise.allSettled(
          CORE_ASSETS.map(url =>
            cache.add(url).catch(e => {
              console.warn('[SW v14] Could not cache:', url, e.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW v14] App shell cached. Activating immediately...');
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────
// Purge ALL old bamboo-booper caches.
// clients.claim() makes this SW control existing pages right away —
// critical so the first page load after data-clear is served by this SW.
self.addEventListener('activate', event => {
  console.log('[SW v14] Activating...');

  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('bamboo-booper-') && k !== CACHE_NAME)
          .map(k => {
            console.log('[SW v14] Purging old cache:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
      .then(() => console.log('[SW v14] Active — controlling all clients.'))
  );
});

// ── FETCH ──────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Only handle http/https (skip chrome-extension://, data:, etc.)
  let reqUrl;
  try {
    reqUrl = new URL(request.url);
    if (!reqUrl.protocol.startsWith('http')) return;
  } catch { return; }

  // ── NAVIGATION (page loads) ──────────────────────────────────
  // This is THE critical path for offline startup after data clear.
  // Strategy: Cache first → network+cache → emergency fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {

        // 1. Try cache first (instant offline load)
        const cached = await cache.match('/index.html');
        if (cached) {
          console.log('[SW v14] Serving index.html from cache');
          // Background refresh — update cache silently
          fetch('/index.html', { cache: 'no-cache' })
            .then(r => { if (r && r.ok) cache.put('/index.html', r); })
            .catch(() => {});
          return cached;
        }

        // 2. Cache miss — try network (first run or after data-clear)
        console.log('[SW v14] Cache miss — fetching from network...');
        try {
          const response = await fetch(request, { cache: 'no-cache' });
          if (response && response.ok) {
            // Cache it immediately for next offline use
            await cache.put('/index.html', response.clone());
            await cache.put('/', response.clone());
            console.log('[SW v14] index.html fetched and cached');
            return response;
          }
        } catch (networkErr) {
          console.warn('[SW v14] Network failed:', networkErr.message);
        }

        // 3. Both cache and network failed → show offline page
        const offlinePage = await caches.match('/offline.html');
        if (offlinePage) return offlinePage;
        return emergencyPage();
      })
    );
    return;
  }

  // ── CDN ASSETS (jsPDF, fonts) — stale-while-revalidate ───────
  if (reqUrl.hostname.includes('cdnjs.cloudflare.com') ||
      reqUrl.hostname.includes('fonts.google') ||
      reqUrl.hostname.includes('fonts.gstatic')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          // Serve cached immediately, refresh in background
          const networkFetch = fetch(request)
            .then(r => { if (r && r.ok) cache.put(request, r.clone()); return r; })
            .catch(() => null);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // ── ALL OTHER ASSETS (icons, style.css, etc.) — cache first ──
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request)
          .then(r => {
            if (r && r.ok && r.type !== 'opaque') {
              cache.put(request, r.clone());
            }
            return r;
          })
          .catch(() => new Response('', {
            status: 503,
            statusText: 'Service Unavailable'
          }));
      })
    )
  );
});

// ── EMERGENCY FALLBACK PAGE ────────────────────────────────────
// Shown ONLY when both cache AND network are unavailable.
// Never shows a blank page.
function emergencyPage() {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="#071a0b"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;flex-direction:column;align-items:center;
  justify-content:center;background:#071a0b;font-family:system-ui,sans-serif;
  color:#fff;text-align:center;padding:28px}
.p{font-size:88px;margin-bottom:16px;animation:bob 2s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
h1{font-size:22px;font-weight:900;color:#7eed9a;margin-bottom:10px}
p{font-size:14px;color:rgba(255,255,255,.75);margin-bottom:8px;line-height:1.6}
.hint{font-size:12px;color:rgba(255,255,255,.45);margin-bottom:28px}
button{padding:14px 36px;background:linear-gradient(135deg,#3dba5e,#2d8f48);
  color:#fff;border:none;border-radius:28px;font-size:16px;font-weight:700;cursor:pointer;
  box-shadow:0 6px 20px rgba(61,186,94,.4)}
button:active{transform:scale(.95)}
.footer{margin-top:32px;font-size:11px;color:rgba(255,255,255,.3)}
</style>
</head>
<body>
<div class="p">&#x1F43C;</div>
<h1>Bamboo Booper</h1>
<p>Please connect to internet once to load the game.</p>
<p class="hint">After first load, the game works fully offline.</p>
<button onclick="location.reload()">&#x1F504; Retry</button>
<div class="footer">Bamboo Booper v1.0 &bull; CodeTech &bull; Lead Developer: Sachin Sheth</div>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ── MESSAGE HANDLER ────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW v14] SKIP_WAITING received.');
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: 'v14', cache: CACHE_NAME, game: GAME_VERSION });
  }
});
