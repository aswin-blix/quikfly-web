// Trips: bookings that belong together. After a bus or holiday booking, offer a ride that
// joins its trip (the cab to the boarding point, or a ride on the holiday's start morning).
import { BOARDING_POINT_PLACES, TRIP_RIDE, type Booking, type Settings } from "@quikfly/shared";
import { qs } from "./nav";

const IST_MIN = 330;
/** An instant as India-time "YYYY-MM-DDTHH:mm" (what scheduledFor expects). */
const istLocal = (ms: number) => new Date(ms + IST_MIN * 60_000).toISOString().slice(0, 16);

export interface RideOffer {
  title: string;
  text: string;
  /** The cab page, prefilled; the ride joins this booking's trip. */
  href: string;
}

/**
 * The ride to offer after booking `b`, or null. Bus: a cab to the boarding point (when it is
 * a place on the ride map), arriving TRIP_RIDE.leadMinutes before boarding. Holiday: a ride
 * on the start date at TRIP_RIDE.holidayHour. Too close to schedule → ride now.
 */
export function rideOffer(b: Booking, settings: Settings, placeName: (id: string) => string | undefined, now = Date.now()): RideOffer | null {
  if (b.status !== "confirmed" || !b.startsAt) return null;
  const date = b.startsAt.slice(0, 10);
  const soonest = now + settings.rideScheduleMinMinutes * 60_000;

  if (b.service === "bus") {
    const dep = b.lines.find(([k]) => k === "Departure")?.[1] ?? "";
    const m = /^(\d{2}:\d{2}) from (.+)$/.exec(dep);
    const placeId = m ? BOARDING_POINT_PLACES[m[2]] : undefined;
    if (!m || !placeId) return null;
    const boarding = Date.parse(`${date}T${m[1]}:00+05:30`);
    const pickup = boarding - TRIP_RIDE.leadMinutes * 60_000;
    if (boarding <= now) return null;
    const at = pickup >= soonest ? istLocal(pickup) : undefined;
    return {
      title: "Get to your bus on time",
      text: `A cab to ${m[2]} (${placeName(placeId) ?? "the boarding point"}), ${at ? `arriving about ${TRIP_RIDE.leadMinutes} minutes before boarding at ${m[1]}` : "right now"}.`,
      href: `/cab${qs({ to: placeId, at, trip: b.id })}`,
    };
  }
  if (b.service === "tours") {
    const start = Date.parse(`${date}T${String(TRIP_RIDE.holidayHour).padStart(2, "0")}:00:00+05:30`);
    if (start <= now) return null;
    const at = start >= soonest ? istLocal(start) : undefined;
    return {
      title: "Need a ride when your holiday starts?",
      text: "Book a cab to the airport, station or bus stand for the morning you leave. It's added to this trip.",
      href: `/cab${qs({ at, trip: b.id })}`,
    };
  }
  return null;
}

/** When a booking happens, for ordering a trip's timeline. */
export const bookingWhen = (b: Booking) => b.startsAt ?? b.createdAt;
