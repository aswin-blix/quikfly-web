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
| POST | `/auth/verify` | `{ phone, otp, name? }` → `{ token, user }`; creates the user on first login |
| POST | `/auth/logout` | ends the session for the bearer token (always succeeds) |
| GET | `/places?q=` | place autocomplete |
| POST | `/rides/quote` | `{ service, pickupId, dropId }` → fares for each ride option |
| POST 🔒 | `/rides` | `{ optionId, pickupId, dropId, payment }` → ride with driver and OTP |
| POST 🔒 | `/rides/:id/cancel` | cancel a ride |
| GET | `/buses?from=&to=&date=` | bus search (same search, same results) |
| GET | `/buses/:id/seats?date=` | seat layout and availability |
| GET | `/tours` | holiday packages |
| GET | `/rentals/cars?city=` | self-drive / chauffeur cars |
| GET | `/rentals/travel-vehicles` | group vehicles |
| GET 🔒 | `/bookings` | the signed-in user's bookings, newest first |
| POST 🔒 | `/bookings` | `{ service, title, subtitle, amount, lines }` → booking |
| POST 🔒 | `/bookings/:id/cancel` | cancel a booking |

## Settings (`wrangler.jsonc` → `vars`)

| Name | Purpose |
|---|---|
| `DEMO_OTP` | Fixed login code while there is no SMS provider. Every number signs in with it. |
| `ALLOWED_ORIGINS` | Comma-separated website origins allowed by CORS, or `*`. |

Sessions are random bearer tokens; only their SHA-256 hash is stored, and they expire after `SESSION_TTL_DAYS` (`src/config.ts`).

## Deploy (free tier)

Live at **https://quikfly-api.quikfly-api.workers.dev/v1**. The D1 database `quikfly-db` already exists and its id is in `wrangler.jsonc`.

```bash
npx wrangler login          # once per machine
npm run db:migrate:remote   # only when migrations/ has a new file
npm run deploy
node scripts/smoke.mjs https://quikfly-api.quikfly-api.workers.dev/v1   # leaves one test user (+91 9000000001)
```

`ALLOWED_ORIGINS` is `*` for now. To lock it down, set it to the website origin plus `http://localhost:3000`. The Flutter app is not affected, because CORS only applies to browsers.

## Not yet built

Real SMS OTP, payments, live driver tracking, and an admin panel for the catalog (it is served from `@quikfly/shared` until then).
