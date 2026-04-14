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
const BASE_PATH = '/';
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
      .then(cache => {
        console.log('[SW v15] Cache opened. Caching core assets...');

        return Promise.allSettled(
          CORE_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn(`[SW v15] Failed to cache: ${url}`, err.message);
              return null; // Continue even if one asset fails
            })
          )
        );
      })
      .then(() => {
        console.log('[SW v15] Installation completed. Activating immediately...');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW v15] Installation failed:', err);
        return self.skipWaiting(); // Still activate even if caching failed
      })
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW v15] Activating...');

  event.waitUntil(
    caches.keys()
      .then(keys => {
        const oldCaches = keys.filter(k => 
          k.startsWith('bamboo-booper-') && k !== CACHE_NAME
        );

        console.log(`[SW v15] Found ${oldCaches.length} old caches to delete.`);

        return Promise.all(
          oldCaches.map(k => {
            console.log(`[SW v15] Deleting old cache: ${k}`);
            return caches.delete(k);
          })
        );
      })
      .then(() => {
        console.log('[SW v15] Claiming clients...');
        return self.clients.claim();
      })
      .then(() => {
        console.log('[SW v15] Activated successfully and controlling all pages.');
      })
      .catch(err => {
        console.error('[SW v15] Activate failed:', err);
        return self.clients.claim(); // Still claim even if cache cleanup fails
      })
  );
});

// ── FETCH ──────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip non-http requests
  try {
    const url = new URL(request.url);
    if (!url.protocol.startsWith('http')) return;
  } catch { return; }

  // ── NAVIGATION REQUESTS (Main HTML loads) ─────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      // Try network first (for fresh content)
      fetch(request, { cache: 'no-cache' })
        .then(response => {
          if (response && response.ok) {
            // Cache the fresh version for offline use
            caches.open(CACHE_NAME).then(cache => {
              cache.put('/index.html', response.clone());
              cache.put(request, response.clone());
            });
            return response;
          }
          throw new Error('Network response not ok');
        })
        .catch(async () => {
          // Offline → Serve from cache
          const cached = await caches.match('/index.html');
          if (cached) return cached;

          // Fallback to offline page
          const offlinePage = await caches.match('/offline.html');
          return offlinePage || emergencyPage();
        })
    );
    return;
  }

  // ── ALL OTHER REQUESTS (images, css, js, etc.) ───────────────
  // Cache-first strategy
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      // Return cached version if available
      if (cachedResponse) return cachedResponse;

      // Otherwise fetch from network and cache it
      return fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});

// ── CDN Assets (jsPDF, fonts, etc.) — Stale-While-Revalidate ─────
if (request.url.includes('cdnjs.cloudflare.com') || 
    request.url.includes('fonts.googleapis.com') || 
    request.url.includes('fonts.gstatic.com')) {
    
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(request).then(cachedResponse => {
          
          // Fetch fresh copy in background
          const networkFetch = fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.ok) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => null);

          // Return cached version immediately if available, else wait for network
          return cachedResponse || networkFetch;
        });
      })
    );
    return;
  }

// ── Static Assets (images, css, js, etc.) — Cache-First ───────
event.respondWith(
  caches.open(CACHE_NAME).then(cache => {
    return cache.match(request).then(cachedResponse => {

      // Return cached version immediately if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // Not in cache → fetch from network
      return fetch(request).then(networkResponse => {
        // Cache successful responses
        if (networkResponse && networkResponse.ok && networkResponse.type !== 'opaque') {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {
        // Network failed and no cache → return 503
        return new Response('', { 
          status: 503, 
          statusText: 'Service Unavailable' 
        });
      });
    });
  })
);

// ── Emergency Fallback Page ─────────────────────────────────────
function emergencyPage() {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#071a0b">
    <title>Bamboo Booter - Offline</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            font-family: system-ui, sans-serif;
            background: linear-gradient(135deg, #071a0b, #0f3a1f);
            color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 20px;
        }
        .panda {
            font-size: 110px;
            margin-bottom: 20px;
            animation: bob 2.2s ease-in-out infinite;
        }
        @keyframes bob {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-18px); }
        }
        h1 {
            font-size: 26px;
            font-weight: 900;
            color: #7eed9a;
            margin-bottom: 12px;
        }
        p {
            font-size: 15.5px;
            line-height: 1.6;
            color: rgba(255,255,255,0.85);
            margin-bottom: 32px;
            max-width: 280px;
        }
        button {
            padding: 16px 40px;
            background: linear-gradient(135deg, #4ade80, #22c55e);
            color: #0f3a1f;
            border: none;
            border-radius: 50px;
            font-size: 17px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 8px 25px rgba(74, 222, 128, 0.4);
        }
        button:active {
            transform: scale(0.95);
        }
        .footer {
            margin-top: 50px;
            font-size: 12px;
            color: rgba(255,255,255,0.4);
        }
    </style>
</head>
<body>
    <div class="panda">🐼</div>
    <h1>Bamboo Booter</h1>
    <p>No internet connection detected.<br>
       Please connect once to load the game.<br>
       After first load, it works offline.</p>
    
    <button onclick="location.reload()">🔄 Retry Connection</button>
    
    <div class="footer">
        Bamboo Booter v1.0 • CodeTech
    </div>
</body>
</html>`,
    { 
      status: 200, 
      headers: { 'Content-Type': 'text/html; charset=utf-8' } 
    }
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
