// Mock (demo mode) versions of the account endpoints. Same rules as the API,
// using the shared limits and patterns, but stored in this browser only.
import {
  CATALOG_SEED, DEFAULT_SETTINGS, DELETION_GRACE_DAYS, PRIVACY_NOTICE, LIMITS, PASS_NAME, PATTERNS, RIDE_PIN, compactCode, passEnd, passSaleError,
  type EmergencyContact, type SavedPlace, type Traveller, type User,
} from "@quikfly/shared";
import type { QuikflyApi } from "./contract";
import {
  KEYS, MOCK_LICENCE_REVIEW_SECONDS, MOCK_OTP, NEW_USER_WALLET, creditSummary, currentUser, drop, fail, load, patchUser, resetAccount, save, saveUser, uid, wait, walletEntry,
} from "./mock-store";

const checkOtp = (otp: string) => otp === MOCK_OTP || fail(`Invalid OTP. Use ${MOCK_OTP} in demo mode.`);
const tenDigits = (phone: string) => {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d}` : fail("Enter a valid 10-digit mobile number.");
};

function newUser(phone: string): User {
  return {
    id: uid("U"), name: "Guest", phone, walletBalance: 0, creditBalance: 0, passUntil: null, email: null, gender: null, dob: null, profileComplete: false,
    referralCode: "QF" + Math.random().toString(36).slice(2, 8).toUpperCase(), referred: false,
    licence: { status: "none", number: null, expiry: null, note: null }, gst: null, autoShareNightRides: false, autoShareRides: "off", ridePin: null, privacyConsent: null,
  };
}

/** Demo mode has no admin to review licences, so pending turns verified after a short wait. */
function withLicenceStatus(u: User): User {
  const submitted = load<number | null>("quikfly.mockLicenceAt", null);
  if (u.licence.status !== "pending" || !submitted || Date.now() - submitted < MOCK_LICENCE_REVIEW_SECONDS * 1000) return u;
  return { ...u, licence: { ...u.licence, status: "verified" } };
}

export const mockAuth: QuikflyApi["auth"] = {
  async sendOtp(phone) { await wait(600); tenDigits(phone); return { sent: true }; },
  async verifyOtp(phoneInput, otp) {
    await wait(600);
    checkOtp(otp);
    const phone = tenDigits(phoneInput);
    let user = load<User | null>(KEYS.user, null);
    const deletedAt = load<string | null>(KEYS.deletedAt, null);
    let restored = false;
    if (user && user.phone === phone && deletedAt) {
      if (Date.now() - Date.parse(deletedAt) < DELETION_GRACE_DAYS * 86_400_000) { drop(KEYS.deletedAt); restored = true; }
      else user = null;
    }
    if (!user || user.phone !== phone) {
      resetAccount();
      user = newUser(phone);
      saveUser(user);
      walletEntry("welcome", NEW_USER_WALLET, "Welcome credit");
      user = currentUser();
    }
    return { token: "demo-token", user: withLicenceStatus(user), isNew: !user.profileComplete, restored };
  },
  async signOut() { /* nothing to end in demo mode */ },
  async me() { await wait(150); return withLicenceStatus(currentUser()); },
};

export const mockAccount: QuikflyApi["account"] = {
  async update(p) {
    await wait(400);
    const u = currentUser();
    const next: User = { ...u };
    if (p.name !== undefined) { next.name = p.name.trim(); next.profileComplete = true; }
    if (p.email !== undefined) next.email = p.email ? (PATTERNS.email.test(p.email) ? p.email.toLowerCase() : fail("Enter a valid email address.")) : null;
    if (p.gender !== undefined) next.gender = p.gender;
    if (p.dob !== undefined) next.dob = p.dob;
    if (p.gst !== undefined) {
      next.gst = p.gst ? { gstin: PATTERNS.gstin.test(compactCode(p.gst.gstin)) ? compactCode(p.gst.gstin) : fail("Enter a valid 15-character GSTIN."), name: p.gst.name } : null;
    }
    // Safety Preferences, like the API: the old night-only flag maps to "night" / "off".
    const mode = p.autoShareRides ?? (p.autoShareNightRides === undefined ? undefined : p.autoShareNightRides ? "night" : "off");
    if (mode !== undefined) { next.autoShareRides = mode; next.autoShareNightRides = mode !== "off"; }
    if (p.ridePin !== undefined) next.ridePin = p.ridePin === null ? null : RIDE_PIN.test(p.ridePin) ? p.ridePin : fail("A ride PIN is 4 digits.");
    saveUser(next);
    return withLicenceStatus(next);
  },
  async requestPhoneChange(phone) {
    await wait(500);
    if (tenDigits(phone) === currentUser().phone) fail("That's already your number.");
    return { sent: true };
  },
  async changePhone(phone, otp) { await wait(500); checkOtp(otp); return patchUser({ phone: tenDigits(phone) }); },
  async signOutEverywhere() { await wait(300); },
  async consent(version) {
    await wait(300);
    if (version !== PRIVACY_NOTICE.version) fail("The privacy notice has changed. Please read the new one and agree again.");
    return withLicenceStatus(patchUser({ privacyConsent: version }));
  },
  async exportData() {
    await wait(400);
    const data: Record<string, unknown[]> = { account: [currentUser()] };
    for (const [name, key] of Object.entries(KEYS)) {
      const v = load<unknown>(key, null);
      if (Array.isArray(v)) data[name] = v;
    }
    return { exportedAt: new Date().toISOString(), noticeVersion: PRIVACY_NOTICE.version, data };
  },
  async deleteAccount(otp) { await wait(500); checkOtp(otp); currentUser(); save(KEYS.deletedAt, new Date().toISOString()); },
  async applyReferral(input) {
    await wait(500);
    const code = compactCode(input);
    const u = currentUser();
    if (u.referred) fail("You've already used a referral code.");
    if (code === u.referralCode) fail("You can't use your own referral code.");
    if (!PATTERNS.referralCode.test(code)) fail("That referral code doesn't look right.");
    // Demo mode has one account per browser, so any well-formed code counts as a friend's.
    walletEntry("referral", DEFAULT_SETTINGS.referralBonus, `Referral bonus · code ${code}`);
    return patchUser({ referred: true });
  },
  async submitLicence(input, expiry) {
    await wait(500);
    const number = compactCode(input);
    if (!PATTERNS.licence.test(number)) fail("Enter the licence number as printed, e.g. TN09 20190001234.");
    if (Date.parse(`${expiry}T00:00:00Z`) <= Date.now()) fail("This licence has expired. Renew it before booking self-drive.");
    save("quikfly.mockLicenceAt", Date.now());
    return patchUser({ licence: { status: "pending", number, expiry, note: null } });
  },
  async walletHistory() { await wait(250); return load(KEYS.wallet, []); },
  async credits() { await wait(250); return creditSummary(); },
  async buyPass() {
    await wait(500);
    const s = DEFAULT_SETTINGS;
    const off = passSaleError(s);
    if (off) fail(off);
    const u = currentUser();
    if (u.walletBalance < s.passPrice) fail(`${PASS_NAME} costs ₹${s.passPrice.toLocaleString("en-IN")} and your wallet has ₹${u.walletBalance.toLocaleString("en-IN")}.`);
    const passUntil = passEnd(s, u.passUntil);
    walletEntry("payment", -s.passPrice, `${PASS_NAME} · ${s.passDays} days`);
    patchUser({ passUntil });
    return { passUntil };
  },
};

/** A small capped list stored under one key. */
function list<T extends { id: string }>(key: string, max: number, what: string) {
  const get = () => load<T[]>(key, []);
  return {
    get,
    add(item: Omit<T, "id">) {
      const items = get();
      if (items.length >= max) fail(`You can save up to ${max} ${what}.`);
      const next = [...items, { ...item, id: uid("ID") } as T];
      save(key, next);
      return next;
    },
    remove(id: string) {
      const items = get();
      if (!items.some((i) => i.id === id)) fail("Not found.");
      const next = items.filter((i) => i.id !== id);
      save(key, next);
      return next;
    },
  };
}

const placesList = list<SavedPlace>(KEYS.places, LIMITS.savedPlaces, "places");
const travellerList = list<Traveller>(KEYS.travellers, LIMITS.travellers, "travellers");
const contactList = list<EmergencyContact>(KEYS.contacts, LIMITS.emergencyContacts, "emergency contacts");

export const mockSavedPlaces: QuikflyApi["savedPlaces"] = {
  async list() { await wait(200); return placesList.get(); },
  async save(kind, placeId, label) {
    await wait(300);
    const place = CATALOG_SEED.place.find((p) => p.id === placeId) ?? fail("Unknown place.");
    const finalLabel = kind === "home" ? "Home" : kind === "work" ? "Work" : label?.trim() || fail('"label" is required for other places.');
    if (kind !== "other") save(KEYS.places, placesList.get().filter((p) => p.kind !== kind));
    const order = { home: 0, work: 1, other: 2 };
    return placesList.add({ kind, label: finalLabel, place }).sort((a, b) => order[a.kind] - order[b.kind]);
  },
  async remove(id) { await wait(200); return placesList.remove(id); },
};

export const mockTravellers: QuikflyApi["travellers"] = {
  async list() { await wait(200); return travellerList.get(); },
  async add(t) { await wait(300); return travellerList.add({ ...t, name: t.name.trim() }); },
  async remove(id) { await wait(200); return travellerList.remove(id); },
};

export const mockContacts: QuikflyApi["contacts"] = {
  async list() { await wait(200); return contactList.get(); },
  async add(c) {
    await wait(300);
    const phone = tenDigits(c.phone);
    if (phone === currentUser().phone) fail("Add someone else's number, not your own.");
    return contactList.add({ name: c.name.trim(), phone, relation: c.relation?.trim() || null });
  },
  async remove(id) { await wait(200); return contactList.remove(id); },
};
