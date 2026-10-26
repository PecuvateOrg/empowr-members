// Empowr Members service worker - PUSH ALERTS ONLY.
//
// It does two things: show a notification when a push arrives, and open the right page when it is tapped.
// It deliberately has NO fetch handler and NO cache: booking data must never come from a stale copy
// (spec: planning/spec/member-messaging.md, "No offline caching of pages in this version").
//
// Payload (JSON, from lib/push.ts): { title, body, url, urgent }. Anything else is ignored.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
      badge: "/favicon-32x32.png",
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
