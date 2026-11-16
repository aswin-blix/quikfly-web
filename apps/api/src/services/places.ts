import { PLACES } from "@quikfly/shared";
import { badRequest } from "../lib/errors";

export function searchPlaces(q: string) {
  const s = q.trim().toLowerCase();
  return s ? PLACES.filter((p) => `${p.name} ${p.area}`.toLowerCase().includes(s)) : PLACES;
}

export function placeById(id: string) {
  const p = PLACES.find((x) => x.id === id);
  if (!p) throw badRequest("Unknown place.");
  return p;
}
