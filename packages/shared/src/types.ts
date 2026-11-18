// Shared domain types. The API returns these shapes, and the website and the
// mobile app consume them, so change them here only.

export type ServiceKey = "bike" | "car" | "bus" | "tours" | "rent" | "rentals";
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
  /** Share rides between NIGHT_HOURS with emergency contacts automatically. */
  autoShareNightRides: boolean;
}

/** Fields a user can change on their profile. Send only what changes; null clears. */
export interface ProfileUpdate {
  name?: string;
  email?: string | null;
  gender?: Gender | null;
  dob?: string | null;
  gst?: { gstin: string; name: string } | null;
  autoShareNightRides?: boolean;
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

export type WalletTxnKind = "welcome" | "payment" | "refund" | "referral" | "opening";

export interface WalletTransaction {
  id: string;
  kind: WalletTxnKind;
  /** Positive = money in, negative = money out. */
  amount: number;
  note: string;
  bookingId: string | null;
  createdAt: string;
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
}

/** A driver on the roster (catalog). A booked ride gets one, plus a vehicle and plate. */
export interface DriverProfile {
  id: string;
  name: string;
  rating: number;
  trips: number;
  phone: string;
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
}

export interface FareQuote {
  option: RideOption;
  fare: number;
  distanceKm: number;
  durationMin: number;
  etaMin: number;
  /** Surge in this fare (1 = none). Shown to the rider before booking (MVAG 2025). */
  surge: number;
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

export type TourTheme = "beach" | "hills" | "international" | "weekend" | "heritage";

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
  /** Why the rider cancelled (a RIDE_CANCEL_REASONS key), when given. */
  cancelReason: string | null;
  /** Ride cancellation fee kept (wallet) or owed (cash/UPI, not collected in the preview); 0 when none. */
  cancelFee: number;
  /** Refundable deposit inside `amount` (₹, self-drive only; 0 otherwise). Returned in full on cancel, and on completion once staff confirm the return. */
  deposit: number;
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
  /** Last day the code works (YYYY-MM-DD, India time), or null for no end. */
  validUntil: string | null;
  /** Times one customer may use it, or null for no limit. */
  perUserLimit: number | null;
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
}

export const RENT_KM_PLANS = ["limited", "unlimited"] as const;
export const RENT_PROTECTION = ["standard", "peace"] as const;

/** What to price. Rides are quoted by POST /rides/quote instead. */
export type QuoteRequest =
  /** `genders` lines up with `seatIds` (who sits where); women-only seats need "female". */
  | { service: "bus"; busId: string; from: string; to: string; date: string; seatIds: string[]; genders?: Gender[] }
  /** `start` is the travel date (YYYY-MM-DD); the cancellation policy counts down to it. */
  | { service: "tours"; tourId: string; adults: number; kids: number; start: string }
  | {
      service: "rent"; carId: string; mode: "self" | "driver";
      /** Local date-times "YYYY-MM-DDTHH:mm". */
      start: string; end: string;
      kmPlan: (typeof RENT_KM_PLANS)[number]; protection: (typeof RENT_PROTECTION)[number]; doorstep: boolean;
    }
  | { service: "rentals"; vehicleId: string; trip: "local" | "outstation"; destinationId?: string; days: number; start: string };

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
}

/** Body of POST /bookings. The amount comes from the quote (or the ride), never the client. */
export interface NewBooking {
  service: ServiceKey;
  title: string;
  subtitle: string;
  payment: PaymentMethod;
  lines: [string, string][];
  /** For bus, tours, rent and rentals. */
  quoteId?: string;
  /** For bike and car rides (the ride carries its fare). */
  rideId?: string;
  couponCode?: string;
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
}
