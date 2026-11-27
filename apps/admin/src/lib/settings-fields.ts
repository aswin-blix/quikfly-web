// How each business setting appears on the Settings page. Add a row when a key is added
// to `Settings` in @quikfly/shared; limits come from SETTING_RULES there, which the API enforces.
import type { Settings } from "@quikfly/shared";

export interface SettingField {
  key: keyof Settings;
  label: string;
  help: string;
  type: "toggle" | "number" | "text";
  /** Shown beside number inputs: "₹", "%", "×", "km". */
  unit?: string;
  step?: number;
  /** A row editor instead of the raw text: surge windows or cancellation tiers. */
  editor?: "hours" | "tiers";
  /** A toggle that needs thought: shown when reviewing a change that switches it on. */
  warnOn?: string;
}

export interface SettingGroup {
  title: string;
  sub: string;
  fields: SettingField[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    title: "Services",
    sub: "Switch a service off to pause new bookings: it disappears from the website and the app, and the API refuses new bookings. Bookings already made carry on.",
    fields: [
      { key: "serviceBike", type: "toggle", label: "Bike taxi", help: "Bike rides booked now or ahead." },
      { key: "serviceCar", type: "toggle", label: "Cabs", help: "Cab rides (Mini, Sedan, SUV, Prime) booked now or ahead." },
      { key: "serviceBus", type: "toggle", label: "Bus tickets", help: "Seat booking on every bus route." },
      { key: "serviceTours", type: "toggle", label: "Holidays", help: "Holiday packages." },
      { key: "serviceRent", type: "toggle", label: "Rent a car", help: "Self-drive and chauffeur rentals." },
      { key: "serviceGroup", type: "toggle", label: "Group travel", help: "Tempo travellers, buses and outstation cabs." },
      {
        key: "serviceParcel", type: "toggle", label: "Parcels", help: "Bus parcels between counters, on the website and in the app at once.",
        warnOn: "QuikFly app 0.1.16 and older can't show parcels, so their users won't see a parcel, or its collection code, until they update (the website shows both). Switch this on only when the app with parcels is published and the rates, counters and GST rate are real.",
      },
      { key: "servicePausedMessage", type: "text", label: "Message for a paused service", help: "Shown where a paused service would be, and when someone tries to book it." },
    ],
  },
  {
    title: "Features",
    sub: "Turn off one part of a service without pausing all of it. Safety features (SOS, trip sharing) are always on.",
    fields: [
      { key: "featureRideScheduling", type: "toggle", label: "Book rides ahead", help: "Off: rides can only be booked for now. Rides already scheduled still start." },
      { key: "featureMultiStop", type: "toggle", label: "Extra stops on rides", help: "Off: rides go straight from pickup to drop." },
      { key: "featureCashRides", type: "toggle", label: "Cash for rides and Quick parcels", help: "Off: riders and Quick parcel senders pay by UPI, card or wallet." },
      { key: "featureOutstation", type: "toggle", label: "Outstation and one-way trips", help: "Off: group travel offers local packages only." },
      { key: "featureSelfDrive", type: "toggle", label: "Self-drive", help: "Off: rent a car offers cars with a chauffeur only." },
      { key: "featureTripOffers", type: "toggle", label: "Add a cab to a trip", help: "Off: no ride offer after a bus or holiday booking." },
      { key: "featureReferral", type: "toggle", label: "Refer and earn", help: "Off: the referral section is hidden and codes can't be used." },
      { key: "featureRidePass", type: "toggle", label: "QuikFly Pass on sale", help: "Off: the pass can't be bought. Passes already bought keep waiving surge until they end." },
      { key: "featureLanguages", type: "toggle", label: "Tamil and Hindi", help: "Shows the language menu (English, தமிழ், हिन्दी) on the website and in the apps. Leave off until every screen is translated and a native speaker has reviewed it; until then untranslated text shows in English." },
      { key: "featureWomenOnlyRides", type: "toggle", label: "Women-only rides", help: "Bike Pink and other ride types marked for women riders, with women captains. Off: they're hidden and can't be booked." },
    ],
  },
  {
    title: "Rides",
    sub: "Bike, auto and cab fares come from each ride type in the catalog (Catalog → Ride types), times surge, plus any night charge. Surge for some ride types, days or hours: Catalog → Surge rules.",
    fields: [
      { key: "surgeMultiplier", type: "number", unit: "×", step: 0.05, label: "Surge multiplier", help: "1 means no surge. 1.2 adds 20% during surge hours. Can't be above the surge cap." },
      { key: "surgeHours", type: "text", editor: "hours", label: "Surge hours", help: "India time. A window from 08:00 to 10:59 covers every pickup in those hours. No windows means no surge." },
      { key: "surgeCap", type: "number", unit: "×", step: 0.1, label: "Surge cap", help: "At most 2×: the 2025 aggregator guidelines allow up to twice the base fare; some states ask for less (Maharashtra: 1.5×)." },
      { key: "passPrice", type: "number", unit: "₹", label: "QuikFly Pass price", help: "Paid from the wallet. The pass takes the surge off every bike, auto and cab ride. Not sold while there are no surge hours." },
      { key: "passDays", type: "number", unit: "days", label: "QuikFly Pass length", help: "How long one pass lasts. Buying again adds these days after the current pass ends." },
      { key: "rideCancelFeePercent", type: "number", unit: "%", label: "Rider cancellation fee", help: "Charged when a rider cancels without a valid reason (guidelines: 10% of the fare)." },
      { key: "rideCancelFeeCap", type: "number", unit: "₹", label: "Cancellation fee cap", help: "The fee never exceeds this (guidelines: ₹100)." },
      { key: "rideCancelFreeMinutes", type: "number", unit: "min", label: "Free cancellation window", help: "Cancelling within this many minutes of booking is always free." },
      { key: "rideBilledPickupMinutes", type: "number", unit: "min", label: "Billed pickup minutes", help: "Minutes charged at the per-minute rate for the driver reaching the pickup. MVAG 2025 covers dead mileage in the base fare, so a state fare card may want 0." },
      { key: "rideNightPercent", type: "number", unit: "%", label: "Night charge", help: "Added to ride fares during night hours, shown to riders as part of the fare. 0 = none; set it only to a state's notified night tariff." },
      { key: "rideNightHours", type: "text", editor: "hours", label: "Night hours", help: "India time. Split a window over midnight into two, e.g. 22:00–23:59 and 00:00–05:59." },
      { key: "rideMaxDiscountPercent", type: "number", unit: "%", label: "Most a ride can be discounted", help: "Coupons and QuikFly Credits together can take at most this share off a ride fare. MVAG 2025: 50%; Maharashtra: 25%. 100 = no limit." },
      { key: "rideAirportFee", type: "number", unit: "₹", label: "Airport fee", help: "Added to rides that start or end at a place marked Airport in Catalog → Places (not surged, shown to riders). 0 = none." },
      { key: "rideStopMinutes", type: "number", unit: "min", label: "Wait per stop", help: "Waiting time included for each extra stop (up to 2), charged at the ride type's per-minute rate. 0 = stops cost only the extra distance." },
      { key: "rideScheduleMinMinutes", type: "number", unit: "min", label: "Schedule at least", help: "How soon a ride can be booked ahead (minutes before pickup)." },
      { key: "rideScheduleMaxDays", type: "number", unit: "days", label: "Schedule up to", help: "How far ahead a ride can be booked." },
      { key: "rideScheduleFreeCancelMinutes", type: "number", unit: "min", label: "Scheduled ride: free cancel until", help: "Cancelling a scheduled ride is free until this many minutes before pickup; after that the cancellation fee rules apply." },
    ],
  },
  {
    title: "Bus fares",
    sub: "The timetable is generated; these set the base fare per seat before each bus's variation. Routes listed in Catalog → Bus route fares are priced by distance instead; Catalog → Peak and festival dates moves fares on chosen dates.",
    fields: [
      { key: "busFareAc", type: "number", unit: "₹", label: "AC base fare", help: "Per seat." },
      { key: "busFareNonAc", type: "number", unit: "₹", label: "Non-AC base fare", help: "Per seat." },
      { key: "busSleeperExtra", type: "number", unit: "₹", label: "Sleeper extra", help: "Added for sleeper buses." },
      { key: "busLowerDeckExtra", type: "number", unit: "₹", label: "Lower-deck extra", help: "Added to each lower-deck seat." },
      { key: "busRandomExtraMax", type: "number", unit: "₹", label: "Fare variation per bus", help: "The generated timetable adds up to this much per bus so buses of one type differ. 0 = the same fare for every bus of a type." },
      { key: "busRescheduleHours", type: "number", unit: "hrs", label: "Bus change closes", help: "Customers can move a ticket to another bus or date once, until this many hours before departure." },
      { key: "busRescheduleFee", type: "number", unit: "₹", label: "Bus change fee", help: "Charged on top of any fare difference. 0 = free change." },
    ],
  },
  {
    title: "Holidays and rentals",
    sub: "Package and car prices are in the catalog; these are the extras around them.",
    fields: [
      { key: "tourChildPercent", type: "number", unit: "%", label: "Child price", help: "Percentage of the adult price." },
      { key: "rentUnlimitedKmExtraPercent", type: "number", unit: "%", label: "Unlimited km extra", help: "How much more the unlimited-km self-drive plan costs." },
      { key: "rentProtectionStandardPerDay", type: "number", unit: "₹", label: "Standard protection per day", help: "Self-drive damage protection." },
      { key: "rentProtectionPeacePerDay", type: "number", unit: "₹", label: "Peace-of-mind protection per day", help: "Self-drive damage protection with a lower excess." },
      { key: "rentExcessStandard", type: "number", unit: "₹", label: "Standard protection: most the customer pays for damage", help: "Shown on the car page (\"You pay up to ₹X for damage\") and kept with each booking; staff can't deduct more damage than this. Changes apply to new bookings." },
      { key: "rentExcessPeace", type: "number", unit: "₹", label: "Peace-of-mind protection: most the customer pays for damage", help: "Usually lower than Standard. Kept with each booking; changes apply to new bookings." },
      { key: "rentDoorstepFee", type: "number", unit: "₹", label: "Doorstep delivery fee", help: "Delivery and collection at the customer's address." },
      { key: "rentDeposit", type: "number", unit: "₹", label: "Self-drive deposit", help: "Refundable deposit added to self-drive bookings. 0 removes it. Always refunded on cancel; refunded on 'Mark completed'." },
      { key: "rentDepositRefundHours", type: "number", unit: "hrs", label: "Deposit back within", help: "What customers are told: how soon after the return staff check the car and mark the booking completed." },
      { key: "rentLimitedKmPerDay", type: "number", unit: "km", label: "Limited plan km per day", help: "Kilometres included per day in the cheaper self-drive plan." },
      { key: "rentExtraKmRate", type: "number", unit: "₹", label: "Extra km rate", help: "Per km beyond the limited plan (shown to customers)." },
      { key: "rentDriverNightCharge", type: "number", unit: "₹", label: "Chauffeur night charge", help: "Added per night a chauffeur booking runs between 10 PM and 6 AM. 0 turns it off." },
      { key: "rentFuelChargePerEighth", type: "number", unit: "₹", label: "Fuel charge per 1/8 tank", help: "Deducted from the deposit for each eighth of a tank a self-drive car comes back with less fuel than at pickup." },
      { key: "rentLateGraceMinutes", type: "number", unit: "min", label: "Late return grace", help: "A return within this many minutes of the return time isn't charged as late." },
      { key: "rentLateFeePercent", type: "number", unit: "%", label: "Late return fee", help: "Each started late hour costs this percentage of the booked hourly rate (150 = 1.5×)." },
      { key: "rentExtendMaxHours", type: "number", unit: "hrs", label: "Longest extension", help: "The most hours a customer can add in one extension (they can extend again)." },
      { key: "rentDocuments", type: "text", label: "Self-drive documents", help: 'Shown on the car page; separate items with ";".' },
      { key: "rentRoadsideAssistance", type: "toggle", label: "Roadside assistance contract", help: "Turn on only when a 24×7 roadside-assistance service is in place. Off: cars show the support number for breakdowns." },
      { key: "groupLocalKmPerDay", type: "number", unit: "km", label: "Group local km per day", help: "Kilometres included in the local group package." },
      { key: "groupOneWaySurchargePercent", type: "number", unit: "%", label: "One-way surcharge", help: "One-way outstation trips cost this much more per km (the vehicle returns empty)." },
      { key: "groupDriverNightAllowance", type: "number", unit: "₹", label: "Driver night allowance", help: "Per night of a multi-day round trip. 0 = none." },
    ],
  },
  {
    title: "Parcels",
    sub: "Counter-to-counter bus parcels. Counters and route prices are in Catalog → Parcels; the switch is under Services.",
    fields: [
      { key: "parcelMaxKg", type: "number", unit: "kg", label: "Heaviest parcel", help: "Weight bands above this aren't offered. Can't be more than 20 kg." },
      { key: "parcelMaxDeclaredValue", type: "number", unit: "₹", label: "Highest declared value", help: "Parcels worth more are refused. Stays below ₹50,000, where goods need a GST e-way bill." },
      { key: "parcelLiabilityCap", type: "number", unit: "₹", label: "Liability cap", help: "QuikFly pays the declared value up to this for a lost or damaged parcel. Parcels aren't insured." },
      { key: "parcelIntercityMinCharge", type: "number", unit: "₹", label: "Minimum charge", help: "The least a bus parcel costs, before handling and GST." },
      { key: "parcelIntercityPerKg", type: "number", unit: "₹", label: "Rate per kg", help: "For routes without a rate in Catalog → Parcels, on the band's heaviest weight." },
      { key: "parcelHandlingFee", type: "number", unit: "₹", label: "Handling fee", help: "Added to every bus parcel. 0 = none." },
      { key: "parcelCutoffMinutes", type: "number", unit: "min", label: "Hand-in closes", help: "Minutes before the bus leaves. A route's rate in the catalog can set its own." },
      { key: "parcelCounterHoldDays", type: "number", unit: "days", label: "Held for collection", help: "After this a parcel can be marked unclaimed." },
      { key: "cancelPolicyParcel", type: "text", editor: "tiers", label: "Cancellation", help: "Bus parcels: counted to the bus's departure, and none can be cancelled once on the bus. Quick parcels follow the ride cancellation fee instead. Refusing on sight always refunds it all." },
      { key: "gstParcel", type: "number", unit: "%", label: "GST", help: "Added on top, so it changes what customers pay. 18 is provisional: confirm with your accountant." },
      { key: "creditsParcel", type: "number", unit: "%", label: "Credits earned", help: "Share of the amount paid, earned when the receiver gets it." },
      { key: "parcelCityBandExtra", type: "text", label: "Quick parcel: extra by weight", help: "Added to the bike fare for a parcel across town. Weight in kg, then rupees, e.g. 2:0, 5:10, 10:25, 20:50." },
      { key: "parcelSimulateTransit", type: "toggle", label: "Simulated transit (demo)", help: "Parcels move by the timetable on their own and screens say so. Handing over at a counter still needs staff and the code. A Quick parcel's sender also plays the captain. Off once counters and captains are real." },
    ],
  },
  {
    title: "Cancellation policies",
    sub: "How much a customer gets back when they (or staff) cancel, by notice given before the start. Each booking keeps the policy it was sold under, so changes apply to new bookings only.",
    fields: [
      { key: "cancelPolicyBus", type: "text", editor: "tiers", label: "Bus", help: "Counted to the departure time. Shorter notice can't refund more than longer notice; later than the last tier refunds nothing." },
      { key: "cancelPolicyTours", type: "text", editor: "tiers", label: "Holidays", help: "Counted to midnight (India time) on the start date." },
      { key: "cancelPolicyRent", type: "text", editor: "tiers", label: "Self-drive and chauffeur cars", help: "Counted to the pickup time. The self-drive deposit always comes back in full." },
      { key: "cancelPolicyGroup", type: "text", editor: "tiers", label: "Group travel", help: "Counted to midnight on the trip date." },
    ],
  },
  {
    title: "GST",
    sub: "Added to bus and holiday prices, and used to split the tax on invoices. Each booking keeps the rate it was sold under, so old invoices never change. Confirm rates with your accountant.",
    fields: [
      { key: "gstRides", type: "number", unit: "%", label: "Rides (bike, auto, cab)", help: "Included in the fare: changing it changes the invoice split and partner earnings, not what riders pay." },
      { key: "gstBus", type: "number", unit: "%", label: "Bus", help: "Added on top of the seat price: changing it changes what customers pay (see Try a fare)." },
      { key: "gstTours", type: "number", unit: "%", label: "Holidays", help: "Added on top of the package price: changing it changes what customers pay." },
      { key: "gstRent", type: "number", unit: "%", label: "Self-drive and chauffeur cars", help: "Included in the price: changing it changes the invoice split, not what customers pay." },
      { key: "gstGroup", type: "number", unit: "%", label: "Group travel", help: "Included in the price: changing it changes the invoice split and partner earnings, not what customers pay." },
    ],
  },
  {
    title: "Wallet",
    sub: "Credits paid into customers' QuikFly wallets.",
    fields: [
      { key: "welcomeCredit", type: "number", unit: "₹", label: "Welcome credit", help: "Given to every new account. 0 turns it off." },
      { key: "referralBonus", type: "number", unit: "₹", label: "Referral bonus", help: "Given to both people when a friend's code is used." },
    ],
  },
  {
    title: "QuikFly Credits",
    sub: "Earned back on completed trips; separate from the wallet, they expire and can pay only part of a booking. Set every percentage to 0 to stop earning.",
    fields: [
      { key: "creditsRides", type: "number", unit: "%", label: "Rides (bike and cab)", help: "Share of the fare paid that comes back as credits." },
      { key: "creditsBus", type: "number", unit: "%", label: "Bus", help: "Share of the ticket price paid." },
      { key: "creditsTours", type: "number", unit: "%", label: "Holidays", help: "Share of the package price paid." },
      { key: "creditsRent", type: "number", unit: "%", label: "Rent a car", help: "Share of the rental paid, not counting the refundable deposit." },
      { key: "creditsGroup", type: "number", unit: "%", label: "Group travel", help: "Share of the trip price paid." },
      { key: "creditsCap", type: "number", unit: "₹", label: "Most per booking", help: "No booking earns more than this." },
      { key: "creditsExpiryDays", type: "number", unit: "days", label: "Expiry", help: "Credits expire this many days after they are earned or returned." },
      { key: "creditsMaxRedeemPercent", type: "number", unit: "%", label: "Most of a booking", help: "Credits can pay at most this share of a booking." },
    ],
  },
  {
    title: "Partners",
    sub: "Vehicle owners who join through the QuikFly Partner app.",
    fields: [
      { key: "vendorJoiningFee", type: "number", unit: "₹", label: "Joining fee", help: "Shown in onboarding step 2. Demo: no money is collected; staff confirm it. 0 skips the payment step." },
      { key: "vendorMaxVehicleAgeYears", type: "number", unit: "years", label: "Oldest vehicle accepted", help: "Vehicles older than this can't register. The 2025 aggregator guidelines allow up to 8 years for cabs." },
      { key: "vendorAuditAddress", type: "text", label: "Vehicle audit address", help: "Where partners bring their vehicle for the audit." },
      { key: "vendorCommissionPercent", type: "number", unit: "%", label: "Commission on partner trips", help: "Of the fare without GST. Partners keep the rest, less 0.1% TDS. At most 20%: the 2025 aggregator guidelines leave cab drivers 80% or more." },
      { key: "vendorMinPayout", type: "number", unit: "₹", label: "Smallest payout", help: "Partners can request a payout once they're owed at least this much." },
      { key: "vendorExpiryWarnDays", type: "number", unit: "days", label: "Document expiry warning", help: "Partners are warned this many days before an RC, insurance or driving licence expires. On the expiry date the vehicle or driver is blocked until a renewal is checked." },
    ],
  },
  {
    title: "Captains (live rides)",
    sub: "Drivers who take rides in the QuikFly Captain app. Everything stays simulated until the first switch is on.",
    fields: [
      { key: "featureLiveDrivers", type: "toggle", label: "Live captains", help: "On: a ride booked from an up-to-date app or the website is offered to real captains who are online. Off: every ride is simulated, as before. Older apps always get simulated rides." },
      { key: "rideSimulateDrivers", type: "toggle", label: "Simulated captain when none is free (demo)", help: "On: if no captain takes a ride, a simulated one steps in and the screen says so. Off: the customer is told no captain is free and nothing is charged." },
      { key: "driverDemoLocation", type: "toggle", label: "Demo locations", help: "Captains may pick a place on the map instead of using GPS, and the app moves itself during a trip. For demos and testing away from the city. Off once captains drive for real." },
      { key: "driverOfferSeconds", type: "number", unit: "sec", label: "Time to answer an offer", help: "After this the ride is offered to the next captain." },
      { key: "driverOfferMaxDrivers", type: "number", label: "Captains asked per ride", help: "One at a time, nearest first; among captains about equally near, the one waiting longest." },
      { key: "driverSearchSeconds", type: "number", unit: "sec", label: "Search gives up after", help: "Counted from the booking." },
      { key: "driverSearchRadiusKm", type: "number", unit: "km", label: "Search radius", help: "Captains further than this from the pickup aren't asked." },
      { key: "driverStaleSeconds", type: "number", unit: "sec", label: "Offline after silence", help: "A captain whose app hasn't been heard from for this long gets no offers and is set offline." },
    ],
  },
  {
    title: "Licence checks",
    sub: "Self-drive customers submit a driving licence before pickup.",
    fields: [
      {
        key: "licenceAutoApprove", type: "toggle", label: "Approve licences automatically",
        help: "Off: every licence waits for a person to approve it. On: licences are verified the moment they're submitted (useful for demos nobody is watching).",
      },
    ],
  },
  {
    title: "Company and safety",
    sub: "Printed on invoices and shown in the SOS sheet.",
    fields: [
      { key: "companyName", type: "text", label: "Legal name", help: "Seller name on invoices." },
      { key: "companyAddress", type: "text", label: "Address", help: "Seller address on invoices." },
      { key: "companyGstin", type: "text", label: "GSTIN", help: "15 characters, e.g. 33ABCDE1234F1Z5." },
      { key: "companyEmail", type: "text", label: "Support email", help: "On invoices and the Help page." },
      { key: "companyPhone", type: "text", label: "Support phone", help: "Shown on Help and for partner support; the apps call it with one tap." },
      { key: "safetyLine", type: "text", label: "24×7 safety line", help: "Shown in the SOS sheet during rides." },
      { key: "whatsappNumber", type: "text", label: "Support WhatsApp number", help: 'Shows a free "Chat on WhatsApp" link on Help, holidays and bookings (opens WhatsApp with a message ready). Empty hides it.' },
    ],
  },
  {
    title: "Privacy (DPDP)",
    sub: "Shown on the privacy notice (website /privacy and both apps). The law requires a published contact for privacy questions and complaints.",
    fields: [
      { key: "privacyOfficerName", type: "text", label: "Grievance Officer name", help: "A person or a role, e.g. \"QuikFly Grievance Officer\". Placeholder until the company names one." },
      { key: "privacyOfficerEmail", type: "text", label: "Grievance Officer email", help: "Replies are due within 30 days." },
      { key: "privacyOfficerPhone", type: "text", label: "Grievance Officer phone", help: "Shown on the privacy notice for privacy questions and complaints." },
      {
        key: "inactivityEraseDays", type: "number", unit: "days", label: "Close unused accounts after",
        help: "Accounts nobody has signed in to for this long are closed with a notice and erased 30 days later unless the person signs in. Accounts with wallet money, a confirmed booking or a partner application are skipped. 0 = never; otherwise at least 180. 1095 = 3 years.",
      },
    ],
  },
];

/** Fare samples a tab can show ("Try a fare"); see components/FarePreview.tsx. */
export type PreviewKind = "ride" | "bus" | "tour" | "rent" | "group";

export interface SettingTab {
  id: string;
  label: string;
  /** Group titles from SETTING_GROUPS, in order. */
  groups: string[];
  preview?: PreviewKind[];
}

/** The Settings page's tabs. Every group belongs to exactly one tab. */
export const SETTING_TABS: SettingTab[] = [
  { id: "services", label: "Services", groups: ["Services", "Features"] },
  { id: "rides", label: "Rides", groups: ["Rides"], preview: ["ride"] },
  { id: "bus", label: "Bus", groups: ["Bus fares"], preview: ["bus"] },
  { id: "holidays", label: "Holidays & rentals", groups: ["Holidays and rentals"], preview: ["tour", "rent", "group"] },
  { id: "parcels", label: "Parcels", groups: ["Parcels"] },
  { id: "cancellation", label: "Cancellation", groups: ["Cancellation policies"] },
  { id: "money", label: "GST & credits", groups: ["GST", "Wallet", "QuikFly Credits"], preview: ["bus", "tour"] },
  { id: "partners", label: "Partners", groups: ["Partners", "Licence checks"] },
  { id: "company", label: "Company & privacy", groups: ["Company and safety", "Privacy (DPDP)"] },
];

export const SETTING_FIELDS: SettingField[] = SETTING_GROUPS.flatMap((g) => g.fields);
export const fieldLabel = (key: string) => SETTING_FIELDS.find((f) => f.key === key)?.label ?? key;
