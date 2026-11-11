/* Service worker del portal Imprima B2B: notificaciones push y página sin conexión.
   No guarda en caché páginas ni datos del portal (precios, pedidos e inventario son en tiempo real). */
const CACHE = 'imprima-pwa-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/pwa/icon-192.png', '/pwa/badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Imprima B2B';
  const url = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/dashboard';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/pwa/icon-192.png',
    badge: '/pwa/badge-96.png',
    tag: typeof data.tag === 'string' && data.tag ? data.tag : undefined,
    lang: 'es-CO',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const exact = windows.find((client) => client.url === target);
      if (exact) return exact.focus();
      const sameOrigin = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (sameOrigin) return sameOrigin.navigate(target).then((client) => (client ? client.focus() : self.clients.openWindow(target)));
      return self.clients.openWindow(target);
    }),
  );
});
