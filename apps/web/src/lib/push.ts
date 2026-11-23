// Browser notifications (Web Push). The browser subscribes with the API's VAPID key (GET /config →
// push) through our service worker (public/sw.js), and the subscription JSON is registered as this
// browser's push token (POST /me/push-devices, platform "web"). The cron then pushes new inbox
// notifications to it, even when the site is closed.
//
// It is always the person's choice: asked from a card or Account → Notifications, never on load.
// Signing out takes this browser off the account but remembers who turned it on, so the same person
// signing in again gets it back; anyone else starts with it off. A session the API ended (401)
// unsubscribes the browser, so nothing more arrives for that account.
import { api, DEMO_MODE } from "@/lib/api";
import { SPA } from "@/lib/spa-flag";

/** The token registered for this browser, and the account that turned notifications on. */
const TOKEN_KEY = "quikfly.push.token";
const OWNER_KEY = "quikfly.push.owner";
/** "Not now" on a card: remembered per browser so the card doesn't come back. */
export const PUSH_DISMISSED_KEY = "quikfly.push.dismissed";
const SW_URL = "/sw.js";
/** What the demo stores instead of a subscription (the mock API never pushes). */
const DEMO_TOKEN = "demo-browser";

/**
 * unavailable: this browser can't (or this is the single-file demo, which has no service worker)
 * demo: the website runs on the mock API; turning it on is remembered, nothing is sent
 * disabled: QuikFly hasn't switched browser notifications on yet (no VAPID key)
 * blocked: the person blocked notifications for this site in the browser
 * off: can be turned on · on: this browser gets notifications
 */
export type PushState = "unavailable" | "demo" | "disabled" | "blocked" | "off" | "on";

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked: still works this visit */ }
};

const supported = () => typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function pushDismissed() { return read(PUSH_DISMISSED_KEY) === "1"; }
export function dismissPush() { write(PUSH_DISMISSED_KEY, "1"); }

/** Where this browser stands. `vapidKey` is config.push?.vapidPublicKey. */
export async function pushState(vapidKey: string | null | undefined): Promise<PushState> {
  if (DEMO_MODE) return read(TOKEN_KEY) === DEMO_TOKEN ? "on" : "demo";
  if (SPA || !supported()) return "unavailable";
  if (!vapidKey) return "disabled";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted" || !read(TOKEN_KEY)) return "off";
  const sub = await subscription();
  return sub && JSON.stringify(sub) === read(TOKEN_KEY) ? "on" : "off";
}

async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL).catch(() => undefined);
  return (await reg?.pushManager.getSubscription().catch(() => null)) ?? null;
}

function keyBytes(base64url: string) {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Asks the browser (it shows its own prompt), subscribes and tells the API. Returns the new state:
 * "blocked" if the person said no.
 */
export async function enablePush(vapidKey: string | null | undefined, userId: string): Promise<PushState> {
  if (DEMO_MODE) {
    await api.pushDevices.register(DEMO_TOKEN, "web");
    write(TOKEN_KEY, DEMO_TOKEN);
    write(OWNER_KEY, userId);
    return "on";
  }
  if (SPA || !supported()) return "unavailable";
  if (!vapidKey) return "disabled";
  // Ask only when the browser hasn't been asked yet (its own prompt); a granted site goes straight on.
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with an older key (QuikFly rotated it) can't receive: start again.
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(vapidKey)))) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) });
  const token = JSON.stringify(sub);
  await api.pushDevices.register(token, "web");
  write(TOKEN_KEY, token);
  write(OWNER_KEY, userId);
  return "on";
}

/** Turns it off here: the API forgets this browser and the browser drops the subscription. */
export async function disablePush(): Promise<void> {
  const token = read(TOKEN_KEY);
  write(TOKEN_KEY, null);
  write(OWNER_KEY, null);
  if (token) await api.pushDevices.remove(token).catch(() => undefined);
  if (!DEMO_MODE && supported()) await (await subscription())?.unsubscribe().catch(() => undefined);
}

/** Before signing out: the account stops sending here; the subscription stays for the same person's return. */
export async function pausePush(): Promise<void> {
  const token = read(TOKEN_KEY);
  if (token) await api.pushDevices.remove(token).catch(() => undefined);
}

/** After signing in: the person who turned it on gets it back; anyone else starts with it off. */
export async function resumePush(userId: string): Promise<void> {
  const token = read(TOKEN_KEY);
  if (!token) return;
  if (read(OWNER_KEY) !== userId) return disablePush();
  if (DEMO_MODE) { await api.pushDevices.register(token, "web").catch(() => undefined); return; }
  if (!supported() || Notification.permission !== "granted") return disablePush();
  const sub = await subscription();
  if (!sub) { write(TOKEN_KEY, null); write(OWNER_KEY, null); return; }
  const fresh = JSON.stringify(sub);
  write(TOKEN_KEY, fresh);
  await api.pushDevices.register(fresh, "web").catch(() => undefined);
}

/** The API ended the session: drop the subscription so nothing more arrives for that account. */
export async function dropPush(): Promise<void> {
  if (!read(TOKEN_KEY)) return;
  write(TOKEN_KEY, null);
  write(OWNER_KEY, null);
  if (!DEMO_MODE && supported()) await (await subscription())?.unsubscribe().catch(() => undefined);
}
