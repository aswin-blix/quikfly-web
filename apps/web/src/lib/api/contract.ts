import type {
  AppConfig, AuthResult, Booking, Bus, CouponCheck, EmergencyContact, FareQuote, Gender, NewBooking, PaymentMethod, Place, PriceQuote,
  ProfileUpdate, QuoteRequest, RentalCar, Ride, SavedPlace, SavedPlaceKind, Seat, SharedRide, TourPackage, Traveller, TravelVehicle, User,
  WalletTransaction, AppNotification, CreditSummary,
} from "@quikfly/shared";
import type { RideCancelReason } from "@quikfly/shared";

/**
 * The single contract between the UI and the backend.
 * Every screen talks to `api` (see ./index.ts), never to fetch() directly.
 * mock.ts powers the offline demo; http.ts maps each method to the REST
 * endpoint named beside it (apps/api), which the Flutter app also uses.
 * Change all three, plus the API and its smoke test, together (see AGENTS.md).
 */
export interface QuikflyApi {
  config: {
    /** GET /config: settings and the small catalog lists, loaded once at start-up (components/ConfigProvider.tsx). */
    get(): Promise<AppConfig>;
  };
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
    /** GET /me/credits: QuikFly Credits balance, the soonest expiry, and history. */
    credits(): Promise<CreditSummary>;
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
    /** POST /rides/quote; `scheduledFor` ("YYYY-MM-DDTHH:mm", India) prices a ride booked ahead. */
    quote(service: "bike" | "car", pickupId: string, dropId: string, scheduledFor?: string, stopIds?: string[]): Promise<FareQuote[]>;
    /** POST /rides; `stopIds` = up to RIDE_MAX_STOPS places between pickup and drop, in order. */
    book(input: { optionId: string; pickupId: string; dropId: string; payment: PaymentMethod; scheduledFor?: string; stopIds?: string[] }): Promise<Ride>;
    /** GET /rides/:id (the rider's own ride) */
    get(rideId: string): Promise<Ride>;
    /** POST /rides/:id/start: starts a scheduled ride near pickup time. */
    start(rideId: string): Promise<Ride>;
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
    /** GET /buses/:id/seats?from=&to=&date= (each seat carries its price) */
    seats(bus: { id: string; from: string; to: string }, date: string): Promise<Seat[]>;
  };
  tours: {
    /** GET /tours */
    list(): Promise<TourPackage[]>;
    /** GET /tours/:slug (rejects when hidden or missing) */
    get(slug: string): Promise<TourPackage>;
  };
  rentals: {
    /** GET /rentals/cars?city= */
    cars(city: string): Promise<RentalCar[]>;
    /** GET /rentals/cars/:id */
    car(id: string): Promise<RentalCar>;
    /** GET /rentals/travel-vehicles */
    travelVehicles(): Promise<TravelVehicle[]>;
  };
  quotes: {
    /** POST /quotes: the API's price for a bus, holiday, self-drive or group booking. */
    create(req: QuoteRequest): Promise<PriceQuote>;
  };
  offers: {
    /** POST /offers/check: what a coupon takes off a quote or a ride (rejects with the reason). */
    check(code: string, ref: { quoteId: string } | { rideId: string }): Promise<CouponCheck>;
  };
  notifications: {
    /** GET /me/notifications: the newest notifications and the unread count. */
    list(): Promise<{ items: AppNotification[]; unread: number }>;
    /** POST /me/notifications/read: these ids, or all when none are given. */
    markRead(ids?: string[]): Promise<{ unread: number }>;
  };
  bookings: {
    /** GET /bookings */
    list(): Promise<Booking[]>;
    /** GET /bookings/:id */
    get(id: string): Promise<Booking>;
    /**
     * POST /bookings: priced by `quoteId` (or `rideId` for rides) minus `couponCode`; the API sets
     * the amount. A wallet payment is deducted here and fails if the balance is too low.
     */
    create(input: NewBooking): Promise<Booking>;
    /** POST /bookings/:id/cancel { reason? }: refunds per the policy; rides may keep the cancellation fee without a valid reason. */
    cancel(id: string, reason?: RideCancelReason): Promise<Booking>;
    /** POST /bookings/:id/complete: marks a finished trip (stand-in for the driver app). */
    complete(id: string): Promise<Booking>;
  };
}
