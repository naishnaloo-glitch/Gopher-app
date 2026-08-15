self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Gopher', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Gopher';
  const options = {
    body: data.body || '',
    // A plain white silhouette works properly as Android's small status-bar icon —
    // unlike a full-color icon, which Android can't convert cleanly (showed as a blank box).
    badge: data.badge || undefined,
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
