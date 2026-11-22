// Shared domain types. The API returns these shapes, and the website and the
// mobile app consume them, so change them here only.
import type { RentalState } from "./rental";
import type { BookingTerms } from "./terms";
import type { QuickParcelPlan, ParcelCategory, ParcelDeparture, ParcelHandover, ParcelQuoteInfo, ParcelSize, ParcelState, ParcelWeightBand } from "./parcel";

export type ServiceKey = "bike" | "car" | "bus" | "tours" | "rent" | "rentals" | "parcel";
/** How a booking is paid. Only "wallet" moves money inside QuikFly; the rest go to a gateway later. */
export const PAYMENT_METHODS = ["upi", "card", "netbanking", "wallet", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type BookingStatus = "confirmed" | "ongoing" | "completed" | "cancelled";

export const GENDERS = ["female", "male", "other"] as const;
export type Gender = (typeof GENDERS)[number];

/** Driving-licence check for self-drive rentals. An admin approves or rejects "pending" (see the licence queue). */
export type LicenceStatus = "none" | "pending" | "verified" | "rejected";

export interface User {
  id: string;
  name: string;
  phone: string;
  walletBalance: number;
  /** Unexpired QuikFly Credits (₹), separate from the wallet: see credits.ts. */
  creditBalance: number;
  /** When the rider's QuikFly Pass ends (ISO), while one is running; null otherwise. */
  passUntil: string | null;
  email: string | null;
  gender: Gender | null;
  /** YYYY-MM-DD */
  dob: string | null;
  /** False until the sign-up step (name etc.) is done. */
  profileComplete: boolean;
  /** This user's own code to share. */
  referralCode: string;
  /** True once a friend's code has been applied (only allowed once). */
  referred: boolean;
  licence: { status: LicenceStatus; number: string | null; expiry: string | null; /** Why it was rejected. */ note: string | null };
  /** Business details printed on GST invoices. */
  gst: { gstin: string; name: string } | null;
  /** Older apps read this: true when rides are shared automatically at all (see autoShareRides). */
  autoShareNightRides: boolean;
  /** Safety Preferences: share the trip with emergency contacts automatically on no rides, night rides (NIGHT_HOURS) or every ride. */
  autoShareRides: AutoShareMode;
  /** The rider's own 4-digit ride PIN, used instead of a new code each ride; null = a new code every ride. */
  ridePin: string | null;
  /** The privacy notice version (PRIVACY_NOTICE.version) this person agreed to; null = not yet. Apps ask again when it's behind. */
  privacyConsent: string | null;
}

export const AUTO_SHARE_MODES = ["off", "night", "always"] as const;
export type AutoShareMode = (typeof AUTO_SHARE_MODES)[number];

/** Fields a user can change on their profile. Send only what changes; null clears. */
export interface ProfileUpdate {
  name?: string;
  email?: string | null;
  gender?: Gender | null;
  dob?: string | null;
  gst?: { gstin: string; name: string } | null;
  /** Older apps send this; true = "night", false = "off". */
  autoShareNightRides?: boolean;
  autoShareRides?: AutoShareMode;
  ridePin?: string | null;
}

/** Result of signing in. */
export interface AuthResult {
  token: string;
  user: User;
  /** First sign-in: show the "complete your profile" step. */
  isNew: boolean;
  /** The account was scheduled for deletion and signing in cancelled that. */
  restored: boolean;
}

export const SAVED_PLACE_KINDS = ["home", "work", "other"] as const;
export type SavedPlaceKind = (typeof SAVED_PLACE_KINDS)[number];

export interface SavedPlace {
  id: string;
  kind: SavedPlaceKind;
  /** "Home", "Work", or the user's own label. */
  label: string;
  place: Place;
}

export interface Traveller {
  id: string;
  name: string;
  age: number;
  gender: Gender;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
}

/** adjustment: a credit or debit made by staff (the note says why). */
export type WalletTxnKind = "welcome" | "payment" | "refund" | "referral" | "opening" | "adjustment";

/** What the safety sheet sends when someone presses SOS. Location only when the app has it. */
export interface SosRequest {
  rideId?: string;
  bookingId?: string;
  lat?: number;
  lng?: number;
  /** Optional, e.g. "driver took a wrong turn" (SOS_NOTE_MAX). */
  note?: string;
}
export const SOS_NOTE_MAX = 200;

/** The API's answer to an SOS press: a reference the customer can quote to support. */
export interface SosReceipt {
  id: string;
  createdAt: string;
  /** Always "open" when raised. */
  status: "open" | "acknowledged" | "closed";
}

export interface WalletTransaction {
  id: string;
  kind: WalletTxnKind;
  /** Positive = money in, negative = money out. */
  amount: number;
  note: string;
  bookingId: string | null;
  createdAt: string;
}

export type CreditKind = "earned" | "spent" | "returned" | "expired";

/** One entry in the credits history (GET /me/credits). */
export interface CreditEntry {
  id: string;
  kind: CreditKind;
  /** Positive = credits in, negative = used or expired. */
  amount: number;
  note: string;
  bookingId: string | null;
  createdAt: string;
  /** Credits in: when they expire, and how much of them is still unused. */
  expiresAt: string | null;
  remaining: number;
}

export interface CreditSummary {
  balance: number;
  /** The soonest-expiring unused credits, or null when there are none. */
  nextExpiry: { amount: number; expiresAt: string } | null;
  items: CreditEntry[];
}

/** What a notification is about; the apps pick an icon and where tapping it goes. */
export const NOTIFICATION_KINDS = [
  "booking.confirmed", "booking.cancelled", "booking.cancelled_by_staff", "booking.deposit_returned",
  "licence.approved", "licence.rejected", "ride.reminder", "credits.earned", "booking.changed", "support.reply",
  "parcel.moved", "parcel.ready", "parcel.collected", "parcel.unclaimed",
  "vendor.changes", "vendor.approved", "vendor.rejected", "vendor.active", "vendor.fleet", "vendor.document", "vendor.trip", "vendor.payout",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** One entry in the customer's notification inbox (also pushed to their phones when push is on). */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** The booking it is about, if any (tapping opens My Trips). */
  bookingId: string | null;
  createdAt: string;
  readAt: string | null;
}

/** What a shared ride link shows. Personal details are trimmed. */
export interface SharedRide {
  riderName: string;
  service: "bike" | "car";
  status: "active" | "cancelled";
  /** When the driver started heading to the pickup (ISO). */
  startedAt: string;
  pickup: Place;
  drop: Place;
  /** Stops between pickup and drop, in order. */
  stops: Place[];
  distanceKm: number;
  durationMin: number;
  etaMin: number;
  driver: { name: string; rating: number; vehicle: string; plate: string };
}

export interface Place {
  id: string;
  name: string;
  area: string;
  /** Position on the demo map (0–100). The real API returns lat/lng instead. */
  x: number;
  y: number;
  /** "yes": rides to or from here pay Settings.rideAirportFee (shown as its own amount). Missing = no. */
  airport?: "yes" | "no";
}

export interface RideOption {
  id: string;
  service: "bike" | "car";
  name: string;
  description: string;
  seats: number;
  baseFare: number;
  perKm: number;
  perMin: number;
  /** Vehicle models a driver of this type may arrive in, e.g. "Maruti Swift". */
  models: string[];
  /** "women": only women riders see and book it, and a woman captain drives (B8). Missing = everyone. */
  riders?: "everyone" | "women";
  /** The fare never goes below this (₹, before surge and night charge); missing or 0 = no minimum. State fare cards set one. */
  minFare?: number | null;
  /** Kilometres covered by the base fare before per-km applies (MVAG 2025: 3 km); missing or 0 = none. */
  includedKm?: number | null;
  /** Average speed for this type (km/h), which sets the billed minutes; missing = RIDE_SIM.speedKmh for its service. */
  speedKmh?: number | null;
}

/**
 * A surge rule (catalog kind "surgeRule"): a multiplier for some ride types on some days and
 * hours. The highest matching rule, or the everyday surge in Settings, applies, never above
 * `surgeCap`. Lets staff surge cabs without surging bikes, or set weekend hours.
 */
export interface SurgeRule {
  id: string;
  name: string;
  /** Which ride types: every type, bikes (not autos), autos, or cabs. */
  appliesTo: "all" | "bike" | "auto" | "cab";
  /** India-time weekdays it runs on. */
  days: ("Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun")[];
  /** Inclusive India-time hour ranges, "8-10, 17-20" (the same format as Settings.surgeHours). */
  hours: string;
  multiplier: number;
}

/** A driver on the roster (catalog). A booked ride gets one, plus a vehicle and plate. */
export interface DriverProfile {
  id: string;
  name: string;
  rating: number;
  trips: number;
  phone: string;
  /** Women-only rides go to drivers marked "female". Missing = not matched to women-only rides. */
  gender?: "female" | "male";
}

export interface City {
  id: string;
  name: string;
}

export interface BusOperator {
  id: string;
  name: string;
}

/** A bus route shortcut shown on the bus page. */
export interface PopularRoute {
  id: string;
  from: string;
  to: string;
}

/** An outstation destination for group travel, with the one-way distance from Chennai. */
export interface GroupDestination {
  id: string;
  name: string;
  km: number;
  /** Tolls one way (₹), quoted as "Tolls (estimate)"; staff settle the actual tolls when the trip is completed. Missing = tolls paid on actuals. */
  tollEstimate?: number | null;
}

/**
 * A bus route fare (catalog kind "busRoute"): listed routes are priced by distance, either
 * direction; other routes keep the base fares in Settings.
 */
export interface BusRoute {
  id: string;
  from: string;
  to: string;
  km: number;
  /** ₹ per km for an AC and a non-AC seat (sleeper buses add Settings.busSleeperExtra). */
  acPerKm: number;
  nonAcPerKm: number;
}

/** Peak or festival dates (catalog kind "fareCalendar"): a % up (or down) on one service's prices for trips starting in the range. */
export interface FareDate {
  id: string;
  name: string;
  service: "all" | "bus" | "tours" | "rent" | "rentals";
  /** India dates, inclusive (YYYY-MM-DD). */
  from: string;
  to: string;
  /** −50 to +100. */
  percent: number;
}

export interface FareQuote {
  option: RideOption;
  fare: number;
  distanceKm: number;
  durationMin: number;
  etaMin: number;
  /** Surge in this fare (1 = none). Shown to the rider before booking (MVAG 2025). */
  surge: number;
  /** ₹ the rider's QuikFly Pass took off this fare (the surge it waived); absent or 0 = none. */
  passSaving?: number;
  /** ₹ of night charge inside `fare` (Settings.rideNightPercent during rideNightHours); absent or 0 = none. Shown to the rider. */
  nightCharge?: number;
  /** ₹ airport fee inside `fare` (a pickup or drop at a place marked airport); absent or 0 = none. Shown to the rider. */
  airportFee?: number;
}

export interface Driver {
  name: string;
  rating: number;
  trips: number;
  vehicle: string;
  plate: string;
  phone: string;
}

export interface Ride {
  id: string;
  quote: FareQuote;
  pickup: Place;
  drop: Place;
  driver: Driver;
  otp: string;
  payment: PaymentMethod;
  /** Pickup time of a ride booked ahead (ISO, India time); null for ride-now. The rider starts it from My Trips. */
  scheduledFor: string | null;
  /** Stops between pickup and drop, in order (up to RIDE_MAX_STOPS). */
  stops: Place[];
}

export interface Bus {
  id: string;
  operator: string;
  type: string;
  ac: boolean;
  sleeper: boolean;
  depart: string;
  arrive: string;
  duration: string;
  fare: number;
  seatsLeft: number;
  rating: number;
  amenities: string[];
  boardingPoints: string[];
}

export interface Seat {
  id: string;
  label: string;
  /** Single-deck buses use "lower" for every seat. */
  deck: "lower" | "upper";
  row: number;
  /** 0 and 1 are the pair on the left; 2 (and 3 on 2+2 buses) sit across the aisle. */
  col: number;
  sleeper: boolean;
  booked: boolean;
  /** Who holds a booked seat (for the "booked by a woman" marker); null when free. */
  bookedGender: Gender | null;
  /** Women only: the seat next to it (same pair) is held by a woman. The API refuses anyone else. */
  ladies: boolean;
  price: number;
}

/** A seat held by a real booking (stored by the API; generated seats are simulated). */
export interface SeatHold {
  seatId: string;
  gender: Gender;
}

export type TourTheme = "beach" | "hills" | "international" | "weekend" | "heritage" | "spiritual" | "women" | "seniors";

/** A dated group departure of a holiday package (catalog kind "departure"). */
export interface TourDeparture {
  id: string;
  tourId: string;
  /** YYYY-MM-DD (India) */
  date: string;
  /** Where the group starts, e.g. "Chennai". */
  fromCity: string;
  seats: number;
  /** Price per adult for this departure; null = the package price. */
  price: number | null;
}

/** An upcoming departure as customers see it (GET /tours): seats left counts active bookings. */
export interface DepartureView {
  id: string;
  date: string;
  fromCity: string;
  seats: number;
  seatsLeft: number;
  /** Price per adult. */
  price: number;
}

export interface TourPackage {
  id: string;
  slug: string;
  themes: TourTheme[];
  hotelStars: number;
  meals: string;
  title: string;
  location: string;
  days: number;
  nights: number;
  price: number;
  rating: number;
  tag?: string;
  highlights: string[];
  includes: string[];
  itinerary: string[];
  hue: number;
  /** Set by the API (not stored on the package): upcoming group departures, soonest first. None = start any date. */
  departures?: DepartureView[];
}

export interface RentalCar {
  id: string;
  name: string;
  category: "Hatchback" | "Sedan" | "SUV" | "MUV" | "Luxury";
  seats: number;
  transmission: "Manual" | "Automatic";
  fuel: "Petrol" | "Diesel" | "EV";
  pricePerHour: number;
  driverPerDay: number;
  rating: number;
  trips: number;
  year: number;
  features: string[];
}

/** Group / outstation trips: a local package, a round trip from Chennai, or one way (drop only). */
export const GROUP_TRIPS = ["local", "outstation", "oneway"] as const;
export type GroupTrip = (typeof GROUP_TRIPS)[number];

export interface TravelVehicle {
  id: string;
  name: string;
  seats: number;
  perKm: number;
  minKmPerDay: number;
  driverBataPerDay: number;
  localPackage: number; // 8 hr / 80 km
  features: string[];
}

/** The booking line that records a coupon ("HOLIDAY10 (−₹2,940)"). Written by the API only; apps may show it as is. */
export const COUPON_LINE = "Coupon";

export interface Booking {
  id: string;
  service: ServiceKey;
  title: string;
  subtitle: string;
  amount: number;
  status: BookingStatus;
  createdAt: string;
  /** Wallet payments are deducted when booked and refunded when cancelled, per the service's cancellation policy. */
  payment: PaymentMethod;
  lines: [string, string][];
  /** When the trip starts (ISO), from the quote; null for rides and bookings made before policies existed. */
  startsAt: string | null;
  /** What came back (₹): the policy's share when cancelled, the deposit when a rental is completed; null while active. */
  refundAmount: number | null;
  /** The ride behind a bike/car booking (to start a scheduled ride); null for other services. */
  rideId: string | null;
  /** Bookings that belong together share a trip id (the id of the booking the trip started from); null when alone. */
  tripId: string | null;
  /** Why the rider cancelled (a RIDE_CANCEL_REASONS key), when given. */
  cancelReason: string | null;
  /** Ride cancellation fee kept (wallet) or owed (cash/UPI, not collected in the preview); 0 when none. */
  cancelFee: number;
  /** Refundable deposit inside `amount` (₹, self-drive only; 0 otherwise). Returned in full on cancel, and on completion once staff confirm the return. */
  deposit: number;
  /** Paid with QuikFly Credits (₹), on top of `amount`; 0 when none. */
  creditsUsed: number;
  /** Coupon discount (₹) taken off this booking; 0 when none. */
  discount: number;
  /** Bus seats this booking holds now (empty for other services, and once cancelled). */
  seats: BookingSeat[];
  /** Bus bookings: the m-ticket's token (GET /tickets/:token, the QR code); null for other services. */
  ticketToken: string | null;
  /** When a bus booking was moved to another bus or date (allowed once); null when never. */
  rescheduledAt: string | null;
  /** Self-drive bookings: where the rental is (GET /bookings/:id/rental has the details); null for everything else. */
  rentalState: RentalState | null;
  /** Parcels: where the parcel is (GET /bookings/:id/parcel has the details); null for everything else. */
  parcelState: ParcelState | null;
  /**
   * The settings this booking was sold under (cancellation policy, ride fee, GST rate, self-drive
   * rates; see terms.ts). Refunds, settlements and invoices use them. Null for bookings made before
   * terms were stored: they use today's settings (withTerms handles both).
   */
  terms: BookingTerms | null;
}

/** A seat a bus booking holds, with what it cost (₹ before GST) and who sits there. */
export interface BookingSeat {
  id: string;
  price: number;
  gender: Gender;
}

/** What a bus m-ticket's QR code opens: enough for a conductor to check it, nothing private beyond first names. */
export interface PublicTicket {
  pnr: string;
  /** "valid" until a while after departure (TICKET_VALID_HOURS_AFTER_DEPARTURE), then "expired"; "cancelled" or "completed" as booked. */
  status: "valid" | "expired" | "cancelled" | "completed";
  title: string;
  subtitle: string;
  startsAt: string | null;
  seats: string[];
  /** Date, departure, arrival as booked. */
  details: [string, string][];
  /** Travellers' first names, in seat order. */
  travellers: string[];
}

/** A coupon. The API checks it at booking; the website only shows it. */
export interface Offer {
  id: string;
  code: string;
  title: string;
  description: string;
  service: ServiceKey | "all";
  hue: number;
  /** Discount as a percentage of the total (100 = flat discount up to maxDiscount). */
  percent: number;
  /** Largest discount in rupees. */
  maxDiscount: number;
  /** Smallest booking total the code works on, in rupees (0 = any). */
  minAmount: number;
  /** First day the code works (YYYY-MM-DD, India time), or null/missing for "from now". Older offers don't have it. */
  validFrom?: string | null;
  /** Last day the code works (YYYY-MM-DD, India time), or null for no end. */
  validUntil: string | null;
  /** Times one customer may use it, or null for no limit. */
  perUserLimit: number | null;
  /** Uses by all customers together (bookings not cancelled), or null/missing for no limit. */
  maxUses?: number | null;
}

export const FAQ_CATEGORIES = ["Rides", "Bus", "Holidays", "Rentals", "Payments", "Account"] as const;

export interface Faq {
  id: string;
  q: string;
  a: string;
  category: (typeof FAQ_CATEGORIES)[number];
}

/** One line of a price breakdown. */
export interface FareLine {
  label: string;
  amount: number;
}

/**
 * A price worked out by the API. Bookings refer to it by id, so the amount
 * can't be changed in the browser. Valid until `expiresAt`, and only once.
 */
export interface PriceQuote {
  id: string;
  service: ServiceKey;
  lines: FareLine[];
  total: number;
  expiresAt: string;
  /** Parcel quotes: the liability cap and, for a bus parcel, its departure. */
  parcel?: ParcelQuoteInfo;
}

export const RENT_KM_PLANS = ["limited", "unlimited"] as const;
export const RENT_PROTECTION = ["standard", "peace"] as const;

/** What to price. Rides are quoted by POST /rides/quote instead. */
export type QuoteRequest =
  /** `genders` lines up with `seatIds` (who sits where); women-only seats need "female". */
  | { service: "bus"; busId: string; from: string; to: string; date: string; seatIds: string[]; genders?: Gender[]; /** Set by the API when it prices the quote (₹ per seat, before GST). */ seatPrices?: number[] }
  /** `start` is the travel date (YYYY-MM-DD); the cancellation policy counts down to it. */
  /** `departureId` is required when the package has upcoming departures; `start` then becomes its date. */
  | { service: "tours"; tourId: string; adults: number; kids: number; start: string; departureId?: string }
  | {
      service: "rent"; carId: string; mode: "self" | "driver";
      /** Local date-times "YYYY-MM-DDTHH:mm". */
      start: string; end: string;
      kmPlan: (typeof RENT_KM_PLANS)[number]; protection: (typeof RENT_PROTECTION)[number]; doorstep: boolean;
    }
  | { service: "rentals"; vehicleId: string; trip: GroupTrip; destinationId?: string; days: number; start: string }
  | (ParcelDetails & {
      service: "parcel"; mode: "city"; pickupId: string; dropId: string;
      /** Set by the API when it prices the quote, never read from a client. */
      plan?: QuickParcelPlan;
    })
  | (ParcelDetails & {
      service: "parcel"; mode: "intercity"; from: string; to: string;
      /** A departure from GET /parcels/options. */
      busId: string; departAt: string;
      pickup: ParcelHandover; delivery: ParcelHandover;
      /** Set by the API when it prices the quote, never read from a client. */
      plan?: { departure: ParcelDeparture; liability: number };
    });

/** What is being sent. */
export interface ParcelDetails {
  category: ParcelCategory;
  weightBand: ParcelWeightBand;
  size: ParcelSize;
  /** ₹, up to Settings.parcelMaxDeclaredValue. */
  declaredValue: number;
}

/** Result of checking a coupon against a quote. */
export interface CouponCheck {
  code: string;
  discount: number;
  /** Total after the discount. */
  total: number;
}

/** Everything the apps load once at start-up (GET /config). Lists contain only visible items. */
export interface AppConfig {
  settings: import("./settings").Settings;
  places: Place[];
  rideOptions: RideOption[];
  cities: City[];
  busOperators: BusOperator[];
  popularRoutes: PopularRoute[];
  groupDestinations: GroupDestination[];
  offers: Offer[];
  faqs: Faq[];
  /** Visible surge rules (ride types, days, hours, multiplier); missing from APIs before 2026-11-20, so read it as `?? []`. */
  surgeRules?: SurgeRule[];
  /** Peak and festival dates (prices up or down by %); read as `?? []` for the same reason. */
  fareCalendar?: FareDate[];
}

/** Body of POST /bookings. The amount comes from the quote (or the ride), never the client. */
export interface NewBooking {
  service: ServiceKey;
  title: string;
  subtitle: string;
  payment: PaymentMethod;
  lines: [string, string][];
  /** For bus, tours, rent, rentals and parcels. */
  quoteId?: string;
  /** For bike and car rides (the ride carries its fare). */
  rideId?: string;
  couponCode?: string;
  /** Join the trip of this booking (e.g. a cab to the boarding point of a bus booking). */
  tripOf?: string;
  /** Pay part of it with QuikFly Credits (the API decides how much: creditsUsable). */
  useCredits?: boolean;
  /**
   * Parcels need all three. `declaration` is the version shown to the sender (GET /parcels/options).
   * The API writes a parcel booking's title, subtitle and lines itself, so personal data stays out of them.
   */
  receiver?: { name: string; phone: string };
  contents?: string;
  declaration?: string;
}

/** What the generic /checkout page needs; created by any service page. */
export interface CheckoutDraft {
  service: ServiceKey;
  title: string;
  subtitle: string;
  image?: string;
  summary: [string, string][];
  /** The API's price for this booking; checkout shows its lines and books with its id. */
  quote: PriceQuote;
  travellers: string[];          // labels for name fields, e.g. ["Seat L4", "Seat L5"]
  needsLicence?: boolean;
  policy: string;
  /** Parcels: what POST /bookings needs besides the quote. Never put in `summary` or booking lines. */
  parcel?: {
    request: Extract<QuoteRequest, { service: "parcel" }>;
    receiver: { name: string; phone: string };
    contents: string;
    declaration: string;
  };
}
