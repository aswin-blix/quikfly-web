# Family and business profiles (Phase 5 #12): design

Status: **designed 2026-11-21, not started.** Nothing of this is in the code yet. The design below was settled after reading the booking, refund, share and account code, so the next session can build it without re-deriving it. The pricing step 7 toll follow-up (chauffeur rentals) is folded in because it touches the same admin "Mark completed" path.

Branch to use: `feat/phase5-12-profiles` from `main`. Build in a scratchpad worktree (see [operations.md](operations.md)); the main folder may be on a release branch the owner builds from.

## 1. What it does

**Family.** One person (the *payer*) adds family members by mobile number, gives each a name ("Amma", "Arjun"), an optional monthly limit in ₹, and a "follow their rides" switch. The member sees the invitation in Account → Family and accepts or declines; either side can end it at any time. From then on:

- at checkout the member can choose **"Pay from <payer>'s wallet"** (wallet payment only). The API checks the membership and the month's room, debits the payer's wallet, writes the payer's wallet row ("Paid for Arjun · Mini Chennai Central → Egmore") and tells the payer;
- refunds, deposit returns, toll settlements, bus seat-cancel refunds and reschedules go back to **whoever paid**;
- every ride the member books is **auto-shared** with payers who follow their rides (the existing share link); the payer gets a notification with the link and sees the member's live rides in Account → Family.

**Business.** The existing Business section (GSTIN on invoices) gains a **monthly GST statement**: one consolidated page per month with every booking's taxable value, CGST and SGST, printable like an invoice, and a list of months to pick from.

Not in scope now (noted so they aren't rediscovered): a family card on the admin customer page; a "destination lock" for family members; "Book again" from a past trip; a separate business account type (the business is the person's own account with a GSTIN, as today).

## 2. Data

Migration `apps/api/migrations/0028_family.sql` (the parcel plan's migration moves to 0029):

```sql
CREATE TABLE family_members (
  id TEXT PRIMARY KEY, payer_id TEXT NOT NULL REFERENCES users(id),
  member_phone TEXT NOT NULL,          -- normalised like users.phone
  member_user_id TEXT,                 -- set when the number has an account (at invite if found, else at accept)
  label TEXT NOT NULL, status TEXT NOT NULL,   -- invited | active | declined | removed
  monthly_limit INTEGER NOT NULL DEFAULT 0,    -- ₹ per India-time calendar month; 0 = no limit
  share_rides INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, accepted_at TEXT, updated_at TEXT NOT NULL,
  UNIQUE (payer_id, member_phone)
);
CREATE INDEX family_by_member ON family_members (member_user_id, status);
CREATE INDEX family_by_phone ON family_members (member_phone, status);
ALTER TABLE bookings ADD COLUMN paid_by TEXT;   -- the payer's user id; NULL = paid by the customer
CREATE INDEX bookings_by_payer ON bookings (paid_by, created_at) WHERE paid_by IS NOT NULL;
```

"Spent this month" is computed, never stored: the sum of `bookings.amount` where `paid_by` = payer, `user_id` = member, `status <> 'cancelled'`, in the India-time month of `created_at` (`substr(date(substr(created_at,1,19), '+330 minutes'), 1, 7)`, the same shift `businessDate()` in `config.ts` uses).

## 3. Shared package

- `packages/shared/src/family.ts`: `FAMILY_RULES` (`maxMembers` 6, `labelMin` 2, `labelMax` 30, `monthlyLimitMax` 50_000), `FAMILY_STATUSES`, types `FamilyMember` (payer's view, with `spentThisMonth`), `FamilyPayer` (member's view, with `remainingThisMonth`), `FamilyLiveRide` (share token, pickup, drop, status), `FamilyView { month, members, payers, liveRides }`, `FamilyMemberInput`, and `checkFamilyLabel()` / `checkMonthlyLimit()` so the apps validate early with the API's values.
- `packages/shared/src/gst.ts`: `gstSplit(amount, rate)` with the same rounding as the website invoice (`apps/web/src/lib/invoice.ts`, mirrored in `apps/mobile/lib/core/invoice.dart`); `StatementSummary`, `StatementRow`, `MonthlyStatement`, `STATEMENT_MONTH` regex, `STATEMENT_MONTHS` = 24.
- `types.ts`: `NewBooking.paidBy?: string` (payer user id), `Booking.paidBy: { id, name } | null`; `NOTIFICATION_KINDS` += `family.invite`, `family.joined`, `family.ride`, `family.paid`.
- Export both new files from the package index.

## 4. API

**Routes** (all `requireUser`): `GET /me/family` → `FamilyView`; `POST /me/family` (add by phone) ; `PATCH /me/family/:id` (label, limit, share switch; payer only); `DELETE /me/family/:id` (payer removes or member leaves; same endpoint); `POST /me/family/:id/accept` and `/decline` (the invited person). `GET /me/statements` → `StatementSummary[]` for the last 24 months with bookings; `GET /me/statements/:month` → `MonthlyStatement` (rows use each booking's own GST rate from `bookings.terms`, so old bookings keep the rate they were sold under).

**`services/family.ts`:** `familyView`, `addMember` (normalise the phone with the auth helper; refuse the payer's own number; count invited+active against `maxMembers`; `INSERT … ON CONFLICT (payer_id, member_phone) DO UPDATE` so a removed or declined number can be invited again; link `member_user_id` if the number already has a live account and notify them), `updateMember`, `removeMembership` (payer or member), `respondToInvite` (links the account, notifies the payer), `assertPayer(memberId, payerId, amount)` (active membership and monthly room, with a clear message naming the limit and what's left), `ridePayers(memberId)` for the auto-share.

**Bookings (`services/bookings.ts`):** `createBooking` with `paidBy` requires payment method `wallet`; after `assertPayer`, the wallet balance condition, the debit `UPDATE users …`, and the `wallet_transactions` payment row all use the payer's id (same single `db.batch()`), the note says who it was for, the `INSERT INTO bookings` adds `paid_by`, and the payer gets `family.paid`. `BookingRow` gains `paid_by`; `toBooking` joins the payer's name (or a second query) for `Booking.paidBy`. Then, for ride bookings, `ridePayers()` → `shareRide()` once per following payer and a `family.ride` notification carrying `/track?t=<token>`.

**Refunds go to whoever paid**: replace `row.user_id` with `COALESCE(paid_by, user_id)` (or read `paid_by ?? user_id` on the row) in `cancelBookingRow` and `completeBookingRow` (`bookings.ts`), the seat-cancel refund and the reschedule wallet check and credit (`bus-changes.ts`), the extension debit (`rentals.ts`) and the toll refund in `services/admin/bookings.ts`. The customer still sees the booking under My Trips; the money line in their wallet history is absent and the booking says "Paid by <name>".

**Auth, privacy, notifications:** `exportData()` includes `family_members` where the person is payer or member; `eraseAccounts()` marks the person's rows `removed` and clears `member_phone`/`member_user_id` (bookings keep `paid_by`, an id only). The privacy notice names "family links: the number and name you add, who pays for whom, and the ride links shared" and bumps `PRIVACY_NOTICE.version` (everyone agrees again). Notification icons: website `NotificationsScreen` icon map gets the four kinds; the app falls back to the bell icon already, add icons when convenient.

**Toll follow-up (pricing step 7):** `adminComplete` for a chauffeur rental (service `rent`, quote `request.mode === "driver"`) accepts `tollsActual` with no estimate (treat the estimate as 0: the whole amount is recorded as owed, as for group trips over the estimate), `AdminBookingDetail.tollsOptional: true` for such bookings, and the admin "Mark completed" dialog shows the tolls input as optional when `tollsOptional` is set (today it shows it only when `tollEstimate !== null`).

**Smoke:** `smoke.mjs` adds a second test user as a member: invite (own number refused, 7th refused), accept, booking paid by the payer (limit exceeded refused, payer's wallet and ledger move, member's don't), cancel refunds the payer, ride auto-share notification, decline/leave paths, statements list and one month's totals equal the sum of its rows. `smoke-admin.mjs`: chauffeur rental completed with and without tolls.

## 5. Website

- Contract/http/mock: `family.view/add/update/remove/accept/decline`, `statements.list/month`, `paidBy` on `bookings.create`. The mock keeps a `family` array in localStorage and a fixed "demo payer".
- Account → **Family** (new `ACCOUNT_SECTIONS` id `family`, i18n keys `sectionFamily` / `sectionFamilyHint` in all three `.arb` files: ta "குடும்பம்", hi "परिवार"): members list with spent/limit bars, add sheet (phone, name, limit, follow switch), invitations I received (accept/decline), who pays for me with what's left, live rides to follow (opens `/track?t=`).
- Checkout (`CheckoutScreens.tsx`): when the signed-in person has active payers, a "Who pays" choice: "My wallet" or "<payer>'s wallet (₹X left this month)"; only with wallet payment. Confirmation and trip detail say "Paid by <name>".
- Business → **Monthly statements**: list of months, each opening `/statement?month=YYYY-MM` (new `src/app/statement/page.tsx` + `SpaApp.tsx` entry) laid out like `InvoiceScreen.tsx` with a print button.
- Notification icons for the four kinds; 390 px and dark-mode check in headless Chrome.

## 6. App (customer flavour only)

`models.dart` (FamilyMember, FamilyPayer, FamilyLiveRide, FamilyView, StatementSummary, MonthlyStatement, `Booking.paidBy`), `api.dart` (same seven endpoints + `paidBy` on booking), Account → Family section (`account_sections.dart` and the `link(...)` tile in `account_screen.dart`; route `/account/family` already works through `/account/:section`), checkout payer choice, statements screen under Business with route `/statement/:month`, `flutter gen-l10n` after the `.arb` edits, contract test for family and statements. The Partner app gets none of this.

## 7. Docs when done

API README rows (7 family, 2 statements), web/admin/mobile READMEs, `docs/privacy.md` table (family links in export and erasure), `docs/decisions.md` (payer's wallet is the ledger of record; refunds follow the payer; monthly limit by India-time month; statements use each booking's own rate), roadmap: Phase 5 row, candidate 12 ✅, backlog toll line removed, work log entry. Parcel plan migration number → 0029.

## 8. Open points for the owner (defaults chosen; say if different)

1. Up to **6** members per payer and a **₹50,000** cap on the monthly limit.
2. A family payment needs the **member's own account** (the payer can't book on their behalf; that is the existing travellers feature).
3. Following rides is **on by default** when adding a member and the member sees that it is on; they can leave at any time.
4. Statements are **per person** (the GSTIN holder's own bookings), not per company with several travellers.
