"use client";
// Account → Privacy & data: the DPDP rights in one place: see the notice and when you agreed,
// download everything QuikFly holds (GET /me/export), and where to correct or erase it.
import { Download, FileText, Mail, Trash2 } from "lucide-react";
import { DELETION_GRACE_DAYS, privacyContact } from "@quikfly/shared";
import { api } from "@/lib/api";
import { longDate } from "@/lib/format";
import { Link, qs } from "@/lib/nav";
import { useApp } from "../AppProvider";
import { useSettings } from "../ConfigProvider";
import { GoldButton } from "../ui";
import { ErrorText, Section, useAction } from "./kit";

/** Saves a JSON value as a file through a temporary link (nothing leaves the browser). */
function saveJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PrivacySection() {
  const { user, toast } = useApp();
  const contact = privacyContact(useSettings());
  const { run, busy, error } = useAction();
  if (!user) return null;
  const download = () => run(async () => {
    const data = await api.account.exportData();
    saveJson(`quikfly-data-${data.exportedAt.slice(0, 10)}.json`, data);
    toast("Your data is downloading");
  });

  return (
    <Section title="Privacy & data" sub="Your rights under India's Digital Personal Data Protection Act.">
      <div className="space-y-6 divide-y divide-line [&>*:not(:first-child)]:pt-6">
        <div>
          <p className="font-medium text-strong flex items-center gap-2"><FileText size={17} className="text-gold" />Privacy notice</p>
          <p className="text-sm text-muted mt-1">
            {user.privacyConsent ? `You agreed to the notice of ${longDate(user.privacyConsent)}.` : "You haven't agreed to the privacy notice yet."}{" "}
            <Link href="/privacy" className="text-gold">Read it</Link>
          </p>
        </div>
        <div>
          <p className="font-medium text-strong flex items-center gap-2"><Download size={17} className="text-gold" />Download your data</p>
          <p className="text-sm text-muted mt-1">One file with your profile, bookings, wallet, saved places, travellers, contacts, notifications and support requests.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <GoldButton loading={busy} onClick={download}><Download size={16} />Download (JSON)</GoldButton>
            <ErrorText>{error}</ErrorText>
          </div>
        </div>
        <div>
          <p className="font-medium text-strong flex items-center gap-2"><Trash2 size={17} className="text-gold" />Correct or erase</p>
          <p className="text-sm text-muted mt-1">
            Fix details in <Link href={`/account${qs({ tab: "profile" })}`} className="text-gold">Profile</Link>. To withdraw consent and erase your data,{" "}
            <Link href={`/account${qs({ tab: "security" })}`} className="text-gold">delete your account</Link>: it closes now and is erased after {DELETION_GRACE_DAYS} days.
          </p>
        </div>
        <div>
          <p className="font-medium text-strong flex items-center gap-2"><Mail size={17} className="text-gold" />Questions or complaints</p>
          <p className="text-sm text-muted mt-1">
            Write to our {contact.role}, {contact.name}, at <a className="text-gold break-all" href={`mailto:${contact.email}`}>{contact.email}</a> or call {contact.phone}.
          </p>
        </div>
      </div>
    </Section>
  );
}
