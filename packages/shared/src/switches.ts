// Service and feature switches (owner-only, in Settings). Off = the website and the app hide
// it, and the API refuses new quotes, rides and bookings for it with the message below.
// Bookings made before a switch went off carry on (scheduled rides still start). Safety
// features (SOS, trip sharing) have no switch on purpose: the 2025 aggregator guidelines
// require a panic button.
import type { Settings } from "./settings";
import type { GroupTrip, PaymentMethod, ServiceKey } from "./types";

/** Is this service open for new bookings? */
export function serviceOn(settings: Settings, service: ServiceKey) {
  switch (service) {
    case "bike": return settings.serviceBike;
    case "car": return settings.serviceCar;
    case "bus": return settings.serviceBus;
    case "tours": return settings.serviceTours;
    case "rent": return settings.serviceRent;
    case "rentals": return settings.serviceGroup;
    // Missing (an API from before parcels) counts as off.
    case "parcel": return settings.serviceParcel === true;
  }
}

/** Shown (and returned by the API) when a feature is switched off. */
export const FEATURE_OFF = {
  rideScheduling: "Booking rides ahead is turned off for now. You can book a ride now.",
  multiStop: "Extra stops are turned off for now. Book a ride straight to your drop.",
  cashRides: "Cash isn't accepted for rides right now. Please pick another payment method.",
  outstation: "Outstation and one-way trips are turned off for now. Local packages are still available.",
  selfDrive: "Self-drive is turned off for now. You can book a car with a chauffeur.",
  tripOffers: "Adding bookings to a trip is turned off for now.",
  referral: "Refer and earn is turned off for now.",
  ridePass: "QuikFly Pass isn't on sale right now. Passes already bought keep working.",
  womenOnly: "Women-only rides are paused for now. Please pick another ride type.",
} as const;

/** What a new quote, ride or booking asks for: only the parts the switches look at. */
export interface SwitchCheck {
  service: ServiceKey;
  scheduledFor?: string | null;
  stopCount?: number;
  payment?: PaymentMethod;
  rentMode?: "self" | "driver";
  groupTrip?: GroupTrip;
  tripOf?: string | null;
}

/** Why the switches refuse this request, or null when it's allowed. */
export function switchError(settings: Settings, r: SwitchCheck): string | null {
  if (!serviceOn(settings, r.service)) return settings.servicePausedMessage;
  if (r.scheduledFor && !settings.featureRideScheduling) return FEATURE_OFF.rideScheduling;
  if (r.stopCount && !settings.featureMultiStop) return FEATURE_OFF.multiStop;
  if (r.payment === "cash" && !settings.featureCashRides) return FEATURE_OFF.cashRides;
  if (r.rentMode === "self" && !settings.featureSelfDrive) return FEATURE_OFF.selfDrive;
  if (r.groupTrip && r.groupTrip !== "local" && !settings.featureOutstation) return FEATURE_OFF.outstation;
  if (r.tripOf && !settings.featureTripOffers) return FEATURE_OFF.tripOffers;
  return null;
}
