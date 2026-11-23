// Phone push: Firebase Cloud Messaging (HTTP v1). Free. Switched on by the FCM_SERVICE_ACCOUNT
// secret: the JSON key of a Firebase service account, stored with `npx wrangler secret put
// FCM_SERVICE_ACCOUNT` by the owner (it never goes in the repo). Without it nothing is sent to
// phones. Browsers are served by services/webpush.ts; scheduled.ts picks the channel per token.
import { FCM, PUSH_ANDROID } from "../config";

interface ServiceAccount { project_id: string; client_email: string; private_key: string }

let cached: { token: string; until: number } | null = null;

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Reads the secret; null when push isn't configured (or the JSON is unusable). */
export function serviceAccount(secret: string | undefined): ServiceAccount | null {
  if (!secret) return null;
  try {
    const sa = JSON.parse(secret) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

/** An OAuth access token for FCM, from a JWT signed with the service account key (cached ~50 min). */
async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: FCM.scope, aud: FCM.tokenUrl, iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch(FCM.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error(`FCM auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, until: Date.now() + (json.expires_in - 600) * 1000 };
  return json.access_token;
}

export type PushResult = "sent" | "gone" | "failed";

/**
 * Sends one notification to one phone. "gone" = the token is no longer valid (forget it).
 * Android shows the `notification` part itself when the app is in the background or closed, on the
 * apps' "Trip updates" channel; the app reads `data` (kind, id, bookingId or link) to open the right screen.
 */
export async function sendPush(sa: ServiceAccount, token: string, msg: { title: string; body: string; data: Record<string, string> }): Promise<PushResult> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      token, notification: { title: msg.title, body: msg.body }, data: msg.data,
      android: { priority: "high", notification: { channel_id: PUSH_ANDROID.channelId, color: PUSH_ANDROID.color } },
    } }),
  });
  if (res.ok) return "sent";
  // 404 UNREGISTERED and 400 INVALID_ARGUMENT (a malformed token) both mean this token will never work.
  return res.status === 404 || res.status === 400 ? "gone" : "failed";
}
