// The privacy notice (Digital Personal Data Protection Act 2023 and the DPDP Rules 2025): the
// one copy of its text. The API serves it to the apps (GET /v1/privacy) and the website renders
// it at /privacy, both through privacyNotice(), so the wording and the contact details (runtime
// Settings: privacyOfficer*, company*) live in one place each.
// Bump PRIVACY_NOTICE.version whenever the meaning changes: everyone is asked to agree again.
import { DELETION_GRACE_DAYS, LIMITS } from "./rules";
import type { Settings } from "./settings";

export const PRIVACY_NOTICE = {
  /** Stored with each consent. Change it (a new date) when the notice's meaning changes. */
  version: "2026-11-19",
  /** Shown as "Last updated". */
  updated: "2026-11-19",
} as const;

/** Inactive accounts are told this long before erasure at the latest (the Rules ask for 48 hours). */
export const INACTIVITY_NOTICE_HOURS = 48;

export interface PrivacySection { title: string; points: string[] }

export interface PrivacyContact {
  /** "Grievance Officer": the person the Rules require a published contact for. */
  role: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
}

export interface PrivacyNotice {
  version: string;
  /** YYYY-MM-DD */
  updated: string;
  /** The short list in the consent sheet: what you're agreeing to, in plain words. */
  summary: string[];
  sections: PrivacySection[];
  contact: PrivacyContact;
}

/** GET /v1/me/export: everything QuikFly holds about the signed-in person, as one JSON file. */
export interface DataExport {
  exportedAt: string;
  noticeVersion: string;
  /** Table name → that person's rows (column names as stored). */
  data: Record<string, unknown[]>;
}

/** 1095 → "3 years", 200 → "200 days". */
export function periodText(days: number) {
  if (days % 365 === 0) return days === 365 ? "1 year" : `${days / 365} years`;
  return `${days} days`;
}

export function privacyContact(s: Settings): PrivacyContact {
  return {
    role: "Grievance Officer",
    name: s.privacyOfficerName,
    email: s.privacyOfficerEmail,
    phone: s.privacyOfficerPhone,
    company: s.companyName,
    address: s.companyAddress,
  };
}

export function privacyNotice(s: Settings): PrivacyNotice {
  const inactive = s.inactivityEraseDays > 0
    ? `If you don't use QuikFly for ${periodText(s.inactivityEraseDays)}, we tell you and close the account; it is erased ${DELETION_GRACE_DAYS} days later unless you sign in.`
    : "We don't close unused accounts on our own; delete yours whenever you like.";
  return {
    version: PRIVACY_NOTICE.version,
    updated: PRIVACY_NOTICE.updated,
    summary: [
      "We use your mobile number to sign you in, and your trips, bookings and payments to run them.",
      "Your driver, bus operator or partner sees only what the trip needs, like your name and pickup.",
      "We don't sell your data or show you ads based on it.",
      "Download your data or delete your account any time from Account → Privacy.",
      `QuikFly accounts are for people aged ${LIMITS.minAge} and over.`,
    ],
    sections: [
      {
        title: "Who we are",
        points: [
          `${s.companyName} (${s.companyAddress}) runs QuikFly and decides how your data is used. Under India's Digital Personal Data Protection Act, 2023 we are the Data Fiduciary.`,
          "This notice covers the QuikFly website, the QuikFly app and the QuikFly Partner app.",
        ],
      },
      {
        title: "What we collect",
        points: [
          "Account: mobile number, name, and if you add them, email, gender and date of birth.",
          "Trips: pickup, drop and stops, your location during a ride, the travellers and emergency contacts you save, and your ride PIN.",
          "Payments: wallet and QuikFly Credits history, invoices, and GST details if you add them. We never store card or UPI details.",
          "Self-drive: your driving licence number and expiry, and the car photos you take at pickup and return.",
          "Partners: city, bank account, your photo, vehicle documents (RC, insurance) and your drivers' licences.",
          "Support: your requests, callbacks and messages to us.",
          "Your phone: a notification token, so we can send trip updates.",
        ],
      },
      {
        title: "Why we use it",
        points: [
          "To book, run and bill your trips, and to pay partners for theirs.",
          "For safety: sharing a trip with your contacts, SOS, and checking licences and vehicle documents.",
          "For support, refunds and disputes, and to stop fraud.",
          "Because the law requires it, for example tax invoices and transport rules.",
          "We don't sell your data, and we don't use it for advertising.",
        ],
      },
      {
        title: "Who sees it",
        points: [
          "The driver, bus operator, holiday or rental partner for your booking: only what that booking needs.",
          "Your emergency contacts, when you or your settings share a trip with them.",
          "Companies that run our systems for us: Cloudflare (servers and database) and Google Firebase (notifications). They may not use it for anything else.",
          "Police or a government body, only when the law requires it.",
        ],
      },
      {
        title: "How long we keep it",
        points: [
          "Your account data stays while you use QuikFly.",
          `When you delete your account it is hidden at once and erased after ${DELETION_GRACE_DAYS} days. Signing in before then keeps it.`,
          inactive,
          "Invoices and payment records are kept for as long as tax and accounting laws require (up to 8 years), with your name and number removed from your account.",
        ],
      },
      {
        title: "Your rights",
        points: [
          "See your data: download a copy from Account → Privacy.",
          "Correct it: edit your profile, travellers, places and contacts in Account.",
          "Withdraw consent and erase it: delete your account from Account → Privacy. Bookings already made are completed or refunded first.",
          "Nominate someone to act for you if you die or can't act yourself: write to the Grievance Officer.",
          "Complain: write to the Grievance Officer below. We reply within 30 days. If you're not satisfied, you can complain to the Data Protection Board of India.",
        ],
      },
      {
        title: "Children",
        points: [`Accounts are for people aged ${LIMITS.minAge} and over. Adults may add children as travellers on their own bookings.`],
      },
      {
        title: "If data leaks",
        points: ["If a breach affects your data, we tell you without delay: what happened, what it means for you and what we're doing. We also report it to the Data Protection Board of India."],
      },
      {
        title: "Changes",
        points: ["When this notice changes in a way that matters, the app and website ask you to read it and agree again."],
      },
    ],
    contact: privacyContact(s),
  };
}
