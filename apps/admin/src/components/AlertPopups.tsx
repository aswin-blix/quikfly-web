"use client";
// Pop-ups for new staff alerts (a ticket, a reply, a callback, a partner to review...): bottom of the
// screen on phones, top right on larger screens. Each has an Open button and closes by itself after a
// while, but only while the tab is on screen and the pointer isn't over it, so none goes unseen.
// An SOS doesn't come here: it gets the banner on every page (AdminShell) and its own tone.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, X } from "lucide-react";
import { alertIcon } from "@/lib/alert-kinds";
import { useAlerts, type AlertPopup } from "@/lib/alerts";

/** How long a pop-up stays once it's been on screen. */
const POPUP_MS = 20_000;

function useTabVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

function Popup({ p, dismiss }: { p: AlertPopup; dismiss: (key: string) => void }) {
  const onClose = useCallback(() => dismiss(p.key), [dismiss, p.key]);
  const visible = useTabVisible();
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!visible || hover) return;
    const t = setTimeout(onClose, POPUP_MS);
    return () => clearTimeout(t);
  }, [visible, hover, onClose]);
  const Icon = p.kind ? alertIcon(p.kind) : BellRing;
  return (
    <li role="status" className="popover popover-enter pointer-events-auto p-3 flex items-start gap-3"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <span className="size-9 shrink-0 rounded-field bg-accent/10 text-accent grid place-items-center"><Icon size={18} /></span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-strong text-sm leading-snug">{p.title}</p>
        <p className="text-sm text-muted mt-0.5 leading-snug">{p.body}</p>
        <Link href={p.link} onClick={onClose} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
          {p.link === "/alerts" ? "See alerts" : "Open"} <ArrowRight size={14} />
        </Link>
      </div>
      <button onClick={onClose} aria-label="Close" className="size-8 -m-1 shrink-0 grid place-items-center rounded-field text-subtle hover:text-fg hover:bg-raised"><X size={16} /></button>
    </li>
  );
}

export function AlertPopups() {
  const { enabled, popups, dismissPopup } = useAlerts();
  if (!enabled) return null;
  return (
    <ol aria-live="polite" aria-label="New alerts"
      className="fixed z-50 pointer-events-none grid gap-2 inset-x-3 bottom-3 sm:inset-x-auto sm:right-4 sm:w-[22rem] sm:bottom-auto sm:top-[4.25rem] lg:right-6">
      {popups.map((p) => <Popup key={p.key} p={p} dismiss={dismissPopup} />)}
    </ol>
  );
}
