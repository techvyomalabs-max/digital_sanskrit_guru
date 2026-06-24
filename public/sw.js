/* sw.js — Digital Sanskrit Guru Service Worker
 * Handles Web Push notifications and shows browser notifications.
 * Placed in /public so Vite serves it at the root path.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming push messages
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Digital Sanskrit Guru", body: event.data ? event.data.text() : "" };
  }

  const title = String(data.title || "Digital Sanskrit Guru");
  const options = {
    body: String(data.body || ""),
    icon: data.icon || "/favicon.ico",
    badge: data.badge || "/favicon.ico",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
    requireInteraction: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — navigate to the relevant page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Reuse existing window if open
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
            return;
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
