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
}

export interface FareQuote {
  option: RideOption;
  fare: number;
  distanceKm: number;
  durationMin: number;
  etaMin: number;
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
  deck: "lower" | "upper";
  row: number;
  col: number;
  sleeper: boolean;
  booked: boolean;
  ladies: boolean;
  price: number;
}

export type TourTheme = "beach" | "hills" | "international" | "weekend" | "heritage";

export interface TourPackage {
  id: string;
  slug: string;
  themes: TourTheme[];
  hotelStars: number;
  meals: string;
  cancellation: string;
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

export interface Booking {
  id: string;
  service: ServiceKey;
  title: string;
  subtitle: string;
  amount: number;
  status: BookingStatus;
  createdAt: string;
  /** Wallet payments are deducted when booked and refunded when cancelled. */
  payment: PaymentMethod;
  lines: [string, string][];
}

export interface Offer {
  id: string;
  code: string;
  title: string;
  description: string;
  service: ServiceKey | "all";
  hue: number;
}

export interface Faq {
  q: string;
  a: string;
  category: "Rides" | "Bus" | "Holidays" | "Rentals" | "Payments" | "Account";
}

/** What the generic /checkout page needs; created by any service page. */
export interface CheckoutDraft {
  service: ServiceKey;
  title: string;
  subtitle: string;
  image?: string;
  summary: [string, string][];
  fare: { label: string; amount: number }[];
  travellers: string[];          // labels for name fields, e.g. ["Seat L4", "Seat L5"]
  needsLicence?: boolean;
  policy: string;
}
