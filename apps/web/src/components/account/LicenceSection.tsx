"use client";
import { useEffect, useState } from "react";
import { BadgeCheck, Clock, IdCard, ShieldAlert } from "lucide-react";
import { PATTERNS, compactCode, formatLicence, type User } from "@quikfly/shared";
import { DEMO_MODE, api } from "@/lib/api";
import { MOCK_LICENCE_REVIEW_SECONDS } from "@/lib/api/mock-store";
import { cx, todayISO } from "@/lib/format";
import { useApp } from "../AppProvider";
import { GoldButton } from "../ui";
import { ErrorText, Field, Section, useAction } from "./kit";

const STATUS = {
  none: { label: "Not added", icon: IdCard, cls: "bg-fg/5 text-muted" },
  pending: { label: "Under review", icon: Clock, cls: "bg-warning/10 text-warning" },
  verified: { label: "Verified", icon: BadgeCheck, cls: "bg-success/10 text-success" },
  rejected: { label: "Not approved", icon: ShieldAlert, cls: "bg-danger/10 text-danger" },
} as const;

/** One line explaining the current licence state, for the account page and checkout. */
export function licenceMessage(user: User) {
  switch (user.licence.status) {
    case "pending":
      return DEMO_MODE
        ? `Under review. You can book now; it must be verified before pickup. (Demo: verified after about ${MOCK_LICENCE_REVIEW_SECONDS} seconds.)`
        : "Under review by our team, usually within a few hours. You can book now; it must be verified before pickup.";
    case "verified":
      return "Verified. Bring the original licence and Aadhaar or passport to pickup.";
    case "rejected":
      return `Not approved${user.licence.note ? `: ${user.licence.note}` : "."} Check the details and submit again.`;
    default:
      return "Add your licence to book a self-drive car.";
  }
}

export function LicenceBadge({ user }: { user: User }) {
  const s = STATUS[user.licence.status];
  return <span className={cx("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full", s.cls)}><s.icon size={14} />{s.label}</span>;
}

/** While a licence is under review, re-checks the account until a decision arrives. */
export function useLicencePolling() {
  const { user, refreshBookings } = useApp();
  const pending = user?.licence.status === "pending";
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => { refreshBookings(); }, 5000);
    return () => clearInterval(t);
  }, [pending, refreshBookings]);
}

/** Add or update the licence. Used here and in self-drive checkout. */
export function LicenceForm({ onSaved, compact }: { onSaved?: () => void; compact?: boolean }) {
  const { user, setUser, toast } = useApp();
  const [number, setNumber] = useState(user?.licence.number ? formatLicence(user.licence.number) : "");
  const [expiry, setExpiry] = useState(user?.licence.expiry ?? "");
  const { run, busy, error, setError } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!PATTERNS.licence.test(compactCode(number))) return setError("Enter the number as printed, e.g. TN09 20190001234.");
    if (!expiry || expiry <= todayISO()) return setError("Enter a future expiry date.");
    run(async () => { setUser(await api.account.submitLicence(number, expiry)); toast("Licence submitted for review"); onSaved?.(); });
  };

  return (
    <form onSubmit={submit} className={cx("grid gap-4", !compact && "sm:grid-cols-2")}>
      <Field label="Driving licence number" htmlFor="dl-no" hint="15 characters: state, RTO, year, number.">
        <input id="dl-no" className="field uppercase" autoComplete="off" placeholder="TN09 20190001234" maxLength={20} value={number} onChange={(e) => setNumber(e.target.value)} />
      </Field>
      <Field label="Valid till" htmlFor="dl-exp">
        <input id="dl-exp" type="date" className="field" min={todayISO(1)} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </Field>
      <div className={cx("flex flex-wrap items-center gap-3", !compact && "sm:col-span-2")}>
        <GoldButton loading={busy}>{user?.licence.status === "none" ? "Submit licence" : user?.licence.status === "rejected" ? "Submit again" : "Update licence"}</GoldButton>
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}

export function LicenceSection() {
  const { user } = useApp();
  useLicencePolling();
  if (!user) return null;
  const { status, number, expiry } = user.licence;

  return (
    <Section title="Driving licence" sub="Needed once before your first self-drive rental. Show the original with Aadhaar or passport at pickup.">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <LicenceBadge user={user} />
        {number && <span className="text-sm text-soft font-mono">{formatLicence(number)}</span>}
        {expiry && <span className="text-xs text-subtle">valid till {expiry}</span>}
      </div>
      {status !== "none" && (
        <p className={cx("text-sm mb-5", status === "rejected" ? "text-danger" : "text-muted")}>{licenceMessage(user)}</p>
      )}
      <LicenceForm />
    </Section>
  );
}
