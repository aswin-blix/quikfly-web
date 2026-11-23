// Browser push for staff: alerts reach this browser even when the panel is closed. The browser
// subscribes with the API's VAPID key (GET /admin/alerts → push) through public/sw.js, and the
// subscription JSON is registered as this staff browser's push token (POST /admin/push-devices).
// Always the staff member's choice (the dashboard card or the Alerts page), never on load.
// Signing out takes the browser off the account; the same person signing in again gets it back.
import { adminApi } from "./api";

const TOKEN_KEY = "quikfly.admin.push.token";
const OWNER_KEY = "quikfly.admin.push.owner";
export const PUSH_DISMISSED_KEY = "quikfly.admin.push.dismissed";
const SW_URL = "/sw.js";

/** unavailable: this browser can't · disabled: QuikFly hasn't set the VAPID keys · blocked: the site is blocked in the browser */
export type PushState = "unavailable" | "disabled" | "blocked" | "off" | "on";

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked */ }
};
const supported = () => typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const pushDismissed = () => read(PUSH_DISMISSED_KEY) === "1";
export const dismissPush = () => write(PUSH_DISMISSED_KEY, "1");

async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL).catch(() => undefined);
  return (await reg?.pushManager.getSubscription().catch(() => null)) ?? null;
}

function keyBytes(base64url: string) {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
const same = (a: ArrayBuffer, b: Uint8Array) => a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]);

export async function pushState(vapidKey: string | null | undefined): Promise<PushState> {
  if (!supported()) return "unavailable";
  if (!vapidKey) return "disabled";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted" || !read(TOKEN_KEY)) return "off";
  const sub = await subscription();
  return sub && JSON.stringify(sub) === read(TOKEN_KEY) ? "on" : "off";
}

/** Asks the browser (its own prompt, only if it hasn't been asked), subscribes and tells the API. */
export async function enablePush(vapidKey: string | null | undefined, adminId: string): Promise<PushState> {
  if (!supported()) return "unavailable";
  if (!vapidKey) return "disabled";
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  await navigator.serviceWorker.ready;
  const key = keyBytes(vapidKey);
  let sub = await reg.pushManager.getSubscription();
  // Made with an older key (QuikFly rotated it): it can't receive, start again.
  const current = sub?.options.applicationServerKey;
  if (sub && current && !same(current, key)) { await sub.unsubscribe().catch(() => undefined); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const token = JSON.stringify(sub);
  await adminApi.pushDevices.register(token);
  write(TOKEN_KEY, token);
  write(OWNER_KEY, adminId);
  return "on";
}

/** Off here: the API forgets this browser and the browser drops the subscription. */
export async function disablePush() {
  const token = read(TOKEN_KEY);
  write(TOKEN_KEY, null);
  write(OWNER_KEY, null);
  if (token) await adminApi.pushDevices.remove(token).catch(() => undefined);
  if (supported()) await (await subscription())?.unsubscribe().catch(() => undefined);
}

/** Before signing out, while the session is valid: alerts stop coming here. */
export async function pausePush() {
  const token = read(TOKEN_KEY);
  if (token) await adminApi.pushDevices.remove(token).catch(() => undefined);
}

/** After signing in: the staff member who turned it on gets it back; anyone else starts with it off. */
export async function resumePush(adminId: string) {
  const token = read(TOKEN_KEY);
  if (!token) return;
  if (read(OWNER_KEY) !== adminId || !supported() || Notification.permission !== "granted") return disablePush();
  const sub = await subscription();
  if (!sub) { write(TOKEN_KEY, null); write(OWNER_KEY, null); return; }
  const fresh = JSON.stringify(sub);
  write(TOKEN_KEY, fresh);
  await adminApi.pushDevices.register(fresh).catch(() => undefined);
}

/** The API ended the session: drop the subscription so no more alerts arrive here. */
export async function dropPush() {
  if (!read(TOKEN_KEY)) return;
  write(TOKEN_KEY, null);
  write(OWNER_KEY, null);
  if (supported()) await (await subscription())?.unsubscribe().catch(() => undefined);
}
