import type { Place } from "@quikfly/shared";
import { visible, visibleById } from "./catalog";

export async function searchPlaces(db: D1Database, q: string): Promise<Place[]> {
  const places = await visible(db, "place");
  const s = q.trim().toLowerCase();
  return s ? places.filter((p) => `${p.name} ${p.area}`.toLowerCase().includes(s)) : places;
}

export const placeById = (db: D1Database, id: string) => visibleById(db, "place", id);
