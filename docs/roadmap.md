# Roadmap and progress

Goal: a live client demo of the website and an Android app on one API, at ₹0 (see [decisions.md](decisions.md)).

Legend: ✅ done · 🔄 in progress · ⬜ not started

## Phases

| Phase | Status | Notes |
|---|---|---|
| 1. API (Workers + Hono + D1) | ✅ | Live. PR #4 |
| 2. Website on Cloudflare | ✅ | Live. Demo fixes in PR #5 (ride completion, real wallet, bus times, date strip, rental defaults, cancel errors, holiday tabs) |
| 2b. Complete the web version: accounts + competitor features | ✅ | Live. PR #6, deployed 2026-11-16 (migration 0003) |
| 2c. Admin panel (lean) + everything from the API | 🔄 | Branch `feat/admin`, one PR per slice. Tracker below |
| 3. Flutter Android app (`apps/mobile`) | ⬜ | Signed APK shared by link; same API. Can start once L2 is live (catalog, settings and prices come from the API) |
| 4. Demo hardening | ⬜ | Rehearse: edit a price in admin → see it on the web and the phone → book → cancel → refund. "Reset catalog" (L2) covers most of "reset demo data" |
| 5. Admin, full | ⬜ | The parts cut from the lean plan: customers screen (wallet adjust, suspend, sign out everywhere, cancel deletion), booking notes, SOS alerts in admin, team screen, CSV export |

## Current task: lean admin panel (L1–L3) 🔄

Requested 2026-11-16. Owner chose the **lean** plan: prove the model end to end (edit data in admin → website and app show it → book → cancel → refund) before the Flutter app; the rest of the admin comes after the client demo (Phase 5).

Decisions (details in [decisions.md](decisions.md)): separate app `apps/admin` on its own Worker; admin login by email + password (the customer demo OTP is public); fixed roles with a permission map in `packages/shared`; every admin write is audited; catalog and business settings move into D1 so admin edits reach the website and the app; prices are computed by the API (quotes), not by the website; licences need manual approval, with an auto-approve setting for unattended demos; detail-page URLs stay as they are (pre-built for known items, the 404 page renders new ones from the API).

### Feature tracker

| ID | Slice | Shared | API | Admin UI | Website | Smoke | Browser |
|---|---|---|---|---|---|---|---|
| L1 | Foundation: `apps/admin` scaffold, admin login + sessions + lockout, roles/permissions, audit log, `create-admin` script, dashboard (bookings, revenue, cancellations, new customers; by service; by day; queues; latest bookings) | ✅ | ✅ | ⬜ | n/a | ✅ | ⬜ |
| L2 | Data from the API: catalog (places, ride options, drivers, tours, rental cars, group vehicles, cities, bus operators, popular routes, FAQs) and settings (fares, surge, bus fares, welcome credit, referral bonus, GST rates, licence auto-approve, invoice company details, helpline) in D1; public `GET /config`; server-side quotes for every service; website reads everything from the API (loading states, detail pages for new items via the 404 page); admin catalog + settings editors; reset catalog to seed; settings cache in the Worker | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| L3 | Operations-lite: bookings (search, filter, detail, cancel + wallet refund, complete); licence queue (approve / reject with reason, customer sees it, resubmit); coupons in D1 checked by the API at quote/booking (expiry, min amount, max discount, uses per customer) with an offers editor | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

Each slice: typecheck → smoke (`smoke.mjs` + `smoke-admin.mjs`) → browser pass at 390 px and desktop → docs + memory → PR → merge → migrate → deploy API → wait 60 s → production smoke → deploy web + admin.

### Work log

- 2026-11-16 Plan agreed (lean). `packages/shared/src/admin.ts` (roles, `PERMISSIONS`, admin shapes), `settings.ts` (`Settings` + defaults); `LicenceStatus` gains `rejected` and a `note`.
- 2026-11-16 **L1 API** (commit "Admin L1: API"): migration `0004_admin.sql` (admin_users, admin_sessions, audit_log, settings, stored licence status); `lib/password.ts` (PBKDF2 via Web Crypto); `services/admin/{auth,audit,stats}.ts`, `services/settings.ts` (30 s cache); `middleware/admin.ts` `requireAdmin(permission)`; `routes/admin/index.ts` (login/logout/me, stats, settings, audit); licence submit now stores `pending` (or `verified` when `licenceAutoApprove` is on), the old 20 s simulation is gone; `scripts/create-admin.mjs`; `scripts/smoke-admin.mjs` (31 checks: login, same message for unknown email, lockout, role 403s, stats, settings validation, audit, setting reaches the customer licence flow). Customer smoke still 94/94.
- Next: `apps/admin` UI (login, dashboard, settings, audit), then website copy for the licence "under review / rejected" states.

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
