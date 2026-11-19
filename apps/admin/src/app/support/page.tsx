"use client";
// Support queue: callback requests (anyone) and tickets (signed-in customers). Staff open one,
// read the thread, reply (the customer is notified in their app) or close it. Both are audited.
import { useState } from "react";
import { CheckCircle2, Headphones, MessageSquare, PhoneCall, Send } from "lucide-react";
import { CALLBACK_TIME_LABEL, SUPPORT_RULES, SUPPORT_TOPIC_LABEL, type AdminSupportTicket, type SupportStatus } from "@quikfly/shared";
import { Badge, Button, Empty, ErrorBox, PageHeader, Segmented } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, dateTime, timeAgo } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

const TABS: { value: SupportStatus; label: string }[] = [
  { value: "open", label: "Waiting for us" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
];

function Thread({ id, onChanged }: { id: string; onChanged: (t: AdminSupportTicket) => void }) {
  const { data: t, setData, error, reload } = useLoad(() => adminApi.support.get(id), [id]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"reply" | "close" | null>(null);
  const [actionError, setActionError] = useState("");

  async function act(kind: "reply" | "close") {
    setBusy(kind); setActionError("");
    try {
      const next = kind === "reply" ? await adminApi.support.reply(id, reply.trim()) : await adminApi.support.close(id, reply.trim() || undefined);
      setData(next); setReply(""); onChanged(next);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't save.");
    } finally { setBusy(null); }
  }

  if (error) return <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div>;
  if (!t) return <div className="p-4"><div className="skeleton h-24" /></div>;
  const tooShort = reply.trim().length < SUPPORT_RULES.messageMin;
  return (
    <div className="px-4 sm:px-5 pb-5 pt-1 space-y-3 border-t border-line bg-fg/[0.02]">
      <p className="text-xs text-subtle pt-3">
        {t.phone}{t.preferredTime ? ` · call ${CALLBACK_TIME_LABEL[t.preferredTime].toLowerCase()}` : ""}
        {t.bookingId ? ` · booking ${t.bookingId}` : ""}{t.ref ? ` · about ${t.ref}` : ""}{t.customerId ? "" : " · not signed in"}
      </p>
      <ol className="space-y-2">
        {t.messages.map((m) => (
          <li key={m.id} className={cx("rounded-xl px-3 py-2 text-sm max-w-[90%]", m.author === "staff" ? "ml-auto bg-brand/10 border border-brand/30" : "bg-surface border border-line")}>
            <p className="text-[11px] text-subtle mb-0.5">{m.author === "staff" ? `${m.staffName ?? "Staff"} (QuikFly)` : t.name} · {dateTime(m.createdAt)}</p>
            <p className="whitespace-pre-wrap text-fg">{m.body}</p>
          </li>
        ))}
      </ol>
      {t.status !== "closed" && (
        <div className="space-y-2">
          <label className="text-xs text-subtle" htmlFor={`reply-${t.id}`}>{t.customerId ? "Reply (the customer sees it in their app and gets a notification)" : "Note (this customer isn't signed in; call them and note what was agreed)"}</label>
          <textarea id={`reply-${t.id}`} className="field w-full min-h-[84px]" maxLength={SUPPORT_RULES.messageMax} value={reply} onChange={(e) => setReply(e.target.value)} />
          {actionError && <ErrorBox message={actionError} />}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="secondary" loading={busy === "close"} disabled={!!busy} onClick={() => act("close")}><CheckCircle2 size={16} /> {reply.trim() ? "Close with this note" : "Close"}</Button>
            {t.customerId && <Button variant="primary" loading={busy === "reply"} disabled={!!busy || tooShort} onClick={() => act("reply")}><Send size={16} /> Send reply</Button>}
          </div>
        </div>
      )}
    </div>
  );
}

function Queue() {
  const [tab, setTab] = useState<SupportStatus>("open");
  const { data, setData, error, loading, reload } = useLoad(() => adminApi.support.list(tab), [tab]);
  const [open, setOpen] = useState<string | null>(null);

  // A reply or close moves the item to another tab: drop it from this list.
  const changed = (t: AdminSupportTicket) => { if (t.status !== tab) setData((l) => l?.filter((x) => x.id !== t.id) ?? null); };

  return (
    <>
      <PageHeader title="Support" sub="Callback requests from anyone, and tickets from signed-in customers. Oldest waiting first." />
      <div className="mb-4"><Segmented label="Show" value={tab} onChange={(v) => { setTab(v); setOpen(null); }} options={TABS} /></div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>}
      {data && (
        <div className={cx("card transition-opacity", loading && "opacity-60")}>
          {data.length === 0 ? (
            <Empty icon={Headphones} title={tab === "open" ? "Nothing waiting" : `No ${TABS.find((x) => x.value === tab)!.label.toLowerCase()} requests`} sub={tab === "open" ? "New callback requests and tickets appear here." : undefined} />
          ) : (
            <ul className="divide-y divide-line">
              {data.map((t) => (
                <li key={t.id}>
                  <button className="w-full text-left px-4 sm:px-5 py-4 flex items-start gap-3 hover:bg-fg/[0.03]" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                    {t.kind === "callback" ? <PhoneCall size={18} className="text-accent mt-0.5 shrink-0" /> : <MessageSquare size={18} className="text-accent mt-0.5 shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-fg">{t.name}</span>
                        <Badge>{t.kind === "callback" ? "Callback" : "Ticket"}</Badge>
                        <span className="text-xs text-subtle">{SUPPORT_TOPIC_LABEL[t.topic]}</span>
                      </span>
                      <span className="block text-sm text-muted truncate mt-0.5">{t.messages[0]?.body}</span>
                    </span>
                    <span className="text-xs text-subtle shrink-0">{timeAgo(t.updatedAt)}</span>
                  </button>
                  {open === t.id && <Thread id={t.id} onChanged={changed} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="support.manage"><Queue /></RequireAdmin>;
}
