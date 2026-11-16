/** Deterministic pseudo-random generator, so the same search returns the same results. */
export function seeded(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Short readable id such as `QFMHX2K9A471`. */
export function uid(prefix: string) {
  const rand = (crypto.getRandomValues(new Uint16Array(1))[0] % 900) + 100;
  return `${prefix}${Date.now().toString(36).toUpperCase()}${rand}`;
}

export function randomToken(bytes = 32) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}
