// Saved places, travellers and emergency contacts: small per-user lists with a size cap.
import { LIMITS, type EmergencyContact, type Gender, type SavedPlace, type SavedPlaceKind, type Traveller } from "@quikfly/shared";
import { badRequest, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { placeById } from "./places";

async function assertRoom(db: D1Database, table: string, userId: string, max: number, what: string) {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).bind(userId).first<{ n: number }>();
  if ((row?.n ?? 0) >= max) throw badRequest(`You can save up to ${max} ${what}.`);
}

async function removeOwned(db: D1Database, table: string, userId: string, id: string) {
  const res = await db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, userId).run();
  if (!res.meta.changes) throw notFound("Not found.");
}

/* ── Saved places ── */

interface PlaceRow { id: string; kind: SavedPlaceKind; label: string; place_id: string }

export async function listPlaces(db: D1Database, userId: string): Promise<SavedPlace[]> {
  const { results } = await db.prepare("SELECT * FROM saved_places WHERE user_id = ? ORDER BY CASE kind WHEN 'home' THEN 0 WHEN 'work' THEN 1 ELSE 2 END, created_at")
    .bind(userId).all<PlaceRow>();
  // Skip places that left the catalogue rather than failing the whole list.
  return results.flatMap((r) => {
    try { return [{ id: r.id, kind: r.kind, label: r.label, place: placeById(r.place_id) }]; } catch { return []; }
  });
}

/** Home and Work are single slots: saving one again replaces it. */
export async function savePlace(db: D1Database, userId: string, kind: SavedPlaceKind, placeId: string, label?: string) {
  placeById(placeId);
  const finalLabel = kind === "home" ? "Home" : kind === "work" ? "Work" : label;
  if (!finalLabel) throw badRequest('"label" is required for other places.');
  if (kind === "other") await assertRoom(db, "saved_places", userId, LIMITS.savedPlaces, "places");
  else await db.prepare("DELETE FROM saved_places WHERE user_id = ? AND kind = ?").bind(userId, kind).run();
  await db.prepare("INSERT INTO saved_places (id, user_id, kind, label, place_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid("SP"), userId, kind, finalLabel, placeId, new Date().toISOString()).run();
  return listPlaces(db, userId);
}

export async function removePlace(db: D1Database, userId: string, id: string) {
  await removeOwned(db, "saved_places", userId, id);
  return listPlaces(db, userId);
}

/* ── Travellers ── */

export async function listTravellers(db: D1Database, userId: string): Promise<Traveller[]> {
  const { results } = await db.prepare("SELECT id, name, age, gender FROM travellers WHERE user_id = ? ORDER BY created_at")
    .bind(userId).all<Traveller>();
  return results;
}

export async function addTraveller(db: D1Database, userId: string, t: { name: string; age: number; gender: Gender }) {
  await assertRoom(db, "travellers", userId, LIMITS.travellers, "travellers");
  await db.prepare("INSERT INTO travellers (id, user_id, name, age, gender, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid("TR"), userId, t.name, t.age, t.gender, new Date().toISOString()).run();
  return listTravellers(db, userId);
}

export async function removeTraveller(db: D1Database, userId: string, id: string) {
  await removeOwned(db, "travellers", userId, id);
  return listTravellers(db, userId);
}

/* ── Emergency contacts ── */

export async function listContacts(db: D1Database, userId: string): Promise<EmergencyContact[]> {
  const { results } = await db.prepare("SELECT id, name, phone, relation FROM emergency_contacts WHERE user_id = ? ORDER BY created_at")
    .bind(userId).all<EmergencyContact>();
  return results;
}

export async function addContact(db: D1Database, userId: string, c: { name: string; phone: string; relation: string | null }) {
  await assertRoom(db, "emergency_contacts", userId, LIMITS.emergencyContacts, "emergency contacts");
  await db.prepare("INSERT INTO emergency_contacts (id, user_id, name, phone, relation, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid("EC"), userId, c.name, c.phone, c.relation, new Date().toISOString()).run();
  return listContacts(db, userId);
}

export async function removeContact(db: D1Database, userId: string, id: string) {
  await removeOwned(db, "emergency_contacts", userId, id);
  return listContacts(db, userId);
}
