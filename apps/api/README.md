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
| GET 🔒 | `/me/wallet` | wallet history, newest first: `welcome`, `payment`, `refund`, `referral`, `opening` |
| GET | `/places?q=` | place autocomplete (visible catalog places) |
| POST | `/rides/quote` | `{ service, pickupId, dropId }` → fares for each visible ride option; surge from settings |
| POST 🔒 | `/rides` | `{ optionId, pickupId, dropId, payment }` → ride with driver and OTP |
| POST 🔒 | `/rides/:id/cancel` | cancel a ride |
| POST 🔒 | `/rides/:id/share` | `{ token, expiresAt }`: a 24-hour link to follow the ride (same link if one is live) |
| GET | `/share/:token` | public, no sign-in: the shared ride (first name, driver, vehicle, route, start time, status) |
| GET | `/buses?from=&to=&date=` | bus search (same search, same results) |
| GET | `/buses/:id/seats?from=&to=&date=` | seat layout, availability and each seat's price (the bus is regenerated from its route and date) |
| GET | `/tours` | holiday packages |
| GET | `/tours/:slug` | one package (404 if hidden or missing) |
| GET | `/rentals/cars?city=` | self-drive / chauffeur cars |
| GET | `/rentals/cars/:id` | one car |
| GET | `/rentals/travel-vehicles` | group vehicles |
| POST | `/quotes` | prices a booking: `{ service: "bus", busId, from, to, date, seatIds }`, `{ service: "tours", tourId, adults, kids, start }`, `{ service: "rent", carId, mode, start, end, kmPlan, protection, doorstep }` or `{ service: "rentals", vehicleId, trip, destinationId?, days, start }` (`start` = YYYY-MM-DD) → `{ id, service, lines, total, expiresAt }`. Valid 30 min, usable once. The quote also records when the trip starts, which the booking copies for its cancellation policy |
| POST 🔒 | `/offers/check` | `{ code, quoteId }` or `{ code, rideId }` → `{ code, discount, total }`; 400 says why a code can't be used (other service, expired, below minimum, per-customer limit, unknown) |
| GET 🔒 | `/bookings` | the signed-in user's bookings, newest first. Each has `startsAt` (from the quote; null for rides and older bookings) and `refundAmount` (set when cancelled) |
| POST 🔒 | `/bookings` | `{ service, title, subtitle, payment, lines, quoteId \| rideId, couponCode? }` → booking. **The API sets the amount** from the quote (bus, tours, rent, rentals) or the ride (bike, car), minus the coupon; any `amount` sent is ignored. A quote or ride books once (409 after). `payment: "wallet"` is deducted in the same transaction and refused (400) if the balance is too low, which also gives the quote back |
| GET 🔒 | `/bookings/:id` | one booking (for invoices) |
| POST 🔒 | `/bookings/:id/cancel` | cancel; refunds the share the service's cancellation policy allows for the notice given (settings `cancelPolicyBus/Tours/Rent/Group`; rides and bookings without `startsAt` get it all), to the wallet if paid from it, in the same transaction; `refundAmount` records it; 409 if already cancelled or completed |
| POST 🔒 | `/bookings/:id/complete` | mark a finished trip (called by the website when a simulated ride ends; the driver app will own this) |

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
| POST 🛡 | `/admin/bookings/:id/complete` | marks an active booking completed `[bookings.manage]` |
| GET 🛡 | `/admin/licences?status=` | licence queue: `pending` (default, oldest first), `rejected` or `verified` `[licences.review]` |
| POST 🛡 | `/admin/licences/:userId/approve` | pending → verified `[licences.review]` |
| POST 🛡 | `/admin/licences/:userId/reject` | `{ reason }` → rejected; the customer sees the reason (`licence.note`) and can submit again `[licences.review]` |

## Settings (`wrangler.jsonc` → `vars`)

| Name | Purpose |
|---|---|
| `DEMO_OTP` | Fixed login code while there is no SMS provider. Every number signs in with it. |
| `ALLOWED_ORIGINS` | Comma-separated website origins allowed by CORS, or `*`. |

Business settings that staff change at runtime (fares, surge, bus fares, GST rates, bonuses, rental fees, cancellation policies, company details, licence auto-approve) live in the `settings` table, read through `services/settings.ts`; keys, defaults and allowed values are in `packages/shared/src/settings.ts`. The catalog lives in `catalog_items` (`services/catalog.ts`), filled from the seed in `packages/shared/src/catalog.ts` on first use. Both are cached for 30 seconds per Worker isolate, so an admin edit can take up to 30 s to show everywhere. Prices are computed by `packages/shared/src/pricing.ts` (`services/quotes.ts`, `services/rides.ts`).

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

Real SMS OTP, payments, live driver tracking, real bus inventory (the timetable is generated).
