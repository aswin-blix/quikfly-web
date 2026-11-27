// The demo city map and the real world. Places are points on a 0–100 map of Chennai (x east, y south),
// and RIDE_SIM.kmPerMapUnit says how many kilometres one unit is. A captain's phone reports latitude and
// longitude; these helpers put that fix on the same map, so distances, dispatch and the customer's
// screen all use one coordinate system. Replace this with real routing when paid maps arrive.
import { RIDE_SIM } from "./pricing";

/** The middle of the map (x 50, y 50). */
export const CITY_CENTER = { lat: 13.06, lng: 80.24 } as const;
/** The map's side, in map units. */
export const MAP_SIZE = 100;
/** A fix this far outside the map (in units) still counts as on its edge; further out is outside the service area. */
export const MAP_EDGE_TOLERANCE = 5;

const KM_PER_DEGREE_LAT = 111.2;
const kmPerDegreeLng = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

export interface MapPoint { x: number; y: number }
export interface LatLng { lat: number; lng: number }

/** A real position on the demo map, or null when it is outside the service area. */
export function toMapPoint({ lat, lng }: LatLng): MapPoint | null {
  const x = MAP_SIZE / 2 + ((lng - CITY_CENTER.lng) * kmPerDegreeLng(CITY_CENTER.lat)) / RIDE_SIM.kmPerMapUnit;
  const y = MAP_SIZE / 2 - ((lat - CITY_CENTER.lat) * KM_PER_DEGREE_LAT) / RIDE_SIM.kmPerMapUnit;
  const outside = (v: number) => v < -MAP_EDGE_TOLERANCE || v > MAP_SIZE + MAP_EDGE_TOLERANCE;
  if (outside(x) || outside(y)) return null;
  const clamp = (v: number) => Math.round(Math.min(MAP_SIZE, Math.max(0, v)) * 100) / 100;
  return { x: clamp(x), y: clamp(y) };
}

/** The real position of a point on the demo map (for a maps link). */
export function toLatLng({ x, y }: MapPoint): LatLng {
  return {
    lat: CITY_CENTER.lat - ((y - MAP_SIZE / 2) * RIDE_SIM.kmPerMapUnit) / KM_PER_DEGREE_LAT,
    lng: CITY_CENTER.lng + ((x - MAP_SIZE / 2) * RIDE_SIM.kmPerMapUnit) / kmPerDegreeLng(CITY_CENTER.lat),
  };
}

/** Straight-line distance between two map points, in km (the same measure ride quotes use). */
export const mapDistanceKm = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y) * RIDE_SIM.kmPerMapUnit;

/** True for a point that is on the map. */
export const onMap = (p: MapPoint) => [p.x, p.y].every((v) => Number.isFinite(v) && v >= 0 && v <= MAP_SIZE);
