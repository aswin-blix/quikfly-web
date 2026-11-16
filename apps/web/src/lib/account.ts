// Website-side account settings: section list, labels and help text.
// Business rules (limits, patterns, bonus amounts) live in @quikfly/shared.
import { WELCOME_CREDIT, type WalletTxnKind } from "@quikfly/shared";
import { inr } from "./format";

export const NEW_USER_WALLET_HINT = `${inr(WELCOME_CREDIT)} welcome credit is in your wallet.`;

/** Numbers shown in the safety sheet. 112 is India's national emergency number. */
export const SAFETY = {
  emergency: "112",
  safetyLine: "1800 123 4567",
};

/** Public page where someone can follow a shared ride. */
export const trackUrl = (token: string) => `${location.origin}/track?${new URLSearchParams({ t: token })}`;

/** Shown on the wallet page so refunds have clear expectations (Zoomcar-style). */
export const REFUND_TIMINGS: [string, string][] = [
  ["QuikFly wallet", "Instant"],
  ["UPI", "1–3 working days"],
  ["Card / net banking", "5–7 working days"],
];

export const WALLET_KIND_LABEL: Record<WalletTxnKind, string> = {
  welcome: "Welcome credit",
  payment: "Payment",
  refund: "Refund",
  referral: "Referral",
  opening: "Opening balance",
};

export const ACCOUNT_SECTIONS = [
  { id: "profile", label: "Profile", hint: "Name, email, gender, date of birth" },
  { id: "wallet", label: "Wallet", hint: "Balance and history" },
  { id: "refer", label: "Refer & earn", hint: "Invite friends, both get credit" },
  { id: "places", label: "Saved places", hint: "Home, work and favourites" },
  { id: "travellers", label: "Travellers", hint: "Fill bookings in one tap" },
  { id: "safety", label: "Safety", hint: "Emergency contacts, trip sharing" },
  { id: "licence", label: "Driving licence", hint: "Needed for self-drive" },
  { id: "business", label: "Business / GST", hint: "GST details on invoices" },
  { id: "security", label: "Login & security", hint: "Number, devices, delete account" },
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]["id"];
