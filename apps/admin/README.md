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
                    (Offers in the sidebar is catalog/list?kind=offer), bookings (filters in the URL, incl. `?rental=returned` for returned self-drive cars; the CSV button downloads the current filters, audited), bookings/view?id= (a "Sold under" card with the terms the booking keeps, from `termLines()`; internal "Staff notes" the customer never sees; "Captains asked" on a live ride (the dispatch log, `drivers.view`); "Mark completed" asks for the actual tolls on group trips quoted with a toll estimate; self-drive: `components/RentalReview.tsx` with pickup/return photos and the deposit settlement), licences, vendors (Partners: queue by status, plus Fleet to review and Payouts), vendors/view?id= (section-by-section review; for live partners the Fleet section: vehicles, drivers, renewals, blocks, each driver's QuikFly Captain status; `components/VendorFleet.tsx`), captains (QuikFly Captain: a "Ready for live rides?" card, red where a launch would go wrong; every signed-in captain with status, last seen, the app's own blocker words, today's trips; filters; Set offline with `drivers.manage`; re-read every 15 s; `drivers.view`) and support (Support: callback requests and tickets by status: Waiting for us / Answered / Closed; reply or close with a note; `support.manage`)
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
- **Staff alerts** (`alerts.view`: owner, operations): `lib/alerts.tsx` polls `GET /admin/alerts` every 15 s (`ALERTS_POLL_MS`) and on tab return. Anything new is **announced**: a pop-up (`components/AlertPopups.tsx`: bottom on phones, top right on larger screens, Open button, closes itself after 20 s but only while the tab is on screen and not hovered; more than `MAX_POPUPS` at once become one "N new alerts" pop-up), a soft chime (an SOS gets the red banner on every page and its urgent tone instead; `lib/tone.ts`, sound only after the first click in the panel, one mute switch per browser), a system notification when the tab is in the background and the browser allows notifications (tagged with the alert id, so the API's push that follows replaces it), and the section's page reloads its list (`useAlertReload("/support", reload)` on Support, SOS, Licences, Partners, Parcels). A new browser session starts with one "N unread alerts" reminder; after a reload only what arrived since is announced (`sessionStorage`). The bell (`components/AlertsMenu.tsx`, in the phone top bar and the desktop top bar) opens the newest alerts with Mark all read and the sound switch. Sidebar counts (`SECTION_KINDS`): opening a section marks its alerts seen, **only while the tab is visible**. The "(n)" tab title stays. `/alerts` lists them (marks read on open, filter by kind) with the settings: **Browser alerts on this computer** (Web Push, `lib/push.ts` + `public/sw.js`, subscription sent to `POST /admin/push-devices`; an SOS notification stays until clicked) and **Alert sounds**. The dashboard offers browser alerts once (Turn on / Not now). Signing out takes the browser off the account first. Reads and device registration aren't audited (only the viewer's own state). A new alert kind needs an icon in `lib/alert-kinds.ts`, a filter on `/alerts`, an entry in `SECTION_KINDS`, and `useAlertReload` on its page.
- **Services and features:** the first two Settings groups switch services and features off (owner only). The API enforces them (`packages/shared/src/switches.ts`); a new service or feature switch needs a `switchError` rule there, a row here, and the screens that should hide it.
- **New setting:** add it to `Settings` in `packages/shared/src/settings.ts` with a default and a rule in `SETTING_RULES`, then a row in `settings-fields.ts` (in a group that belongs to a tab in `SETTING_TABS`). The API and the page both validate with `checkSetting`. The page shows "Changed from default" against `DEFAULT_SETTINGS`, offers "Reset to default", and History (owners) reads the audit log filtered by the key.
- **Saving settings:** "Review and save" lists every change (old → new) before anything is sent; nothing saves without that step. Restoring an old value from History only puts it in the draft.
- **Try a fare:** samples run in the browser with `@quikfly/shared` pricing (the same functions the API quotes with) and never save. A tab lists its sample kinds in `SETTING_TABS.preview`; the catalog edit form previews ride types, packages, rental cars and group vehicles.
- **Catalog:** the list and edit pages are generic. Each kind's fields, labels, hints and limits come from `CATALOG_DEFS` (`packages/shared/src/catalog-kinds.ts`); the form validates with `validateCatalogData` before saving and the API validates again. Add a field there, not here. The Parcels group holds counters and rates (an operator id plus city names, checked by the API).
- **Parcels** (`parcels.manage`): `parcels` is the queue (city, status and date in the URL; the search is not, as it can be a phone number), `parcels/view?id=` the journey with counter buttons. The buttons come from `staffMoves()` in `@quikfly/shared`, never from a list of their own (`lib/parcels.ts` only names them); `components/ParcelMoveDialog.tsx` takes the note, reason or code. Staff never see the code. A **counter** login (Team → role Counter + a counter) lands on this queue and has nothing else; pass `admin.counter` to `movesFor` and `nextAction`. `components/ParcelChangeDialogs.tsx` (`parcels.change`): another bus and the weight (until it leaves), and sending an unclaimed parcel back as the LR the sender booked. The dashboard's parcel tiles link to the same queue filters they count. Quick parcels are in the same queue (dated by booking): picked up, delivered (code), brought back (reason, no refund) or refused before pickup. The booking page links here, has no "Mark completed" for parcels and no Cancel once one is on the bus. Settings has a Parcels tab; switching `serviceParcel` on shows a warning in the review (`warnOn`): app 0.1.16 and older can't show parcels, so their users see neither the parcel nor its code until they update, and the rates, counters and GST must be real first.
- **CSS layers:** component classes (`.card`, `.field`, `.btn-primary`...) are in `@layer components` in `globals.css` so utilities like `w-56` or `pl-9` override them. Keep new component classes inside that layer.
- **Routing:** this app uses `next/link` and `next/navigation` directly (unlike the website, it has no single-file SPA build). Pages that read the query string wrap their content in `<Suspense>`.
- **Charts** follow the dataviz rules: one hue (`--chart-bar`), bars ≤ 24px, hairline grid, tooltip on hover and focus, "Show as table" view.
- **Phones:** check at 390 px. Grids need `grid-cols-1` on phones (not an implicit column), or a wide child can push the page sideways.

## Deploy

```bash
npm run deploy -w @quikfly/admin   # builds with .env.production, uploads ./out
```

Live at https://admin.quikfly.in (also https://quikfly-admin.quikfly-api.workers.dev). Deploy the API first (it must have the `/admin` routes and migration 0004).
