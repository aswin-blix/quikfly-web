# QuikFly client demo script

For whoever presents the demo. It shows one system working end to end: staff change something in the **admin panel**, customers see it on the **website** and the **Android app**, they book, and money moves correctly through the wallet. About 15–20 minutes. Rehearsed on production on 2026-11-17 (see `docs/roadmap.md`, Phase 4).

## Links

| What | Where |
|---|---|
| Website | https://quikfly-web.quikfly-api.workers.dev |
| Admin panel | https://quikfly-admin.quikfly-api.workers.dev (owner account) |
| Android app (latest APK) | https://github.com/aswin-blix/quikfly-web/releases/latest/download/QuikFly-arm64.apk |

## Before the demo (the day before, then again 30 minutes before)

- [ ] **Phone:** QuikFly app installed (Android Settings → Apps → QuikFly shows the version: **0.1.16** or newer), charged, notifications silenced. Install it beforehand; don't download it live.
- [ ] **Demo customer:** decide which account the phone uses.
  - *New-customer moment:* sign out and sign up live with a demo number such as **+91 90000 00100** (any 10-digit number works; OTP **1234**). It starts with **₹500** in the wallet.
  - *Existing account:* check its wallet balance is enough for the bookings below (a bus seat is about ₹450).
- [ ] **Laptop:** admin panel signed in (sessions last 12 hours) in one tab, website in another. Zoom the browser so the room can read it.
- [ ] **Time of day:** ride fares are **×1.2 during 8–10 am and 5–8 pm** (surge). Fine to show ("demand pricing"), just don't be surprised by it.
- [ ] **Settings (admin → Settings):** "Approve licences automatically" must be **off**, or the licence approval moment won't happen. Welcome credit ₹500.
- [ ] **Licence:** the account you'll use for self-drive should not already be verified if you want to show approval. (The owner's own account was verified during the rehearsal.)
- [ ] **Network:** test the phone on the venue Wi-Fi *and* mobile data; keep the faster one.
- [ ] Note any price or offer you plan to change, so you can put it back afterwards.

## The demo

Times are what the rehearsal measured.

### 1. One platform, three screens (2 min)
Show the website home page and the app home screen side by side: same services, same offers, same holiday prices. *"There's one system behind both. The admin panel controls what customers see."*

### 2. Staff change a price, customers see it (2 min)
1. Admin → **Catalog → Holiday packages → Goa Beach Holiday**: change "Price per adult" (for example ₹14,499 → ₹13,999), **Save changes**.
2. Refresh the website's Goa page and pull down to refresh the app's holiday list: the new price shows. In the rehearsal it showed within about a second; allow **up to 30 seconds** (the API caches).
3. Optional: Admin → **Offers**, switch an offer off; it disappears from the website and the app's Offers tab. Switch it back on.

### 3. A new customer (2 min)
On the phone: **Login** → mobile number → OTP **1234** → name → account created with **₹500** in the wallet. *"OTP is fixed for the demo: no SMS is sent. A real SMS provider plugs in later."*

### 4. A cab ride (2 min)
Car Ride → pick a destination (for example Chennai Airport) → fares for Mini, Sedan, SUV, Prime → choose **QuikFly wallet** → **Book**. A driver is assigned with a ride OTP, drives to the pickup (about 9 s) and completes the trip (about 12 s). Mention **Share** (live trip link) and **SOS** (112, safety line, alert emergency contacts). *"The driver and map are simulated for the demo."*

Don't press Share during the demo unless you mean to: it opens the phone's share sheet (WhatsApp etc.).

### 5. Staff cancel, instant wallet refund (3 min)
A ride finishes by itself after about 20 seconds, so show refunds with a booking that stays upcoming:
1. On the phone: **Bus Booking** → Chennai → Bengaluru → a **non-AC** bus → pick one seat (about ₹450) → checkout → pay with **QuikFly wallet**.
2. Admin → **Bookings**: it's at the top. Open it → **Cancel booking** → type a reason → confirm.
3. On the phone: My Trips (pull down to refresh) shows it under **Cancelled**, and Account → Wallet shows the **refund straight away**.

(BUS150 needs a ticket of ₹999 or more, so don't use it on a single cheap seat.)

### 6. Holiday with a coupon, and the invoice (3 min)
Tour Packages → a package → adults/children (the total updates as you change them) → **Book now** → checkout → **See offers for this booking** → **Use HOLIDAY10** (10% off, up to ₹5,000) → **Continue to payment** → UPI → **Pay**. Booking confirmed → **Invoice** shows the GST split. *"Card, UPI and net banking are simulated: no money moves. A payment gateway plugs in after sign-off."*

### 7. Self-drive and licence approval (3 min) — the strongest moment
1. On the phone: Account → **Driving licence** → number `TN09 20190001234` (sample format) → a future expiry date → **Submit licence** → "Under review".
2. Admin → **Licence reviews**: it's there. Either:
   - **Reject** with a reason → within about 5–7 seconds the phone shows "Not approved: <your reason>" on its own → on the phone, **Submit again** → then
   - **Approve** → within about 7 seconds the phone shows **Verified**, no refresh needed.
3. Optional: Rent a Car → a car → self-drive → the quote with km plan, protection and deposit.

### 8. The admin view (2 min)
Admin **Dashboard**: bookings, revenue and cancellations by day and by service, queues. Show the **Audit log**: every staff change (the price edit, the cancel, the licence decision) recorded with who and when.

Optional, support (1 min): on the website **Help** page → **Request a callback** (or in the app: Account → Support tickets → New ticket). Admin → **Support**: it's under "Waiting for us"; open it and send a reply. The customer sees the reply in the app with a notification. *"Replies stay inside QuikFly for now; WhatsApp and SMS replies are paid add-ons after sign-off."* Set the WhatsApp number in admin → Settings beforehand if you want the WhatsApp buttons to show.

### 9. Getting the app (1 min)
Website home → **Download for Android**: the signed APK from GitHub Releases. *"Not on Google Play yet; that comes after sign-off. Updates install over the old version and keep the customer signed in."*

### Optional: a bus parcel (3 min; only where parcels are switched on)

Not on production until an app release shows parcels: until then run it on a local API, or leave it out.
1. Website → **Parcels** → Chennai → Coimbatore → a departure → weight, value, receiver, declaration → **Continue** → wallet → **Pay**.
2. **My Trips** → the parcel → **Share tracking link**, or scan the QR on a phone: the timeline shows first names only.
3. Admin → **Parcels** → the parcel → **Receive at counter → Load on bus → Mark reached → Ready for collection**. No need to wait for the bus.
4. The code appears on the sender's My Trips (reload). *"The sender passes it on; SMS comes after sign-off."*
5. Admin → **Hand over** → type the code → **Collected**; the sender earns credits.

## What's simulated, and what to say

| Area | In the demo | Say |
|---|---|---|
| OTP | Fixed code 1234, no SMS | "SMS provider after sign-off." |
| Payments | Card / UPI / net banking succeed without a gateway; the **wallet is real** within the demo (debits and refunds) | "Payment gateway after sign-off." |
| Rides and map | Driver assigned automatically, drawn map, trip runs in about 20 s | "Live tracking and maps after sign-off." |
| Bus timetable | Generated from routes (same search gives the same buses) | "Operator inventory connects later." |
| Parcels | Transit follows the timetable (labelled), no SMS to the receiver | "Counters and SMS after sign-off." |
| Alerts to emergency contacts | Labelled "demo: no SMS sent" | — |

## Things to avoid during the demo

- Cancelling a ride from admin while the ride screen is open on the phone: the phone's ride keeps playing.
- Trying to cancel a ride after the trip started (the app refuses, correctly, but it breaks the flow).
- Booking with too little wallet balance (the wallet option is disabled; switch to UPI).
- Expecting an admin edit to show instantly: allow up to 30 seconds.

## Existing data in the admin panel

Production still holds test traffic from development (test numbers +91 90000 00001 and +91 90000 00002, and the owner's rehearsal bookings). It shows in the dashboard totals, the bookings list and the audit log. The owner chose to keep it (see `docs/decisions.md`). Describe it as "earlier test bookings".

## If something goes wrong

- **Phone network slow:** switch Wi-Fi ↔ mobile data; or continue the same step on the website on the laptop.
- **App stuck or shows an error:** pull down to refresh; or close and reopen the app (sign-in is kept).
- **Admin signed out:** sign in again (sessions last 12 hours).
- **API unreachable (no internet at all):** open the single-file offline demo of the website on the laptop (`apps/web`, `npm run build:demo` in Git Bash, produces `quikfly-demo.html`; it runs on built-in sample data). Build it before the day.

## After the demo

- Put back any price or offer you changed (Admin → Catalog).
- Bookings made during the demo stay; that's fine (the owner keeps production data).
