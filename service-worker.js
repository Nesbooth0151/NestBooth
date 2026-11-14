const CACHE_NAME = 'kasirkita-pos-v103';
const APP_FILES = [
  './',
  './index.html',
  './tv-display.html',
  './tv-access.js',
  './receipt-enhancer.js',
  './qz-autoprint.js',
  './history-six-months.js',
  './mobile-navigation.js',
  './responsive-layout.js',
  './nest-menu.js',
  './brand-logo.js',
  './product-photos.js',
  './dashboard-stock.js',
  './cloud-sync.js',
  './operational-alerts.js',
  './online-admin.js',
  './stock-alerts.js',
  './cashier-stock-view.js',
  './shift-report.js',
  './cashier-shift-gate.js',
  './user-management.js',
  './online-report.js',
  './profit-report.js',
  './sale-management.js',
  './recipe-manager.js',
  './dashboard-realtime.js',
  './login-page.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon.svg?v=80',
  './assets/menu/01-Neslo.jpg',
  './assets/menu/02-Nestea.jpg',
  './assets/menu/03-Lemonade.jpg',
  './assets/menu/04-Blackcurrant.jpg',
  './assets/menu/05-Milo.jpg',
  './assets/menu/06-Coffee.jpg',
  './assets/menu/07-Ice-Roast.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Data transaksi harus selalu terbaru. Jangan pernah menyimpan respons API
  // (termasuk respons error lama) ke cache browser.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  const freshFiles = event.request.mode === 'navigate' || /\.(js|css|html)$/.test(url.pathname);
  if (freshFiles) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        if (url.origin === self.location.origin) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      if (new URL(event.request.url).origin === self.location.origin) {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
