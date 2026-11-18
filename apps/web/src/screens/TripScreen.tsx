"use client";
// /trip?id=TRIP_ID: the bookings of one trip on a timeline, each with its own tax invoice
// (services carry different GST rates and invoice numbers), and the trip total. Printable.
import { ArrowLeft, FileText, Printer, Route } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Empty, GoldButton } from "@/components/ui";
import { cx, inr, prettyDateTime } from "@/lib/format";
import { Link, qs, useQuery } from "@/lib/nav";
import { serviceByKey } from "@/lib/services";
import { bookingWhen } from "@/lib/trips";

export function TripScreen() {
  const id = useQuery().get("id") ?? "";
  const { user, bookings, requireAuth } = useApp();
  const items = bookings.filter((b) => b.tripId === id).sort((a, b) => bookingWhen(a).localeCompare(bookingWhen(b)));
  const live = items.filter((b) => b.status !== "cancelled");
  const total = live.reduce((sum, b) => sum + b.amount, 0);

  const shell = (node: React.ReactNode) => <div className="max-w-xl mx-auto px-4 py-20"><div className="panel">{node}</div></div>;
  if (!user) return shell(<Empty icon={<Route size={40} />} text="Sign in to see this trip." action={<GoldButton onClick={() => requireAuth(() => undefined)}>Login</GoldButton>} />);
  if (!items.length) return shell(<Empty icon={<Route size={40} />} text="This trip wasn't found. Your bookings are under My Trips." action={<Link href="/bookings" className="text-gold">My trips</Link>} />);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-16">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
        <Link href="/bookings" className="text-sm text-muted hover:text-strong flex items-center gap-1"><ArrowLeft size={16} />My trips</Link>
        <GoldButton onClick={() => window.print()} className="!py-2"><Printer size={16} />Print / Save as PDF</GoldButton>
      </div>

      <article className="paper p-6 sm:p-10 text-sm">
        <header className="pb-5 border-b paper-line">
          <p className="font-display text-2xl paper-accent">QuikFly</p>
          <p className="text-lg font-bold mt-2">Trip summary</p>
          <p className="paper-muted">Trip <span className="font-mono">{id}</span> · {items.length} booking{items.length > 1 ? "s" : ""}</p>
          <p className="paper-muted mt-1">Each booking has its own tax invoice (different services carry different GST rates).</p>
        </header>

        <ol className="py-5 space-y-4">
          {items.map((b) => {
            const s = serviceByKey(b.service);
            return (
              <li key={b.id} className={cx("flex gap-4 items-start", b.status === "cancelled" && "opacity-60")}>
                <span className="w-9 h-9 shrink-0 rounded-lg grid place-items-center border paper-line"><s.icon size={18} /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{b.title}</p>
                  <p className="paper-muted">{b.subtitle}</p>
                  <p className="paper-muted text-xs mt-0.5">{s.action} · {prettyDateTime(bookingWhen(b))} · <span className="capitalize">{b.status}</span> · <span className="font-mono">{b.id}</span></p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">{inr(b.amount)}</p>
                  {b.status !== "cancelled" && <Link href={`/invoice${qs({ id: b.id })}`} className="no-print text-xs paper-accent inline-flex items-center gap-1"><FileText size={12} />Invoice</Link>}
                </div>
              </li>
            );
          })}
        </ol>

        <footer className="pt-4 border-t paper-line flex justify-between items-end">
          <span className="paper-muted">Trip total{live.length < items.length ? " (cancelled bookings left out)" : ""}</span>
          <span className="text-xl font-bold">{inr(total)}</span>
        </footer>
      </article>
    </div>
  );
}
