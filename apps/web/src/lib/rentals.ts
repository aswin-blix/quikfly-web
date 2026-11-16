// Default pickup and return times for car rentals.
import { toLocalInput } from "./format";

export const RENTAL_DEFAULTS = {
  /** Earliest pickup, in hours from now. */
  leadHours: 3,
  /** Hub opening hours (24 h clock). Pickups outside them move to the next morning. */
  openHour: 8,
  closeHour: 20,
  /** Pickup hour used when the next slot falls outside opening hours. */
  morningHour: 10,
  /** Default rental length in hours. */
  durationHours: 24,
};

/** Next sensible pickup (on the hour, inside opening hours) and a return one rental-length later. */
export function defaultRentalWindow(now = new Date()) {
  const { leadHours, openHour, closeHour, morningHour, durationHours } = RENTAL_DEFAULTS;
  const start = new Date(now.getTime() + leadHours * 3600000);
  start.setMinutes(0, 0, 0);
  if (start.getHours() >= closeHour) {
    start.setDate(start.getDate() + 1);
    start.setHours(morningHour);
  } else if (start.getHours() < openHour) {
    start.setHours(morningHour);
  }
  const end = new Date(start.getTime() + durationHours * 3600000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}
