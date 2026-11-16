"use client";
// /invoice?id=BOOKING_ID: a printable tax invoice ("Save as PDF" from the print dialog).
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import type { Booking } from "@quikfly/shared";
import { useApp } from "@/components/AppProvider";
import { Empty, GoldButton, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { prettyDateTime } from "@/lib/format";
import { inr2, invoiceFor } from "@/lib/invoice";
import { Link, useQuery } from "@/lib/nav";
import { serviceByKey } from "@/lib/services";
import { COMPANY } from "@/lib/site";

export function InvoiceScreen() {
  const id = useQuery().get("id") ?? "";
  const { user, requireAuth } = useApp();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const signedIn = !!user;

  useEffect(() => {
    if (!signedIn || !id) return;
    api.bookings.get(id).then(setBooking, (e) => setError((e as Error).message));
  }, [signedIn, id]);

  const shell = (node: React.ReactNode) => <div className="max-w-xl mx-auto px-4 py-20"><div className="panel">{node}</div></div>;
  if (!user) return shell(<Empty icon={<FileText size={40} />} text="Sign in to see this invoice." action={<GoldButton onClick={() => requireAuth(() => undefined)}>Login</GoldButton>} />);
  if (!id || error) return shell(<Empty icon={<FileText size={40} />} text={error || "No booking selected."} />);
  if (!booking) return <div className="py-32 grid place-items-center"><Spinner size={26} /></div>;
  if (booking.status === "cancelled") return shell(<Empty icon={<FileText size={40} />} text="This booking was cancelled, so there's no invoice." />);

  const inv = invoiceFor(booking);
  const svc = serviceByKey(booking.service);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-16">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
        <Link href="/bookings" className="text-sm text-muted hover:text-strong flex items-center gap-1"><ArrowLeft size={16} />My trips</Link>
        <GoldButton onClick={() => window.print()} className="!py-2"><Printer size={16} />Print / Save as PDF</GoldButton>
      </div>

      <article className="paper p-6 sm:p-10 text-sm">
        <header className="flex flex-wrap justify-between gap-4 pb-6 border-b paper-line">
          <div>
            <p className="font-display text-2xl paper-accent">QuikFly</p>
            <p className="font-semibold mt-2">{COMPANY.legalName}</p>
            <p className="paper-muted">{COMPANY.address}</p>
            <p className="paper-muted">GSTIN {COMPANY.gstin}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">Tax invoice</p>
            <p className="paper-muted mt-2">Invoice no. <span className="font-mono">INV-{booking.id}</span></p>
            <p className="paper-muted">Date {prettyDateTime(booking.createdAt)}</p>
            <p className="paper-muted">Booking {booking.id}</p>
          </div>
        </header>

        <section className="grid sm:grid-cols-2 gap-6 py-6 border-b paper-line">
          <div>
            <p className="text-xs uppercase tracking-wide paper-muted">Billed to</p>
            <p className="font-semibold mt-1">{inv.buyerGst?.name || user.name}</p>
            {inv.buyerGst && <p>GSTIN <span className="font-mono">{inv.buyerGst.gstin}</span></p>}
            <p className="paper-muted">{user.phone}{user.email ? ` · ${user.email}` : ""}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide paper-muted">Service</p>
            <p className="font-semibold mt-1">{svc.action}: {booking.title}</p>
            <p className="paper-muted">{booking.subtitle}</p>
          </div>
        </section>

        {inv.details.length > 0 && (
          <dl className="py-6 border-b paper-line grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
            {inv.details.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="paper-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}
          </dl>
        )}

        <table className="w-full mt-6">
          <tbody>
            <tr><td className="py-1.5 paper-muted">Taxable value</td><td className="py-1.5 text-right tabular-nums">{inr2(inv.taxable)}</td></tr>
            <tr><td className="py-1.5 paper-muted">CGST @ {inv.rate / 2}%</td><td className="py-1.5 text-right tabular-nums">{inr2(inv.cgst)}</td></tr>
            <tr><td className="py-1.5 paper-muted">SGST @ {inv.rate / 2}%</td><td className="py-1.5 text-right tabular-nums">{inr2(inv.sgst)}</td></tr>
            <tr className="border-t paper-line text-base font-bold"><td className="pt-3">Total (incl. GST)</td><td className="pt-3 text-right tabular-nums">{inr2(inv.total)}</td></tr>
          </tbody>
        </table>
        <p className="paper-muted mt-2">Paid via {booking.payment.toUpperCase()} · Status: {booking.status}</p>

        <footer className="mt-10 pt-6 border-t paper-line text-xs paper-muted space-y-1">
          <p>Questions? {COMPANY.email} · {COMPANY.phone}</p>
          <p>Demo invoice generated by the QuikFly preview. Not valid for tax purposes.</p>
        </footer>
      </article>
    </div>
  );
}
