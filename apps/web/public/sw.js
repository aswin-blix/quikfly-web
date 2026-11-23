// QuikFly service worker: shows browser notifications pushed by the API (apps/api/src/scheduled.ts)
// and opens the right page when one is clicked. It caches nothing. Registered only when someone
// turns notifications on (src/lib/push.ts); the single-file demo build never registers it.
const ICON = "/assets/notify-icon.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { title: "QuikFly", body: event.data ? event.data.text() : "" }; }
  const title = msg.title || "QuikFly";
  event.waitUntil(self.registration.showNotification(title, {
    body: msg.body || "",
    icon: ICON,
    // One notification per event: a repeat replaces it instead of stacking.
    tag: msg.id || undefined,
    data: { url: msg.url || "/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
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
