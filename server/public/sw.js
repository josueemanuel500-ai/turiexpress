// Service worker del panel: notificaciones push y carga offline del cascarón.
// Los datos (/v1/*) nunca se guardan en caché: son privados y deben estar al día.
const CACHE = 'turi-panel-v8';
const SHELL = ['/', '/index.html', '/app.css?v=8', '/app.js?v=8', '/icons.js?v=8', '/charts.js?v=8', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/v1/')) return;
  // Red primero; si no hay conexión, el cascarón guardado.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && SHELL.includes(url.pathname + url.search)) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match('/index.html'))),
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('push', event => {
  let data = { title: 'Turi Express', body: 'Tienes una novedad', url: '/' };
  try { data = { ...data, ...event.data.json() }; } catch { /* texto plano */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: Boolean(data.tag),
      silent: false, // con sonido
      requireInteraction: Boolean(data.urgent), // las solicitudes nuevas se quedan hasta que las veas
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: data.url },
      vibrate: [350, 150, 350, 150, 600],
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        client.postMessage({ type: 'navigate', url: target });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
