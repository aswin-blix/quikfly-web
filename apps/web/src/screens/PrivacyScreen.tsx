"use client";
// /privacy: the DPDP privacy notice. The text is packages/shared/src/privacy.ts (the apps get
// the same notice from GET /v1/privacy); the Grievance Officer's details are runtime Settings.
import { Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { privacyNotice } from "@quikfly/shared";
import { useSettings } from "@/components/ConfigProvider";
import { PageHeader } from "@/components/ui";
import { Link } from "@/lib/nav";
import { longDate } from "@/lib/format";

export function PrivacyScreen() {
  const notice = privacyNotice(useSettings());
  const c = notice.contact;
  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Privacy notice"]]} title="Privacy notice" icon={<ShieldCheck className="text-gold" size={36} />}
        sub={`How QuikFly handles your personal data. Last updated ${longDate(notice.updated)}.`} />
      <section className="max-w-3xl mx-auto px-4 pb-16 space-y-5">
        <div className="panel p-5 sm:p-6">
          <p className="label !text-gold">In short</p>
          <ul className="mt-3 space-y-2 list-disc pl-5 text-soft">{notice.summary.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
        {notice.sections.map((s) => (
          <div key={s.title} className="panel p-5 sm:p-6">
            <h2 className="font-display text-xl text-strong">{s.title}</h2>
            <ul className="mt-3 space-y-2 list-disc pl-5 text-soft">{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ))}
        <div className="panel p-5 sm:p-6" id="contact">
          <h2 className="font-display text-xl text-strong">Contact the {c.role}</h2>
          <p className="text-sm text-muted mt-1">Questions, corrections, complaints or nominating someone: write or call. We reply within 30 days.</p>
          <div className="mt-4 grid gap-3 text-sm">
            <p className="font-semibold text-strong">{c.name}</p>
            <a className="flex items-center gap-2 text-gold break-all" href={`mailto:${c.email}`}><Mail size={16} className="shrink-0" />{c.email}</a>
            <a className="flex items-center gap-2 text-gold" href={`tel:${c.phone.replace(/\s/g, "")}`}><Phone size={16} className="shrink-0" />{c.phone}</a>
            <p className="flex items-start gap-2 text-soft"><MapPin size={16} className="shrink-0 mt-0.5 text-gold" />{c.company}, {c.address}</p>
          </div>
          <p className="text-sm text-muted mt-5">Signed in? Download your data or delete your account from <Link href="/account?tab=privacy" className="text-gold">Account → Privacy &amp; data</Link>.</p>
        </div>
      </section>
    </>
  );
}
