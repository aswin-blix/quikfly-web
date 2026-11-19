# QuikFly API

One REST API for the website (`apps/web`) and the mobile app (`apps/mobile`).

Cloudflare Workers · Hono · D1 (SQLite) · TypeScript. Types and catalog data come from `@quikfly/shared`.

## Run locally

From the repo root, after `npm install`:

```bash
npm run db:migrate:local   # create the local database (first time, and after new migrations)
npm run dev:api            # http://localhost:8787/v1
npm run smoke              # end-to-end check of every endpoint against the local API
```

`node scripts/smoke.mjs <baseUrl> <otp>` runs the same checks against any deployment.

## Layout

```
src/
  index.ts        app, CORS, error handler, route mounting under /v1
  config.ts       tunable values: fares, surge hours, session length, bus timetable
  env.ts          bindings declared in wrangler.jsonc
  routes/         HTTP layer: parse and validate input, call a service
  services/       business logic and SQL
  middleware/     bearer-token auth
  lib/            errors, validation helpers, ids and hashing
migrations/       D1 schema
scripts/smoke.mjs endpoint tests
```

## Endpoints

All paths are under `/v1`. Errors are `{ "message": "..." }` with a 4xx/5xx status. Routes marked 🔒 need `Authorization: Bearer <token>`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | liveness check |
| GET | `/config` | everything the apps load at start-up: `{ settings, places, rideOptions, cities, busOperators, popularRoutes, groupDestinations, offers, faqs }` (visible items only) |
| POST | `/auth/otp` | `{ phone }` → `{ sent }` (no SMS yet) |
| POST | `/auth/verify` | `{ phone, otp }` → `{ token, user, isNew, restored }`. Creates the user on first login (₹500 welcome credit, referral code); `isNew` stays true until a name is saved; signing in within 30 days of deleting restores the account (`restored`) |
| POST | `/auth/logout` | ends the session for the bearer token (always succeeds) |
| GET 🔒 | `/auth/me` | the signed-in user |
| PATCH 🔒 | `/me` | any of `{ name, email, gender, dob, gst: { gstin, name }, autoShareNightRides }`; `null` clears. Saving a name completes sign-up |
| POST 🔒 | `/me/phone/otp` | `{ phone }`: checks the new number is free (OTP is the demo code) |
| POST 🔒 | `/me/phone` | `{ phone, otp }` → user with the new number |
| POST 🔒 | `/me/logout-all` | ends every session for the account |
| POST 🔒 | `/me/delete` | `{ otp }`: schedules deletion (30-day grace), ends all sessions |
| POST 🔒 | `/me/referral` | `{ code }`: once per account; both users get ₹100 (`REFERRAL_BONUS`) |
| PUT 🔒 | `/me/licence` | `{ number, expiry }`: driving licence for self-drive; `pending` until an admin approves or rejects it (`licence.note` holds the reason), or `verified` at once when the `licenceAutoApprove` setting is on |
| GET / POST 🔒 | `/me/places` | saved places; POST `{ kind: home\|work\|other, placeId, label? }` (Home and Work replace) |
| DELETE 🔒 | `/me/places/:id` | remove a saved place |
| GET / POST 🔒 | `/me/travellers` | saved co-travellers; POST `{ name, age, gender }` |
| DELETE 🔒 | `/me/travellers/:id` | remove a traveller |
| GET / POST 🔒 | `/me/contacts` | emergency contacts (max 3); POST `{ name, phone, relation? }` |
| DELETE 🔒 | `/me/contacts/:id` | remove a contact |
| GET 🔒 | `/me/notifications` | `{ items, unread }`: the newest 50 (`NOTIFICATIONS_PAGE`); kinds `booking.confirmed`, `booking.cancelled`, `booking.cancelled_by_staff`, `booking.deposit_returned`, `licence.approved`, `licence.rejected`, `ride.reminder` |
| POST 🔒 | `/me/notifications/read` | `{ ids? }` (up to 100; none = all) → `{ unread }` |
| POST 🔒 | `/me/push-devices` | `{ token, platform: android\|ios\|web }`: registers a Firebase token for push (201) |
| DELETE 🔒 | `/me/push-devices/:token` | forget a device (on sign-out) |
| GET 🔒 | `/me/credits` | `{ balance, nextExpiry: { amount, expiresAt } \| null, items }`: QuikFly Credits, newest 100 entries (`earned`, `spent`, `returned`, `expired`). `GET /auth/me` carries `creditBalance` |
| POST 🔒 | `/me/pass` | buy a QuikFly Pass from the wallet (201 → `{ passUntil }`): `passPrice` for `passDays` days, added after the end of a pass still running; 409 when `featureRidePass` is off, there's no surge to waive, or the wallet is short. `GET /auth/me` carries `passUntil` (null when none is running) |
| GET 🔒 | `/me/wallet` | wallet history, newest first: `welcome`, `payment`, `refund`, `referral`, `opening` |
| GET | `/places?q=` | place autocomplete (visible catalog places) |
| POST | `/rides/quote` | `{ service, pickupId, dropId, scheduledFor?, stopIds? }` → fares for each visible ride option (through up to 2 `stopIds`, in order: distance is the sum of the legs, plus `rideStopMinutes` of waiting per stop), each with its `surge`. With a bearer token whose QuikFly Pass covers the pickup time, fares carry no surge (`surge` 1) and `passSaving` says how many ₹ that took off. `scheduledFor` (local `YYYY-MM-DDTHH:mm`, India) prices a ride booked ahead at its pickup hour; it must be `rideScheduleMinMinutes`–`rideScheduleMaxDays` ahead (400 otherwise) (1 = none; never above the `surgeCap` setting, MVAG 2025) |
| POST 🔒 | `/rides` | `{ optionId, pickupId, dropId, payment, scheduledFor?, stopIds? }` → ride with driver, OTP and `stops`; `scheduledFor` books ahead (fare locked at booking) |
| GET 🔒 | `/rides/:id` | the rider's own ride (with `scheduledFor`, null for ride-now) |
| POST 🔒 | `/rides/:id/start` | start a scheduled ride: allowed from 15 min (`RIDE_SCHEDULE.startWindowMinutes`) before pickup (409 earlier or if cancelled); the share link counts from then |
| POST 🔒 | `/rides/:id/cancel` | cancel a ride |
| POST 🔒 | `/rides/:id/share` | `{ token, expiresAt }`: a 24-hour link to follow the ride (same link if one is live) |
| GET | `/share/:token` | public, no sign-in: the shared ride (first name, driver, vehicle, route, start time, status) |
| GET | `/tickets/:token` | public, no sign-in: a bus m-ticket (the QR code opens it): `{ pnr, status: valid\|expired\|cancelled\|completed, title, subtitle, startsAt, seats, details, travellers }` with first names only. `expired` once departure is more than `TICKET_VALID_HOURS_AFTER_DEPARTURE` (12) hours ago and staff haven't closed the booking |
| GET | `/buses?from=&to=&date=` | bus search (same search, same results) |
| GET | `/buses/:id/seats?from=&to=&date=` | seat layout, availability and each seat's price (the bus is regenerated from its route and date) |
| GET | `/tours` | holiday packages |
| GET | `/tours/:slug` | one package (404 if hidden or missing) |
| GET | `/rentals/cars?city=` | self-drive / chauffeur cars |
| GET | `/rentals/cars/:id` | one car |
| GET | `/rentals/travel-vehicles` | group vehicles |
| POST | `/quotes` | prices a booking: `{ service: "bus", busId, from, to, date, seatIds, genders? }`, `{ service: "tours", tourId, adults, kids, start }`, `{ service: "rent", carId, mode, start, end, kmPlan, protection, doorstep }` or `{ service: "rentals", vehicleId, trip (local \| outstation \| oneway), destinationId?, days, start }` (`start` = YYYY-MM-DD) → `{ id, service, lines, total, expiresAt }`. Bus: `genders` lines up with `seatIds`; a women-only seat (its pair is held by a woman) needs `"female"` (400 otherwise), a held seat is 409. Valid 30 min, usable once. The quote also records when the trip starts, which the booking copies for its cancellation policy |
| POST 🔒 | `/offers/check` | `{ code, quoteId }` or `{ code, rideId }` → `{ code, discount, total }`; 400 says why a code can't be used (other service, expired, below minimum, per-customer limit, unknown) |
| GET 🔒 | `/bookings` | the signed-in user's bookings, newest first. Each has `startsAt` (from the quote; null for rides and older bookings), `deposit` (refundable self-drive deposit inside `amount`, else 0) and `refundAmount` (set when cancelled, or the deposit when staff complete a rental) |
| POST 🔒 | `/bookings` | `{ service, title, subtitle, payment, lines, quoteId \| rideId, couponCode?, tripOf?, useCredits? }` → booking. `useCredits: true` pays up to `creditsMaxRedeemPercent` of what's left after the coupon with QuikFly Credits (never the deposit; soonest-expiring credits first, in the same transaction); the booking carries `creditsUsed`, a `QuikFly Credits` line, and `amount` is the rest. `tripOf` (one of the customer's bookings, not cancelled: 404/409) puts both in the same trip: every booking in it carries `tripId` = the id of the booking the trip started from. Bus seats are held in `bus_seat_holds` in the same transaction (409 if someone took one meanwhile) and released on cancel. **The API sets the amount** from the quote (bus, tours, rent, rentals) or the ride (bike, car), minus the coupon; any `amount` sent is ignored. A quote or ride books once (409 after). `payment: "wallet"` is deducted in the same transaction and refused (400) if the balance is too low, which also gives the quote back |
| GET 🔒 | `/bookings/:id` | one booking (for invoices) |
| POST 🔒 | `/bookings/:id/cancel` | optional `{ reason }` (a `RIDE_CANCEL_REASONS` key, else 400). Rides: a rider cancelling after the free minutes without a valid (driver-side) reason pays the cancellation fee (% of the fare, capped; settings), kept from a wallet refund or recorded as owed; `cancelReason` and `cancelFee` are stored. Others: cancel; refunds the share the service's cancellation policy allows for the notice given (settings `cancelPolicyBus/Tours/Rent/Group`; rides and bookings without `startsAt` get it all; a `deposit` always comes back in full), to the wallet if paid from it, in the same transaction; `refundAmount` records it; 409 if already cancelled or completed |
| POST 🔒 | `/bookings/:id/complete` | mark a finished **ride** (called by the website and app when a simulated ride ends; the driver app will own this). Other services: 409, staff close them |
| POST 🔒 | `/bookings/:id/cancel-seats` | bus tickets: `{ seatIds }` cancels some seats (not all: cancel the booking for that). Their share of what was paid (by seat price) comes back at the bus policy's rate, with the same share of credits and coupon; the seats go back on sale; the Seats and Traveller names lines drop them → the booking |
| POST 🔒 | `/bookings/:id/reschedule` | bus tickets, once, until `busRescheduleHours` before departure: `{ quoteId, subtitle, lines }` moves the booking to a new bus quote on the same route with one seat per traveller (same genders). The fare difference plus `busRescheduleFee` is paid now (from the wallet for wallet bookings; 400 if short), or the difference comes back → `{ booking, charged, refunded }`. `lines` replaces Date/Departure/Arrival |

### Partner (`/vendor/*`, QuikFly Partner app; customer login)

| Method | Path | What it does |
|---|---|---|
| GET 🔒 | `/vendor` | `{ application }`, null before one is started |
| POST 🔒 | `/vendor` | start (or return) the application → 201 |
| PUT 🔒 | `/vendor/sections/:section` | save `vehicle` `{ city, type, fuel, regNumber, purchaseDate }`, `bank` `{ holder, account, ifsc }`, `rc` `{ ownerName, validTill }`, `insurance` `{ insurer, policyNumber, validTill }` or `audit` `{ date, slot }`; only while `draft`. Rules in `packages/shared/src/vendor.ts` (registration format, vehicle age from settings, one vehicle per registration number, audit up to 30 days ahead) |
| PUT 🔒 | `/vendor/documents/:kind` | raw JPEG/PNG/WebP body (≤ 2 MB, file signature checked) for `photo`, `rc` or `insurance`; stored in R2, replaces the old photo. 409 when R2 isn't bound |
| GET 🔒 | `/vendor/documents/:kind` | the partner's own document photo |
| POST 🔒 | `/vendor/reset` | clear a draft that was never sent (photos too) |
| POST 🔒 | `/vendor/submit` | send for review (every section filled) |
| POST 🔒 | `/vendor/onboarding/payment` | joining fee: **demo, nothing is collected** (no payment gateway) |
| POST 🔒 | `/vendor/onboarding/agreement` | `{ name, accept: true }` after the fee |
| POST 🔒 | `/vendor/onboarding/sticker` | ask for sticker & paint after the agreement; staff mark it done |
| GET 🔒 | `/vendor/fleet` | `{ vehicles, drivers }`. Every fleet call below returns this. Changes need a live partner (409 otherwise) |
| POST 🔒 | `/vendor/vehicles` | `{ type, fuel, regNumber, purchaseDate }` → a `draft` vehicle (201) |
| PUT 🔒 | `/vendor/vehicles/:id/:part` | `details`, `rc`, `insurance`, `audit` while `draft`; `rc`/`insurance` on a live vehicle is a **renewal** (`docsPending`, staff check it) |
| PUT / GET 🔒 | `/vendor/vehicles/:id/documents/:kind` | RC or insurance photo (`rc`, `insurance`) |
| POST 🔒 | `/vendor/vehicles/:id/submit` | send a complete draft for review |
| PATCH 🔒 | `/vendor/vehicles/:id` | `{ active }`: on or off duty (live, not blocked) |
| DELETE 🔒 | `/vendor/vehicles/:id` | remove a draft or rejected vehicle |
| POST 🔒 | `/vendor/drivers` | `{ name, phone, dlNumber, dlValidTill }` or `{ self: true, dlNumber, dlValidTill }` → `submitted` (201); one licence per driver across QuikFly |
| PUT 🔒 | `/vendor/drivers/:id/licence` | correct (back to review) or renew (live driver: `docsPending`) |
| PUT / GET 🔒 | `/vendor/drivers/:id/documents/dl` | licence photo |
| POST 🔒 | `/vendor/drivers/:id/assign` | `{ vehicleId \| null }`: an approved driver onto a live vehicle (one driver per vehicle; the previous one comes off) |
| DELETE 🔒 | `/vendor/drivers/:id` | remove a driver |
| GET 🔒 | `/vendor/trips?from=&to=` | trips on the partner's vehicles booked in the range (India dates, default last 7 days), newest first; each with collection, GST, fare, commission, TDS and earning in **paise** (`estimate` until completed) |
| GET 🔒 | `/vendor/summary?from=&to=` | completed trips in the range: totals (gross, cash, online, discount, earnings) and per vehicle / per driver |
| GET 🔒 | `/vendor/money` | balance (positive: QuikFly owes the partner), minimum payout, open request, monthly statements (all months), last 100 ledger entries, payouts |
| POST 🔒 | `/vendor/payouts` | request a payout of the whole balance (≥ `vendorMinPayout`, bank account on file, one open request) → 201 |
| POST 🔒 | `/vendor/payments` | settle a negative balance: **demo, nothing is collected** |

### Admin (`/admin/*`, staff only)

Staff sign in with email + password (accounts come from `scripts/create-admin.mjs`; there is no sign-up). 🛡 = admin bearer token; the permission in brackets is checked against the role (`PERMISSIONS` in `@quikfly/shared`), 403 when the role lacks it. Every change writes an `audit_log` row.

| Method | Path | Notes |
|---|---|---|
| POST | `/admin/auth/login` | `{ email, password }` → `{ token, admin }`. 401 for a wrong email or password (same message for both); 429 after 5 failures (locked 15 min) |
| POST 🛡 | `/admin/auth/logout` | ends the session |
| GET 🛡 | `/admin/auth/me` | the signed-in admin |
| GET 🛡 | `/admin/stats?days=` | dashboard numbers for the last 1–90 days (default 7, India time): totals, by service, by day, queues, latest bookings `[dashboard.view]` |
| GET 🛡 | `/admin/settings` | current business settings (defaults in `@quikfly/shared` `settings.ts`) `[dashboard.view]` |
| PATCH 🛡 | `/admin/settings` | change settings; only known keys with the right type `[settings.edit]` |
| GET 🛡 | `/admin/audit?page=&entity=&entityId=` | audit log, newest first, 25 per page `[audit.view]` |
| GET 🛡 | `/admin/catalog` | each catalog kind with item counts and whether this admin can edit it `[dashboard.view]` |
| GET 🛡 | `/admin/catalog/:kind` | all items of a kind, hidden ones included. Kinds and fields: `packages/shared/src/catalog-kinds.ts` `[the kind's permission]` |
| POST 🛡 | `/admin/catalog/:kind` | `{ data, active?, sort? }` → new item; `data` is validated against the kind's fields; unique fields (tour slug, offer code, city name...) give 409 |
| PUT 🛡 | `/admin/catalog/:kind/:id` | change `data`, `active` (show/hide) and/or `sort` |
| DELETE 🛡 | `/admin/catalog/:kind/:id` | remove an item (bookings keep their own copy of what was bought) |
| POST 🛡 | `/admin/catalog/reset` | replace the whole catalog with the seed (demo reset) `[settings.edit]` |
| GET 🛡 | `/admin/bookings?q=&status=&service=&from=&to=&page=` | all customers' bookings, newest first, 25 per page; `q` matches booking id, title, customer name or phone; dates are India time `[bookings.view]` |
| GET 🛡 | `/admin/bookings/:id` | `{ booking (with customer), wallet entries, coupon, refundIfCancelled ({ amount, percent } while active), history (staff actions) }` `[bookings.view]` |
| POST 🛡 | `/admin/bookings/:id/cancel` | `{ reason }` (5–300 chars) → cancels an active booking; the policy's share of a wallet payment is refunded to the customer's wallet in the same transaction; 409 if already finished `[bookings.manage]` |
| POST 🛡 | `/admin/bookings/:id/complete` | marks an active booking completed; a self-drive deposit paid from the wallet goes back to the customer in the same transaction (recorded as `refundAmount` and in the audit row either way) `[bookings.manage]` |
| GET 🛡 | `/admin/vendors?status=` | partner applications: `submitted` (default, oldest first), `draft`, `onboarding`, `active`, `rejected`, `blocked`; deleted accounts left out `[vendors.review]` |
| GET 🛡 | `/admin/vendors/:id` | `{ application, bankAccount, customerId }`: the full bank account number is staff-only `[vendors.review]` |
| GET 🛡 | `/admin/vendors/:id/documents/:kind` | a document photo (`photo`, `rc`, `insurance`), private, not cached `[vendors.review]` |
| POST 🛡 | `/admin/vendors/:id/sections/:section` | `{ decision: approve\|changes, note? }`: approve one section or send it back (note required; the partner sees it). The `audit` section records the audit as passed or failed `[vendors.review]` |
| POST 🛡 | `/admin/vendors/:id/review` | `{ decision: approve\|changes\|reject, note? }`: approve (all sections approved; onboarding opens, the joining fee is fixed), return for changes (at least one section sent back), or reject (note required) `[vendors.review]` |
| GET 🛡 | `/admin/vendors/payouts?status=` | payout requests (`requested` default, `paid`, `rejected`) with the partner's bank account `[vendors.review]` |
| POST 🛡 | `/admin/vendors/payouts/:pid` | `{ decision: paid\|rejected, reference?, note? }`: paid needs the bank reference (UTR) and writes the ledger row; rejected needs a reason `[vendors.review]` |
| GET 🛡 | `/admin/vendors/assignable-vehicles` | live partner cars, tempo travellers and buses with an approved driver `[vendors.review]` |
| POST 🛡 | `/admin/bookings/:id/vendor` | `{ vehicleId \| null }`: give an active group-travel booking to a partner vehicle (or take it back); the partner is notified `[bookings.manage]` |
| GET 🛡 | `/admin/vendors/fleet-queue` | live partners' vehicles and drivers waiting for staff (new vehicle, sticker, renewal, new driver), oldest first `[vendors.review]` |
| POST 🛡 | `/admin/vendors/:id/vehicles/:vid/review` | `{ decision: approve\|changes\|reject, note? }` for a submitted vehicle (approve = audit passed) `[vendors.review]` |
| POST 🛡 | `/admin/vendors/:id/vehicles/:vid/sticker` | approved → live `[vendors.review]` |
| POST 🛡 | `/admin/vendors/:id/vehicles/:vid/docs` | `{ decision: approve\|changes, note? }` a renewal; accepting lifts an expiry block when everything is valid `[vendors.review]` |
| POST 🛡 | `/admin/vendors/:id/vehicles/:vid/block` | `{ block, note? }` (reason required to block); unblocking needs valid documents `[vendors.review]` |
| GET 🛡 | `/admin/vendors/:id/vehicles/:vid/documents/:kind`, `/admin/vendors/:id/drivers/:did/documents/dl` | document photos `[vendors.review]` |
| POST 🛡 | `/admin/vendors/:id/drivers/:did/review` | `{ decision: approve\|reject, note?, policeVerified, trainingDone }`: approve needs both ticks and the licence photo `[vendors.review]` |
| POST 🛡 | `/admin/vendors/:id/drivers/:did/docs`, `/admin/vendors/:id/drivers/:did/block` | renewal check; block (taken off the vehicle) / unblock `[vendors.review]` |
| POST 🛡 | `/admin/vendors/:id/sticker` | sticker & paint done (after the agreement): the partner and vehicle go live `[vendors.review]` |
| GET 🛡 | `/admin/licences?status=` | licence queue: `pending` (default, oldest first), `rejected` or `verified` `[licences.review]` |
| POST 🛡 | `/admin/licences/:userId/approve` | pending → verified `[licences.review]` |
| POST 🛡 | `/admin/licences/:userId/reject` | `{ reason }` → rejected; the customer sees the reason (`licence.note`) and can submit again `[licences.review]` |

## Settings (`wrangler.jsonc` → `vars`)

| Name | Purpose |
|---|---|
| `DEMO_OTP` | Fixed login code while there is no SMS provider. Every number signs in with it. |
| `ALLOWED_ORIGINS` | Comma-separated website origins allowed by CORS, or `*`. |
| `DOCS` (R2 binding) | Bucket `quikfly-docs` for partner document photos (private; only the partner and `vendors.review` staff can open them). Create it once with `npx wrangler r2 bucket create quikfly-docs` before deploying. Missing binding = uploads answer 409. |
| `FCM_SERVICE_ACCOUNT` | **Secret**, optional: the Firebase service-account JSON. Unset = no push (the inbox still works). Set it with `npx wrangler secret put FCM_SERVICE_ACCOUNT`, never in `vars`. |

**Notifications.** Events write rows to `notifications` (`services/notifications.ts`, one per user/kind/ref, so retries don't duplicate). A cron trigger (`triggers.crons`, every minute, `src/scheduled.ts`) adds `ride.reminder` rows when a scheduled ride's start window opens and, when `FCM_SERVICE_ACCOUNT` is set, sends rows not yet pushed (newer than `PUSH_MAX_AGE_MINUTES`, `PUSH_BATCH` per run) to each of the user's devices through FCM HTTP v1 (`services/push.ts`); dead tokens are removed.

**Service and feature switches** (`packages/shared/src/switches.ts`, owner-only settings `service*`, `servicePausedMessage`, `feature*`). `switchError()` is checked by `POST /quotes`, ride quotes and `POST /rides`, `POST /bookings` and `POST /me/referral`; a refusal is **409 with the customer-facing message** (the owner's paused message for a paused service). Bookings made before a switch went off carry on; scheduled rides still start. SOS and trip sharing have no switch.

**Partner trips and money** (`services/partner-trips.ts`): `POST /rides` gives a cab ride (or the Auto option) to a free live partner vehicle of that type with an approved driver, least recently used first, else a simulated driver; the booking carries `vendor_id`/`vendor_vehicle_id`/`vendor_driver_id`. Staff assign group-travel bookings. On completion the trip settles in the same batch (`vendor_trips`, `vendor_ledger`): fare without GST (`gstRate`), less `vendorCommissionPercent` (max 20) and 0.1% TDS (`TDS_194O_PERCENT`); coupons and credits are QuikFly's cost; for cash the driver's collection is a negative ledger row. Amounts in paise. No payment gateway: payouts are paid by staff and recorded with the reference; partner payments are simulated.

**Partner document expiry** (`scheduled.ts` → `documentExpiry`): once per document and validity date, a `vendor.document` notification when an RC, insurance or driving licence is within `vendorExpiryWarnDays`; on the expiry date the vehicle or driver is blocked with reason `Expired: …` (the driver comes off their vehicle) until staff accept a renewal.

**QuikFly Credits** (`services/credits.ts`, rules in `packages/shared/src/credits.ts`) live in the `credits` table, apart from the wallet. A completed booking (rider ends a ride, or staff complete it) earns its service's % of what was paid, deposit and credits excluded, up to `creditsCap`, once per booking, with a `credits.earned` notification; credits expire after `creditsExpiryDays`. Cancelling returns credits in the same share as the refund, with a fresh expiry. Balances always ignore expired rows; the cron only writes the `expired` history rows. Locally, `wrangler dev --test-scheduled` and `GET /__scheduled?cron=*+*+*+*+*` run the cron once.

Business settings that staff change at runtime (fares, surge and its cap, rider cancellation fee, bus fares, GST rates, bonuses, rental fees and km plan, chauffeur night charge, self-drive documents, roadside-assistance toggle, deposit-return window, cancellation policies, company details, licence auto-approve, QuikFly Credits rates, cap, expiry and redeem share) live in the `settings` table, read through `services/settings.ts`; keys, defaults and allowed values are in `packages/shared/src/settings.ts`. The catalog lives in `catalog_items` (`services/catalog.ts`), filled from the seed in `packages/shared/src/catalog.ts` on first use. Both are cached for 30 seconds per Worker isolate, so an admin edit can take up to 30 s to show everywhere. Prices are computed by `packages/shared/src/pricing.ts` (`services/quotes.ts`, `services/rides.ts`).

Sessions are random bearer tokens; only their SHA-256 hash is stored, and they expire after `SESSION_TTL_DAYS` (`src/config.ts`). Admin sessions work the same way (`admin_sessions`, 12 hours). Admin passwords are PBKDF2-SHA256 hashes (`lib/password.ts`).

## Admin accounts

```bash
node scripts/create-admin.mjs --local  owner@example.com "Your Name" owner        # local D1, prints a generated password
node scripts/create-admin.mjs --remote owner@example.com "Your Name" owner        # production
node scripts/create-admin.mjs --remote ops@example.com "Ops Person" operations "ChosenPassword123"
```

Roles: `owner` (everything), `operations` (bookings, licences, catalog), `content` (catalog, offers). Running the script again for the same email resets the password and clears a lockout.

## Deploy (free tier)

Live at **https://quikfly-api.quikfly-api.workers.dev/v1**. The D1 database `quikfly-db` already exists and its id is in `wrangler.jsonc`.

```bash
npx wrangler login          # once per machine
npm run db:migrate:remote   # only when migrations/ has a new file
npm run deploy
node scripts/smoke.mjs https://quikfly-api.quikfly-api.workers.dev/v1   # leaves one test user (+91 9000000001)
node scripts/smoke-admin.mjs https://quikfly-api.quikfly-api.workers.dev/v1 <owner email> <password>   # admin endpoints
```

Locally, `node scripts/smoke-admin.mjs http://localhost:8787/v1` creates its own test admins and also checks roles and lockout.

`ALLOWED_ORIGINS` is `*` for now. To lock it down, set it to the website origin plus `http://localhost:3000`. The Flutter app is not affected, because CORS only applies to browsers.

## Not yet built

Real SMS OTP, payments, live driver tracking, real bus inventory (the timetable is generated). Push needs a Firebase project and the app's `firebase_messaging` registration (the server side is ready).
