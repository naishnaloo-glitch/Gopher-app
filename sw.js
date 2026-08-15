self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Gopher', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Gopher';
  const options = {
    body: data.body || '',
    // No custom icon/badge: a full-color icon doesn't convert well to Android's small
    // monochrome status-bar icon, so we let the OS use its own clean default instead.
    vibrate: [120, 60, 120],
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
