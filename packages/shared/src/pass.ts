// QuikFly Pass: bought from the wallet, it takes the peak-hour surge off every bike, auto and
// cab ride for `passDays` days (like Rapido's Power Pass). The pass doesn't change the base
// fare, only the surge. Buying while a pass is running adds the days after its end. A ride
// booked ahead is waived when the pass covers its pickup time. The API applies these rules;
// the apps call them to show the same offer.
import { effectiveSurge, parseSurgeHours, type Settings } from "./settings";
import { FEATURE_OFF } from "./switches";

export const PASS_NAME = "QuikFly Pass";

/** Is there any surge for a pass to take off? */
export const passUseful = (settings: Settings) => effectiveSurge(settings) > 1 && parseSurgeHours(settings.surgeHours).length > 0;

/** Why a pass can't be bought right now, or null when it can. */
export function passSaleError(settings: Settings): string | null {
  if (!settings.featureRidePass) return FEATURE_OFF.ridePass;
  if (!passUseful(settings)) return `There's no peak-hour surge right now, so ${PASS_NAME} isn't on sale.`;
  return null;
}

/** When a pass bought now ends: `passDays` after now, or after the end of the pass still running. */
export function passEnd(settings: Settings, runningUntil: string | null, now = Date.now()) {
  const from = Math.max(now, runningUntil ? Date.parse(runningUntil) : 0);
  return new Date(from + settings.passDays * 86_400_000).toISOString();
}

/** Is a pass that ends at `until` running at `at` (ms)? */
export const passCovers = (until: string | null | undefined, at = Date.now()) => !!until && Date.parse(until) > at;

