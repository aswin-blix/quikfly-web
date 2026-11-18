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
}

export interface SettingGroup {
  title: string;
  sub: string;
  fields: SettingField[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    title: "Rides",
    sub: "Bike, auto and cab fares come from each ride type in the catalog, multiplied by surge.",
    fields: [
      { key: "surgeMultiplier", type: "number", unit: "×", step: 0.05, label: "Surge multiplier", help: "1 means no surge. 1.2 adds 20% during surge hours." },
      { key: "surgeHours", type: "text", label: "Surge hours", help: 'India time, inclusive hour ranges like "8-10, 17-20". Empty means no surge.' },
      { key: "surgeCap", type: "number", unit: "×", step: 0.1, label: "Surge cap", help: "Surge never goes above this, whatever the multiplier says. The 2025 aggregator guidelines allow up to 2×; some states ask for less (Maharashtra draft: 1.5×)." },
      { key: "rideCancelFeePercent", type: "number", unit: "%", label: "Rider cancellation fee", help: "Charged when a rider cancels without a valid reason (guidelines: 10% of the fare)." },
      { key: "rideCancelFeeCap", type: "number", unit: "₹", label: "Cancellation fee cap", help: "The fee never exceeds this (guidelines: ₹100)." },
      { key: "rideCancelFreeMinutes", type: "number", unit: "min", label: "Free cancellation window", help: "Cancelling within this many minutes of booking is always free." },
    ],
  },
  {
    title: "Bus fares",
    sub: "The timetable is generated; these set the base fare per seat before each bus's variation.",
    fields: [
      { key: "busFareAc", type: "number", unit: "₹", label: "AC base fare", help: "Per seat." },
      { key: "busFareNonAc", type: "number", unit: "₹", label: "Non-AC base fare", help: "Per seat." },
      { key: "busSleeperExtra", type: "number", unit: "₹", label: "Sleeper extra", help: "Added for sleeper buses." },
      { key: "busLowerDeckExtra", type: "number", unit: "₹", label: "Lower-deck extra", help: "Added to each lower-deck seat." },
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
      { key: "rentDoorstepFee", type: "number", unit: "₹", label: "Doorstep delivery fee", help: "Delivery and collection at the customer's address." },
      { key: "rentDeposit", type: "number", unit: "₹", label: "Self-drive deposit", help: "Refundable deposit added to self-drive bookings. 0 removes it. Always refunded on cancel; refunded on 'Mark completed'." },
      { key: "rentDepositRefundHours", type: "number", unit: "hrs", label: "Deposit back within", help: "What customers are told: how soon after the return staff check the car and mark the booking completed." },
      { key: "rentLimitedKmPerDay", type: "number", unit: "km", label: "Limited plan km per day", help: "Kilometres included per day in the cheaper self-drive plan." },
      { key: "rentExtraKmRate", type: "number", unit: "₹", label: "Extra km rate", help: "Per km beyond the limited plan (shown to customers)." },
      { key: "rentDriverNightCharge", type: "number", unit: "₹", label: "Chauffeur night charge", help: "Added per night a chauffeur booking runs between 10 PM and 6 AM. 0 turns it off." },
      { key: "rentDocuments", type: "text", label: "Self-drive documents", help: 'Shown on the car page; separate items with ";".' },
      { key: "rentRoadsideAssistance", type: "toggle", label: "Roadside assistance contract", help: "Turn on only when a 24×7 roadside-assistance service is in place. Off: cars show the support number for breakdowns." },
      { key: "groupLocalKmPerDay", type: "number", unit: "km", label: "Group local km per day", help: "Kilometres included in the local group package." },
    ],
  },
  {
    title: "Cancellation policies",
    sub: "How much a customer gets back when they (or staff) cancel, by notice given before the start. Bookings made earlier keep the policy's current tiers.",
    fields: [
      { key: "cancelPolicyBus", type: "text", label: "Bus", help: 'e.g. "12h:100, 4h:50": full refund 12+ hours before departure, half 4+ hours before, nothing later. Empty = full refund any time.' },
      { key: "cancelPolicyTours", type: "text", label: "Holidays", help: 'e.g. "15d:100, 7d:50". Counted to midnight (India time) on the start date.' },
      { key: "cancelPolicyRent", type: "text", label: "Self-drive and chauffeur cars", help: 'e.g. "24h:100": full refund up to 24 hours before pickup, nothing after.' },
      { key: "cancelPolicyGroup", type: "text", label: "Group travel", help: 'e.g. "48h:100". Counted to midnight on the trip date.' },
    ],
  },
  {
    title: "GST",
    sub: "Added to bus and holiday prices, and used to split the tax on invoices. Confirm rates with your accountant.",
    fields: [
      { key: "gstRides", type: "number", unit: "%", label: "Rides (bike, auto, cab)", help: "" },
      { key: "gstBus", type: "number", unit: "%", label: "Bus", help: "" },
      { key: "gstTours", type: "number", unit: "%", label: "Holidays", help: "" },
      { key: "gstRent", type: "number", unit: "%", label: "Self-drive and chauffeur cars", help: "" },
      { key: "gstGroup", type: "number", unit: "%", label: "Group travel", help: "" },
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
      { key: "companyAddress", type: "text", label: "Address", help: "" },
      { key: "companyGstin", type: "text", label: "GSTIN", help: "15 characters, e.g. 33ABCDE1234F1Z5." },
      { key: "companyEmail", type: "text", label: "Support email", help: "" },
      { key: "companyPhone", type: "text", label: "Support phone", help: "" },
      { key: "safetyLine", type: "text", label: "24×7 safety line", help: "Shown in the SOS sheet during rides." },
    ],
  },
];
