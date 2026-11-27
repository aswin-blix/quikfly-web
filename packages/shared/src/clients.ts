// Which services a client can show. The six launch services need no mention; a later one has to be
// declared, so an installed app from before it never gets a booking it would show as something else
// (app 0.1.16 reads an unknown service as a cab, with a cab's refund preview and GST).
//
// The declaration is a parameter of `Accept`, not a header of its own: `Accept` passes CORS
// without being allowed by name, so a new website still works against an older API.
import type { ServiceKey } from "./types";

/** Services added after the apps first shipped. A new service joins this list (and the app's copy in models.dart). */
export const DECLARED_SERVICES = ["parcel"] as const satisfies readonly ServiceKey[];

/** The `Accept` a client sends when it can show every service above. */
export const CLIENT_ACCEPT = `application/json; services=${DECLARED_SERVICES.join("+")}`;

/** The services to keep from a client that sent this `Accept` (none, or one from before this rule: all of them). */
export function hiddenServices(accept: string | null | undefined): ServiceKey[] {
  const declared = /;\s*services=([a-z+]+)/i.exec(accept ?? "")?.[1].split("+") ?? [];
  return DECLARED_SERVICES.filter((s) => !declared.includes(s));
}

/** What a client is told when it asks for a booking it can't show. */
export const UPDATE_TO_SEE = "Update QuikFly to see this booking, or open My Trips on the website.";

/**
 * Live rides (docs/driver-app-plan.md): a client that follows the server's ride phases says so with
 * `rides=live` in the same `Accept`. Anything else gets a simulated ride, because released apps play a
 * ride with their own timers and would "complete" a real one after a few seconds.
 */
export const LIVE_RIDES_PARAM = "rides=live";
export const acceptsLiveRides = (accept: string | null | undefined) => /;\s*rides=live\b/i.test(accept ?? "");

/** The `Accept` of a client that also follows live rides (the website, and the apps from the release that shows them). */
export const LIVE_CLIENT_ACCEPT = `${CLIENT_ACCEPT}; ${LIVE_RIDES_PARAM}`;
