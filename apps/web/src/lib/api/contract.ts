import type {
  AppConfig, AuthResult, Booking, Bus, CouponCheck, EmergencyContact, FareQuote, Gender, NewBooking, PaymentMethod, Place, PriceQuote,
  ProfileUpdate, QuoteRequest, RentalCar, Ride, LiveRide, SavedPlace, SavedPlaceKind, Seat, SharedRide, TourPackage, Traveller, TravelVehicle, User,
  WalletTransaction, AppNotification, CreditSummary, DataExport,
} from "@quikfly/shared";
import type { CallbackTime, FareLine, Parcel, ParcelOptions, PublicTracking, PublicTicket, Rental, RentalPhotoSide, RentalStage, RideCancelReason, SosReceipt, SosRequest, SupportTicket, SupportTopic, VendorApplication, VendorDocument, VendorSection } from "@quikfly/shared";

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
    /** POST /me/consent: agree to the privacy notice (PRIVACY_NOTICE.version); returns the user with privacyConsent set. */
    consent(version: string): Promise<User>;
    /** GET /me/export: everything QuikFly holds about this person (the DPDP right of access), saved as a JSON file. */
    exportData(): Promise<DataExport>;
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
    /** POST /me/pass: buy a QuikFly Pass from the wallet; returns when the pass now ends. */
    buyPass(): Promise<{ passUntil: string }>;
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
  sos: {
    /** POST /me/sos: records an SOS press for the QuikFly safety desk (admin → SOS). Nothing is dispatched automatically yet. */
    raise(req: SosRequest): Promise<SosReceipt>;
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
    /**
     * POST /rides; `stopIds` = up to RIDE_MAX_STOPS places between pickup and drop, in order. With live captains on,
     * a ride-now ride comes back live (isLiveRide): no driver yet, booked once a captain accepts. The mock is always simulated.
     */
    book(input: { optionId: string; pickupId: string; dropId: string; payment: PaymentMethod; scheduledFor?: string; stopIds?: string[] }): Promise<Ride | LiveRide>;
    /** GET /rides/:id (the rider's own ride). A live ride's poll also moves its captain search on. */
    get(rideId: string): Promise<Ride | LiveRide>;
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
    /** POST /quotes: the API's price for a bus, holiday, self-drive, group or parcel booking. */
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
  pushDevices: {
    /** POST /me/push-devices: this browser's PushSubscription JSON, so notifications reach it when the site is closed. */
    register(token: string, platform: "web"): Promise<{ registered: true }>;
    /** DELETE /me/push-devices/:token: forget it (turned off, or signing out). */
    remove(token: string): Promise<{ removed: true }>;
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
    /** POST /bookings/:id/cancel-seats: bus tickets cancel some seats; their share comes back per the bus policy. */
    cancelSeats(id: string, seatIds: string[]): Promise<Booking>;
    /** POST /bookings/:id/reschedule: bus tickets move once to a new bus quote on the same route; the difference is settled. */
    reschedule(id: string, change: { quoteId: string; subtitle: string; lines: [string, string][] }): Promise<{ booking: Booking; charged: number; refunded: number }>;
  };
  /** Parcels (packages/shared/src/parcel.ts): priced by quotes.create, booked by bookings.create. */
  parcels: {
    /** GET /parcels/options?from=&to=: buses still taking parcels, and the declaration to accept. */
    options(from: string, to: string): Promise<ParcelOptions>;
    /** GET /bookings/:id/parcel: the sender's parcel, with the collection code while it's ready. */
    get(bookingId: string): Promise<Parcel>;
    /** POST /bookings/:id/parcel/handover { otp }: demo, the sender confirms the captain has it (pickup code). */
    handover(bookingId: string, otp: string): Promise<Parcel>;
    /** POST /bookings/:id/parcel/deliver { otp }: demo, the sender plays the captain with the receiver's code. */
    deliver(bookingId: string, otp: string): Promise<Parcel>;
    /** GET /track/:lr (public): the timeline, with first names only. */
    track(lr: string): Promise<PublicTracking>;
  };
  tickets: {
    /** GET /tickets/:token (public): what a bus m-ticket's QR code shows. */
    get(token: string): Promise<PublicTicket>;
  };
  /** Self-drive rentals: the pickup and return checklist and extensions (packages/shared/src/rental.ts). */
  rental: {
    /** GET /bookings/:id/rental */
    get(bookingId: string): Promise<Rental>;
    /** PUT /bookings/:id/rental/photos/:stage/:side (a JPEG the browser has shrunk) */
    uploadPhoto(bookingId: string, stage: RentalStage, side: RentalPhotoSide, image: Blob): Promise<Rental>;
    /** GET /bookings/:id/rental/photos/:stage/:side as an object URL; null when there's none (or in demo mode). */
    photoUrl(bookingId: string, stage: RentalStage, side: RentalPhotoSide): Promise<string | null>;
    /** POST /bookings/:id/rental/start */
    start(bookingId: string, reading: { odometerKm: number; fuel: number }): Promise<Rental>;
    /** GET /bookings/:id/rental/extension?hours= */
    extensionQuote(bookingId: string, hours: number): Promise<{ lines: FareLine[]; total: number; endsAt: string }>;
    /** POST /bookings/:id/rental/extend */
    extend(bookingId: string, hours: number): Promise<{ rental: Rental; lines: FareLine[]; total: number }>;
    /** POST /bookings/:id/rental/return */
    end(bookingId: string, reading: { odometerKm: number; fuel: number }): Promise<Rental>;
  };
  /** Customer support: callback requests (anyone) and tickets (signed in). */
  support: {
    /** POST /support/callbacks (signed-in requests are linked to the account). */
    requestCallback(input: { name: string; phone: string; topic: SupportTopic; preferredTime: CallbackTime; message?: string; ref?: string }): Promise<SupportTicket>;
    /** GET /me/tickets */
    list(): Promise<SupportTicket[]>;
    /** GET /me/tickets/:id (with the whole thread) */
    get(id: string): Promise<SupportTicket>;
    /** POST /me/tickets */
    open(input: { topic: SupportTopic; message: string; bookingId?: string }): Promise<SupportTicket>;
    /** POST /me/tickets/:id/messages */
    reply(id: string, body: string): Promise<SupportTicket>;
    /** POST /me/tickets/:id/close */
    close(id: string): Promise<SupportTicket>;
  };
  /** Partner (vehicle owner) application and onboarding: the same /vendor endpoints as the QuikFly Partner app. */
  vendor: {
    /** GET /vendor: the signed-in user's application, or null before they start one. */
    get(): Promise<VendorApplication | null>;
    /** POST /vendor */
    start(): Promise<VendorApplication>;
    /** PUT /vendor/sections/:section (photo sections take their image with uploadDocument). */
    saveSection(section: Exclude<VendorSection, "photo">, body: Record<string, unknown>): Promise<VendorApplication>;
    /** PUT /vendor/documents/:kind: a JPEG, PNG or WebP up to VENDOR_RULES.maxPhotoBytes. */
    uploadDocument(kind: VendorDocument, image: Blob): Promise<VendorApplication>;
    /** GET /vendor/documents/:kind as an object URL to show, or null when none is saved. */
    documentUrl(kind: VendorDocument): Promise<string | null>;
    /** POST /vendor/reset: clears a draft, photos included. */
    reset(): Promise<VendorApplication>;
    /** POST /vendor/submit */
    submit(): Promise<VendorApplication>;
    /** POST /vendor/onboarding/payment (demo: nothing is collected). */
    payJoiningFee(): Promise<VendorApplication>;
    /** POST /vendor/onboarding/agreement { name, accept: true } */
    acceptAgreement(name: string): Promise<VendorApplication>;
    /** POST /vendor/onboarding/sticker */
    requestSticker(): Promise<VendorApplication>;
  };
}
