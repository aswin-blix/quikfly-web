"use client";
// Browser notifications, offered where they help: the inbox and a confirmed booking show a card
// ("Get trip updates in this browser"), Account → Notifications has the switch. The browser's own
// prompt only appears after the person presses "Turn on". See src/lib/push.ts.
import { useCallback, useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { disablePush, dismissPush, enablePush, pushDismissed, pushState, type PushState } from "@/lib/push";
import { useApp } from "./AppProvider";
import { useConfig } from "./ConfigProvider";
import { GoldButton } from "./ui";

/** This browser's notification state and the actions on it, for the card and the Account switch. */
export function usePush() {
  const { user, toast } = useApp();
  const config = useConfig();
  const key = config?.push?.vapidPublicKey;
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!config) return; // wait for /config: it says whether browser push is on
    let live = true;
    pushState(key).then((s) => live && setState(s), () => live && setState("unavailable"));
    return () => { live = false; };
  }, [config, key]);

  const enable = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const next = await enablePush(key, user.id);
      setState(next);
      if (next === "on") toast("Notifications are on in this browser");
      else if (next === "blocked") toast("Notifications are blocked for this site in your browser settings", "err");
    } catch {
      toast("Couldn't turn notifications on. Please try again.", "err");
    } finally {
      setBusy(false);
    }
  }, [key, user, toast]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await disablePush();
      setState(await pushState(key));
      toast("Notifications are off in this browser");
    } finally {
      setBusy(false);
    }
  }, [key, toast]);

  return { state, busy, enable, disable };
}

const COPY = {
  inbox: { title: "Get these in your browser", text: "Booking changes, refunds, ride reminders and parcel updates, even when QuikFly isn't open." },
  booking: { title: "Want updates on this trip?", text: "Get a notification when it's about to start, if anything changes, and when a refund lands." },
} as const;

/** The offer to turn browser notifications on. Shows only when that's possible and not yet declined. */
export function PushCard({ context, className }: { context: keyof typeof COPY; className?: string }) {
  const { user } = useApp();
  const { state, busy, enable } = usePush();
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(pushDismissed()), []);
  if (!user || hidden || (state !== "off" && state !== "demo")) return null;
  const copy = COPY[context];
  return (
    <div className={`panel p-4 flex gap-3 items-start text-left ${className ?? ""}`} role="region" aria-label="Browser notifications">
      <span className="w-10 h-10 shrink-0 rounded-xl bg-gold/10 text-gold grid place-items-center"><BellRing size={19} /></span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-strong">{copy.title}</p>
        <p className="text-sm text-muted mt-0.5">{copy.text}</p>
        {state === "demo" && <p className="text-xs text-subtle mt-1">Demo: your choice is saved in this browser, but no notifications are sent.</p>}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <GoldButton loading={busy} onClick={enable} className="px-4 py-2 text-sm">Turn on</GoldButton>
          <button type="button" onClick={() => { dismissPush(); setHidden(true); }} className="px-3 py-2 text-sm text-muted hover:text-strong rounded-xl">Not now</button>
        </div>
      </div>
      <button type="button" onClick={() => { dismissPush(); setHidden(true); }} aria-label="Dismiss" className="p-1 -m-1 text-subtle hover:text-strong rounded-lg"><X size={16} /></button>
    </div>
  );
}
