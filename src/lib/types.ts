// Shared domain types. Keep these in sync with the backend API responses —
// the same shapes will be reused by the mobile app.

export type ServiceKey = "bike" | "car" | "bus" | "tours" | "rent" | "rentals";
export type PaymentMethod = "cash" | "upi" | "wallet" | "card";
export type BookingStatus = "confirmed" | "ongoing" | "completed" | "cancelled";

export interface User {
  id: string;
  name: string;
  phone: string;
  walletBalance: number;
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
