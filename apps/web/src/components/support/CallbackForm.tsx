"use client";
// "Request a callback": anyone can leave a name and number (signed-in customers' requests are
// linked to their account and show under Account → Support). Staff see it in the admin queue.
import { useState } from "react";
import { CheckCircle2, MessageCircle, PhoneCall } from "lucide-react";
import { CALLBACK_TIMES, CALLBACK_TIME_LABEL, LIMITS, PATTERNS, SUPPORT_RULES, SUPPORT_TOPICS, SUPPORT_TOPIC_LABEL, whatsappLink, type CallbackTime, type SupportTopic } from "@quikfly/shared";
import { useApp } from "@/components/AppProvider";
import { useSettings } from "@/components/ConfigProvider";
import { ErrorText, Field, useAction } from "@/components/account/kit";
import { GoldButton } from "@/components/ui";
import { DEMO_MODE, api } from "@/lib/api";
import { Link } from "@/lib/nav";

/** WhatsApp chat link with a ready message; renders nothing until the owner sets a WhatsApp number. */
export function WhatsAppButton({ text, className }: { text: string; className?: string }) {
  const href = whatsappLink(useSettings().whatsappNumber, text);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? "rounded-xl px-5 py-3 border border-line hover:border-gold/60 inline-flex items-center justify-center gap-2 transition-colors"}>
      <MessageCircle size={18} className="text-gold" /> Chat on WhatsApp
    </a>
  );
}

export function CallbackForm({ topic: initialTopic = "booking", about, idPrefix = "cb" }: {
  topic?: SupportTopic;
  /** What the request is about (e.g. a holiday's name), shown to staff. */
  about?: string;
  idPrefix?: string;
}) {
  const { user } = useApp();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone.replace(/\D/g, "").slice(-10) ?? "");
  const [topic, setTopic] = useState<SupportTopic>(initialTopic);
  const [time, setTime] = useState<CallbackTime>("anytime");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<CallbackTime | null>(null);
  const { run, busy, error, setError } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < LIMITS.nameMin) return setError("Enter your name.");
    if (!PATTERNS.phone.test(phone)) return setError("Enter a valid 10-digit mobile number.");
    run(async () => {
      await api.support.requestCallback({ name: name.trim(), phone, topic, preferredTime: time, message: message.trim() || undefined, ref: about });
      setDone(time); setMessage("");
    });
  };

  if (done) return (
    <div className="flex items-start gap-3" role="status">
      <CheckCircle2 className="text-gold shrink-0 mt-0.5" size={22} />
      <div className="text-sm">
        <p className="font-medium text-strong">Request received</p>
        <p className="text-muted mt-1">Our team will call you{done === "anytime" ? " soon" : ` in the ${CALLBACK_TIME_LABEL[done].toLowerCase()}`}.
          {user ? <> You can follow it in <Link href="/account?tab=support" className="text-gold">Account → Support</Link>.</> : null}
          {DEMO_MODE ? " (demo: requests stay in this browser)" : ""}</p>
        <button type="button" className="text-gold mt-2" onClick={() => setDone(null)}>Request another</button>
      </div>
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Your name" htmlFor={`${idPrefix}-name`}><input id={`${idPrefix}-name`} className="field" autoComplete="name" maxLength={LIMITS.nameMax} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Mobile number" htmlFor={`${idPrefix}-phone`}><input id={`${idPrefix}-phone`} className="field" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="About" htmlFor={`${idPrefix}-topic`}>
          <select id={`${idPrefix}-topic`} className="field" value={topic} onChange={(e) => setTopic(e.target.value as SupportTopic)}>
            {SUPPORT_TOPICS.map((t) => <option key={t} value={t}>{SUPPORT_TOPIC_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Best time to call" htmlFor={`${idPrefix}-time`}>
          <select id={`${idPrefix}-time`} className="field" value={time} onChange={(e) => setTime(e.target.value as CallbackTime)}>
            {CALLBACK_TIMES.map((t) => <option key={t} value={t}>{CALLBACK_TIME_LABEL[t]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Anything we should know? (optional)" htmlFor={`${idPrefix}-msg`}>
        <textarea id={`${idPrefix}-msg`} className="field min-h-[72px]" maxLength={SUPPORT_RULES.messageMax} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <GoldButton loading={busy}><PhoneCall size={16} /> Call me back</GoldButton>
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}
