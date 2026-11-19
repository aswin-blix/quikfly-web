"use client";
// /ticket?t=TOKEN: a bus m-ticket. Public (no login), so the QR code on it can be scanned
// by a conductor, who sees the same page with its status. The timetable is simulated, so the
// page says so.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { BusFront, CircleCheck, Printer, XCircle } from "lucide-react";
import type { PublicTicket } from "@quikfly/shared";
import { Empty, Spinner } from "@/components/ui";
import { QR_COLORS, ticketUrl } from "@/lib/account";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { useQuery } from "@/lib/nav";

const STATUS = {
  valid: { label: "Valid ticket", className: "bg-success/15 text-success", Icon: CircleCheck },
  cancelled: { label: "Cancelled", className: "bg-danger/15 text-danger", Icon: XCircle },
  completed: { label: "Trip completed", className: "bg-fg/10 text-muted", Icon: CircleCheck },
} as const;

export function TicketScreen() {
  const token = useQuery().get("t") ?? "";
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setError("This link is missing its ticket code."); return; }
    api.tickets.get(token).then(setTicket, (e) => setError((e as Error).message));
    QRCode.toString(ticketUrl(token), { type: "svg", margin: 1, color: QR_COLORS }).then(setQr, () => setQr(""));
  }, [token]);

  if (error) return <div className="max-w-lg mx-auto px-4 pt-12"><div className="panel"><Empty icon={<BusFront size={40} />} text={error} /></div></div>;
  if (!ticket) return <div className="py-24 text-center text-gold"><Spinner size={26} /></div>;
  const status = STATUS[ticket.status];

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-16">
      <div className="panel overflow-hidden">
        <div className="p-5 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <BusFront className="text-gold shrink-0" size={22} />
            <p className="font-display text-lg text-strong">QuikFly m-Ticket</p>
          </div>
          <span className={cx("text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 shrink-0", status.className)}>
            <status.Icon size={14} />{status.label}
          </span>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <h1 className="font-display text-2xl text-strong">{ticket.title}</h1>
            <p className="text-sm text-muted">{ticket.subtitle}</p>
          </div>
          {ticket.details.length > 0 && (
            <dl className="divide-y divide-line text-sm">
              {ticket.details.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-subtle">{k}</dt><dd className="text-right font-medium text-strong">{v}</dd></div>)}
            </dl>
          )}
          {ticket.seats.length > 0 && (
            <div>
              <p className="label mb-2">Seats</p>
              <div className="flex flex-wrap gap-2">
                {ticket.seats.map((seat, i) => (
                  <span key={seat} className="chip !text-sm">{seat}{ticket.travellers[i] ? ` · ${ticket.travellers[i]}` : ""}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-between items-baseline gap-4">
            <span className="label">PNR</span>
            <span className="font-mono text-strong tracking-wider">{ticket.pnr}</span>
          </div>
        </div>

        {ticket.status === "valid" && qr && (
          <div className="p-5 border-t border-dashed border-line flex flex-col items-center gap-3">
            {/* Dark on white in both themes, so any scanner reads it. */}
            <div className="w-48 h-48 rounded-xl overflow-hidden" role="img" aria-label={`QR code for ticket ${ticket.pnr}`} dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="text-xs text-muted text-center">Show this at boarding. Scanning the code opens this page, so the conductor sees the ticket is valid.</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-subtle">Demo: the bus timetable is simulated.</p>
        {ticket.status === "valid" && (
          <button onClick={() => window.print()} className="text-sm text-gold inline-flex items-center gap-1.5 print:hidden"><Printer size={15} />Print or save</button>
        )}
      </div>
    </div>
  );
}
