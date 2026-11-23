"use client";
// Browser alerts for staff: the offer on the dashboard ("Get alerts when the panel is closed") and the
// switch on the Alerts page. The browser's own prompt only follows "Turn on". See src/lib/push.ts.
import { useCallback, useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { useAlerts } from "@/lib/alerts";
import { disablePush, dismissPush, enablePush, pushDismissed, pushState, type PushState } from "@/lib/push";
import { useSession } from "@/lib/session";
import { Button, Toggle } from "./ui";

export function usePush() {
  const { admin } = useSession();
  const { pushKey, items } = useAlerts();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loaded = items !== null;

  useEffect(() => {
    if (!loaded) return; // the first alerts load says whether browser push is on
    let live = true;
    pushState(pushKey).then((s) => live && setState(s), () => live && setState("unavailable"));
    return () => { live = false; };
  }, [loaded, pushKey]);

  const enable = useCallback(async () => {
    if (!admin) return;
    setBusy(true); setError("");
    try { setState(await enablePush(pushKey, admin.id)); }
    catch { setError("Couldn't turn browser alerts on. Please try again."); }
    finally { setBusy(false); }
  }, [admin, pushKey]);

  const disable = useCallback(async () => {
    setBusy(true); setError("");
    try { await disablePush(); setState(await pushState(pushKey)); }
    finally { setBusy(false); }
  }, [pushKey]);

  return { state, busy, error, enable, disable };
}

/** Dashboard card: shown while browser alerts are possible, off, and not declined. */
export function PushCard() {
  const { enabled } = useAlerts();
  const { state, busy, error, enable } = usePush();
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(pushDismissed()), []);
  if (!enabled || hidden || state !== "off") return null;
  const dismiss = () => { dismissPush(); setHidden(true); };
  return (
    <div className="card p-4 mb-6 flex items-start gap-3" role="region" aria-label="Browser alerts">
      <span className="size-10 shrink-0 rounded-field bg-accent/10 text-accent grid place-items-center"><BellRing size={19} /></span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-strong">Get alerts when the panel is closed</p>
        <p className="text-sm text-muted mt-0.5">SOS presses, new tickets and callbacks, partner reviews and payout requests, licences and unclaimed parcels, as browser notifications.</p>
        {error && <p className="text-sm text-danger mt-1" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="primary" size="sm" loading={busy} onClick={enable}>Turn on</Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>Not now</Button>
        </div>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="size-8 -m-1 grid place-items-center rounded-field text-subtle hover:text-fg hover:bg-raised"><X size={16} /></button>
    </div>
  );
}

const STATE_TEXT: Record<PushState, string> = {
  unavailable: "This browser can't show notifications. Try Chrome, Edge or Firefox.",
  disabled: "Browser alerts aren't switched on for QuikFly yet (the owner sets the VAPID keys). Alerts still show here and on the bell.",
  blocked: "Notifications are blocked for this site. Allow them in the browser's site settings (the icon left of the address), then come back.",
  off: "Off. Alerts show here and on the bell while the panel is open.",
  on: "On. Alerts arrive as notifications even when the panel is closed. An SOS stays on screen until you click it.",
};

/** The Alerts page's settings: browser alerts and the SOS tone. */
export function AlertSettings() {
  const { muted, setMuted } = useAlerts();
  const { state, busy, error, enable, disable } = usePush();
  return (
    <div className="card p-4 grid gap-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-strong">Browser alerts on this computer</p>
          <Toggle label="Browser alerts on this computer" checked={state === "on"} disabled={busy || !(state === "on" || state === "off")} onChange={(on) => (on ? enable() : disable())} />
        </div>
        <p className="text-xs text-muted mt-1">{state ? STATE_TEXT[state] : "Checking this browser…"}</p>
        {error && <p className="text-sm text-danger mt-1" role="alert">{error}</p>}
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-strong">Sound for a new SOS</p>
          <Toggle label="Sound for a new SOS" checked={!muted} onChange={(on) => setMuted(!on)} />
        </div>
        <p className="text-xs text-muted mt-1">A short tone while the panel is open. Browsers allow it after you&apos;ve clicked anywhere in the panel once.</p>
      </div>
    </div>
  );
}
