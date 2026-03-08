// SplitHome Service Worker – handles web push notifications

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// ── Push received ────────────────────────────────────────────────
self.addEventListener('push', function (event) {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { return }

  const options = {
    body:    data.body  ?? '',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    tag:     data.type  ?? 'general',
    renotify: true,
    data:    { url: data.link ?? '/' },
    vibrate: [200, 100, 200],
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'SplitHome', options)
  )
})

// ── Notification click ───────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus()
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
      })
  )
})
