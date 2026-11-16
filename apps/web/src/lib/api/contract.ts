import type {
  AuthResult, Booking, Bus, EmergencyContact, FareQuote, Gender, PaymentMethod, Place, ProfileUpdate, RentalCar, Ride,
  SavedPlace, SavedPlaceKind, Seat, ServiceKey, SharedRide, TourPackage, Traveller, TravelVehicle, User, WalletTransaction,
} from "@quikfly/shared";

/**
 * The single contract between the UI and the backend.
 * Every screen talks to `api` (see ./index.ts), never to fetch() directly.
 * mock.ts powers the offline demo; http.ts maps each method to the REST
 * endpoint named beside it (apps/api), which the Flutter app also uses.
 * Change all three, plus the API and its smoke test, together (see AGENTS.md).
 */
export interface QuikflyApi {
  auth: {
    /** POST /auth/otp */
    sendOtp(phone: string): Promise<{ sent: boolean }>;
    /** POST /auth/verify: `isNew` → show the sign-up step; `restored` → deletion was cancelled. */
    verifyOtp(phone: string, otp: string): Promise<AuthResult>;
    /** POST /auth/logout: ends the session; always clears the stored token. */
    signOut(): Promise<void>;
    /** GET /auth/me: the signed-in user, with the current wallet balance. */
    me(): Promise<User>;
  };
  account: {
    /** PATCH /me: saving a name also completes sign-up. */
    update(patch: ProfileUpdate): Promise<User>;
    /** POST /me/phone/otp */
    requestPhoneChange(phone: string): Promise<{ sent: boolean }>;
    /** POST /me/phone */
    changePhone(phone: string, otp: string): Promise<User>;
    /** POST /me/logout-all: also clears the token on this device. */
    signOutEverywhere(): Promise<void>;
    /** POST /me/delete: schedules deletion; clears the token. */
    deleteAccount(otp: string): Promise<void>;
    /** POST /me/referral */
    applyReferral(code: string): Promise<User>;
    /** PUT /me/licence */
    submitLicence(number: string, expiry: string): Promise<User>;
    /** GET /me/wallet */
    walletHistory(): Promise<WalletTransaction[]>;
  };
  savedPlaces: {
    /** GET /me/places */
    list(): Promise<SavedPlace[]>;
    /** POST /me/places (Home and Work replace the existing one) */
    save(kind: SavedPlaceKind, placeId: string, label?: string): Promise<SavedPlace[]>;
    /** DELETE /me/places/:id */
    remove(id: string): Promise<SavedPlace[]>;
  };
  travellers: {
    /** GET /me/travellers */
    list(): Promise<Traveller[]>;
    /** POST /me/travellers */
    add(t: { name: string; age: number; gender: Gender }): Promise<Traveller[]>;
    /** DELETE /me/travellers/:id */
    remove(id: string): Promise<Traveller[]>;
  };
  contacts: {
    /** GET /me/contacts */
    list(): Promise<EmergencyContact[]>;
    /** POST /me/contacts */
    add(c: { name: string; phone: string; relation?: string }): Promise<EmergencyContact[]>;
    /** DELETE /me/contacts/:id */
    remove(id: string): Promise<EmergencyContact[]>;
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
    /** POST /rides/:id/share: a public link to follow the ride. */
    share(rideId: string): Promise<{ token: string; expiresAt: string }>;
    /** GET /share/:token (public) */
    shared(token: string): Promise<SharedRide>;
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
    /** GET /bookings/:id */
    get(id: string): Promise<Booking>;
    /** POST /bookings: a wallet payment is deducted here and fails if the balance is too low. */
    create(input: Omit<Booking, "id" | "createdAt" | "status"> & { service: ServiceKey }): Promise<Booking>;
    /** POST /bookings/:id/cancel: refunds a wallet payment. */
    cancel(id: string): Promise<Booking>;
    /** POST /bookings/:id/complete: marks a finished trip (stand-in for the driver app). */
    complete(id: string): Promise<Booking>;
  };
}
