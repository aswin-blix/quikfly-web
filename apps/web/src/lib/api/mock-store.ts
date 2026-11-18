// Browser-side "database" for the mock API (demo mode). One account per browser.
import type { CreditEntry, CreditKind, CreditSummary, EmergencyContact, Ride, SavedPlace, Traveller, User, WalletTransaction, WalletTxnKind } from "@quikfly/shared";

/** Login code accepted by the mock API. */
export const MOCK_OTP = "1234";
/** Demo mode has no admin to review licences; a submitted one turns verified after this long. */
export const MOCK_LICENCE_REVIEW_SECONDS = 20;
import { DEFAULT_SETTINGS } from "@quikfly/shared";
/** Demo mode uses the default settings (it has no admin panel). */
export const NEW_USER_WALLET = DEFAULT_SETTINGS.welcomeCredit;

export const wait = (ms = 450) => new Promise((r) => setTimeout(r, ms));
export const uid = (p: string) => `${p}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;

export const KEYS = {
  user: "quikfly.mockUser",
  deletedAt: "quikfly.mockDeletedAt",
  places: "quikfly.mockPlaces",
  travellers: "quikfly.mockTravellers",
  contacts: "quikfly.mockContacts",
  wallet: "quikfly.mockWallet",
  credits: "quikfly.mockCredits",
  rides: "quikfly.mockRides",
  bookings: "quikfly.bookings",
} as const;

export function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
export function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
export function drop(key: string) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

export const fail = (message: string): never => { throw new Error(message); };

export function currentUser(): User {
  const u = load<User | null>(KEYS.user, null);
  if (!u || load<string | null>(KEYS.deletedAt, null)) fail("Please sign in to continue.");
  return { ...u!, creditBalance: creditBalance() };
}
export const saveUser = (u: User) => save(KEYS.user, u);
export function patchUser(patch: Partial<User>): User {
  const u = { ...currentUser(), ...patch };
  saveUser(u);
  return u;
}

/** Changes the balance and records it in the wallet history, like the API's ledger. */
export function walletEntry(kind: WalletTxnKind, amount: number, note: string, bookingId: string | null = null) {
  const u = currentUser();
  saveUser({ ...u, walletBalance: u.walletBalance + amount });
  const list = load<WalletTransaction[]>(KEYS.wallet, []);
  save(KEYS.wallet, [{ id: uid("WT"), kind, amount, note, bookingId, createdAt: new Date().toISOString() }, ...list]);
}

/** Unused, unexpired credits, soonest expiry first (the order the API spends them in). */
function liveCredits(list = load<CreditEntry[]>(KEYS.credits, [])) {
  const now = Date.now();
  return list.filter((e) => e.remaining > 0 && e.expiresAt && Date.parse(e.expiresAt) > now)
    .sort((a, b) => a.expiresAt!.localeCompare(b.expiresAt!));
}
export const creditBalance = () => liveCredits().reduce((s, e) => s + e.remaining, 0);

/** Adds a credits entry like the API: credits in carry an expiry; "spent" takes from the soonest-expiring. */
export function creditEntry(kind: CreditKind, amount: number, note: string, bookingId: string | null, expiresAt: string | null = null) {
  const list = load<CreditEntry[]>(KEYS.credits, []);
  if (kind === "spent") {
    let left = -amount;
    for (const e of liveCredits(list)) {
      if (left <= 0) break;
      const take = Math.min(e.remaining, left);
      e.remaining -= take;
      left -= take;
    }
  }
  const positive = amount > 0;
  save(KEYS.credits, [{ id: uid("CR"), kind, amount, note, bookingId, createdAt: new Date().toISOString(), expiresAt: positive ? expiresAt : null, remaining: positive ? amount : 0 }, ...list]);
}

export function creditSummary(): CreditSummary {
  const live = liveCredits();
  const first = live[0];
  return {
    balance: live.reduce((s, e) => s + e.remaining, 0),
    nextExpiry: first ? { amount: live.filter((e) => e.expiresAt === first.expiresAt).reduce((s, e) => s + e.remaining, 0), expiresAt: first.expiresAt! } : null,
    items: load<CreditEntry[]>(KEYS.credits, []).slice(0, 100),
  };
}

export type MockLists = { places: SavedPlace[]; travellers: Traveller[]; contacts: EmergencyContact[] };
export type MockRide = { ride: Ride; startedAt: string; cancelled: boolean };

/** Starts a fresh account: clears everything the previous one stored in this browser. */
export function resetAccount() {
  for (const k of [KEYS.deletedAt, KEYS.places, KEYS.travellers, KEYS.contacts, KEYS.wallet, KEYS.rides, KEYS.bookings]) drop(k);
}
