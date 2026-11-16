# Roadmap and progress

Goal: a live client demo of the website and an Android app on one API, at ₹0 (see [decisions.md](decisions.md)).

Legend: ✅ done · 🔄 in progress · ⬜ not started

## Phases

| Phase | Status | Notes |
|---|---|---|
| 1. API (Workers + Hono + D1) | ✅ | Live. PR #4 |
| 2. Website on Cloudflare | ✅ | Live. Demo fixes in PR #5 (ride completion, real wallet, bus times, date strip, rental defaults, cancel errors, holiday tabs) |
| 2b. Complete the web version: accounts + competitor features | ✅ | Live. PR #6, deployed 2026-11-16 (migration 0003) |
| 2c. Admin panel (lean) + everything from the API | 🔄 | Code complete, PRs #8 (L1) → #9 (L2) → #10 (L3) open, stacked; then release. Tracker below |
| 3. Flutter Android app (`apps/mobile`) | ⬜ | Signed APK shared by link; same API. Can start once L2 is live (catalog, settings and prices come from the API) |
| 4. Demo hardening | ⬜ | Rehearse: edit a price in admin → see it on the web and the phone → book → cancel → refund. "Reset catalog" (L2) covers most of "reset demo data" |
| 5. Admin, full | ⬜ | The parts cut from the lean plan: customers screen (wallet adjust, suspend, sign out everywhere, cancel deletion), booking notes, SOS alerts in admin, team screen, CSV export |

## Current task: lean admin panel (L1–L3) 🔄

Requested 2026-11-16. Owner chose the **lean** plan: prove the model end to end (edit data in admin → website and app show it → book → cancel → refund) before the Flutter app; the rest of the admin comes after the client demo (Phase 5).

Decisions (details in [decisions.md](decisions.md)): separate app `apps/admin` on its own Worker; admin login by email + password (the customer demo OTP is public); fixed roles with a permission map in `packages/shared`; every admin write is audited; catalog and business settings move into D1 so admin edits reach the website and the app; prices are computed by the API (quotes), not by the website; licences need manual approval, with an auto-approve setting for unattended demos; detail-page URLs stay as they are (pre-built for known items, the 404 page renders new ones from the API).

### Feature tracker

| ID | Slice | Shared | API | Admin UI | Website | Smoke | Browser |
|---|---|---|---|---|---|---|---|
| L1 | Foundation: `apps/admin` scaffold, admin login + sessions + lockout, roles/permissions, audit log, `create-admin` script, dashboard (bookings, revenue, cancellations, new customers; by service; by day; queues; latest bookings) | ✅ | ✅ | ✅ | n/a | ✅ | ✅ |
| L2 | Data from the API: catalog (places, ride options, drivers, tours, rental cars, group vehicles, cities, bus operators, popular routes, group destinations, offers, FAQs) and settings (fares, surge, bus fares, welcome credit, referral bonus, GST rates, rental fees, licence auto-approve, invoice company details, safety line) in D1; public `GET /config`; server-side quotes for every service; **coupons checked by the API** (moved here from L3 because bookings changed shape); website reads everything from the API (loading states, detail pages for new items via the 404 page); admin catalog + settings editors; reset catalog to seed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| L3 | Operations-lite: bookings (search, filter, detail, cancel + wallet refund, complete); licence queue (approve / reject with reason, customer sees it, resubmit) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Each slice: typecheck → smoke (`smoke.mjs` + `smoke-admin.mjs`) → browser pass at 390 px and desktop → docs + memory → PR → merge → migrate → deploy API → wait 60 s → production smoke → deploy web + admin.

### Work log

- 2026-11-16 Plan agreed (lean). `packages/shared/src/admin.ts` (roles, `PERMISSIONS`, admin shapes), `settings.ts` (`Settings` + defaults); `LicenceStatus` gains `rejected` and a `note`.
- 2026-11-16 **L1 API** (commit "Admin L1: API"): migration `0004_admin.sql` (admin_users, admin_sessions, audit_log, settings, stored licence status); `lib/password.ts` (PBKDF2 via Web Crypto); `services/admin/{auth,audit,stats}.ts`, `services/settings.ts` (30 s cache); `middleware/admin.ts` `requireAdmin(permission)`; `routes/admin/index.ts` (login/logout/me, stats, settings, audit); licence submit now stores `pending` (or `verified` when `licenceAutoApprove` is on), the old 20 s simulation is gone; `scripts/create-admin.mjs`; `scripts/smoke-admin.mjs` (31 checks: login, same message for unknown email, lockout, role 403s, stats, settings validation, audit, setting reaches the customer licence flow). Customer smoke still 94/94.
- 2026-11-16 **L1 admin UI** (commit "Admin L1: admin app"): `apps/admin` (Next 16 static export, own Worker `quikfly-admin`): login (with `?next=` limited to same-site paths), session + `<RequireAdmin permission>`, sidebar / phone menu filtered by role, light + dark (device default, toggle), dashboard (date presets, 4 stat tiles, revenue/bookings by day column chart with tooltip + table view, revenue by service, queues, wallet liability, latest bookings), settings (generic form from `settings-fields.ts`, sticky save bar), audit log (filter, expandable before/after, pager). Root scripts `dev:admin`, admin in `build`/`typecheck`/`deploy`.
  - Browser pass (local API, port 8795): wrong password message, sign-in, dashboard at 1280 px and 390 px in dark and light, all four date ranges, settings toggle → save → audit row with before/after. Fixed during the pass: 30/90-day charts pushed the page sideways on phones (grid needed `grid-cols-1`, bars/labels `min-w-0`); phone axis shows every other label; switch knob is white in both themes.
- 2026-11-16 **L2 shared + API** (branch `feat/admin-l2`, commit "Admin L2: catalog, settings, quotes and coupons in the API"): `settings.ts` grows to 27 settings with `SETTING_RULES` / `checkSetting`; `catalog-kinds.ts` (12 kinds, field definitions, `validateCatalogData`, seed map); `pricing.ts` (ride fares, bus timetable + seats, bus/tour/rent/group prices, coupon rules) moved out of the API and the web mock; seed reshaped (ride types carry vehicle models, drivers/cities/operators have ids, offers/FAQs/routes/destinations moved from the website). Migration `0005_catalog.sql` (`catalog_items`, `meta`, `quotes`, booking `quote_id`/`ride_id`/`coupon_code`/`discount`). `services/catalog.ts` (seed on first use in one statement, 30 s cache, CRUD + audit, reset), `quotes.ts`, `offers.ts`; bookings priced from quote/ride with coupon, quote claimed once and released if the wallet is short; `GET /config`, `/tours/:slug`, `/rentals/cars/:id`, `POST /quotes`, `POST /offers/check`, `/admin/catalog/*`. Welcome credit and referral bonus come from settings. Smoke: customer 126 checks, admin 67 checks, each run twice.
- 2026-11-17 **L2 website** (same commit): `ConfigProvider` (GET /config → `useConfig`, `useSettings`), `catalog-hooks.ts` (tours, cars, group vehicles); every screen reads lists from the API (home offers/routes/holidays/FAQs, booking widget, ride panel, city map, saved places, bus cities/operators/routes/FAQs, help, offers); bus/holiday/self-drive/group screens show live estimates with the shared pricing and book via `api.quotes.create`; checkout shows the quote, checks coupons with the API (signs in first) and books with `quoteId` + `couponCode`; rides book with `rideId`; invoice GST rates and seller details, safety line, welcome credit and referral bonus come from settings; `lib/api/data.ts` deleted; `not-found.tsx` renders holidays/cars added after the build; mock API rebuilt on the shared seed + pricing (quotes, coupons, ride/bus generation). Fixed during the pass: holidays list and help FAQs stayed empty (memo deps), duplicate "Travellers" booking line (now "Traveller names").
  - Browser pass at 390 px against the local API: home lists from the API; holiday quote → HOLIDAY10 → paid ₹35,908 (API booking amount and coupon line match); bus 2 seats → quote with GST; cab paid from wallet (₹200 deducted, priced from the ride); self-drive and group estimates equal their quotes; holiday created via the admin API appears in the list and opens at its address on a wrangler-served build; unknown holiday → "not found"; demo (mock) build: holiday quote → sign-in → coupon → paid.
- 2026-11-17 **L2 admin UI** (commit "Admin L2: catalog and settings editors"): `/catalog` overview grouped by Rides/Bus/Holidays/Rentals/Marketing with visible/hidden counts and an owner-only "Reset to sample data" (confirm dialog); `/catalog/list?kind=` with search, show/hide switch, edit, delete (confirm); `/catalog/edit` generic form built from `CATALOG_DEFS` (text, long text, numbers, selects, theme chips, one-per-line lists, dates, visibility, order) with the shared validation; sidebar "Offers" opens the offer list; Settings page covers all 27 settings in 7 groups with the shared rules. Fixed during the pass: admin component classes moved into `@layer components` (utilities like `w-56`/`pl-9` were being overridden); duplicated label in settings errors; offer description now says changes apply within 30 s.
  - Browser pass (desktop and 390 px): edited Goa's price → public `/tours/goa-beach-holiday` served it at once; hid BUS150 → gone from `/config` → shown again; duplicate tour slug → "Another holiday package already uses that web address"; nights > days caught before saving; surge hours "25-30" refused before saving; welcome credit 750 saved and served by `/config` (then restored); no sideways overflow on overview, list, edit and settings at 390 px. Smoke: customer 126, admin 67, all pass.
- 2026-11-17 L2 PR #9 opened (stacked on #8).
- 2026-11-17 **L3** (branch `feat/admin-l3`): API `services/admin/bookings.ts` (search with q/status/service/India-time dates, detail with wallet entries, coupon and staff history, cancel with reason + wallet refund via the shared `cancelBookingRow`, complete), `services/admin/licences.ts` (queue by status, approve/reject pending only, reason stored as `licence_note`, audited with the number), `routes/admin/operations.ts`. Admin: `/bookings` (filters kept in the URL, table on desktop, cards on phones), `/bookings/view` (summary, customer, wallet, staff actions, cancel with `ReasonDialog`, mark completed), `/licences` (To review / Rejected / Approved, approve, reject with a reason the customer sees); dashboard queue links now live. Website: rejection message shows only the reviewer's reason. Admin smoke grows to 96 checks (bookings search/filter/detail, staff cancel refunds the wallet, 409s, licence reject → customer sees reason → resubmit → approve, content role 403s); customer smoke 126.
  - Browser pass: customer submits licence on the website (390 px) → staff reject in admin (desktop; reason required) → the account page shows "Not approved: <reason>" without reloading → resubmit → staff approve → website shows Verified; staff find the customer's wallet ride by phone, cancel with a reason → wallet ₹300 → ₹500, booking history shows the reason, customer's My Trips lists it under Cancelled; bookings list, detail and licences fit at 390 px. Fixed during the pass: booking filters overlapped at desktop width and were tall on phones (now two rows on desktop, paired controls on phones, labelled dates).
- Next: owner merges #8 → #9 → #10, then release (migrations 0004 + 0005, API, owner account, smoke, website, admin). Then Phase 3 (Flutter).

## Released: Part A (accounts) + B1–B4 ✅

PR #6, deployed 2026-11-16. Sign-up step; `/account` with profile, change number, saved places, saved travellers, emergency contacts, wallet history, delete account (30-day grace), sign out everywhere; safety centre (SOS sheet, `/track` share links, auto-share night rides); driving-licence check; printable GST invoices; referral codes. 94 smoke checks; browser-checked at 390 px and desktop. Full log: `git show 43f8350:docs/roadmap.md`.

## Backlog (agreed ideas, not scheduled)

- Phase 5 items above (customers screen, booking notes, SOS in admin, team screen, CSV export)
- Cloudflare Access in front of the admin address (free ≤ 50 users) when a custom domain exists, or earlier if the `workers.dev` toggle is available
- `packages/ui` if a third web app appears (admin copies `tokens.css` and a few primitives from the website for now)
- Partner portals (bus operators, car owners) if the client lets others list on QuikFly
- Live dispatcher map (rides are simulated); support tickets; payouts
- B5 Ride scheduling (book for later)
- B6 Free reschedule for bus and holiday bookings (redBus FlexiTicket)
- B7 Self-serve "Modify booking" for rentals (Zoomcar)
- B8 Women-only bike option (Rapido Bike Pink)
- B9 Save partner applications to the API; point the "Google Play" button at the APK
- Light-mode logo: needs a file from the owner or client
- After client sign-off (paid): SMS OTP, payment gateway, real maps, live tracking, Play Store listing, custom domain, Truecaller/Google login, EMI, ride insurance
