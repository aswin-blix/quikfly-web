"use client";
// Service switches (admin → Settings → Services): screens list only open services, and a
// paused service's pages show the owner's message instead. The API refuses new bookings
// for it too, so this is about not offering what can't be booked.
import { PauseCircle } from "lucide-react";
import { serviceOn, type ServiceKey } from "@quikfly/shared";
import { localizeService, SERVICES, type ServiceMeta } from "@/lib/services";
import { useT } from "./LanguageProvider";
import { useSettings } from "./ConfigProvider";
import { GhostLink } from "./ui";

/** Services open for new bookings, in menu order, with texts in the visitor's language. */
export function useOpenServices(): ServiceMeta[] {
  const settings = useSettings();
  const t = useT();
  return SERVICES.filter((s) => serviceOn(settings, s.key)).map((s) => localizeService(s, t));
}

/** A function telling whether a service is open (for links between services). */
export function useServiceOn(): (key: ServiceKey) => boolean {
  const settings = useSettings();
  return (key) => serviceOn(settings, key);
}

/** The service a path belongs to ("/bus/seats" → bus), if any. */
const serviceForPath = (path: string) => SERVICES.find((s) => path === s.href || path.startsWith(`${s.href}/`));

/** Renders the page, or the paused message when the page's service is switched off. */
export function PausedGate({ path, children }: { path: string; children: React.ReactNode }) {
  const settings = useSettings();
  const svc = serviceForPath(path);
  if (!svc || serviceOn(settings, svc.key)) return <>{children}</>;
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <span className="w-16 h-16 mx-auto rounded-2xl bg-gold/10 text-gold grid place-items-center"><PauseCircle size={32} /></span>
      <h1 className="font-display text-3xl mt-6">{svc.action} is paused</h1>
      <p className="text-muted mt-2">{settings.servicePausedMessage}</p>
      <p className="text-sm text-subtle mt-1">Bookings you&apos;ve already made aren&apos;t affected. You&apos;ll find them in My Trips.</p>
      <div className="flex justify-center gap-3 mt-8">
        <GhostLink href="/">See other services</GhostLink>
        <GhostLink href="/bookings">My Trips</GhostLink>
      </div>
    </div>
  );
}
