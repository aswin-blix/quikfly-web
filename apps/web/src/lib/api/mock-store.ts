// Browser-side "database" for the mock API (demo mode). One account per browser.
import type { EmergencyContact, Ride, SavedPlace, Traveller, User, WalletTransaction, WalletTxnKind } from "@quikfly/shared";

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
  return u!;
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

export type MockLists = { places: SavedPlace[]; travellers: Traveller[]; contacts: EmergencyContact[] };
export type MockRide = { ride: Ride; startedAt: string; cancelled: boolean };

/** Starts a fresh account: clears everything the previous one stored in this browser. */
export function resetAccount() {
  for (const k of [KEYS.deletedAt, KEYS.places, KEYS.travellers, KEYS.contacts, KEYS.wallet, KEYS.rides, KEYS.bookings]) drop(k);
}
