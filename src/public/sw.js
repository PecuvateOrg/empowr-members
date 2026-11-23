// Empowr Members service worker - PUSH ALERTS ONLY.
//
// It does two things: show a notification when a push arrives, and open the right page when it is tapped.
// Booking data must never come from a stale copy (spec: planning/spec/member-messaging.md, "No offline
// caching of pages"). That still holds: pages are always fetched live. The only thing cached is the
// static /offline.html, shown when the network is down (installable-app standard, 2026-11-23).
//
// Payload (JSON, from lib/push.ts): { title, body, url, urgent }. Anything else is ignored.
// Offline (installable-app standard, 2026-11-23): only the static /offline.html is cached. Pages are
// always fetched live (never cached: they hold signed-in or live data); if the network fails, the
// offline page shows instead of the browser's error.
const OFFLINE = "offline-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(OFFLINE).then((c) => c.add("/offline.html")).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== OFFLINE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match("/offline.html")));
});


self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_err) {
    // Not JSON: fall through to the generic notification below.
  }
  const title = typeof payload.title === "string" && payload.title ? payload.title : "Empowr CIC";
  const body = typeof payload.body === "string" ? payload.body : "You have a new message.";
  // Same-origin paths only, so a malformed payload can never send someone elsewhere.
  const url = typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//") ? payload.url : "/messages";
  event.waitUntil(
    // Every push MUST show a notification (iOS revokes permission for silent pushes).
    self.registration.showNotification(title, {
      body,
      icon: "/android-chrome-192x192.png",
      // Android draws the badge from its alpha channel only: an opaque favicon became a solid block (owner, 2026-10-26).
      // notification-badge.png is the white eye mark on transparency, cut from logo-white.png.
      badge: "/notification-badge.png",
      data: { url },
      // One notification per message; a repeat replaces rather than stacks.
      tag: url,
      requireInteraction: payload.urgent === true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/messages", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.focus().then((focused) => ("navigate" in focused ? focused.navigate(target) : focused));
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
