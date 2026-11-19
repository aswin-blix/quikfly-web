# Admin settings and pricing audit

Audit of every tunable business value in QuikFly, how each service is priced, and what staff can change in the admin panel. **Stage 1 (inventory and findings)** is below. Stage 2 (research and recommendations) is added after the owner reviews this.

- **Date:** 2026-11-19. **Code:** `main` at `2eb8cc0` (after PR #94). No app code was changed.
- **Read first:** [AGENTS.md](../AGENTS.md), [roadmap.md](roadmap.md), [decisions.md](decisions.md). Findings that touch a recorded decision name it.
- **Method:** read the shared rules, the API services and routes, the admin forms, and searched the website, admin and Flutter screens for prices and policy text. Traced two changes end to end on a **local** API (section 4). The settings table in 2.1 was generated from the source, so its file:line, defaults and limits match the code.

### What was not checked

- **No browser pass.** The Chrome extension wasn't connected, and an admin `next dev` that this session didn't start already held `apps/admin` (port 3101, pointed at a local API on :8795 that isn't running). It wasn't stopped. The website's ride fare and the admin forms were checked **in code**, not on screen. The website dev server did start against the local API (port 3021).
- **The Flutter app wasn't run.** Its fare path was checked in code and in `test/api_contract_test.dart`.
- **Production wasn't touched.** All API calls went to a local Worker on port 8821 (port 8787 was held by a `workerd` this session didn't start). The local D1 has a new owner login `audit-owner@example.com`, a test customer, and two trace bookings, both cancelled. Both changed values were put back.
- **Legal claims** (MVAG 2025 surge base, GST rates, state rules) are quoted as the code states them. Stage 2 checks them against sources.

---

## 1. Summary

**What works well.** One `Settings` object (91 values) drives the API, the website and the app. The API checks every value against `SETTING_RULES`. Every setting and catalog change is audited with before and after values. The API sets every price. A quote holds its price for 30 minutes and a ride keeps its fare, so changing a price never changes a booking already made (section 4).

**Main problems.**

1. **Some rules are applied with today's settings to bookings made earlier.** This covers cancellation refunds, ride cancellation fees, self-drive deposit deductions and invoice GST. If staff tighten a policy or change a rate, customers who booked under the old terms get the new terms. (H1–H3)
2. **Self-drive damage isn't capped at the excess the car page promises** (₹10,000 Standard, ₹2,000 Peace of mind). Staff can deduct up to ₹1,00,000. (H4)
3. **GST is handled two ways.** Bus and holidays add GST on top of the price. Rides, rentals and group travel include it. The holiday page says its price *includes* GST, but the quote adds 5% on top. Changing `gstRent` or `gstGroup` changes no price, only how the invoice splits it. (H5, M1)
4. **Pricing can't vary where operators need it.** There is one surge for all ride types and every day. One bus fare applies to every route, whatever the distance. There is no minimum fare, night fare, airport fee, toll or zone, and no scheduled price change. (M2–M5)
5. **The admin Settings page is one long form of 91 fields.** It has no search, no fare preview, no warnings when values conflict (a multiplier above the cap, Peace cheaper than Standard), no per-setting history and no reset to default. The content role can change every catalog price. (M6–M9, L-items)

---

## 2. Inventory

### 2.1 Runtime settings (`packages/shared/src/settings.ts`)

All 91 keys have an admin row in `apps/admin/src/lib/settings-fields.ts`. None is missing, and none is unread.

- **Who can change:** owner only (`settings.edit`, `packages/shared/src/admin.ts:24`). Every role can view them (`dashboard.view`).
- **Where they're stored:** the D1 `settings` table, over `DEFAULT_SETTINGS`. They're cached 30 s per isolate (`apps/api/src/services/settings.ts:4`). `GET /v1/config` serves them to the website and the app.
- **Audit:** a `settings.update` row with before and after values (`apps/api/src/routes/admin/index.ts:56-66`).

**How to read "Read by":** these are files that name the key. "Shared fn (API)" means a shared function the API runs uses it, e.g. `gstRate()`, `priceRent()` or `rentalSettlement()`. The website and app invoices read **every** GST rate through `gstRate()` (`apps/web/src/lib/invoice.ts:13`, `apps/mobile/lib/core/invoice.dart:23`), even where the table shows only "app".

| Setting | File:line | Default | Admin group → label | Validation (SETTING_RULES) | Services | Read by |
|---|---|---|---|---|---|---|
| `serviceBike` | settings.ts:13 | true | Services → Bike taxi | on/off | That service | shared fn (API), app |
| `serviceCar` | settings.ts:14 | true | Services → Cabs | on/off | That service | shared fn (API), web, app |
| `serviceBus` | settings.ts:15 | true | Services → Bus tickets | on/off | That service | shared fn (API), app |
| `serviceTours` | settings.ts:16 | true | Services → Holidays | on/off | That service | shared fn (API), app |
| `serviceRent` | settings.ts:17 | true | Services → Rent a car | on/off | That service | shared fn (API), app |
| `serviceGroup` | settings.ts:18 | true | Services → Group travel | on/off | That service | shared fn (API), app |
| `servicePausedMessage` | settings.ts:20 | "This service is paused for now. Please check back soon." | Services → Message for a paused service | text, 5–160 chars | That service | shared fn (API), web, app |
| `featureRideScheduling` | settings.ts:22 | true | Features → Book rides ahead | on/off | That feature | shared fn (API), web, app |
| `featureMultiStop` | settings.ts:23 | true | Features → Extra stops on rides | on/off | That feature | shared fn (API), web, app |
| `featureCashRides` | settings.ts:24 | true | Features → Cash for rides | on/off | That feature | shared fn (API), web, app |
| `featureOutstation` | settings.ts:25 | true | Features → Outstation and one-way trips | on/off | That feature | shared fn (API), web, app |
| `featureSelfDrive` | settings.ts:26 | true | Features → Self-drive | on/off | That feature | shared fn (API), web, app |
| `featureTripOffers` | settings.ts:27 | true | Features → Add a cab to a trip | on/off | That feature | shared fn (API), web, app |
| `featureReferral` | settings.ts:28 | true | Features → Refer and earn | on/off | That feature | API, web, app |
| `featureRidePass` | settings.ts:30 | true | Features → QuikFly Pass on sale | on/off | That feature | shared fn (API), app |
| `featureWomenOnlyRides` | settings.ts:32 | true | Features → Women-only rides | on/off | That feature | API, web, app |
| `featureLanguages` | settings.ts:34 | false | Features → Tamil and Hindi | on/off | That feature | web, app |
| `licenceAutoApprove` | settings.ts:37 | false | Licence checks → Approve licences automatically | on/off | Self-drive, chauffeur | API, app |
| `welcomeCredit` | settings.ts:40 | ₹500 | Wallet → Welcome credit | ₹0–5000, whole | Wallet | API, web, app |
| `referralBonus` | settings.ts:42 | ₹100 | Wallet → Referral bonus | ₹0–5000, whole | Wallet | API, web, app |
| `surgeMultiplier` | settings.ts:45 | 1.2 × | Rides → Surge multiplier | 1–3 (decimals) | Bike, auto, cab | shared fn (API), app |
| `surgeHours` | settings.ts:47 | "8-10, 17-20" | Rides → Surge hours | text ≤60 chars + pattern; hours 0–23, start ≤ end | Bike, auto, cab | shared fn (API), web, app |
| `surgeCap` | settings.ts:49 | 2 × | Rides → Surge cap | 1–3 (decimals) | Bike, auto, cab | shared fn (API), web, app |
| `passPrice` | settings.ts:52 | ₹99 | Rides → QuikFly Pass price | ₹0–2000, whole | Bike, auto, cab | API, web, app |
| `passDays` | settings.ts:53 | 30 days | Rides → QuikFly Pass length | 1–365, whole | Bike, auto, cab | shared fn (API), API, web, app |
| `rideCancelFeePercent` | settings.ts:56 | 10 % | Rides → Rider cancellation fee | 0–100, whole | Bike, auto, cab | shared fn (API), web, app |
| `rideCancelFeeCap` | settings.ts:57 | ₹100 | Rides → Cancellation fee cap | ₹0–1000, whole | Bike, auto, cab | shared fn (API), web, app |
| `rideCancelFreeMinutes` | settings.ts:59 | 2 min | Rides → Free cancellation window | 0–30, whole | Bike, auto, cab | shared fn (API), web, app |
| `rideStopMinutes` | settings.ts:62 | 3 min | Rides → Wait per stop | 0–15, whole | Bike, auto, cab | shared fn (API), web, app |
| `rideScheduleMinMinutes` | settings.ts:65 | 30 min | Rides → Schedule at least | 5–240, whole | Bike, auto, cab | shared fn (API), web, app |
| `rideScheduleMaxDays` | settings.ts:66 | 30 days | Rides → Schedule up to | 1–90, whole | Bike, auto, cab | shared fn (API), web, app |
| `rideScheduleFreeCancelMinutes` | settings.ts:68 | 60 min | Rides → Scheduled ride: free cancel until | 0–1440, whole | Bike, auto, cab | shared fn (API), web, app |
| `busFareAc` | settings.ts:71 | ₹650 | Bus fares → AC base fare | ₹0–10000, whole | Bus | shared fn (API) |
| `busFareNonAc` | settings.ts:72 | ₹420 | Bus fares → Non-AC base fare | ₹0–10000, whole | Bus | shared fn (API) |
| `busSleeperExtra` | settings.ts:73 | ₹250 | Bus fares → Sleeper extra | ₹0–5000, whole | Bus | shared fn (API) |
| `busLowerDeckExtra` | settings.ts:75 | ₹50 | Bus fares → Lower-deck extra | ₹0–2000, whole | Bus | shared fn (API) |
| `gstRides` | settings.ts:78 | 5 % | GST → Rides (bike, auto, cab) | 0–100, whole | Bike, auto, cab | shared fn (API), web, app |
| `gstBus` | settings.ts:79 | 5 % | GST → Bus | 0–100, whole | Bus | shared fn (API), web, app |
| `gstTours` | settings.ts:80 | 5 % | GST → Holidays | 0–100, whole | Holidays | shared fn (API), web, app |
| `gstRent` | settings.ts:81 | 18 % | GST → Self-drive and chauffeur cars | 0–100, whole | Self-drive, chauffeur | shared fn (API), app |
| `gstGroup` | settings.ts:82 | 5 % | GST → Group travel | 0–100, whole | Group, outstation | shared fn (API), app |
| `busRescheduleHours` | settings.ts:85 | 6 hrs | Bus fares → Bus change closes | 0–72, whole | Bus | shared fn (API), API, app |
| `busRescheduleFee` | settings.ts:86 | ₹0 | Bus fares → Bus change fee | ₹0–1000, whole | Bus | shared fn (API), app |
| `tourChildPercent` | settings.ts:89 | 60 % | Holidays and rentals → Child price | 0–100, whole | Holidays | shared fn (API), web, app |
| `rentUnlimitedKmExtraPercent` | settings.ts:92 | 25 % | Holidays and rentals → Unlimited km extra | 0–200, whole | Self-drive, chauffeur | shared fn (API), API, web, app |
| `rentProtectionStandardPerDay` | settings.ts:93 | ₹199 | Holidays and rentals → Standard protection per day | ₹0–5000, whole | Self-drive, chauffeur | shared fn (API), API, web, app |
| `rentProtectionPeacePerDay` | settings.ts:94 | ₹399 | Holidays and rentals → Peace-of-mind protection per day | ₹0–5000, whole | Self-drive, chauffeur | shared fn (API), API, web, app |
| `rentDoorstepFee` | settings.ts:95 | ₹299 | Holidays and rentals → Doorstep delivery fee | ₹0–5000, whole | Self-drive, chauffeur | shared fn (API), web, app |
| `rentDeposit` | settings.ts:97 | ₹2000 | Holidays and rentals → Self-drive deposit | ₹0–50000, whole | Self-drive, chauffeur | shared fn (API), web, app |
| `rentDepositRefundHours` | settings.ts:99 | 48 hrs | Holidays and rentals → Deposit back within | 1–720, whole | Self-drive, chauffeur | web, app |
| `rentLimitedKmPerDay` | settings.ts:101 | 140 km | Holidays and rentals → Limited plan km per day | 10–2000, whole | Self-drive, chauffeur | shared fn (API), app |
| `rentExtraKmRate` | settings.ts:102 | ₹12 | Holidays and rentals → Extra km rate | ₹0–500, whole | Self-drive, chauffeur | shared fn (API), app |
| `rentDriverNightCharge` | settings.ts:104 | ₹250 | Holidays and rentals → Chauffeur night charge | ₹0–5000, whole | Self-drive, chauffeur | shared fn (API), web, app |
| `rentFuelChargePerEighth` | settings.ts:106 | ₹500 | Holidays and rentals → Fuel charge per 1/8 tank | ₹0–5000, whole | Self-drive, chauffeur | shared fn (API) |
| `rentLateGraceMinutes` | settings.ts:108 | 30 min | Holidays and rentals → Late return grace | 0–240, whole | Self-drive, chauffeur | shared fn (API) |
| `rentLateFeePercent` | settings.ts:110 | 150 % | Holidays and rentals → Late return fee | 100–500, whole | Self-drive, chauffeur | shared fn (API) |
| `rentExtendMaxHours` | settings.ts:112 | 48 hrs | Holidays and rentals → Longest extension | 1–168, whole | Self-drive, chauffeur | shared fn (API), web, app |
| `rentDocuments` | settings.ts:114 | "Driving licence held for at least 1 year; Aadhaar or passport; Driver aged 21 or over" | Holidays and rentals → Self-drive documents | text, 3–300 chars | Self-drive, chauffeur | shared fn (API), app |
| `rentRoadsideAssistance` | settings.ts:116 | false | Holidays and rentals → Roadside assistance contract | on/off | Self-drive, chauffeur | web, app |
| `groupLocalKmPerDay` | settings.ts:119 | 80 km | Holidays and rentals → Group local km per day | 10–500, whole | Group, outstation | shared fn (API), web, app |
| `groupOneWaySurchargePercent` | settings.ts:121 | 15 % | Holidays and rentals → One-way surcharge | 0–100, whole | Group, outstation | shared fn (API), web, app |
| `groupDriverNightAllowance` | settings.ts:123 | ₹250 | Holidays and rentals → Driver night allowance | ₹0–5000, whole | Group, outstation | shared fn (API), web, app |
| `cancelPolicyBus` | settings.ts:130 | "12h:100, 4h:50" | Cancellation policies → Bus | tier text, ≤80 chars, checkCancelPolicy() | Bus | shared fn (API), app |
| `cancelPolicyTours` | settings.ts:131 | "15d:100, 7d:50" | Cancellation policies → Holidays | tier text, ≤80 chars, checkCancelPolicy() | Holidays | shared fn (API), app |
| `cancelPolicyRent` | settings.ts:132 | "24h:100" | Cancellation policies → Self-drive and chauffeur cars | tier text, ≤80 chars, checkCancelPolicy() | Self-drive, chauffeur | shared fn (API), app |
| `cancelPolicyGroup` | settings.ts:133 | "48h:100" | Cancellation policies → Group travel | tier text, ≤80 chars, checkCancelPolicy() | Group, outstation | shared fn (API), app |
| `creditsRides` | settings.ts:136 | 5 % | QuikFly Credits → Rides (bike and cab) | 0–50, whole | Bike, auto, cab | shared fn (API), web, app |
| `creditsBus` | settings.ts:137 | 2 % | QuikFly Credits → Bus | 0–50, whole | Bus | shared fn (API), web, app |
| `creditsTours` | settings.ts:138 | 3 % | QuikFly Credits → Holidays | 0–50, whole | Holidays | shared fn (API), web, app |
| `creditsRent` | settings.ts:139 | 3 % | QuikFly Credits → Rent a car | 0–50, whole | Self-drive, chauffeur | shared fn (API), web, app |
| `creditsGroup` | settings.ts:140 | 3 % | QuikFly Credits → Group travel | 0–50, whole | Group, outstation | shared fn (API), web, app |
| `creditsCap` | settings.ts:142 | ₹150 | QuikFly Credits → Most per booking | ₹0–5000, whole | All (credits) | shared fn (API), web, app |
| `creditsExpiryDays` | settings.ts:144 | 60 days | QuikFly Credits → Expiry | 1–365, whole | All (credits) | API, web, app |
| `creditsMaxRedeemPercent` | settings.ts:146 | 50 % | QuikFly Credits → Most of a booking | 0–100, whole | All (credits) | shared fn (API), API, web, app |
| `vendorJoiningFee` | settings.ts:149 | ₹1000 | Partners → Joining fee | ₹0–50000, whole | Partners | API, web, app |
| `vendorMaxVehicleAgeYears` | settings.ts:150 | 8 years | Partners → Oldest vehicle accepted | 1–20, whole | Partners | API, web, app |
| `vendorAuditAddress` | settings.ts:151 | "QuikFly partner hub, Chennai" | Partners → Vehicle audit address | text, 5–200 chars | Partners | web, app |
| `vendorExpiryWarnDays` | settings.ts:153 | 30 days | Partners → Document expiry warning | 1–90, whole | Partners | API, app |
| `vendorCommissionPercent` | settings.ts:155 | 20 % | Partners → Commission on partner trips | 0–20, whole | Partners | shared fn (API) |
| `vendorMinPayout` | settings.ts:157 | ₹500 | Partners → Smallest payout | ₹0–10000, whole | Partners | API |
| `companyName` | settings.ts:160 | "QuikFly Mobility Pvt. Ltd." | Company and safety → Legal name | text, 2–120 chars | All | shared fn (API), web, app |
| `companyAddress` | settings.ts:161 | "Chennai, Tamil Nadu, India" | Company and safety → Address | text, 2–240 chars | All | shared fn (API), web, app |
| `companyGstin` | settings.ts:162 | "33AAACQ0000A1Z5" | Company and safety → GSTIN | text ≤15 chars + pattern | All | web, app |
| `companyEmail` | settings.ts:163 | "support@quikfly.in" | Company and safety → Support email | text ≤120 chars + pattern | All | web, app |
| `companyPhone` | settings.ts:164 | "1800 123 4567" | Company and safety → Support phone | text, 6–30 chars | All | web, app |
| `privacyOfficerName` | settings.ts:166 | "QuikFly Grievance Officer" | Privacy (DPDP) → Grievance Officer name | text, 2–80 chars | All | shared fn (API) |
| `privacyOfficerEmail` | settings.ts:167 | "privacy@quikfly.in" | Privacy (DPDP) → Grievance Officer email | text ≤120 chars + pattern | All | shared fn (API) |
| `privacyOfficerPhone` | settings.ts:168 | "044 4000 1234" | Privacy (DPDP) → Grievance Officer phone | text, 6–30 chars | All | shared fn (API) |
| `inactivityEraseDays` | settings.ts:170 | 1095 days | Privacy (DPDP) → Close unused accounts after | 0–3650, whole; 0 or ≥180 | All | shared fn (API), API |
| `safetyLine` | settings.ts:172 | "1800 123 4567" | Company and safety → 24×7 safety line | text, 3–30 chars | All | web, app |
| `whatsappNumber` | settings.ts:174 | "" | Company and safety → Support WhatsApp number | text ≤20 chars + pattern | All | shared fn (API), web, app |

### 2.2 Catalog prices staff edit (`packages/shared/src/catalog-kinds.ts`)

13 kinds live in one `catalog_items` table (decision 2026-11-16).

- **Who can change:** `catalog.edit` and `offers.edit`, both granted to **owner, operations and content** (`admin.ts:22-23`).
- **Audit:** every create, update, hide or delete writes an audit row in the same `db.batch()` (`apps/api/src/services/catalog.ts:108-153`).
- **Cache:** 30 s per isolate (`CATALOG_CACHE_MS`, `catalog.ts:12`).

The table lists only fields that change a price or the bill. Text fields are left out.

| Kind → field | catalog-kinds.ts | Seed example | Validation | Used in price | Read by |
|---|---|---|---|---|---|
| rideOption → `baseFare` | :101 | Mini ₹50 | int ₹0–2,000 | `rideQuotes()` pricing.ts:111 | API; web/app show it (`/config`) |
| rideOption → `perKm` | :102 | Mini ₹14 | number 0–500 | same | same |
| rideOption → `perMin` | :103 | Mini ₹1.2 | number 0–100 | same; minutes come from a fixed speed (see 2.3) | same |
| rideOption → `service` | :98 | bike / car | select | which speed and switch apply; autos use `bike` | API |
| rideOption → `riders` | :105 | everyone / women | select | who may book (women-only) | API, web, app |
| place → `x`, `y` | :89-90 | 0–100 | int | distance = map units × 0.32 km | API |
| tour → `price` | :147 | Goa ₹14,499 | int ₹0–20,00,000 | `priceTour()` per adult; child = `tourChildPercent` | API, web, app |
| departure → `price` | :166 | optional | int ₹0–20,00,000 or empty | overrides the package price | API |
| departure → `seats` | :165 | 1–200 | int | sold-out check inside the booking batch | API |
| departure → `tourId` | :162 | "t9" | text ≤20, **not checked against real packages** | — | API |
| rentalCar → `pricePerHour` | :179 | ₹0–10,000 | int | `priceRent()`; unlimited km × (1 + `rentUnlimitedKmExtraPercent`) | API, web, app |
| rentalCar → `driverPerDay` | :179 | ₹0–10,000 | int | chauffeur days | same |
| travelVehicle → `perKm` | :191 | 0–1,000 | number | `priceGroup()` | API, web, app |
| travelVehicle → `minKmPerDay` | :192 | 0–2,000 | int | billed km floor | same |
| travelVehicle → `driverBataPerDay` | :193 | ₹0–10,000 | int | bata per day | same |
| travelVehicle → `localPackage` | :194 | ₹0–1,00,000 | int | local trips per day | same |
| groupDestination → `km` | :202 | 1–3,000 | int, "km from Chennai" | billed km | API, web, app |
| offer → `percent` | :213 | 1–100 | int; **100 means "flat amount up to the max"** | `couponDiscount()` pricing.ts:332-338 | API; web/app list offers |
| offer → `maxDiscount` | :214 | ₹0–1,00,000 | int | cap | same |
| offer → `minAmount` | :214 | ₹0–10,00,000 | int | minimum booking | same |
| offer → `validUntil` | :215 | optional date | date | expiry (India date) | same |
| offer → `perUserLimit` | :216 | optional 1–100 | int | uses per customer; **no total budget or total-uses cap** | same |

### 2.3 Values that are code only (not runtime settings)

These need a code change and a deploy. Only values that change a price, a limit a customer meets, or a policy are listed.

| Name | File:line | Value | Effect | Read by |
|---|---|---|---|---|
| `RIDE_SIM.minDistanceKm` | pricing.ts:12 | 1.5 km | shortest billed ride: an **implicit minimum fare** | API (shared) |
| `RIDE_SIM.kmPerMapUnit` | pricing.ts:14 | 0.32 | demo map → km | API |
| `RIDE_SIM.speedKmh` | pricing.ts:15 | bike 24, car 20 | billed minutes = distance ÷ speed, so per-minute is really a second per-km rate; autos use the bike speed | API |
| `RIDE_SIM.pickupBufferMin` | pricing.ts:16 | 3 min | **added to every ride's billed minutes** (pricing.ts:110) | API |
| `BUS_SIM.randomExtra` | pricing.ts:34 | up to ₹400 | random add-on per generated bus | API |
| `BUS_SIM.types` (layouts, amenities) | pricing.ts:26-32 | 5 types | which buses have sleepers (and so the sleeper extra) | API |
| `BOOKING_LIMITS` | pricing.ts:46-52 | bus 6 seats, tours 12, rent min 4 h / max 30 days, group max 15 days | `rentMinHours` is a **billing minimum** (4 h) | API, web, app |
| `DRIVER_NIGHT_WINDOW` | pricing.ts:65 | 22:00–06:00 | when `rentDriverNightCharge` applies | API |
| `QUOTE_TTL_MINUTES` | pricing.ts:72 | 30 | how long a quote's price holds | API |
| `RENTAL_RULES` | rental.ts:23-33 | start 60 min early, extensions [1…48 h], `damageMax` ₹1,00,000 | damage deduction ceiling | API, admin |
| `TDS_194O_PERCENT` | vendor.ts:202 | 0.1 % | partner earnings (law) | API |
| `tripEarnings()` | vendor.ts:209-215 | fare ÷ (1 + GST) − commission − TDS | treats ride and group fares as GST-inclusive | API |
| `RIDE_SCHEDULE.startWindowMinutes` | rules.ts:20 | 15 | when a scheduled ride can start | API, web, app |
| `RIDE_MAX_STOPS` | rules.ts:23 | 2 | stops per ride | API, web, app |
| `RIDE_CANCEL_REASONS[].waivesFee` | rules.ts:32-40 | 3 of 6 waive | which reasons avoid the MVAG fee | API, web, app |
| `NIGHT_HOURS` | rules.ts:44 | 22–6 | auto-share at night (safety, not price) | web, app |
| `DEPARTURE_FILLING_SEATS` / `DEPARTURE_BOOK_UNTIL_DAYS` | holidays.ts:6, :9 | 5 / 1 day | "filling fast" badge; booking cut-off | API, web, app |
| `TICKET_VALID_HOURS_AFTER_DEPARTURE` | bus-changes.ts:18 | 12 | m-ticket validity | API |
| `BUSINESS_TZ_OFFSET` / `BUSINESS_UTC_OFFSET_MIN` | cancellation.ts:22, config.ts:12 | +05:30 | surge hour, coupon dates, refund countdown | API |
| `CATALOG_CACHE_MS` / `SETTINGS_CACHE_MS` | api services/catalog.ts:12, services/settings.ts:4 | 30 s | how long edits take to reach every isolate | API |
| `INACTIVITY_MIN_DAYS` | settings.ts:272 | 180 | floor for `inactivityEraseDays` | API, admin |
| Invoice CGST/SGST split | web invoice.ts:16, app invoice.dart:26 | always intra-state (Tamil Nadu) | no IGST for other states | web, app |

### 2.4 Hard-coded business values in screens

Display formatting and test data are left out.

| Text / value | Where | Should come from |
|---|---|---|
| Protection excess "You pay up to ₹10,000 / ₹2,000 for damage" | web `RentScreens.tsx:121`; app `rent_screens.dart:34` | a setting per plan, **enforced** at settlement (H4) |
| "Per person … **including GST**" | web `HolidayScreens.tsx:272`; app `holiday_screens.dart:591` | contradicts the quote, which adds GST (H5) |
| Children are "5–11" | web `HolidayScreens.tsx:272, :308`; app `holiday_screens.dart:464, :591` | a setting, or a field per package |
| Holiday "Not included" list | web `HolidayScreens.tsx:265` | a tour catalog field |
| "Fuel & tolls on actuals" (chauffeur) | web `RentScreens.tsx:205`; app `rent_screens.dart:439` | policy text in Settings; nothing in the price or booking tracks them |
| "Tolls, parking & state permits paid on actuals" (group) | web `TravelRentalsScreen.tsx:57`; app `group_screen.dart:119` | same |
| Group local "8 hr / N km per day" (hours fixed at 8) | web `TravelRentalsScreen.tsx:54` | a setting beside `groupLocalKmPerDay` |
| "2,500+ operators" | app `bus_screens.dart:63` | removed from the website in T4 (roadmap) but **still in the app** |
| "at half the price of a cab", "under 5 minutes" | web `RideScreen.tsx:26`; app `ride_screen.dart:601`; `app_en.arb:27` | marketing claims with nothing behind them (low) |
| Home mock-up "Book Mini · ₹313" | web `HomeScreen.tsx:338` | illustration; can disagree with real fares (low) |
| App fallback defaults for 60+ settings | app `models.dart:645-763` | a hand copy of `DEFAULT_SETTINGS`, used only when a key is missing; can drift |

---

## 3. Pricing per service

✅ = staff change it in admin. 🔧 = code only. — = doesn't exist.

| Part | Bike / auto | Cab | Bus | Holidays | Self-drive | Chauffeur | Group / outstation |
|---|---|---|---|---|---|---|---|
| Base / fixed | ✅ `baseFare` per ride type | ✅ same | ✅ `busFareAc`/`NonAc` (**same on every route**) + 🔧 random ≤₹400 | ✅ package or departure price | — | — | ✅ `localPackage` per day (local) |
| Per km | ✅ `perKm` | ✅ | — | — | ✅ extra km `rentExtraKmRate` (at settlement) | — (unlimited) | ✅ `perKm` |
| Per minute / hour | ✅ `perMin` × 🔧 minutes from fixed speed + 3 min | ✅ | — | — | ✅ `pricePerHour` | ✅ `pricePerHour` | — |
| Minimum | 🔧 1.5 km floor only | 🔧 same | — | — | 🔧 4 h | 🔧 4 h | ✅ `minKmPerDay`, ✅ `groupLocalKmPerDay` |
| Night | — | — | — | — | — | ✅ `rentDriverNightCharge` (🔧 22–06) | ✅ `groupDriverNightAllowance` |
| Surge / demand | ✅ one multiplier, ✅ hours, ✅ cap: **same for every type and day** | ✅ same | — | — | — | — | — |
| Tolls / parking / airport | — | — | — | — | — | text only "on actuals" | text only "on actuals" |
| Extras | ✅ wait per stop | ✅ | ✅ sleeper, lower deck | ✅ child % | ✅ protection ×2, doorstep, unlimited km % | ✅ driver/day, doorstep | ✅ one-way %, bata |
| Deposit | — | — | — | — | ✅ `rentDeposit` | — | — |
| GST | ✅ rate; **included** in fare | ✅ included | ✅ **added on top** | ✅ **added on top** | ✅ rate; included (invoice only) | ✅ included (invoice only) | ✅ included (invoice only) |
| Cancellation | ✅ MVAG fee %, cap, free minutes | ✅ | ✅ tiers | ✅ tiers | ✅ tiers (deposit always back) | ✅ tiers | ✅ tiers |
| Partner share | ✅ `vendorCommissionPercent` (one value for all) | ✅ | — | — | — | — | ✅ (staff-assigned) |

**Formulas as coded:**

- **Rides** (`pricing.ts:103-117`): fare = round((base + perKm × km + perMin × min) × surge). Here min = km ÷ speed × 60 + 3 + stops × `rideStopMinutes`, and surge = min(multiplier, cap) inside the surge hours. Surge multiplies the **whole fare**, not only the base. Whether MVAG 2025 caps surge on the base fare is for Stage 2 to check. QuikFly Pass removes the surge.
- **Bus** (`pricing.ts:134-135, 191-198, 223-226`): seat = AC/non-AC base (+ sleeper extra on sleeper buses) + random ≤ ₹400, rounded to ₹10. Lower-deck berths add `busLowerDeckExtra`; upper berths on seater/sleeper buses add the sleeper extra. GST is added on top.
- **Holidays** (`pricing.ts:231-239`): adults × price + kids × price × `tourChildPercent`, then GST on top.
- **Self-drive and chauffeur** (`pricing.ts:256-274`): hours (at least 4) × price per hour (× unlimited uplift), plus protection per day (self-drive) or driver per day (chauffeur), the night charge (chauffeur), doorstep delivery and the deposit (self-drive). No GST line.
- **Group** (`pricing.ts:304-324`):
  - Local: package × days.
  - Round trip: max(2 × km, minKm × days) × perKm + bata × days + night allowance × (days − 1).
  - One way: max(km, minKm) × perKm × (1 + one-way %) + one day of bata.
  - No GST line.

---

## 4. Two changes traced end to end (local only)

**Setup:**

- `npm run db:migrate:local` (nothing new to apply).
- `wrangler dev --port 8821`, because :8787 was held by another process.
- `create-admin.mjs --local` owner.
- Website: `next dev --port 3021` with `NEXT_PUBLIC_API_URL=http://localhost:8821/v1`.

The calls were made with a script against the API (the same calls the admin panel makes).

| Step | Result |
|---|---|
| Before | `gstBus` 5. Cab "Mini": base ₹50, ₹14/km, ₹1.2/min. Ride quote, scheduled 12:30 tomorrow (no surge): **₹397** (19.5 km, 62 min). Bus quote, 1 seat: ₹690 + GST (5%) ₹35 = **₹725** |
| Customer acts before the change | Created a ride (fare locked at ₹397) and kept the ₹725 bus quote |
| Change 1 (setting) | `PATCH /admin/settings {gstBus: 12}` → `/config` shows 12 at once |
| Change 2 (catalog) | `PUT /admin/catalog/rideOption/mini` perKm 14 → 19 → `/config` shows 19 at once |
| New quotes | Ride **₹495** (= 50 + 19 × 19.5 + 1.2 × 62, as expected). Bus ₹690 + GST (12%) ₹83 = **₹773** |
| Old quote and ride | Booking with the old bus quote charged **₹725**. Booking the old ride charged **₹397** (new quote ₹495) |
| Audit | `settings.update {before: {gstBus: 5}, after: {gstBus: 12}}` and `catalog.update rideOption/mini` with the full before and after |
| Cleanup | Both trace bookings cancelled by staff; `gstBus` 5 and perKm 14 restored and confirmed through `/config` |

**What reaches the customer:**

- **Website** (code):
  - The ride panel shows the API's `/rides/quote` fare (`RidePanel.tsx:124`). Bus and holiday checkout show the API quote (`BusScreens.tsx:340`, `HolidayScreens.tsx:204`).
  - Self-drive and group pages show a **local estimate** from `priceRent()`/`priceGroup()` using `/config` (`RentScreens.tsx:141`, `TravelRentalsScreen.tsx:38`). They fetch the API quote only at "Book".
  - `/config` loads once per page load (`ConfigProvider.tsx:22`). A tab left open keeps showing old estimates until reload. The price charged is the new quote, and nothing tells the customer the price moved.
- **App** (code): every estimate comes from the API (`api.dart:233`, `:262`), as decided on 2026-11-17. Config reloads when the app resumes (`main.dart:34`). The contract test checks surge ≤ `surgeCap`, a positive rent GST rate and the chauffeur night line (`api_contract_test.dart:31, 58, 137`). It doesn't compare the app's fallback defaults with `DEFAULT_SETTINGS`.
- **Caches:** on the isolate that made the change, it applies at once (the cache is cleared). Other isolates keep the old value for up to 30 s. A quote made there holds that old price for 30 more minutes, so a price **cut** can take up to about 30.5 minutes to reach every booking.
- **Existing bookings:** prices never change (confirmed above). Refunds, cancellation fees, deposit deductions and invoices **do** use today's settings (H1–H3).

---

## 5. Findings

### High

**H1. Cancellation refunds use the policy in force when the customer cancels, not when they booked.**
- Code: `refundFor()` reads `getSettings()` and `cancelPolicyFor(settings, …)` at cancel time (`apps/api/src/services/bookings.ts:277-288`). Bookings store `startsAt` but not the policy.
- Scenario: a customer books a holiday shown "free cancellation up to 15 days". Staff change `cancelPolicyTours` to `30d:100, 15d:50`. The customer cancels 20 days out and gets 50%, not 100%. Ride cancellation fees work the same way (`rideCancelFee(settings, …)`, `:283`).
- The admin help says "Bookings made earlier keep the policy's current tiers" (`settings-fields.ts:108`), which hides this.
- Decision 2026-11-18 (cancellation policies as settings) chose the setting design but didn't decide how existing bookings are treated. Fixing this doesn't reverse it.

**H2. The self-drive settlement uses today's settings, not the booking's.**
- Code: `settlementPreview()` passes `await getSettings(db)` (`apps/api/src/services/rentals.ts:193`). `rentalSettlement()` then applies the current `rentLimitedKmPerDay`, `rentExtraKmRate`, `rentLateGraceMinutes`, `rentLateFeePercent` and `rentFuelChargePerEighth` (`rental.ts:124-133`).
- The booking stores only the hourly rate and protection per day (`bookings.ts:98-106`).
- Scenario: a customer books with "140 km/day, ₹12/km beyond". Staff raise the rate to ₹18 before the return. The deposit deduction uses ₹18.

**H3. Invoices split GST at today's rate.**
- Code: `invoiceFor()` uses `gstRate(settings, b.service)` with the current settings (`apps/web/src/lib/invoice.ts:13-16`, `apps/mobile/lib/core/invoice.dart:23-26`). Bookings don't store the rate or the tax.
- Scenario: change `gstRent` 18 → 12 and every old self-drive invoice re-prints with a different taxable value and tax.
- For self-drive, the refundable deposit is inside `b.amount`, so GST is backed out of the deposit too (taxable value overstated).
- Decision 2026-11-16 ("invoices are printable pages… revisit when real GST invoicing is needed") applies. This is a correctness issue inside that decision, not a reversal.

**H4. Damage deductions aren't capped at the protection excess the customer bought.**
- The car page promises "You pay up to ₹10,000 / ₹2,000 for damage" (`RentScreens.tsx:121`, `rent_screens.dart:34`).
- Settlement accepts any damage up to `RENTAL_RULES.damageMax` ₹1,00,000 (`rentals.ts:198`, `rental.ts:31`). The admin form caps at the same (`RentalReview.tsx:47`).
- The excess isn't stored or checked anywhere: an overcharge risk.

**H5. The holiday page says the price includes GST, but the quote adds GST on top.**
- The text: "Per person, twin sharing, including GST (5%)" (`HolidayScreens.tsx:272`, `holiday_screens.dart:591`).
- What happens: `priceTour()` adds a `GST (5%)` line on top (`pricing.ts:238`), and the page's own estimate does too (`HolidayScreens.tsx:197`). A ₹14,499 package costs ₹15,224 per adult.

### Medium

**M1. GST works two ways, and the GST settings don't say which.**
- Bus and holidays: GST is added (`gstLine`, `pricing.ts:218-221`).
- Rides, self-drive, chauffeur and group: the fare is treated as GST-inclusive. Partner earnings divide by (1 + rate) (`vendor.ts:211`), and invoices back the tax out.
- So changing `gstRent` or `gstGroup` changes **no price**, only the invoice split and partner earnings. Changing `gstBus` raises every bus fare (section 4: ₹725 → ₹773).
- The admin help ("Added to bus and holiday prices, and used to split the tax on invoices", `settings-fields.ts:118`) is right but easy to miss. The GST fields have empty help (`:120-124`).

**M2. One surge for every ride type, city and day.**
- `surgeMultiplier`, `surgeHours` and `surgeCap` are global (`settings.ts:45-49`), and `surgeAt()` ignores the weekday (`pricing.ts:93-95`).
- Staff can't surge cabs without surging bikes, set weekend hours, or run a lower cap in one state (decision 2026-11-18 mentions Maharashtra's 1.5× draft).

**M3. Bus base fare doesn't depend on the route.**
- `busFareAc`/`busFareNonAc` are one national value (`pricing.ts:134`), so Chennai → Bangalore costs the same as a much longer route.
- There's no per-route or per-operator fare (the `popularRoute` and `busOperator` kinds carry none), and no weekend or festival uplift. The random ≤ ₹400 (`pricing.ts:34`) isn't controllable.

**M4. Ride fares have no explicit minimum, night or airport charge, toll, or waiting charge.**
- The only floor is the 1.5 km minimum distance (`pricing.ts:12`).
- 3 pickup minutes are billed on every ride (`pricing.ts:16, :110`), and billed minutes come from a fixed speed, so per-minute isn't time-based.
- Autos are a `bike` ride type and use the bike speed.

**M5. No scheduled or seasonal price changes, and no per-partner commission.**
- Every change is live within 30 s, so a festival fare or a policy change has to be typed in at the moment.
- `vendorCommissionPercent` is one value for all partners and vehicle types (`settings.ts:155`).
- Self-drive and group have no weekday/weekend or season rates; `rentalCar` and `travelVehicle` carry one rate each.

**M6. No cross-field validation.** `checkSetting()` checks each key alone (`settings.ts:380-398`). These are all accepted:
- `surgeMultiplier` 2.5 with `surgeCap` 2: silently clamped to 2, and the admin form shows 2.5.
- Peace-of-mind protection cheaper than Standard.
- `busFareAc` below `busFareNonAc`.
- `creditsMaxRedeemPercent` 100 with a coupon: a ₹0 booking.
- A ride type with base, per km and per minute all ₹0: free rides (`catalog-kinds.ts:101-103`, min 0).
- A departure for a package id that doesn't exist (`:162`).

**M7. Validation ranges allow values the rules being followed forbid.**
- `surgeCap` max 3 (`settings.ts:308`), while decision 2026-11-18 and the admin help say MVAG allows 2×.
- `perMin` max ₹100/min and `perKm` max ₹500 (`catalog-kinds.ts:102-103`) are far above any real fare, so a typo goes through.
- Offer `percent` 100 means "flat amount", and with a high `maxDiscount` it makes bookings free (`pricing.ts:337`). There's no total budget or total-uses cap on an offer.

**M8. The content role can change every price.** `catalog.edit` and `offers.edit` include `content` (`admin.ts:22-23`), whose summary is "Catalog, offers and FAQs" (`admin.ts:11`). A content editor can change ride fares, package prices and rental rates, or create a 100% coupon. Nothing needs approval. Decision 2026-11-16 (fixed roles) says "revisit when more granular roles are needed".

**M9. Ride fares never expire.** A ride created with `POST /rides` keeps its fare with no time limit, and `ownRide()` checks only the owner and that it isn't cancelled (`rides.ts:129-134`). A ride created off-peak can be booked during surge at the off-peak fare. Each ride books once (`bookings_ride_once`, migration 0005). Quotes for other services expire after 30 min.

**M10. The settings audit isn't atomic.** `updateSettings()` commits, then `audit()` writes separately (`routes/admin/index.ts:58-65`). AGENTS.md rule 4 asks for `auditStatement` in the same `db.batch()`, as the catalog does. If the second write fails, a price change has no audit row.

### Low (admin usability and smaller risks)

- **L1. One long Settings page.** 91 fields in 12 groups (`settings-fields.ts`). It has no search, no jump links and no "changed from default" marker. The sticky bar shows "N unsaved changes" but not which ones, and nothing confirms them before save (`settings/page.tsx:93-100`).
- **L2. No fare preview.** Changing a surge, a per-km rate or a GST rate shows no example fare. The catalog edit form has no preview either (`catalog/edit/page.tsx`).
- **L3. No per-setting history or undo.** The audit log exists but is owner-only and separate (`/audit`). Settings can't be reset to default or rolled back to an earlier value. The catalog has only a whole-catalog "Reset to sample data".
- **L4. No bulk edit.** Raising all cab fares by 5% means editing each ride type.
- **L5. Mini-languages are easy to get wrong.** Surge hours `"8-10, 17-20"` are inclusive (8-10 covers 08:00–10:59) and cancellation tiers are `"15d:100, 7d:50"`. Both are validated, but staff see raw text, not a table.
- **L6. Missing units and help.** GST fields have empty help (`settings-fields.ts:120-124`). `rentLateFeePercent` min 100 isn't explained ("150 = 1.5×" is). Catalog money fields say only "In rupees". There's no example of the resulting fare.
- **L7. Estimates go stale on the website** (section 4). An open self-drive or group page shows old prices until reload, and checkout charges the new quote without a "price changed" note.
- **L8. The bookings hourly rate is taken at booking, not from the quote** (`bookings.ts:101-104`). If the car's price changed during the 30-minute quote, extensions and late fees use the newer rate. Hiding the car in that window makes the booking fail.
- **L9. Display-only promises.** `rentDepositRefundHours` is shown to customers, but nothing tracks it. The "on actuals" toll and fuel text has no field in a booking.
- **L10. App truthfulness.** "2,500+ operators" is still in the app (`bus_screens.dart:63`).
- **L11. Drift risk.** The app's fallback defaults are a hand copy of `DEFAULT_SETTINGS` (`models.dart:645-763`).

### Settings nobody reads

None. Every key is referenced outside its own definition. Five are display text only (no rule enforces them): `rentDepositRefundHours`, `rentDocuments`, `rentRoadsideAssistance`, `vendorAuditAddress` and the `company*` fields. `gstRent` and `gstGroup` change no price (M1).

---

## 6. Questions for Stage 2

1. Should existing bookings keep the terms they were sold under (policy, rental rates, GST rate)? This audit assumes yes. It is the usual consumer-law expectation; Stage 2 will check.
2. MVAG 2025: is the 2× cap on the base fare or the whole fare? What are the minimum-fare and night-fare rules, and how do Tamil Nadu, Karnataka and Maharashtra differ?
3. GST: should bus and holidays move to GST-inclusive display like the others, or the others to GST-added?
4. Does the owner want maker-checker (one role proposes a price, the owner approves) or simply narrower roles?

*Stage 2 (research, recommendations and the prioritised plan) will be appended here after review.*
