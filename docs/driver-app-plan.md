# QuikFly Captain: the driver app

Status: **approved 2026-11-27; all steps built, merged (#173–#180) and the API, website and admin deployed 2026-11-27 (migrations `0033`–`0036` on production). `featureLiveDrivers` is off in production: nothing changes for riders until the owner turns it on. Next: a Captain build on a phone, the privacy-notice decision, Captain in Firebase.** Tick the steps below as they ship and keep the status line current.

## Context

Rides are the one part of QuikFly that is still fully simulated. Today the API picks a driver the instant a ride is booked (a free partner vehicle, else a made-up roster captain), the customer's own phone runs two timers (9 s arriving, 12 s trip) and then calls `POST /bookings/:id/complete` itself. No server code moves a ride forward, the ride PIN is never checked, and a driver record (`vendor_drivers`) is only a row a partner filled in: no account, no sign-in, no duty state, no location.

A real launch can't happen without drivers who accept and run trips. This is the longest build left and needs no paid service, so it is the right thing to build in the dev stage.

**Owner's decisions (2026-11-27):** fleet drivers and self sign-up; city rides only in version 1 (bike taxi, auto, cab; parcels and outstation later); nearest driver first, one at a time; the simulation stays behind a switch so the demo keeps working; be clearly different from competitors.

**Outcome:** a third app, **QuikFly Captain** (`com.quikfly.captain`, flavor `captain`), in the same Flutter project. A driver signs in, goes online, gets ride offers, verifies the rider's PIN, runs the trip and sees what was earned. The customer app, website and shared-trip page show the real driver and real progress. Everything is behind one switch that is off by default.

## What makes it different

Researched: Rapido Captain, Uber Driver, Namma Yatri, and the Motor Vehicle Aggregator Guidelines 2025. These go into version 1, not later:

| QuikFly Captain | Competitors today |
|---|---|
| **Every offer shows the full trip and the money split**: pickup, drop, distance, what the customer pays, what the vehicle earns, QuikFly's share (or "no commission" on the daily fee). For every driver, always. | Uber shows the destination only above an acceptance threshold; the fare breakdown comes after the trip. |
| **Offers are read aloud in the driver's language** (Tamil, Hindi, English): "Bike ride, T. Nagar to Adyar, 6 km, ₹84". A rider on a bike shouldn't have to read a phone. | Text and a sound. |
| **Declining is free.** No acceptance score, no penalty, no hidden ranking. Among drivers about equally near, the one waiting longest is asked first. | Acceptance rates gate features and incentives. |
| **Owners see their drivers live** in QuikFly Partner: who is online, who is on a trip. | Fleet owners use separate tools, or none. |
| **Women captains get Bike Pink rides.** A woman rider's women-only ride goes only to verified women captains. | Uber has a preference toggle; not tied to a dedicated ride type. |
| **Cash is unmistakable**: a full-screen "Collect ₹X" at the end, and a running "cash you hold" total for the day. | A line in a trip summary. |
| **One captain account for every QuikFly job.** Version 1 is rides; parcels, outstation and chauffeur trips arrive in the same app later. | One app per business, or rides only. |

Later, same theme (noted, not built now): paid waiting after arrival, a "heading home" filter, trip ratings both ways.

## Design

### Identity: a driver is a `vendor_drivers` row linked to a login
- `vendor_drivers.user_id` (new, nullable). On first sign-in to Captain, the account's phone is matched to an **active** driver record with the same phone and linked (`services/drivers.ts: linkDriver`). One phone, one active driver record: enforced in `addDriver` going forward (today only `dl_number` is unique).
- `requireDriver` middleware (new, `middleware/driver.ts`): `requireUser`, then the linked driver, its vehicle and vendor; sets `c.var.driver`. Not eligible (blocked, licence expired, no vehicle, vendor not active) is a clear reason in `GET /driver`, never a bare 403.
- Same OTP login, `sessions` and `users` as the other apps. A person can be a customer and a captain on one number.
- **Self sign-up (step 6)** reuses the existing partner application (`/vendor/*`, `requireUser` only): an owner-driver is a vendor whose first driver is `self`. Captain shows the same six sections plus the licence, reusing `lib/partner` screens. Staff review it in the existing admin queue. New vehicle type `bike` (`VENDOR_VEHICLE_TYPES`, `vehicleTypeForRide`), since bike taxi is the first service and partners can't register a bike today.

### Location: device GPS, the existing demo map, no paid maps
- Places are points on a 0–100 demo map of Chennai, not lat/lng. `packages/shared/src/geo.ts` (new) converts both ways with one bounding box (`CITY_BOUNDS`), so a real GPS fix lands on the same map the customer already sees and distances use the existing `RIDE_SIM.kmPerMapUnit`.
- **Demo location** (setting `driverDemoLocation`, on by default): the captain picks a starting place and the app moves itself along the route during a trip (reusing `vehiclePosition` from `lib/widgets/city_map.dart`), labelled "demo location". This is how it is tested and demoed away from Chennai.
- **Real GPS** (step 7): `geolocator` with an Android foreground service, permissions only in the captain flavor's manifest, a disclosure screen before the system prompt.
- Only the **latest** position is stored (`driver_state`), plus where a trip started and ended. No trail.

### Dispatch: nearest first, advanced on read (no always-on server)
The Worker has no background loop and the cron is one minute, too slow for a 15-second offer. So dispatch moves forward whenever someone asks:
- The customer polls `GET /rides/:id` every 3 s while searching; an online captain calls `POST /driver/ping` every 15 s idle, every 5 s with an offer or a trip (intervals in `DRIVER_RULES`, shared).
- Each call runs `advanceDispatch(rideId)` (`services/dispatch.ts`): if the current offer expired or was declined, offer the next captain. It is one conditional `UPDATE … WHERE offer_seq = ?` (the same guard idea as parcels' `move_id`), so two callers can't both advance.
- Eligible captains: online, seen within `driverStaleSeconds`, no current ride, right vehicle type, within `driverSearchRadiusKm`, not already asked for this ride; women-only rides need `gender = 'female'`. Order: distance in bands, then longest idle.
- A new offer also sends an FCM push **immediately** (`ctx.waitUntil`, existing `services/push.ts`), so a backgrounded app wakes; the poll is the guarantee.
- After `driverOfferMaxDrivers` refusals or `driverSearchSeconds`: with `rideSimulateDrivers` on, the ride falls back to today's simulated captain (labelled); off, the customer is told no captain is free and nothing is charged.
- The cron is only a backstop: marks captains offline when stale, closes searches nobody is polling.

### Trip lifecycle: the server owns the phases
`rides` gains `dispatch` (`sim` | `live`), `phase` (`searching` → `arriving` → `arrived` → `ontrip` → `done`, or `unmatched`), `phase_at`, `offer_seq`, `otp_tries`. `rides.status` and the `data` JSON keep their meaning, so released apps are unaffected. One transition table in shared `driver.ts` (`RIDE_TRANSITIONS`), one writer (`advanceRide`), like parcels.

| Step | Endpoint | Notes |
|---|---|---|
| Accept / decline | `POST /driver/offers/:rideId/accept` · `/decline` | Accept writes the driver card into `data`, sets `vendor_*` ids |
| Arrived | `POST /driver/rides/:id/arrived` | |
| Start | `POST /driver/rides/:id/start {otp}` | **Checks the ride PIN** (5 tries, 15-minute lock, as `checkCollectOtp` does) |
| Complete | `POST /driver/rides/:id/complete` | Calls the existing `completeBookingRow` → `settlementStatements` (vendor trip, ledger, cash row, credits) in one batch |
| Driver cancels | `POST /driver/rides/:id/cancel {reason}` | Before start only; the ride goes back to searching, the customer pays nothing |

Money does not change shape: the customer still books the ride, is matched, then `POST /bookings` debits the wallet as today. If payment fails the client cancels the ride (as it does now) and the captain is told. The customer's `POST /bookings/:id/complete` is refused for a live ride.

### Old apps stay safe
Released apps run the timers themselves and would "complete" a live ride after 21 seconds. Live dispatch therefore reaches only clients that declare it, the same way parcels did: `Accept: application/json; services=parcel; rides=live` (`packages/shared/src/clients.ts`, copied in `models.dart`). Anything else gets a simulated ride exactly as today.

### Settings (all in `packages/shared/src/settings.ts`, editable in admin)
`featureLiveDrivers` (false: the master switch), `rideSimulateDrivers` (true), `driverDemoLocation` (true), `driverOfferSeconds` 15, `driverOfferMaxDrivers` 5, `driverSearchSeconds` 90, `driverSearchRadiusKm` 5, `driverStaleSeconds` 60.

### Notifications and privacy
- `PUSH_APPS` gains `captain`; kinds start with `driver.` (`driver.offer`, `driver.cancelled`, `driver.account`). `pushNew`'s two-way SQL split and Flutter's `NotificationScope.shows` become a per-app prefix map (both rules change together, per AGENTS.md).
- `exportData()` / `eraseAccounts()` cover the driver's own link, state and offers. This also closes an existing gap: erasing a partner today leaves `vendor_drivers.name`, `phone` and `dl_number` behind.
- **Decided 2026-11-28 (owner): a separate captains' notice, shown only in QuikFly Captain** (`CAPTAIN_NOTICE`, `captainNotice()` in `packages/shared/src/privacy.ts`; `GET /privacy/captain`, `POST /driver/notice`). The main notice keeps its version, so customers aren't asked again. A captain can't go online until they agree to the current version (`captainBlocker`); Captain's home shows "Before your first ride" → the notice → I agree. The website shows it on /privacy.

## Steps (one PR each; the switch stays off until step 4 is checked)

**0. Plan in the repo.** `docs/driver-app-plan.md` (this plan, with the research table and sources), linked from AGENTS.md and the roadmap.

**1. Foundation (API and shared; nothing visible).**
Migration `0033_drivers.sql`: `vendor_drivers.user_id`, `gender`; `driver_state` (driver_id PK, online, x, y, lat, lng, demo, seen_at, ride_id); `ride_offers` (ride_id, driver_id, seq, offered_at, expires_at, outcome); the new `rides` columns. Shared `driver.ts` (types, `DRIVER_RULES`, `RIDE_TRANSITIONS`), `geo.ts`, settings, vehicle type `bike`. `requireDriver`, `linkDriver`, `GET /driver`, `POST /driver/duty`, `POST /driver/ping`. Push app and kinds. Privacy export and erase. Staff set a driver's gender in the existing review dialog (`VendorFleet.tsx`).

Done 2026-11-27 (branch `feat/captain-1-foundation`). What changed from the plan:
- **`bike` vehicles moved to step 6.** Adding the type now would show "Bike" on the website's partner form before anything can use it. Until then Captain is for autos and cars (`CAPTAIN_VEHICLE_TYPES`), and a tempo or bus driver is told so.
- **No captain kinds in the inbox.** Ride offers will be pushed straight to the phone (step 2), not stored as notifications, so released QuikFly apps (which list every non-partner kind) never show a driver's offers. `pushAppForKind` and the three-way split in `pushNew` are ready for kinds starting with `driver.`.
- **One number, one driver** is enforced when a driver is added (a rejected record doesn't count). Existing duplicates, if any, link to the approved one, then the newest.
- **A silent captain is set offline when their duty is next read** (`dutyOf`), as well as by the cron backstop in step 2.
- Staff can set a driver's gender at approval and any time after (`POST /admin/vendors/:id/drivers/:did/gender`, audited).
- The migration also creates `ride_offers` and the new `rides` columns that step 2 uses, so the owner runs one migration, not two.
- **Deploy order:** run migration `0033` before deploying this API (driver review, export and erasure read the new columns).

**2. Dispatch and the trip (API).**
`services/dispatch.ts`, `services/driver-rides.ts`, `routes/driver.ts`; `bookRide` branches on switch + client declaration; `getRide` returns `live { phase, captain position, etaMin }`; `readShare` reports the real phase; customer complete refused for live rides; fallback; immediate offer push; cron backstop (within the 50-queries budget).

Done 2026-11-27 (branch `feat/captain-2-dispatch`). What changed from the plan:
- **Two more settings for going live gradually:** `liveRideAuto`, `liveRideCab` (bikes join with step 6), plus `driverArrivedRadiusKm` and `driverCancelPenaltyPercent` from the admin settings plan. Migration `0035`: one offer per search step (unique `(ride_id, seq)`) and `ride_offers.reason`.
- **The rider pays after a captain accepts** (`POST /bookings` is refused while searching), so an unmatched search never needs a refund; a captain who gives back a paid ride with nobody else free triggers a full refund (`unmatched`).
- **Scheduled rides stay simulated** in this step; dispatch near pickup comes later. The fallback with `rideSimulateDrivers` on is a roster captain, never a partner cab.
- **Offers are notifications pushed only to Captain phones** (`driver.offer`, `driver.cancelled`; never browsers, never listed in an inbox) and sent right after the response, not at the cron minute. The rider gets `ride.captain` when a captain gives the ride back or nobody is found.
- **A driver online in Captain gets no simulated partner rides** (`partnerForRide` skips them).
- Not yet: "How it works" rules in `GET /driver` (with step 3, where they are shown), the admin dispatch log (step 5).
- Checks: typecheck, local smoke 343 + 805 passed (51 new live-ride checks, the plan's verification list), cron run, API dry-run build.
- **Deploy order:** migration `0035` before this API (after `0033` and `0034`).

**3. QuikFly Captain, version 1 (Flutter).**
Flavor `captain` (the 15-place checklist from the exploration: `build.gradle.kts`, `src/captain`, `tool/ios_flavors.rb`, `lib/main_captain.dart`, `lib/captain/`, `NotificationScope.captain`, `scripts/app-icons.mjs` with a third icon, `tool/ios_icons.swift`). Screens: sign-in and "you're not set up yet" reasons; home with the online switch and today's trips, earnings and cash held; the offer sheet (countdown, full trip, money split, read aloud by the phone's text-to-speech); trip screens (go to pickup with a Maps link, arrived, enter PIN, on trip, collect cash / done); trips list; account. Demo location. `api.dart` + `captain_models.dart`.

Done 2026-11-27 (branch `feat/captain-3-app`, on top of step 2). What changed from the plan:
- **Two small API additions:** `GET /driver` returns `rules` (the "How it works" values) and `GET /driver/trips` lists the captain's last 50 trips; the offer's money split also carries `gstPaise` and the app shows exact paise, so the split adds up.
- **The voice language is the captain's own choice** (English, Tamil, Hindi in Account), not the app's language, which stays English until `featureLanguages`. The Tamil and Hindi sentences need a native speaker's check.
- **Demo locations only** in version 1 (GPS is step 7): the captain picks where to start, and on a trip the app moves itself about 1 km per heartbeat. With `driverDemoLocation` off the app says GPS comes in the next version.
- **Push:** the Captain flavor builds without its Firebase file (its Google services step is skipped); the owner adds `com.quikfly.captain` to the Firebase project to switch its push on. A foreground offer push asks for the state at once and shows no banner.
- **Icon:** the Q on deep green with a green navigation arrow, from `scripts/app-icons.mjs` (Android and iPhone).
- Checks: `flutter analyze` clean; `flutter test` 126 + the new Captain tests pass on the local API (screens at 390 px with large text, 740 px and 1366 px, light and dark; routes; scope; contract `GET /driver`); a debug `com.quikfly.captain` APK builds; local smoke 343 + 807. **Not checked yet:** on a phone (needs a build the owner installs: offer sound and voice, the Maps link, the dialler).

**4. Customers see the real trip.**
Website `RidePanel.tsx`, `TrackScreen.tsx`, `contract.ts` / `http.ts` / `mock.ts`; app `ride_screen.dart`: declare `rides=live`, poll instead of timers when the ride is live, "Finding your captain", re-search when a captain cancels, the no-captain message. Simulated rides keep the timers.

Done 2026-11-27 (branch `feat/captain-4-riders`, on top of step 3). What changed from the plan:
- **The website sends `LIVE_CLIENT_ACCEPT` always** (`rides=live`); the app sends it from its next release. The mock API stays simulated, so the demo build and `build:demo` are unchanged.
- **Pay on accept** on both: the booking is created when the first poll after acceptance sees `arriving`; if paying fails, the ride is cancelled so the captain is freed.
- **A rider never pays a fee while a new captain is being found** (their captain gave the ride back): the API waives it, so the app and website show "Cancel (no charge)".
- **The shared-trip page** shows a live ride's phase and the captain's map position, read every 5 s (`SharedRide.captain`).
- **Checked end to end in a browser at 390 px against the local API**, with a test captain driven by API calls: searching, accept → paid → "Captain on the way" with the real name and plate, arrived with the PIN, started with that PIN → "min to drop" with Cancel gone, the shared-trip page with the captain between pickup and drop, completed → "You have arrived" (light and dark), booking completed and credits earned. The browser test found and fixed a poll that stopped while a search stayed unchanged. **Not checked in a browser:** the no-captain screen (the browser session was closed; covered by the API smoke and the same poll), the app screens (no device; `flutter test` covers the models and the Accept).
- Checks: typecheck; `flutter analyze` clean; `flutter test` 133 passed on the local API; local smoke 343 + 807.

**5. Staff and owners can see it.**
Admin: a Captains page (online now, on a trip, last seen), a ride's dispatch log (who was asked, what they did) in the booking view, the new settings. Partner app: each driver's live status. Permission `drivers.view` in `PERMISSIONS`.

Done 2026-11-27 (branch `feat/captain-5-staff`, on top of step 4). What changed from the plan:
- **Two permissions:** `drivers.view` (Captains page, dispatch log) and `drivers.manage` (Set offline), both owner and operations. Blocking and gender stay on the partner's fleet review (`vendors.review`), linked from each captain.
- **Captain status has four values** (`captainLiveStatus`, shared): on a ride, online, not heard from (marked online but silent past `driverStaleSeconds`), offline. The admin page, the admin fleet card and QuikFly Partner use the same function and labels.
- **The dispatch log records the distance** at each offer (migration `0036`, `ride_offers.km`).
- **The readiness card** sits on the Captains page (not above the Settings switch), and Settings → Captains points to it.
- **Not built (later):** "Send a test offer" (needs an offer without a ride), and the `driverCashLimit` / `driverMaxOnlineHours` settings (they need a cash-settlement idea and an online-hours clock first).
- **Partner app:** each driver shows "Captain: Online / On a ride / Not heard from / Offline" (reaches phones with the next Partner release).
- Checks: typecheck; `flutter analyze`; local smoke 343 + 817 (10 new: list, readiness, fleet status, dispatch log with distance and reason, set offline refused on a ride and when already offline, audited, the content role refused); the Captains page and a booking's "Captains asked" at 390 px in light and dark (no sideways scroll).

**6. Self sign-up.** Owner-driver registration inside Captain on the existing `/vendor` application; `bike` vehicles end to end.

Done 2026-11-27 (branch `feat/captain-6-signup`, on top of step 5). What changed from the plan:
- **Behind `captainSelfSignup` (off by default)**, so staff open sign-ups when they're ready to review them. `GET /driver` tells a number with no driver record whether to offer it (`selfSignup`).
- **Captain reuses QuikFly Partner's screens** instead of copies: home shows the Partner checklist (`PartnerHomeScreen`) while the application is in progress, and the router mounts the sections, onboarding, vehicle and driver screens. Once live, a two-step screen: add yourself as the driver (the licence; Captain links you by your number at once), then QuikFly checks it; "Choose your vehicle" assigns the vehicle.
- **Bikes:** vehicle type `bike` (petrol or electric only, `fuelsFor`; the API, the mock and both forms enforce it); bike-taxi options other than Auto go to bikes (`vehicleTypeForRide`), also for simulated partner rides; new switch `liveRideBike`. Group-travel assignment stays cars, tempo travellers and buses.
- **Partner updates reach Captain too** (fixed after the first review): `vendor.*` notifications are listed and pushed in Captain as well as in QuikFly Partner, because in Captain they can only belong to an owner-driver who registered there. Partner apps up to 0.1.20 still show a bike without a label: the label is in the app, so only the next Partner release fixes it.
- Checks: typecheck; `flutter analyze`; `flutter test` 135 (sign-up states and the extended routes test); local smoke 343 + 827 (10 new: bike vehicle and fuel rule, bike rides live and simulated by the switch, self sign-up offered only when on).

**7. Real GPS in the background.** `geolocator`, the Android foreground service and disclosure, iPhone location strings, `driverDemoLocation` off path.

Done 2026-11-27 (branch `feat/captain-7-gps`, on top of step 6). What changed from the plan:
- **`geolocator`** (on Swift Package Manager, so no CocoaPods): going online asks for one fix and starts the position stream as an Android foreground service (`ForegroundNotificationConfig`: "You're online in QuikFly Captain") or with iOS background location; the heartbeat sends the latest fix and keeps running with the app closed. Going offline, or staff setting the captain offline, stops it. After a restart while online, the stream starts again if location is still allowed (never a prompt at launch).
- **The app explains first** (once, `gpsDisclosure`): why, that it continues with the app closed, that only the latest position is kept; then Android's or iOS's prompt. Blocked location or location turned off says so, with "Open settings".
- **Demo locations stay** as an alternative ("Use a demo location instead") while `driverDemoLocation` is on; with it off, only GPS.
- **Only Captain asks for location:** its permissions are in its own manifest, the customer and Partner manifests remove the plugin's service (checked in the built APKs), and Captain has its own iOS Info.plist (`Runner/Info-captain.plist`, set by `tool/ios_flavors.rb`) with the location reasons and background location.
- **Also fixed here (gap from step 6):** an owner-driver's partner updates (`vendor.*`) are listed and pushed in Captain too.
- **Not checked on a phone** (no device here): the prompt, the notification, staying online with the screen off, battery use. That is the first thing to try with a test build.
- Checks: typecheck; `flutter analyze`; `flutter test` 138; Captain, customer and Partner debug APKs built and their manifests compared; Captain built for the iPhone Simulator.

**After sign-off (paid or policy-bound):** real maps and turn-by-turn, WebSockets via Durable Objects instead of polling, real SMS, Play Store listing for Captain, ratings, parcels and outstation jobs.

## Files that matter

- Reuse as is: `services/partner-trips.ts` (`settlementStatements`, `partnerDriverCard`), `services/bookings.ts` (`completeBookingRow`, `cancelBookingRow`), `services/push.ts`, `services/fleet.ts`, `services/admin/fleet.ts` (driver review), `lib/screens/auth/login_screen.dart`, `lib/screens/parcel/polling.dart` (`PollsWhileVisible`), `lib/widgets/city_map.dart`, `lib/widgets/ui.dart`, `lib/partner/*` registration screens.
- Change: `services/rides.ts` (`bookRide`, `getRide`, `cancelRide`), `services/share.ts`, `scheduled.ts` (`pushNew`, backstop), `packages/shared/src/{types,settings,clients,vendor,privacy,admin}.ts`, `services/privacy.ts`, `apps/web/src/components/RidePanel.tsx`, `apps/mobile/lib/screens/ride/ride_screen.dart`, `lib/state/catalog.dart`, `lib/core/notifications.dart`.
- New: `packages/shared/src/{driver,geo}.ts`, `apps/api/src/{middleware/driver.ts,routes/driver.ts,services/drivers.ts,services/dispatch.ts,services/driver-rides.ts}`, migration `0033`, `apps/mobile/lib/main_captain.dart`, `lib/captain/`, `lib/api/captain_models.dart`.
- Every step follows rule 1 (one contract, four implementations): shared types → API → web contract/http/mock → smoke → `apps/api/README.md` → `models.dart` / `api.dart` + contract test → docs.

## Admin settings and screens (planned 2026-11-27)

The aim: staff can run live rides without a developer, and a captain is never surprised by a rule.

**Rules for every setting here**
- A plain label, a unit, limits that stop a harmful value, and one sentence of help saying what a captain or rider will notice.
- Settings that do nothing while **Live captains** is off are dimmed, with "Turn on Live captains to use this".
- A global rule is a setting. Anything about one captain (blocked, gender, vehicle) lives on that captain's card, not in Settings.
- Security limits (PIN tries and lock time) stay constants in code, not settings.
- Each value is read with a safe fallback, because a new setting can be missing for a minute after a deploy.
- Every change is audited, as all settings are.

**Settings, under "Captains (live rides)" in the order staff think about them**

| Part | Setting | Default | Step | Why it helps |
|---|---|---|---|---|
| Going live | `featureLiveDrivers` Live captains | off | 1 (built) | The master switch. Step 5 shows "N captains online now" beside it, so nobody turns it on with no one to drive. |
| Going live | `liveRideBike`, `liveRideAuto`, `liveRideCab` | all on | 2 | Start with one ride type (for example autos) and add the others when there are enough captains. A type that is off stays simulated. |
| Going live | `rideSimulateDrivers` | on | 1 (built) | When no captain takes a ride: on falls back to a simulated one (demo), off tells the rider honestly. Turn off for real operations. |
| Going live | `driverDemoLocation` | on | 1 (built) | Captains may use a pretend position. Admin shows a "test mode" banner while it is on; turn off before real riders. |
| Matching | `driverSearchRadiusKm` | 5 | 1 (built) | How far a captain can be from the pickup. |
| Matching | `driverOfferSeconds` | 15 | 1 (built) | Time to answer an offer. The app shows the same countdown. |
| Matching | `driverOfferMaxDrivers`, `driverSearchSeconds` | 5, 90 | 1 (built) | When to stop looking. |
| Matching | `driverStaleSeconds` | 60 | 1 (built) | A silent app goes offline after this. |
| Trip | `driverArrivedRadiusKm` | 0.3 (0 = no check) | 2 | "Arrived" only works near the pickup, so a waiting clock can't be started from far away (a known complaint about other apps). |
| Trip | `driverCancelPenaltyPercent` | 0 | 2 | For cancelling after accepting without a listed valid reason. The guidelines allow up to 10%, capped at ₹100; 0 during the pilot. Declining an offer is always free. |
| Trip | `driverFreeWaitMinutes`, `driverWaitPerMinute` | 3, ₹0 | later | Paid waiting after arrival. ₹0 keeps it off. Needs a fare change for riders, so not in version 1. |
| Money | `vendorFlatDailyFee`, `vendorDailyFee`, `vendorCommissionPercent` | off, ₹50, 20% | built (#174) | Commission per ride or a flat daily fee. Shown here as well as under Partners, since it is the first thing a captain asks. |
| Money | `driverCashLimit` | ₹2,000 (0 = no limit) | 5 | A captain holding more cash than this gets no new cash rides until the owner settles. Protects QuikFly; the app shows how close they are. |
| Safety | `driverMaxOnlineHours` | 12 | 5 | Longest time online in a day; the app warns an hour before and then sets the captain offline. Check the figure against the guidelines before launch. |
| Sign-up | `captainSelfSignup` | off | 6 | Opens owner-driver registration in the app. Off: only drivers a fleet owner added can sign in. |

Reused, not duplicated: the support number, the document expiry warning (`vendorExpiryWarnDays`), the joining fee and the rider's cancellation reasons.

**Admin screens that make the settings usable**

| Screen | Step | What staff get |
|---|---|---|
| Captains page | 5 | Who is online, on a trip or silent, with last seen and vehicle. One captain's card shows **the same "why can't I go online" reasons the app shows**, so support and the captain read the same words. Actions: set offline, block with a reason, set gender. |
| Ride dispatch log | 5 | On a booking: who was offered the ride, in what order, how far away, and what each did. Answers "why did nobody come?". |
| Send a test offer | 5 | Sends a clearly labelled practice offer to one captain, to check their phone rings and speaks. Creates no ride and no money. |
| Readiness card | 5 | Above the master switch: captains approved, captains online, demo location on or off, simulated fallback on or off. Red where a real launch would go wrong. |
| Settings page | each step | The Captains group in the order above, dependent fields dimmed, and a test-mode banner. |

**In the Captain app, from the same settings**

A "How it works" page built from the live values, never typed by hand: time to answer an offer, that declining is free, what cancelling after accepting costs and the valid reasons, the commission or the daily fee, the cash limit and the online-hours limit. `GET /driver` returns these rules with the profile, so the app needs no release when staff change one.

## Limits to know

- **Polling costs requests.** One captain online for 8 hours is about 2,000–5,000 requests a day; the free plan allows 100,000 a day in total. Fine for a pilot of about ten captains; beyond that the $5 plan (after sign-off) or WebSockets.
- **An offer can take up to 15 s to appear** if the push doesn't arrive and the app is idle-polling. Acceptable for a pilot; WebSockets remove it.
- **With GPS a captain stays online with the app closed** (a notification shows while it does); with a demo location the app must stay open. Phone makers that kill background apps (some Android skins) can still stop it: the captain goes silent and is set offline after `driverStaleSeconds`.
- **Scheduled rides** start dispatch when the rider taps Start (as today), not automatically.

## Verification

- **Each API step:** `npm run typecheck`; new sections in `apps/api/scripts/smoke.mjs` and `smoke-admin.mjs` on the local API: link a driver, go online, book a live ride with `rides=live`, first captain declines, second accepts, wrong PIN refused and locked, start, complete, vendor trip and ledger rows written once, customer complete refused, driver cancel re-searches, nobody online falls back (switch on) or reports no captain (switch off), an old client (no declaration) still gets a simulated ride. Query counts stay under 50 per request.
- **Captain app:** `flutter analyze`, `flutter test` with a new `captain_routes_test.dart`, extended notification scope and target tests, and contract tests for the driver endpoints against the local API.
- **End to end, locally:** API on :8787 with `featureLiveDrivers` on; Captain on the phone (or two emulators) with demo location; the customer on the website at 390 px in light and dark. Book, accept, PIN, complete; watch the website follow the real phases and the shared-trip page agree; check the Partner app's earnings and the admin dispatch log.
- **Production:** nothing changes until the owner turns `featureLiveDrivers` on; the smoke run confirms simulated rides behave exactly as before.

## Open questions for the owner

1. **The privacy notice. Decided 2026-11-28: only inside Captain**, as its own notice with its own version (see Notifications and privacy).
2. **Name and package id.** "QuikFly Captain", `com.quikfly.captain`. The id can't change once the app is on the Play Store; it can until then.
3. **How QuikFly earns (decided 2026-11-27): a setting.** Commission per ride (`vendorCommissionPercent`, the default) or a flat daily fee per driver (`vendorFlatDailyFee` + `vendorDailyFee`): no commission on rides, and the driver's first completed ride of the day charges the owner the fee once; no rides, no fee. Built in `feat/partner-daily-fee` (migration `0034`). Captain's offer sheet and earnings must read the model from settings and never show a share that isn't taken. Before turning the fee on for real partners: reword the agreement term that says "commission" and bump its version.
4. **Who is paid.** A trip's earning goes to the vehicle's owner (the partner), as today; a fleet driver sees trips, fares and cash held, not a payout. Owner-drivers are their own partner. Say if drivers should have their own earnings ledger.

## Sources (research, 2026-11-27)

- Rapido: [subscription instead of commission for autos and cabs](https://yourstory.com/2024/02/rapido-saas-model-auto-drivers-lifetime-zero-commission), [Sacra on the model](https://sacra.com/chat/h/bd21c905-b859-4e73-9f3c-7ed8a7c8a063/)
- Uber India: [destination shown before accepting](https://www.deccanherald.com/business/no-more-cancellations-uber-drivers-can-now-see-destinations-before-accepting-rides-1110810.html), [driver features: selfie check, earnings breakdown](https://www.uber.com/en-IN/newsroom/uber-features-to-make-driving-safer-easier-and-fairer), [women rider preference, helmet selfie](https://www.businesstoday.in/technology/news/story/women-rider-preference-helmet-selfies-and-more-uber-rolls-out-new-features-in-india-453851-2024-11-15)
- Namma Yatri: [zero commission, daily fee](https://www.deccanherald.com/india/karnataka/bengaluru/namma-yatri-to-charge-auto-drivers-subscription-fees-from-september-1-2660636), [Rest of World on the model](https://restofworld.org/2025/uber-ola-copy-india-zero-commission-ride-hailing-app/)
- Motor Vehicle Aggregator Guidelines 2025: [MoRTH PDF](https://morth.gov.in/sites/default/files/circulars_document/MV-Aggregators-Guidelines-2025 - English and Hindi.pdf), [SCC Online summary](https://www.scconline.com/blog/post/2025/07/04/motor-vehicle-aggregators-guidelines-pricing-safety-morth-india-2025/) (police verification, 40-hour induction, 80% of the fare to a driver with their own vehicle, ₹5 lakh health and ₹10 lakh term cover)
- Background location on Android: [geolocator notes](https://www.github.com/Baseflow/flutter-geolocator/issues/1395), [ArcGIS on foreground services](https://developers.arcgis.com/flutter/device-location/background-location-tracking/)

These are press and vendor pages read once; check the current app or the official text before quoting any figure to a driver or a regulator.
