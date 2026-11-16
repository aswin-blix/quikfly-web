# Roadmap and progress

Goal: a live client demo of the website and an Android app on one API, at ₹0 (see [decisions.md](decisions.md)).

Legend: ✅ done · 🔄 in progress · ⬜ not started

## Phases

| Phase | Status | Notes |
|---|---|---|
| 1. API (Workers + Hono + D1) | ✅ | Live. PR #4 |
| 2. Website on Cloudflare | ✅ | Live. Demo fixes in PR #5 (ride completion, real wallet, bus times, date strip, rental defaults, cancel errors, holiday tabs) |
| 2b. Complete the web version: accounts + competitor features | 🔄 | **Current task.** See the tracker below. Branch `feat/accounts` |
| 3. Flutter Android app (`apps/mobile`) | ⬜ | Signed APK shared by link; same API |
| 4. Demo hardening | ⬜ | Reset-demo-data endpoint; rehearse booking on the phone and seeing it on the web |

## Current task: Part A (accounts) + B1–B4

Requested 2026-11-16. Scope came from a competitor review of Uber, Ola, Rapido, redBus, MakeMyTrip and Zoomcar. Branch: `feat/accounts` (not merged, not deployed).

### Feature tracker

| ID | Feature | Shared | API | Web | Mock | Smoke tests | Browser-checked |
|---|---|---|---|---|---|---|---|
| A1 | Sign-up step: after OTP, new users complete their profile (name, optional email, optional referral code) | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ |
| A2 | `/account` profile: edit name, email, gender, DOB | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| A3 | Change mobile number (OTP to the new number) | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| A4 | Saved places (Home, Work, other) + one-tap picks in the ride panel | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| A5 | Saved travellers + one-tap fill at checkout | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| A6 | Emergency contacts (max 3) | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| A7 | Wallet page: balance + labelled transaction history + refund timings | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| A8 | Delete account: OTP, 30-day grace, restored on sign-in, wallet-loss warning | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| A9 | Sign out of all devices | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| B1 | Safety centre: SOS sheet in a live ride (Call 112, safety line, alert contacts, share), public trip-tracking link `/track`, "auto-share night rides" switch | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| B2 | Driving-licence check before self-drive (pending → verified, simulated) | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| B3 | Printable tax invoice from My Trips (`/invoice`), with GST details saved in the account and applied at checkout | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| B4 | Referral code: each user has one; applying a friend's code gives both ₹100 wallet credit (once) | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |

### Work log (by layer)

**Shared (`packages/shared`)**: ✅
- [x] `types.ts`: extended `User` (email, gender, dob, profileComplete, referralCode, referred, licence, gst, autoShareNightRides); `ProfileUpdate`, `AuthResult` (isNew, restored), `SavedPlace`, `Traveller`, `EmergencyContact`, `WalletTransaction`, `SharedRide`
- [x] `rules.ts`: `LIMITS`, `REFERRAL_BONUS`, `DELETION_GRACE_DAYS`, `LICENCE_REVIEW_SECONDS`, `SHARE_LINK_HOURS`, `NIGHT_HOURS`, `RIDE_SIMULATION`, `PATTERNS` (phone, email, GSTIN, licence, referral code), helpers

**API (`apps/api`)**: ✅ (94 smoke checks pass, 3 runs in a row, local)
- [x] Migration `0003_accounts.sql`: user columns, `saved_places`, `travellers`, `emergency_contacts`, `wallet_transactions` (+ opening-balance backfill), `ride_shares`
- [x] `services/wallet.ts`: ledger statement helper, transaction list
- [x] `services/auth.ts`: full `toUser`, referral code on sign-up, welcome-credit entry, `isNew` / `restored`, 30-day restore-or-erase, deleted users rejected
- [x] `services/account.ts`: profile update (a name completes sign-up), phone change, sign out everywhere, delete, referral, licence
- [x] `services/saved.ts`: places, travellers, contacts with limits
- [x] `services/bookings.ts`: write ledger rows on wallet debit and refund; `getBooking`
- [x] `services/share.ts`: create share token for a ride; public read
- [x] `routes/me.ts`: `PATCH /me`, `POST /me/phone/otp`, `POST /me/phone`, `POST /me/logout-all`, `POST /me/delete`, `POST /me/referral`, `PUT /me/licence`, `GET|POST /me/places`, `DELETE /me/places/:id`, the same for `/me/travellers` and `/me/contacts`, `GET /me/wallet`
- [x] `routes/auth.ts`: verify returns `AuthResult`
- [x] `GET /bookings/:id`, `POST /rides/:id/share`, `GET /share/:token`
- [x] Smoke tests for every new endpoint (incl. deletion grace restore, referral twice, limits)
- [x] `apps/api/README.md` endpoint table

**Web (`apps/web`)**: 🔄 next
- [x] Contract + `http.ts` + `mock.ts` for all new endpoints (mock split into `mock-store.ts`, `mock-account.ts`, `mock.ts`)
- [x] Login modal (`components/LoginModal.tsx`): phone → OTP → "complete your profile" (name, optional email, optional referral code) for new users; "account restored" message
- [x] `lib/account.ts`: section list, labels, safety numbers, refund timings; `WELCOME_CREDIT` moved to shared rules
- [ ] `/account` page: overview + sections (Profile, Saved places, Travellers, Safety, Wallet, Refer & earn, Driving licence, Business / GST, Security). Mobile shows a list, desktop a sidebar. Add to the SPA router
- [ ] Header and account sheet link to `/account` (the header button currently signs out on click)
- [ ] Ride panel: saved-place chips; SOS / safety sheet; Share trip (link + Web Share); auto-share at night
- [ ] `/track?t=` public page (map + driver + progress)
- [ ] Checkout: saved-traveller chips, GST invoice option, licence card for self-drive (replaces the checkbox)
- [ ] My Trips: "Invoice" link; `/invoice?id=` printable page with print styles (hide header, footer, nav)

**Verification and release**: ⬜
- [ ] `npm run typecheck`, smoke ×2 locally
- [ ] Browser pass at 390 px, light and dark, for every new screen
- [ ] PR → merge → `db:migrate:remote` → deploy → production smoke test

## Backlog (agreed ideas, not scheduled)

- B5 Ride scheduling (book for later)
- B6 Free reschedule for bus and holiday bookings (redBus FlexiTicket)
- B7 Self-serve "Modify booking" for rentals (Zoomcar)
- B8 Women-only bike option (Rapido Bike Pink)
- B9 Save partner applications to the API; point the "Google Play" button at the APK
- Light-mode logo: needs a file from the owner or client
- After client sign-off (paid): SMS OTP, payment gateway, real maps, live tracking, Play Store listing, custom domain, Truecaller/Google login, EMI, ride insurance
