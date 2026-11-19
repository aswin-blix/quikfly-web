// Customer support: callback requests (anyone, from the website or the app) and support
// tickets (signed-in customers: a thread with QuikFly staff, optionally about a booking).
// Staff answer both from one admin queue. WhatsApp is a free click-to-chat link only
// (the WhatsApp Business API is paid), shown when the `whatsappNumber` setting is filled in.

export const SUPPORT_TOPICS = ["booking", "refund", "payment", "holiday", "group", "partner", "account", "other"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
export const SUPPORT_TOPIC_LABEL: Record<SupportTopic, string> = {
  booking: "A booking", refund: "A refund", payment: "A payment", holiday: "A holiday package", group: "Group travel quote",
  partner: "Becoming a partner", account: "My account", other: "Something else",
};

/** When a callback suits the customer. */
export const CALLBACK_TIMES = ["anytime", "morning", "afternoon", "evening"] as const;
export type CallbackTime = (typeof CALLBACK_TIMES)[number];
export const CALLBACK_TIME_LABEL: Record<CallbackTime, string> = { anytime: "Any time", morning: "Morning (9–12)", afternoon: "Afternoon (12–5)", evening: "Evening (5–9)" };

export type SupportKind = "callback" | "ticket";
/** open: waiting for QuikFly · answered: staff replied, waiting for the customer · closed */
export type SupportStatus = "open" | "answered" | "closed";

export interface SupportMessage {
  id: string;
  author: "customer" | "staff";
  /** Staff first name on staff messages; null on the customer's. */
  staffName: string | null;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  kind: SupportKind;
  status: SupportStatus;
  topic: SupportTopic;
  bookingId: string | null;
  /** What the request is about, e.g. a holiday's web address ("holidays/goa-beach-holiday"). */
  ref: string | null;
  name: string;
  phone: string;
  /** Callbacks only. */
  preferredTime: CallbackTime | null;
  createdAt: string;
  updatedAt: string;
  /** The thread, oldest first (in lists: just the first message). */
  messages: SupportMessage[];
}

/** The staff queue item: the ticket plus the customer account, if any. */
export interface AdminSupportTicket extends SupportTicket {
  customerId: string | null;
}

export const SUPPORT_RULES = {
  messageMin: 5,
  messageMax: 1000,
  /** Callback requests one phone number can make in 24 hours. */
  callbacksPerDay: 3,
  /** Open tickets a customer can have at once. */
  openTickets: 5,
} as const;

/** A wa.me click-to-chat link for `number` (10-digit Indian numbers get +91), or null when the number isn't usable. */
export function whatsappLink(number: string | null | undefined, text: string): string | null {
  // Missing when an older API's settings are loaded (e.g. mid-deploy): no link, no crash.
  let digits = (number ?? "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
