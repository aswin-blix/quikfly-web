# AGENTS.md: guide for coding agents

QuikFly is an Indian travel super app: bike taxi, cab, bus tickets, holiday packages, self-drive car rental and group vehicles. This repo is an npm-workspaces monorepo holding the **website**, the **REST API** they share, and (from Phase 3) the **Flutter app**.

Read this file first. Then read:
- [docs/roadmap.md](docs/roadmap.md): status and the in-progress checklist. **Start here when continuing work.**
- [docs/decisions.md](docs/decisions.md): why things are built this way. Don't reverse a decision without asking the owner.
- [docs/operations.md](docs/operations.md): environments, deploying, testing, troubleshooting.
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
apps/admin/       Next.js static export for staff (Phase 2c): login, dashboard, bookings, licence reviews, catalog, offers, settings, audit
apps/api/         Cloudflare Worker: Hono + D1 (SQLite)
  src/routes/     HTTP only: parse, validate, call a service. routes/admin/ = staff endpoints (/v1/admin/*)
  src/services/   business logic + SQL. services/admin/ = auth, audit, stats, bookings, licences. services/settings.ts,
                  services/catalog.ts (cached 30 s), services/quotes.ts, services/offers.ts
  src/middleware/ requireUser (customer token) · requireAdmin(permission) (staff token + role check)
  src/config.ts   tunable API values that are NOT (yet) runtime settings
  migrations/     numbered D1 SQL files; never edit an applied one, add a new one
  scripts/        smoke.mjs (customer endpoints) · smoke-admin.mjs (admin endpoints) · create-admin.mjs (staff accounts)
apps/mobile/      Flutter Android app (Phase 3; v0.1.0 released on GitHub Releases; read apps/mobile/README.md). Same endpoints as the website:
  lib/api/        api.dart (one method per endpoint) · models.dart (Dart copy of packages/shared types + Rules)
  lib/theme/      tokens.dart mirrors apps/web tokens.css · lib/screens/ one folder per area · test/api_contract_test.dart
packages/shared/  @quikfly/shared: types.ts (domain types), rules.ts (validation patterns, limits),
                  catalog.ts (SEED data only) + catalog-kinds.ts (12 kinds, fields, validation), settings.ts
                  (runtime Settings, defaults, rules), pricing.ts (all price maths + bus/ride simulation),
                  admin.ts (roles, PERMISSIONS, admin shapes)
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
7. **Free tier only** until the client signs off: no paid SMS, payment gateway, maps, Play Store fee or domain. Simulate instead, and label simulations honestly in the UI (e.g. "demo: no SMS sent").
8. **Responsive and friendly UI.** Every screen must work at 390 px (phone), tablet and desktop, in light and dark mode. Verify in a browser at phone width before calling UI work done.
9. **Routing:** screens use only `Link`, `useNav`, `usePath` and `useQuery` from `src/lib/nav.tsx`, never `next/navigation`, so the single-file SPA build keeps working. New pages need a file in `src/app/` **and** an entry in `src/spa/SpaApp.tsx`.
10. **Git:** branch from `main`, open a PR, never push to `main`. Use merge commits. Commit messages say what changed and why.
11. **Docs are part of the change.** Update `docs/roadmap.md` (tick items, add new ones), the READMEs, and `docs/decisions.md` for any new trade-off.

## Gotchas

- `apps/web/AGENTS.md` is generated by `next dev` (a Next.js notice). Leave it; this root file is the project guide. Next 16 differs from older versions; check `node_modules/next/dist/docs/` before using a Next API.
- On Windows, stopping `wrangler dev` or `next dev` from a tool can leave the child process holding the port. Use another port (`wrangler dev --port 8791`) instead of killing processes you didn't start. Only one `next dev` can run per app folder.
- Right after `wrangler deploy`, Cloudflare serves old and new versions for about a minute. Wait before running the production smoke test.
- `npm run build:demo` uses POSIX env syntax and won't run from Windows cmd; use Git Bash.
- `apps/web/quikfly-web-architecture.md` is an old copy of the web README. Treat it as stale.
- Free plan: at most 50 D1 queries per request. Keep loops of statements out of request paths (the catalog seed is one `json_each` insert for this reason).
- `next dev` errors on detail pages that weren't pre-built (new admin-created holidays/cars). Test those on a build served with `npx wrangler dev` in `apps/web`.
- React lists derived from API data with `useMemo` must list that data in the dependencies, or they stay empty after it loads.
