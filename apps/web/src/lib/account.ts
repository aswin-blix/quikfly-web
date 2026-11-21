// Website-side account settings: section list, labels and help text.
// Business rules (limits, patterns) live in @quikfly/shared; amounts the owner can change
// (welcome credit, referral bonus, safety line) come from the API settings (useSettings()).
import type { WalletTxnKind, CreditKind } from "@quikfly/shared";

/** India's national emergency number (the QuikFly safety line comes from settings). */
export const EMERGENCY_NUMBER = "112";

/** Public page where someone can follow a shared ride. */
export const trackUrl = (token: string) => `${location.origin}/track?${new URLSearchParams({ t: token })}`;

/** Public page a bus m-ticket's QR code opens (a conductor checks it there). */
export const ticketUrl = (token: string) => `${location.origin}/ticket?${new URLSearchParams({ t: token })}`;

/** QR codes stay dark on white in both themes so every scanner can read them. */
export const QR_COLORS = { dark: "#000000", light: "#ffffff" } as const;

/** Shown on the wallet page so refunds have clear expectations (Zoomcar-style). */
export const REFUND_TIMINGS: [string, string][] = [
  ["QuikFly wallet", "Instant"],
  ["UPI", "1–3 working days"],
  ["Card / net banking", "5–7 working days"],
];

export const CREDIT_KIND_LABEL: Record<CreditKind, string> = {
  earned: "Earned",
  spent: "Used",
  returned: "Returned",
  expired: "Expired",
};

export const WALLET_KIND_LABEL: Record<WalletTxnKind, string> = {
  welcome: "Welcome credit",
  payment: "Payment",
  refund: "Refund",
  referral: "Referral",
  adjustment: "Adjustment by QuikFly",
  opening: "Opening balance",
};

/** Account sections in menu order; `label` and `hint` are string keys (packages/shared/i18n). */
export const ACCOUNT_SECTIONS = [
  { id: "profile", label: "sectionProfile", hint: "sectionProfileHint" },
  { id: "wallet", label: "sectionWallet", hint: "sectionWalletHint" },
  { id: "refer", label: "linkReferEarn", hint: "sectionReferHint" },
  { id: "places", label: "sectionPlaces", hint: "sectionPlacesHint" },
  { id: "travellers", label: "sectionTravellers", hint: "sectionTravellersHint" },
  { id: "safety", label: "sectionSafety", hint: "sectionSafetyHint" },
  { id: "licence", label: "sectionLicence", hint: "sectionLicenceHint" },
  { id: "support", label: "sectionSupport", hint: "sectionSupportHint" },
  { id: "business", label: "sectionBusiness", hint: "sectionBusinessHint" },
  { id: "privacy", label: "sectionPrivacy", hint: "sectionPrivacyHint" },
  { id: "security", label: "sectionSecurity", hint: "sectionSecurityHint" },
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]["id"];
