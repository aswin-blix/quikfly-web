# QuikFly admin panel (`@quikfly/admin`)

The staff side of QuikFly: a Next.js 16 static export served by its own Cloudflare Worker (`wrangler.jsonc`, name `quikfly-admin`). Everything it shows comes from the API's `/v1/admin/*` endpoints (see `apps/api/README.md`); it has no mock mode.

## Run it

```bash
npm run dev:api        # from the repo root: API on :8787
npm run dev:admin      # admin on http://localhost:3100
node apps/api/scripts/create-admin.mjs --local you@example.com "Your Name" owner   # once: prints a password
```

`next dev` reads `.env.development` (API on :8787). To use another port, put `NEXT_PUBLIC_API_URL=http://localhost:8795/v1` in `.env.development.local` (git-ignored). Production builds use `.env.production`.

## Structure

```
src/app/            one folder per page: / (dashboard, with the open-SOS queue tile), login, settings, audit, catalog (overview), catalog/list?kind=, catalog/edit?kind=&id=,
                    customers (search by name, phone, email or id; state tabs; `customers.view`), customers/view?id= (profile, wallet history, recent bookings, staff actions; with `customers.manage`: adjust wallet with a reason the customer sees, suspend / lift, sign out everywhere, cancel a scheduled deletion),
                    sos (SOS alerts by status, re-read every 30 s while open; "I'm on it" acknowledges, closing needs a note; `sos.manage`), team (owners: staff accounts, roles, one-time passwords shown once, disable / enable; `team.manage`),
                    (Offers in the sidebar is catalog/list?kind=offer), bookings (filters in the URL, incl. `?rental=returned` for returned self-drive cars; the CSV button downloads the current filters, audited), bookings/view?id= (a "Sold under" card with the terms the booking keeps, from `termLines()`; internal "Staff notes" the customer never sees; "Mark completed" asks for the actual tolls on group trips quoted with a toll estimate; self-drive: `components/RentalReview.tsx` with pickup/return photos and the deposit settlement), licences, vendors (Partners: queue by status, plus Fleet to review and Payouts), vendors/view?id= (section-by-section review; for live partners the Fleet section: vehicles, drivers, renewals, blocks; `components/VendorFleet.tsx`) and support (Support: callback requests and tickets by status: Waiting for us / Answered / Closed; reply or close with a note; `support.manage`)
src/components/     AdminShell (sidebar / phone menu), ui.tsx (buttons, badges, fields, pager...), charts.tsx, ConfirmDialog.tsx, ReasonDialog.tsx,
                    FarePreview.tsx ("Try a fare" on Settings and the catalog edit form), SettingEditors.tsx (surge-hours and cancellation-tier rows)
src/lib/api.ts      the only place that calls fetch(); token in localStorage ("quikfly.admin.token")
src/lib/session.tsx SessionProvider, useSession(), <RequireAdmin permission="...">
src/lib/nav.ts      sidebar entries + permissions; LIVE_ROUTES lists pages that exist so far
src/lib/settings-fields.ts  how each business setting appears on the Settings page, its tabs (SETTING_TABS) and which fare samples a tab shows
src/lib/fare-samples.ts     sample trips priced with the shared pricing functions (current vs draft)
src/styles/tokens.css       colours, fonts, radii (light + dark). Never use raw hex elsewhere
```

## Rules

- **Prices:** catalog fields flagged `pricing: true` (fares, package and rental prices, coupon amounts and dates) need `pricing.edit` (owner, operations). The edit form dims and locks them for other roles, the list hides "Add" for kinds with a required price and locks offer switches; the API enforces the same rule with `pricingChanges()`.
- **Permissions:** wrap every page in `<RequireAdmin permission="...">` and hide buttons with `useSession().can(...)`. The API enforces the same `PERMISSIONS` map from `@quikfly/shared`; the UI only hides what would fail anyway.
- **New page:** add `src/app/<name>/page.tsx`, a `NAV` entry, and the route to `LIVE_ROUTES`.
- **Services and features:** the first two Settings groups switch services and features off (owner only). The API enforces them (`packages/shared/src/switches.ts`); a new service or feature switch needs a `switchError` rule there, a row here, and the screens that should hide it.
- **New setting:** add it to `Settings` in `packages/shared/src/settings.ts` with a default and a rule in `SETTING_RULES`, then a row in `settings-fields.ts` (in a group that belongs to a tab in `SETTING_TABS`). The API and the page both validate with `checkSetting`. The page shows "Changed from default" against `DEFAULT_SETTINGS`, offers "Reset to default", and History (owners) reads the audit log filtered by the key.
- **Saving settings:** "Review and save" lists every change (old → new) before anything is sent; nothing saves without that step. Restoring an old value from History only puts it in the draft.
- **Try a fare:** samples run in the browser with `@quikfly/shared` pricing (the same functions the API quotes with) and never save. A tab lists its sample kinds in `SETTING_TABS.preview`; the catalog edit form previews ride types, packages, rental cars and group vehicles.
- **Catalog:** the list and edit pages are generic. Each kind's fields, labels, hints and limits come from `CATALOG_DEFS` (`packages/shared/src/catalog-kinds.ts`); the form validates with `validateCatalogData` before saving and the API validates again. Add a field there, not here.
- **CSS layers:** component classes (`.card`, `.field`, `.btn-primary`...) are in `@layer components` in `globals.css` so utilities like `w-56` or `pl-9` override them. Keep new component classes inside that layer.
- **Routing:** this app uses `next/link` and `next/navigation` directly (unlike the website, it has no single-file SPA build). Pages that read the query string wrap their content in `<Suspense>`.
- **Charts** follow the dataviz rules: one hue (`--chart-bar`), bars ≤ 24px, hairline grid, tooltip on hover and focus, "Show as table" view.
- **Phones:** check at 390 px. Grids need `grid-cols-1` on phones (not an implicit column), or a wide child can push the page sideways.

## Deploy

```bash
npm run deploy -w @quikfly/admin   # builds with .env.production, uploads ./out
```

Planned address: https://quikfly-admin.quikfly-api.workers.dev. Deploy the API first (it must have the `/admin` routes and migration 0004).
