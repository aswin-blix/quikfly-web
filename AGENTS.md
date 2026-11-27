# AGENTS.md: guide for coding agents

QuikFly is an Indian travel super app: bike taxi, cab, bus tickets, holiday packages, self-drive car rental and group vehicles. This repo is an npm-workspaces monorepo holding the **website**, the **REST API** they share, and (from Phase 3) the **Flutter app**.

Read this file first. Then read:
- [docs/roadmap.md](docs/roadmap.md): status and the in-progress checklist. **Start here when continuing work.**
- [docs/decisions.md](docs/decisions.md): why things are built this way. Don't reverse a decision without asking the owner.
- [docs/operations.md](docs/operations.md): environments, deploying, testing, troubleshooting.
- [docs/demo-script.md](docs/demo-script.md): the client demo, step by step (Phase 4).
- [docs/privacy.md](docs/privacy.md): DPDP privacy: notice, consent, export, erasure, and the data-breach plan.
- [docs/prompts/](docs/prompts/): ready-to-paste prompts for planned work (e.g. the admin settings and pricing audit).
- [docs/parcel-service-plan.md](docs/parcel-service-plan.md): the parcel service (KPN-style bus parcels + bike courier): research, the owner's decisions, design and steps. Steps 1 (foundation), 2 (Bus parcel on the website and in admin), 3 (Quick parcel, in every client), 5 (the customer app, released in 0.1.17), 6 (operations) and 7's counter role are live, and `serviceParcel` is on in production since 2026-11-23 (the owner's decision); step 4 and the operators' share (rest of 7) wait for the owner.
- [docs/family-profiles-plan.md](docs/family-profiles-plan.md): Phase 5 #12 (family payer with a monthly limit and shared rides, monthly GST statements) and the chauffeur toll follow-up: settled design, not started.
- [docs/ios-app-plan.md](docs/ios-app-plan.md): iPhone builds of both apps: free 7-day installs from the Mac now, notifications and TestFlight after sign-off. Scoped, not started.
- [apps/api/README.md](apps/api/README.md): endpoint list. [apps/web/README.md](apps/web/README.md): pages, theming, navigation. [apps/admin/README.md](apps/admin/README.md): admin panel structure and rules.

## Map

```
apps/web/         Next.js 16 static export (App Router). Screens never call fetch() and never import catalog seed data:
                  useConfig()/useSettings() (components/ConfigProvider.tsx) and components/catalog-hooks.ts give them API data.
  src/app/        thin route files (metadata + one screen)
  src/screens/    page-level UI          src/components/  shared UI (shell, sheets, RidePanel, ui.tsx)
  src/lib/api/    contract.ts (interface) · http.ts (real API) · mock.ts (demo, localStorage) · index.ts (picks one)
  src/spa/        in-memory router for the single-file demo build. Every new route goes here too.
  src/styles/     tokens.css is the only place for colours, fonts, radii (light + dark)
apps/admin/       Next.js static export for staff: login, dashboard, bookings (notes, CSV export), customers (wallet, suspend, sign-out,
                  cancel deletion), SOS alerts, licence reviews, partners, support, catalog, offers, settings, team (staff accounts), audit
apps/api/         Cloudflare Worker: Hono + D1 (SQLite)
  src/routes/     HTTP only: parse, validate, call a service. routes/admin/ = staff endpoints (/v1/admin/*)
  src/services/   business logic + SQL. services/admin/ = auth, audit, stats, bookings (+ notes, CSV), customers, team, licences, vendors, fleet.
                  services/sos.ts (SOS alerts: customers raise, staff handle), services/settings.ts,
                  services/catalog.ts (cached 30 s), services/quotes.ts, services/offers.ts
  src/middleware/ requireUser (customer token) · requireAdmin(permission) (staff token + role check)
  src/config.ts   tunable API values that are NOT (yet) runtime settings
  migrations/     numbered D1 SQL files; never edit an applied one, add a new one
  scripts/        smoke.mjs (customer endpoints) · smoke-admin.mjs (admin endpoints) · create-admin.mjs (staff accounts)
apps/mobile/      Flutter Android apps (read apps/mobile/README.md): the customer app (default flavor) and QuikFly Partner for vehicle
                  owners (flavor partner, lib/main_partner.dart, screens in lib/partner/). Same endpoints as the website:
  lib/api/        api.dart (one method per endpoint) · models.dart (Dart copy of packages/shared types + Rules)
  lib/theme/      tokens.dart mirrors apps/web tokens.css · lib/screens/ one folder per area · test/api_contract_test.dart
packages/shared/i18n/ app_en.arb (template), app_ta.arb, app_hi.arb: UI strings for the website (useT()) and both apps (L.of(context))
brand/           quikfly-logo.svg: the one logo. After changing it run `node scripts/logo.mjs` (copies to web/admin, renders the app PNG)
packages/shared/  @quikfly/shared: types.ts (domain types), rules.ts (validation patterns, limits),
                  catalog.ts (SEED data only) + catalog-kinds.ts (18 kinds, fields, validation), settings.ts
                  (runtime Settings, defaults, rules), pricing.ts (all price maths + bus/ride simulation),
                  cancellation.ts (refund tiers per service: the API applies them, the apps preview them),
                  admin.ts (roles, PERMISSIONS, admin shapes), support.ts (support topics, callback times, limits, whatsappLink), parcel.ts (parcel legs, the transition table, declaration), clients.ts (which services a client declares it can show), rental.ts (self-drive checklist, extensions, deposit settlement),
                  privacy.ts (the privacy notice text + version; bump the version to ask everyone to agree again)
```

## Commands (repo root)

```bash
npm install                 # links all workspaces
npm run db:migrate:local    # local D1 schema (re-run after adding a migration)
npm run dev                 # API :8787 + website :3000 (website uses the mock API unless apps/web/.env.local sets NEXT_PUBLIC_API_URL)
npm run dev:admin           # admin panel :3100 against the local API (create a login with apps/api/scripts/create-admin.mjs)
npm run typecheck           # shared + api + web + admin; must pass before committing
npm run build               # API dry-run bundle + website export + admin export
npm run smoke               # API end-to-end tests against the local API (node apps/api/scripts/smoke.mjs <baseUrl> for others)
npm run smoke:admin         # admin endpoints against the local API; creates its own test admins
npm run deploy              # production; read docs/operations.md first
cd apps/mobile && flutter analyze && flutter test --dart-define=API_URL=http://127.0.0.1:8787/v1   # app checks
```

## Rules

1. **One contract, four implementations.** An API change touches all of these in the same change:
   `packages/shared` types → `apps/api` route + service (+ migration) → `apps/web/src/lib/api/contract.ts` → `http.ts` → `mock.ts` → `scripts/smoke.mjs` checks → the endpoint table in `apps/api/README.md` → `apps/mobile/lib/api/models.dart` + `api.dart` when the app uses it, and its contract test.
2. **Separation of concerns.** Routes validate, services hold logic and SQL, screens render. Shared rules (regexes, limits, bonus amounts) live in `packages/shared/src/rules.ts`, so the API enforces them and the apps check early with the same values.
3. **No hard-coded tunables.** Customisable values go in named constants (`apps/api/src/config.ts`, `packages/shared/src/rules.ts`, `apps/web/src/lib/*`), and colours go in `tokens.css`. Use token utilities (`text-gold`, `bg-coal`...), never raw hex or Tailwind palette colours.
4. **Admin writes are audited and permission-checked.** Every `/admin` route that changes data uses `requireAdmin("<permission>")` and writes an `audit_log` row (`services/admin/audit.ts`; use `auditStatement` inside the change's `db.batch()` so both land together). New permissions go in `PERMISSIONS` (`packages/shared/src/admin.ts`); the admin UI hides what a role can't do using the same map. Runtime-tunable business values belong in `Settings` (`packages/shared/src/settings.ts`), not `config.ts`.
5. **The API sets every price.** Bookings carry a `quoteId` (`POST /quotes`) or `rideId`, never an amount. Price maths lives only in `packages/shared/src/pricing.ts`; apps may call it for live estimates, but checkout always charges the API's quote.
6. **Money changes are atomic.** Any wallet debit or credit runs in one `db.batch()` together with its `wallet_transactions` row (see `services/bookings.ts`, `services/account.ts`).
7. **Free tier only** until the client signs off: no paid SMS, payment gateway, maps or Play Store fee (the domain `quikfly.in` is the owner's one exception, bought 2026-11-26). Simulate instead, and label simulations honestly in the UI (e.g. "demo: no SMS sent").
8. **Responsive and friendly UI.** Every screen must work at 390 px (phone), tablet and desktop, in light and dark mode. Verify in a browser at phone width before calling UI work done.
9. **Routing:** screens use only `Link`, `useNav`, `usePath` and `useQuery` from `src/lib/nav.tsx`, never `next/navigation`, so the single-file SPA build keeps working. New pages need a file in `src/app/` **and** an entry in `src/spa/SpaApp.tsx`.
10. **Git:** branch from `main`, open a PR, never push to `main`. Merge with **rebase and merge** (`gh pr merge <n> --rebase`; the owner's rule since 2026-11-23). Commit messages say what changed and why.
11. **Docs are part of the change.** Update `docs/roadmap.md` (tick items, add new ones), the READMEs, and `docs/decisions.md` for any new trade-off.

## Gotchas

- `apps/web/AGENTS.md` is generated by `next dev` (a Next.js notice). Leave it; this root file is the project guide. Next 16 differs from older versions; check `node_modules/next/dist/docs/` before using a Next API.
- On Windows, stopping `wrangler dev` or `next dev` from a tool can leave the child process holding the port. Use another port (`wrangler dev --port 8791`) instead of killing processes you didn't start. Only one `next dev` can run per app folder.
- Right after `wrangler deploy`, Cloudflare serves old and new versions for about a minute. Wait before running the production smoke test. When a deploy changes nothing an anonymous request can see, `wrangler deployments status` (in `apps/api`) shows when the new version serves 100%.
- A stacked PR keeps its parent branch as its base after the parent is merged (the branch isn't deleted). Retarget it with `gh pr edit <n> --base main` before merging, or it merges into the old branch.
- `npm run build:demo` (in `apps/web`) works from any shell and needs Python 3. It always builds on the mock API (`scripts/build-demo.mjs`): don't replace it with a plain `next build`, which takes the production API from `.env.production`.
- `apps/web/quikfly-web-architecture.md` is an old copy of the web README. Treat it as stale.
- Free plan: at most 50 D1 queries per request. Keep loops of statements out of request paths (the catalog seed is one `json_each` insert for this reason).
- `apps/web/.env.development.local` (the owner's) points the website at `http://localhost:8795/v1`. If that isn't an API, the dev site can't sign in or save; for local tests start the API (`npm run dev`, :8787) and build or run the website with `NEXT_PUBLIC_API_URL=http://localhost:8787/v1`. Old `wrangler dev` processes may still hold ports 8795–8797; pick a free port instead of killing them.
- `next dev` errors on detail pages that weren't pre-built (new admin-created holidays/cars). Test those on a build served with `npx wrangler dev` in `apps/web`.
- React lists derived from API data with `useMemo` must list that data in the dependencies, or they stay empty after it loads.
- A plain `next build` of the website talks to the **production** API (`.env.production`). Building to test locally? Pass `NEXT_PUBLIC_API_URL` for the local API, or test submissions would hit production.
- New `Settings` fields can be missing for a minute after a deploy (old API, new website). Code reading them must not crash on `undefined`.
- Parcels: move one only through `planLegMove` + `advanceLegs` (never `UPDATE parcels SET state`), and never put a receiver's name, number, contents or the collection code in booking lines, notifications or audit rows. `serviceParcel` and `parcelSimulateTransit` in production are the owner's switches: don't change either without their word.
- The `counter` staff role is scoped (operator + city): every route that lets it in must pass `staffScope(c.var.admin)` to the service. It has `parcels.manage` and nothing else; don't give that permission to a new route without applying the scope, and `smoke-admin` fails for any other admin route that doesn't refuse it.
- A parcel's bus or weight changes only through `services/parcels/changes.ts`: a new `move_id`, conditional on the one read, so it can't race a move or a cancel. `cancelBookingRow` refunds only from the amount it read; keep that condition when adding anything that edits `bookings.amount`.
- A parcel booking with no start time is a Quick parcel (`isQuickParcel`): it follows the ride cancellation rules, and cash on pickup is never shown or paid as a refund. Never give a Quick parcel a `startsAt` or a booking `ride_id` (its captain's card is a rides row with status `parcel`, linked from the leg).
- A service added after the six launch ones reaches only clients that declare it in `Accept: application/json; services=parcel` (`packages/shared/src/clients.ts`, copied in the app's `models.dart`): released apps read an unknown service as a cab, with a cab's refund and GST. A new service joins both lists in the change that can show it everywhere. A script or curl without that `Accept` sees no parcel bookings.
- The catalog seed runs once per database. A new kind or seed row reaches production only through a migration (`INSERT OR IGNORE`, see 0012 and 0029).
- Production lives on `quikfly.in` (`api.`, `admin.`, `www`) as Worker custom domains, and on the old `*.quikfly-api.workers.dev` addresses that released apps call. Keep `workers_dev: true` in every `wrangler.jsonc` (adding `routes` turns workers.dev off otherwise), never add DNS records for those names by hand, and add any new production hostname to the production checks in `smoke.mjs` and `test/api_contract_test.dart`.
- Run the production smoke test once per deploy; every run leaves bookings, tickets and callbacks on production.
- Languages (see docs/roadmap.md): until the feature freeze, UI text may stay hard-coded; text already in `packages/shared/i18n` is changed there (all three files). After editing the `.arb` files run `flutter gen-l10n` in apps/mobile (`test/l10n_test.dart` fails otherwise). `npm run typecheck` warns about untranslated strings; `npm run i18n:strict` must pass before `featureLanguages` is turned on.
- The logo is transparent and suits both themes: never put it on a badge or background (`test/logo_test.dart` checks the app). Edit only `brand/quikfly-logo.svg`, then run `node scripts/logo.mjs`.
- Personal data needs a privacy thought: a new table with `user_id` must be added to `exportData()` and handled in `eraseAccounts()` (`services/privacy.ts`), and new kinds of data belong in the notice (`packages/shared/src/privacy.ts`). See [docs/privacy.md](docs/privacy.md).
- The customer app (QuikFly) never gets partner screens; partner flows live in the Partner app and on the website.
- Phone checks on the owner's phone: in the Partner app up to 0.1.13 and the first 0.1.14 build, the registration ⋮ menu's only item is "Sign out" and it opens under the finger with no confirmation; don't tap ⋮ there unless signing out is intended. The rebuilt 0.1.14 adds Privacy & data and the notice to that menu and asks before signing out.
- Push follows the same split: a phone registers with `app` (`PUSH_APPS`), and `pushNew` sends `vendor.*` (`PARTNER_NOTIFICATION_PREFIX`) only to Partner phones. A new partner-only kind must start with `vendor.`, or both rules (here and `NotificationScope`) need changing together.
- Screens shared by both apps (login, notifications, not-found) must not link to pages only one app has; the Partner router lacks customer routes like `/trips`. One account has one inbox: `NotificationScope` keeps `vendor.*` in the Partner app and the rest in the customer app. `test/partner_routes_test.dart` fails if `lib/partner` links to a page the Partner router doesn't have.
