import type {
  Booking, Bus, FareQuote, PaymentMethod, Place, RentalCar, Ride, Seat,
  ServiceKey, TourPackage, TravelVehicle, User,
} from "@quikfly/shared";

/**
 * The single contract between the UI and the backend.
 * Every screen talks to `api` (see ./index.ts) — never to fetch() directly.
 * The mock implementation powers the demo; the HTTP implementation maps
 * each method to a REST endpoint (listed beside each method) for the real
 * backend, which the Flutter/React Native app will reuse.
 */
export interface QuikflyApi {
  auth: {
    /** POST /auth/otp */
    sendOtp(phone: string): Promise<{ sent: boolean }>;
    /** POST /auth/verify */
    verifyOtp(phone: string, otp: string, name?: string): Promise<{ token: string; user: User }>;
    /** POST /auth/logout — ends the session; always clears the stored token. */
    signOut(): Promise<void>;
    /** GET /auth/me — the signed-in user, with the current wallet balance. */
    me(): Promise<User>;
  };
  places: {
    /** GET /places?q= */
    search(q: string): Promise<Place[]>;
  };
  rides: {
    /** POST /rides/quote */
    quote(service: "bike" | "car", pickupId: string, dropId: string): Promise<FareQuote[]>;
    /** POST /rides */
    book(input: { optionId: string; pickupId: string; dropId: string; payment: PaymentMethod }): Promise<Ride>;
    /** POST /rides/:id/cancel */
    cancel(rideId: string): Promise<void>;
  };
  buses: {
    /** GET /buses?from=&to=&date= */
    search(from: string, to: string, date: string): Promise<Bus[]>;
    /** GET /buses/:id/seats?date= */
    seats(busId: string, date: string): Promise<Seat[]>;
  };
  tours: {
    /** GET /tours */
    list(): Promise<TourPackage[]>;
  };
  rentals: {
    /** GET /rentals/cars?city= */
    cars(city: string): Promise<RentalCar[]>;
    /** GET /rentals/travel-vehicles */
    travelVehicles(): Promise<TravelVehicle[]>;
  };
  bookings: {
    /** GET /bookings */
    list(): Promise<Booking[]>;
    /** POST /bookings — a wallet payment is deducted here and fails if the balance is too low. */
    create(input: Omit<Booking, "id" | "createdAt" | "status"> & { service: ServiceKey }): Promise<Booking>;
    /** POST /bookings/:id/cancel — refunds a wallet payment. */
    cancel(id: string): Promise<Booking>;
    /** POST /bookings/:id/complete — marks a finished trip (stand-in for the driver app). */
    complete(id: string): Promise<Booking>;
  };
}
