"use client";
// Service switches (admin → Settings → Services): screens list only open services, and a
// paused service's pages show the owner's message instead. The API refuses new bookings
// for it too, so this is about not offering what can't be booked.
import { PauseCircle } from "lucide-react";
import { DEFAULT_SETTINGS, serviceOn, type ServiceKey } from "@quikfly/shared";
import { localizeService, SERVICES, type ServiceMeta } from "@/lib/services";
import { useT } from "./LanguageProvider";
import { useConfigState, useSettings } from "./ConfigProvider";
import { GhostLink, Spinner } from "./ui";

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
/** Pages that work while their service is off: a parcel already sent can still be tracked. */
const ALWAYS_OPEN = ["/parcels/track"];
const serviceForPath = (path: string) => ALWAYS_OPEN.includes(path) ? undefined : SERVICES.find((s) => path === s.href || path.startsWith(`${s.href}/`));

/** Renders the page, or the paused message when the page's service is switched off. */
export function PausedGate({ path, children }: { path: string; children: React.ReactNode }) {
  const settings = useSettings();
  const { config, error, retry } = useConfigState();
  const svc = serviceForPath(path);
  if (!svc || serviceOn(settings, svc.key)) return <>{children}</>;
  // A service that's off by default can't be called paused before the settings arrive.
  if (!config && !serviceOn(DEFAULT_SETTINGS, svc.key)) {
    return (
      <div className="py-32 text-center text-gold">
        {error ? <p className="text-sm text-danger" role="alert">{error} <button onClick={retry} className="text-gold underline">Try again</button></p> : <Spinner size={26} />}
      </div>
    );
  }
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
