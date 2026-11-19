"use client";
// Account → Support: the customer's tickets and callback requests, a form to open a ticket
// (optionally about one of their bookings; /account?tab=support&booking=ID prefills it), and
// each thread with reply and close. Staff answer from the admin Support queue.
import { useEffect, useState } from "react";
import { ArrowLeft, Headphones, MessageSquare, PhoneCall, Plus, Send } from "lucide-react";
import { SUPPORT_RULES, SUPPORT_TOPICS, SUPPORT_TOPIC_LABEL, type Booking, type SupportStatus, type SupportTicket, type SupportTopic } from "@quikfly/shared";
import { WhatsAppButton } from "@/components/support/CallbackForm";
import { GoldButton } from "@/components/ui";
import { DEMO_MODE, api } from "@/lib/api";
import { cx, prettyDateTime } from "@/lib/format";
import { useNav, useQuery } from "@/lib/nav";
import { ErrorText, Field, ItemRow, Section, useAction } from "./kit";

const STATUS_LABEL: Record<SupportStatus, string> = { open: "Waiting for QuikFly", answered: "QuikFly replied", closed: "Closed" };
const STATUS_TONE: Record<SupportStatus, string> = { open: "text-muted border-line", answered: "text-gold border-gold/40", closed: "text-subtle border-line" };

function StatusChip({ status }: { status: SupportStatus }) {
  return <span className={cx("text-[11px] border rounded-full px-2 py-0.5 whitespace-nowrap", STATUS_TONE[status])}>{STATUS_LABEL[status]}</span>;
}

function NewTicket({ bookings, bookingId: initialBooking, onOpened, onCancel }: {
  bookings: Booking[]; bookingId?: string; onOpened: (t: SupportTicket) => void; onCancel: () => void;
}) {
  const [topic, setTopic] = useState<SupportTopic>("booking");
  const [bookingId, setBookingId] = useState(initialBooking && bookings.some((b) => b.id === initialBooking) ? initialBooking : "");
  const [message, setMessage] = useState("");
  const { run, busy, error, setError } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < SUPPORT_RULES.messageMin) return setError("Tell us a little more about the problem.");
    run(async () => onOpened(await api.support.open({ topic, message: message.trim(), bookingId: bookingId || undefined })));
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="About" htmlFor="st-topic">
          <select id="st-topic" className="field" value={topic} onChange={(e) => setTopic(e.target.value as SupportTopic)}>
            {SUPPORT_TOPICS.map((t) => <option key={t} value={t}>{SUPPORT_TOPIC_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Booking (optional)" htmlFor="st-booking">
          <select id="st-booking" className="field" value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
            <option value="">Not about a booking</option>
            {bookings.map((b) => <option key={b.id} value={b.id}>{b.title} · {b.id}</option>)}
          </select>
        </Field>
      </div>
      <Field label="What happened?" htmlFor="st-msg" hint={`${message.trim().length}/${SUPPORT_RULES.messageMax}`}>
        <textarea id="st-msg" className="field min-h-[110px]" maxLength={SUPPORT_RULES.messageMax} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <GoldButton loading={busy}><Send size={16} /> Send to QuikFly</GoldButton>
        <button type="button" className="text-sm text-muted hover:text-strong px-2 py-3" onClick={onCancel}>Cancel</button>
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}

function Thread({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: (t: SupportTicket) => void }) {
  const [t, setT] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState("");
  const { run, busy, error, setError } = useAction();

  useEffect(() => { run(async () => setT(await api.support.get(id))); }, [id, run]);
  const save = (next: SupportTicket) => { setT(next); onChanged(next); };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (reply.trim().length < SUPPORT_RULES.messageMin) return setError("Write a little more.");
    run(async () => { save(await api.support.reply(id, reply.trim())); setReply(""); });
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm text-muted hover:text-strong inline-flex items-center gap-1 mb-4"><ArrowLeft size={16} /> All requests</button>
      {!t ? (error ? <ErrorText>{error}</ErrorText> : <div className="skeleton h-32" />) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="font-medium text-strong">{t.kind === "callback" ? "Callback request" : "Ticket"} · {SUPPORT_TOPIC_LABEL[t.topic]}</p>
            <StatusChip status={t.status} />
          </div>
          <p className="text-xs text-subtle mb-4">{t.id}{t.bookingId ? ` · booking ${t.bookingId}` : ""}{t.ref ? ` · ${t.ref}` : ""}</p>
          <ol className="space-y-2">
            {t.messages.map((m) => (
              <li key={m.id} className={cx("rounded-xl px-3 py-2 text-sm max-w-[90%] border", m.author === "staff" ? "bg-gold/10 border-gold/30" : "ml-auto bg-smoke border-line")}>
                <p className="text-[11px] text-subtle mb-0.5">{m.author === "staff" ? `${m.staffName ?? "QuikFly"} · QuikFly support` : "You"} · {prettyDateTime(m.createdAt)}</p>
                <p className="whitespace-pre-wrap text-strong">{m.body}</p>
              </li>
            ))}
          </ol>
          {t.status === "open" && <p className="text-xs text-muted mt-3">We usually reply within a few hours.{DEMO_MODE ? " (demo: no staff answer here)" : ""}</p>}
          {t.status === "closed" ? (
            <p className="text-sm text-muted mt-5 pt-5 border-t border-line">This request is closed. Need more help? Open a new ticket.</p>
          ) : t.kind === "callback" ? (
            <p className="text-sm text-muted mt-5 pt-5 border-t border-line">Our team will call you on {t.phone}.</p>
          ) : (
            <form onSubmit={send} className="mt-5 pt-5 border-t border-line grid gap-3">
              <Field label="Reply" htmlFor="st-reply">
                <textarea id="st-reply" className="field min-h-[84px]" maxLength={SUPPORT_RULES.messageMax} value={reply} onChange={(e) => setReply(e.target.value)} />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <GoldButton loading={busy}><Send size={16} /> Send</GoldButton>
                <button type="button" disabled={busy} className="text-sm text-muted hover:text-strong px-2 py-3" onClick={() => run(async () => save(await api.support.close(id)))}>My problem is solved, close it</button>
                <ErrorText>{error}</ErrorText>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

export function SupportSection() {
  const q = useQuery();
  const nav = useNav();
  const prefillBooking = q.get("booking") ?? undefined;
  const openId = q.get("ticket");
  const [list, setList] = useState<SupportTicket[] | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [composing, setComposing] = useState(!!prefillBooking);
  const { run, error } = useAction();

  useEffect(() => {
    run(async () => {
      const [tickets, b] = await Promise.all([api.support.list(), api.bookings.list().catch(() => [] as Booking[])]);
      setList(tickets); setBookings(b);
    });
  }, [run]);

  const show = (id: string | null) => nav.push(`/account?${new URLSearchParams({ tab: "support", ...(id ? { ticket: id } : {}) })}`);
  // Keep the list in step with a reply or close made inside a thread.
  const changed = (t: SupportTicket) => setList((l) => l?.map((x) => (x.id === t.id ? { ...x, status: t.status, updatedAt: t.updatedAt } : x)) ?? l);

  return (
    <Section title="Support" sub="Your questions to QuikFly and our replies. You'll get a notification when we answer.">
      {openId ? <Thread id={openId} onBack={() => show(null)} onChanged={changed} /> : composing ? (
        <NewTicket bookings={bookings} bookingId={prefillBooking}
          onOpened={(t) => { setList((l) => [t, ...(l ?? [])]); setComposing(false); show(t.id); }}
          onCancel={() => setComposing(false)} />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <GoldButton type="button" onClick={() => setComposing(true)}><Plus size={16} /> New ticket</GoldButton>
            <WhatsAppButton text="Hi QuikFly, I need help with " />
          </div>
          <div className="mt-5 pt-2 border-t border-line">
            {list === null ? (error ? <ErrorText>{error}</ErrorText> : <div className="skeleton h-16 mt-3" />) : list.length === 0 ? (
              <div className="flex items-center gap-3 py-6 text-sm text-muted"><Headphones size={20} className="text-gold" /> No requests yet. Open a ticket, or ask for a callback on the Help page.</div>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((t) => (
                  <ItemRow key={t.id} icon={t.kind === "callback" ? <PhoneCall size={18} /> : <MessageSquare size={18} />}
                    title={<button type="button" className="text-left hover:text-gold" onClick={() => show(t.id)}>{SUPPORT_TOPIC_LABEL[t.topic]}{t.kind === "callback" ? " · callback" : ""}</button>}
                    sub={`${t.messages[0]?.body ?? ""} · ${prettyDateTime(t.updatedAt)}`}
                    action={<StatusChip status={t.status} />} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Section>
  );
}
