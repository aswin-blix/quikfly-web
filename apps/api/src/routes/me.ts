// The signed-in user's account: profile, number, sessions, deletion, referral,
// licence, saved places, travellers, emergency contacts and wallet history.
import { Hono } from "hono";
import {
  AUTO_SHARE_MODES, GENDERS, LIMITS, PATTERNS, RIDE_PIN, SAVED_PLACE_KINDS, ageFrom, compactCode, type ProfileUpdate,
} from "@quikfly/shared";
import type { AppEnv } from "../env";
import { badRequest } from "../lib/errors";
import { bool, has, int, jsonBody, matches, oneOf, optStr, str, text } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import {
  applyReferral, changePhone, deleteAccount, requestPhoneChange, signOutEverywhere, submitLicence, updateProfile,
} from "../services/account";
import { normalisePhone } from "../services/auth";
import { getSettings } from "../services/settings";
import {
  addContact, addTraveller, listContacts, listPlaces, listTravellers, removeContact, removePlace, removeTraveller, savePlace,
} from "../services/saved";
import { listTransactions } from "../services/wallet";
import { creditSummary } from "../services/credits";
import { buyPass } from "../services/pass";
import { listNotifications, markRead, registerDevice, removeDevice } from "../services/notifications";

type Json = Record<string, unknown>;
const NAME = [LIMITS.nameMin, LIMITS.nameMax] as const;

function parseProfile(body: Json): ProfileUpdate {
  const p: ProfileUpdate = {};
  if (has(body, "name")) p.name = text(body, "name", ...NAME);
  if (has(body, "email")) {
    p.email = body.email === null ? null : matches(str(body, "email", 120).toLowerCase(), PATTERNS.email, "Enter a valid email address.");
  }
  if (has(body, "gender")) p.gender = body.gender === null ? null : oneOf(body, "gender", GENDERS);
  if (has(body, "dob")) {
    if (body.dob === null) p.dob = null;
    else {
      const dob = matches(str(body, "dob", 10), PATTERNS.isoDate, '"dob" must be YYYY-MM-DD.');
      const age = ageFrom(dob);
      if (Number.isNaN(age) || age < LIMITS.minAge || age > LIMITS.maxAge) throw badRequest(`Age must be between ${LIMITS.minAge} and ${LIMITS.maxAge}.`);
      p.dob = dob;
    }
  }
  if (has(body, "gst")) {
    if (body.gst === null) p.gst = null;
    else {
      const g = (typeof body.gst === "object" ? body.gst : {}) as Json;
      p.gst = {
        gstin: matches(compactCode(str(g, "gstin", 20)), PATTERNS.gstin, "Enter a valid 15-character GSTIN, e.g. 33ABCDE1234F1Z5."),
        name: text(g, "name", 2, 100),
      };
    }
  }
  if (has(body, "autoShareNightRides")) p.autoShareNightRides = bool(body, "autoShareNightRides");
  if (has(body, "autoShareRides")) p.autoShareRides = oneOf(body, "autoShareRides", AUTO_SHARE_MODES);
  if (has(body, "ridePin")) p.ridePin = body.ridePin === null ? null : matches(str(body, "ridePin", 4), RIDE_PIN, "A ride PIN is 4 digits.");
  if (!Object.keys(p).length) throw badRequest("Nothing to update.");
  return p;
}

export const me = new Hono<AppEnv>()
  .use(requireUser)

  // Profile (saving a name also completes sign-up)
  .patch("/", async (c) => c.json(await updateProfile(c.env.DB, c.var.user.id, parseProfile(await jsonBody(c)))))

  // Mobile number: check it's free (OTP "sent"), then confirm with the OTP.
  .post("/phone/otp", async (c) => {
    await requestPhoneChange(c.env.DB, c.var.user.id, str(await jsonBody(c), "phone", 20));
    return c.json({ sent: true });
  })
  .post("/phone", async (c) => {
    const body = await jsonBody(c);
    return c.json(await changePhone(c.env.DB, c.env.DEMO_OTP, c.var.user.id, str(body, "phone", 20), str(body, "otp", 10)));
  })

  .post("/logout-all", async (c) => {
    await signOutEverywhere(c.env.DB, c.var.user.id);
    return c.json({ signedOut: true });
  })
  .post("/delete", async (c) => {
    await deleteAccount(c.env.DB, c.env.DEMO_OTP, c.var.user.id, str(await jsonBody(c), "otp", 10));
    return c.json({ scheduled: true });
  })

  .post("/referral", async (c) => {
    const code = matches(compactCode(str(await jsonBody(c), "code", 20)), PATTERNS.referralCode, "That referral code doesn't look right.");
    return c.json(await applyReferral(c.env.DB, c.var.user.id, code));
  })

  .put("/licence", async (c) => {
    const body = await jsonBody(c);
    const number = matches(compactCode(str(body, "number", 25)), PATTERNS.licence, "Enter the licence number as printed, e.g. TN09 20190001234.");
    const expiry = matches(str(body, "expiry", 10), PATTERNS.isoDate, '"expiry" must be YYYY-MM-DD.');
    const daysLeft = (Date.parse(`${expiry}T00:00:00Z`) - Date.now()) / 86_400_000;
    if (!(daysLeft >= LIMITS.licenceMinDaysLeft)) throw badRequest("This licence has expired. Renew it before booking self-drive.");
    if (c.var.user.dob && ageFrom(c.var.user.dob) < 18) throw badRequest("You must be 18 or older to drive.");
    return c.json(await submitLicence(c.env.DB, c.var.user.id, number, expiry, (await getSettings(c.env.DB)).licenceAutoApprove));
  })

  // Saved places
  .get("/places", async (c) => c.json(await listPlaces(c.env.DB, c.var.user.id)))
  .post("/places", async (c) => {
    const body = await jsonBody(c);
    return c.json(await savePlace(c.env.DB, c.var.user.id, oneOf(body, "kind", SAVED_PLACE_KINDS), str(body, "placeId"), optStr(body, "label", 30)), 201);
  })
  .delete("/places/:id", async (c) => c.json(await removePlace(c.env.DB, c.var.user.id, c.req.param("id"))))

  // Travellers
  .get("/travellers", async (c) => c.json(await listTravellers(c.env.DB, c.var.user.id)))
  .post("/travellers", async (c) => {
    const body = await jsonBody(c);
    return c.json(await addTraveller(c.env.DB, c.var.user.id, {
      name: text(body, "name", ...NAME), age: int(body, "age", 1, 120), gender: oneOf(body, "gender", GENDERS),
    }), 201);
  })
  .delete("/travellers/:id", async (c) => c.json(await removeTraveller(c.env.DB, c.var.user.id, c.req.param("id"))))

  // Emergency contacts
  .get("/contacts", async (c) => c.json(await listContacts(c.env.DB, c.var.user.id)))
  .post("/contacts", async (c) => {
    const body = await jsonBody(c);
    const phone = normalisePhone(str(body, "phone", 20));
    if (phone === c.var.user.phone) throw badRequest("Add someone else's number, not your own.");
    return c.json(await addContact(c.env.DB, c.var.user.id, {
      name: text(body, "name", ...NAME), phone, relation: optStr(body, "relation", 30) ?? null,
    }), 201);
  })
  .delete("/contacts/:id", async (c) => c.json(await removeContact(c.env.DB, c.var.user.id, c.req.param("id"))))

  .get("/wallet", async (c) => c.json(await listTransactions(c.env.DB, c.var.user.id)))
  // QuikFly Credits: balance, the soonest expiry, and history (newest first).
  .get("/credits", async (c) => c.json(await creditSummary(c.env.DB, c.var.user.id)))
  // QuikFly Pass: paid from the wallet; returns when the pass now ends.
  .post("/pass", async (c) => c.json(await buyPass(c.env.DB, c.var.user.id), 201))

  // Notification inbox
  .get("/notifications", async (c) => c.json(await listNotifications(c.env.DB, c.var.user.id)))
  // { ids: [...] } marks those read; {} or { all: true } marks everything read.
  .post("/notifications/read", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const ids = body.ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some((x) => typeof x !== "string"))) throw badRequest('"ids" must be a list of notification ids.');
    return c.json(await markRead(c.env.DB, c.var.user.id, (ids as string[] | undefined) ?? null));
  })

  // Push devices (Firebase tokens from the app)
  .post("/push-devices", async (c) => {
    const body = await jsonBody(c);
    return c.json(await registerDevice(c.env.DB, c.var.user.id, str(body, "token", 400), oneOf(body, "platform", ["android", "ios", "web"] as const)), 201);
  })
  .delete("/push-devices/:token", async (c) => c.json(await removeDevice(c.env.DB, c.var.user.id, c.req.param("token"))));
