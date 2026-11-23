// Browser push (the Web Push standard, RFC 8030/8291/8292): the Worker encrypts each message and
// signs it with QuikFly's VAPID key, so browsers need no Firebase. Switched on by three secrets
// (`node scripts/vapid-keys.mjs` prints them): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.
// A browser's "token" (push_devices / admin_push_devices) is its PushSubscription JSON.
import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { WEB_PUSH_TTL_SECONDS } from "../config";
import type { Env } from "../env";
import type { PushResult } from "./push";

/** QuikFly's VAPID keys (the library's type allows undefined fields; ours never does). */
export interface VapidKeys { subject: string; publicKey: string; privateKey: string }

/** The VAPID keys, or null when browser push isn't configured (any of the three secrets missing or odd). */
export function vapidKeys(env: Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT">): VapidKeys | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = env;
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

/** A browser subscription is stored as JSON; FCM tokens never start with "{". */
export const isWebToken = (token: string) => token.startsWith("{");

/** What the service worker receives (apps/web/public/sw.js, apps/admin/public/sw.js). */
export interface WebPushMessage {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** Page to open when the notification is clicked, relative to the site. */
  url: string;
}

/** Sends one message to one browser. "gone" = the subscription has ended (forget it). */
export async function sendWebPush(vapid: VapidKeys, token: string, msg: WebPushMessage): Promise<PushResult> {
  let sub: PushSubscription;
  try {
    const parsed = JSON.parse(token) as Partial<PushSubscription>;
    if (typeof parsed.endpoint !== "string" || !parsed.endpoint.startsWith("https://") || typeof parsed.keys?.p256dh !== "string" || typeof parsed.keys?.auth !== "string") return "gone";
    sub = { endpoint: parsed.endpoint, expirationTime: parsed.expirationTime ?? null, keys: { p256dh: parsed.keys.p256dh, auth: parsed.keys.auth } };
  } catch {
    return "gone";
  }
  const payload = await buildPushPayload({ data: JSON.stringify(msg), options: { ttl: WEB_PUSH_TTL_SECONDS, urgency: msg.kind === "sos.raised" ? "high" : "normal" } }, sub, vapid);
  const res = await fetch(sub.endpoint, payload);
  if (res.ok) return "sent";
  // 404 and 410: the browser unsubscribed or the subscription expired. 403/401 are our key's fault, keep the row.
  return res.status === 404 || res.status === 410 ? "gone" : "failed";
}
