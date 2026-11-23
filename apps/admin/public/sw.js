// QuikFly Admin service worker: shows staff alerts pushed by the API (apps/api/src/scheduled.ts →
// pushStaff) and opens the alert's page when one is clicked. It caches nothing. Registered only when
// a staff member turns browser alerts on (src/lib/push.ts).
const ICON = "/assets/notify-icon.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { title: "QuikFly Admin", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(msg.title || "QuikFly Admin", {
    body: msg.body || "",
    icon: ICON,
    tag: msg.id || undefined,
    // An SOS stays on screen until someone acts on it.
    requireInteraction: msg.kind === "sos.raised",
    data: { url: msg.url || "/alerts" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/alerts", self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (tab) {
      await tab.focus();
      return tab.navigate(url).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  })());
});
