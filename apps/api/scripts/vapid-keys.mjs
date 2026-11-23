// Makes one VAPID key pair for browser push (website and admin) and prints the three secrets to set.
// Usage: node scripts/vapid-keys.mjs [mailto:you@example.com]
// Run it once; the public key reaches browsers through GET /config and GET /admin/alerts, the private
// key never leaves the Worker. Nothing is written to disk. Rotating the keys ends every browser's
// subscription (they resubscribe when they next turn notifications on).
const subject = process.argv[2] || "mailto:ops@quikfly.in";
if (!/^(mailto:|https:)/.test(subject)) {
  console.error("The subject must start with mailto: or https: (a contact the push services may use).");
  process.exit(1);
}

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
// The standard VAPID encoding: the public key as the raw 65-byte point (0x04 ‖ x ‖ y), the private key as the raw scalar.
const publicKey = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]));
const privateKey = jwk.d;

console.log("Run these from apps/api (each asks you to paste the value):\n");
for (const [name, value] of [["VAPID_PUBLIC_KEY", publicKey], ["VAPID_PRIVATE_KEY", privateKey], ["VAPID_SUBJECT", subject]]) {
  console.log(`npx wrangler secret put ${name}`);
  console.log(`  ${value}\n`);
}
console.log("For a local API, put the same three lines in apps/api/.dev.vars as NAME=value (that file is git-ignored).");
