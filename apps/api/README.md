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
| GET | `/places?q=` | place autocomplete |
| POST | `/rides/quote` | `{ service, pickupId, dropId }` → fares for each ride option |
| POST 🔒 | `/rides` | `{ optionId, pickupId, dropId, payment }` → ride with driver and OTP |
| POST 🔒 | `/rides/:id/cancel` | cancel a ride |
| POST 🔒 | `/rides/:id/share` | `{ token, expiresAt }`: a 24-hour link to follow the ride (same link if one is live) |
| GET | `/share/:token` | public, no sign-in: the shared ride (first name, driver, vehicle, route, start time, status) |
| GET | `/buses?from=&to=&date=` | bus search (same search, same results) |
| GET | `/buses/:id/seats?date=` | seat layout and availability |
| GET | `/tours` | holiday packages |
| GET | `/rentals/cars?city=` | self-drive / chauffeur cars |
| GET | `/rentals/travel-vehicles` | group vehicles |
| GET 🔒 | `/bookings` | the signed-in user's bookings, newest first |
| POST 🔒 | `/bookings` | `{ service, title, subtitle, amount, payment, lines }` → booking. `payment: "wallet"` is deducted in the same transaction and refused (400) if the balance is too low |
| GET 🔒 | `/bookings/:id` | one booking (for invoices) |
| POST 🔒 | `/bookings/:id/cancel` | cancel; refunds a wallet payment; 409 if already cancelled or completed |
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

## Settings (`wrangler.jsonc` → `vars`)

| Name | Purpose |
|---|---|
| `DEMO_OTP` | Fixed login code while there is no SMS provider. Every number signs in with it. |
| `ALLOWED_ORIGINS` | Comma-separated website origins allowed by CORS, or `*`. |

Business settings that staff change at runtime (licence auto-approve, later fares and bonuses) live in the `settings` table, read through `services/settings.ts` with a 30-second cache per Worker isolate.

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

Real SMS OTP, payments, live driver tracking. The catalog is still served from `@quikfly/shared` until slice L2 of the admin work moves it into D1 (see `docs/roadmap.md`).
