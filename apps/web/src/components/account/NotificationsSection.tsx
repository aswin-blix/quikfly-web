"use client";
// Account → Notifications: the switch for notifications in this browser, what they cover, and
// what to do when the browser blocks them. The inbox itself is /notifications.
import { BellRing, Inbox } from "lucide-react";
import { Link } from "@/lib/nav";
import { usePush } from "../PushCard";
import { useT } from "../LanguageProvider";
import { Section, Toggle } from "./kit";

const STATE_TEXT = {
  unavailable: "This browser can't show QuikFly notifications. Try Chrome, Edge or Firefox, or install the QuikFly app.",
  disabled: "Browser notifications aren't switched on for QuikFly yet. Your updates are in the inbox.",
  blocked: "Notifications are blocked for this site. Allow them in your browser's site settings (the lock or tune icon next to the address), then come back here.",
  demo: "Demo: your choice is saved in this browser, but no notifications are sent.",
  off: "Off. Updates still arrive in your inbox.",
  on: "On. You'll get them even when QuikFly isn't open.",
} as const;

export function NotificationsSection() {
  const t = useT();
  const { state, busy, enable, disable } = usePush();
  const canSwitch = state === "on" || state === "off" || state === "demo";
  return (
    <Section title={t("navNotifications")} sub="Choose how QuikFly tells you about your trips.">
      <div className="space-y-6 divide-y divide-line [&>*:not(:first-child)]:pt-6">
        <div>
          <Toggle label="Notifications in this browser" sub={state ? STATE_TEXT[state] : "Checking this browser…"}
            checked={state === "on"} disabled={!canSwitch || busy} onChange={(on) => (on ? enable() : disable())} />
          <ul className="mt-4 text-sm text-muted space-y-1 list-disc pl-5">
            <li>Booking confirmed, changed or cancelled, and refunds</li>
            <li>A reminder when your scheduled ride is about to start</li>
            <li>Parcel moves, and when it&apos;s ready to collect</li>
            <li>Replies from QuikFly support, licence decisions and credits earned</li>
          </ul>
          <p className="text-xs text-subtle mt-3 flex items-center gap-1.5"><BellRing size={13} />Each browser and phone is set separately. Signing out stops them here.</p>
        </div>
        <div>
          <p className="font-medium text-strong flex items-center gap-2"><Inbox size={17} className="text-gold" />Your inbox</p>
          <p className="text-sm text-muted mt-1">Every update is kept there too, with or without notifications. <Link href="/notifications" className="text-gold">Open the inbox</Link></p>
        </div>
      </div>
    </Section>
  );
}
