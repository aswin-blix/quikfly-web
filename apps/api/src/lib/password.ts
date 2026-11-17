// Password hashing with PBKDF2-SHA256 from Web Crypto (built into Workers, no cost).
// Format: "pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>". scripts/create-admin.mjs
// produces the same format with Node's crypto, so keep the two in step.

/** Workers caps PBKDF2 at 100,000 iterations. */
export const PBKDF2_ITERATIONS = 100_000;
const SCHEME = "pbkdf2-sha256";

const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${SCHEME}$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(await derive(password, salt, PBKDF2_ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split("$");
  const iterations = Number(iter);
  if (scheme !== SCHEME || !salt || !hash || !(iterations > 0 && iterations <= PBKDF2_ITERATIONS)) return false;
  const actual = await derive(password, fromHex(salt), iterations);
  const expected = fromHex(hash);
  if (actual.length !== expected.length) return false;
  // Constant-time comparison, so response timing doesn't leak how much matched.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
