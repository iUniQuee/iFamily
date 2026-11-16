// iFamily PWA — Web Push мэдэгдэл хүлээн авч харуулах service worker.
// Кэш хийхгүй: зөвхөн push / notification click-ийг боловсруулна.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'iFamily';
  // Android Chrome: icon/badge зам нь БОДИТ файлд хүрэх ёстой (192px PNG).
  // vibrate — Android дэмжинэ, iOS чимээгүйгээр алгасна.
  // silent:false — Android дээр дуугарна (iOS дээр энэ талбар үл хайхрагдана).
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'ifamily',
    renotify: true,
    vibrate: [100, 50, 100],
    silent: false,
    timestamp: Date.now(),
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let target = self.registration.scope;
  try {
    const raw = (event.notification.data && event.notification.data.url) || '/';
    const u = new URL(raw, self.location.origin);
    // Зөвхөн өөрийн сайт руу — гадаад холбоос руу үсрэхгүй
    if (u.origin === self.location.origin) target = u.href;
  } catch (e) { /* буруу URL — үндсэн хуудас */ }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin)) {
        try { await client.focus(); } catch (e) { /* focus хангалтгүй бол шинэ цонх */ }
        // Android: navigate дэмжигддэг; болохгүй бол шинэ цонхоор нээнэ.
        let navOk = false;
        if ('navigate' in client) {
          try { await client.navigate(target); navOk = true; } catch (e) { navOk = false; }
        }
        if (navOk || client.url.indexOf(target) === 0) return;
        break;
      }
    }
    await self.clients.openWindow(target);
  })());
});
