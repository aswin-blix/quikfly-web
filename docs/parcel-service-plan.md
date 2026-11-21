# Parcel service: research and implementation plan

How QuikFly adds parcels (send a package across town on a bike, or between cities with the bus network, the way KPN Parcel Service does) as a seventh service on the same API, website, admin panel and apps. Research first (sections 1–2), then the design (3–8), then the plan in steps the owner approves one at a time (9), then open decisions (10). **Nothing here is implemented yet.**

- **Date:** 2026-11-20. **Code:** `main` at `021b718` (after PR #112). No app code was changed.
- **Read first:** [AGENTS.md](../AGENTS.md), [roadmap.md](roadmap.md), [decisions.md](decisions.md). The plan keeps every recorded decision; where a step leans on one it names it.
- **Sources:** web research on 2026-11-20. KPN publishes no tariff or API, so its process is reconstructed from directory listings and tracking help sites and is marked unverified. Competitor prices are the figures their public pages showed that day and will drift.

---

## 1. Summary

**The opportunity.** QuikFly already has the two things a parcel service is built from: a bike fleet with drivers, OTPs and live (simulated) trips, and an intercity bus network with routes, timetables and counters in every city. Competitors sell these separately: Porter, Uber, Ola and Rapido sell the in-city bike courier; KPN, SRS and Parveen sell the counter-to-counter bus parcel; Porter Intercity, Delhivery and DTDC sell door-to-door across cities over days. A super app that offers all three under one wallet, one tracking page and one invoice is the gap.

**What to build.** One new service key `parcel` with two modes, priced by the API like everything else:

| Mode | Like | How it moves | Promise |
|---|---|---|---|
| **Quick parcel** (`city`) | Porter / Uber Parcel / Ola Parcel / Rapido | A bike or auto from the ride roster; the sender hands over with an OTP, the receiver signs for it with an OTP | Minutes to hours, same city, up to ~20 kg |
| **Bus parcel** (`intercity`) | KPN Parcel / SRS Logistics | Dropped at a QuikFly counter (or picked up by a Quick parcel leg), travels with a scheduled bus, collected at the destination counter with an OTP or delivered by a Quick parcel leg | Same or next day between cities on the bus map |

A door-to-door intercity parcel is simply a bus parcel with a Quick parcel leg at either end, grouped as a **trip** (the `tripId` mechanism bookings already have).

**What it reuses.** Quotes (`POST /quotes`), bookings and the atomic wallet, cancellation tiers, booking terms, credits, coupons, notifications, the public token page pattern (`/tickets/:token`, `/share/:token`), the rental lifecycle pattern (a `rentals` row beside the booking with states and photos), the catalog kinds, Settings with admin history, the audit log, and the ride simulation for the city leg.

**What is new.** A `parcels` table whose journey is a list of **legs** (a bike ride, a bus, a counter hold) in a `parcel_legs` table, an event timeline in `parcel_events`, a public tracking page by LR number, a price formula with weight slabs, a prohibited-items list and a sender declaration, a receiver (third-party personal data, so privacy work), counter handling in the admin panel, and a transit simulation for the demo, labelled as such.

**Built to last (section 3.5).** Every counter, rate and bus leg carries an **operator**, so the same code works whether QuikFly runs its own counters, aggregates KPN-style operators' parcel arms, or pays partner operators a share. The journey is legs, so counter-to-counter, door-to-door, city-only and later multi-hop are data, not new code. The simulation, staff actions and future operator APIs all drive the same leg transitions, so swapping the demo for the real thing changes one service file, no screens.

**Order of work (section 9).** Foundation and the intercity counter-to-counter flow first (that is the KPN product and the part no ride-hailing competitor has), then Quick parcel (cheap: it is a ride with a package instead of a passenger), then door pickup and delivery as trips, then the app, then counters and bus operators as partners. Each step ships on its own and is switched off by `serviceParcel` until the owner turns it on.

---

## 2. Competitor research

### 2.1 Bus-based parcel services (the KPN model)

| Operator | How booking works | Tracking | Pricing | Source (reliability) |
|---|---|---|---|---|
| **KPN Parcel Service / KPN Speed Parcel** (Salem; buses in TN, Puducherry, Kerala, Karnataka) | Walk in at a parcel counter beside the bus point (Madurai office listed 10 AM–10 PM). Fill a form with consignor and consignee details, hand over the parcel, get an **LR / docket number** on the receipt. Collection at the destination counter against the docket | Enter the docket number on a tracker page; statuses like "In Transit" (between KPN points) and "Reached Destination" | No published tariff: a route-specific quote at the counter, by route, weight and size. One aggregator claims 85% delivered within 24 h (unverified) | [Wikipedia](https://en.wikipedia.org/wiki/KPN_Travels), [trackingstatus.in](https://trackingstatus.in/kpn-parcel-service-tracking/), [magicpin listing](https://magicpin.in/Madurai/Avaniyapuram/Other/Kpn-Parcel-Service/store/1189796), [IndiaMART](https://www.indiamart.com/kpnparcel-service/) (directories and tracker sites, **unverified**) |
| **SRS Logistics** (freight and parcel arm of SRS Travels, about 5,000 vehicles in the south) | Counter booking; the tracking number is on the parcel-office receipt and is separate from a bus PNR | Tracker form by receipt number | Not published | [trackingstatus.in](https://trackingstatus.in/srs-logistics/), [indiapackrs](https://indiapackrs.com/srs-logistics-travels-tracking/) (**unverified**) |
| **Parveen Travels** | Counter booking | Tracker shows dispatch, estimated delivery, current location, delays | Not published | [transport-tracking.com](https://www.transport-tracking.com/parveen-travels-tracking-online/) (**unverified**) |

**What this tells us.** The bus-parcel category is still offline: no operator publishes a tariff, booking is a paper form at a counter, and tracking is a docket number typed into a web form. None of them has a consumer app. QuikFly's version should keep what customers already understand (a docket/LR number, counter hours, "reached destination") and add what they lack: an upfront price, booking from the phone, a tracking page with a timeline, an OTP at collection instead of a paper slip, and refunds to the wallet.

### 2.2 In-city bike parcel (the Porter model)

| Service | Weight | Price (public pages, 2026-11) | Notable rules | Source |
|---|---|---|---|---|
| **Porter two-wheeler** | Up to 20 kg | Base fare by city: Chennai from ₹32.50 for 1 km, Bengaluru ₹48, Mumbai ₹52.50 for 1 km, Delhi ₹60 for 2 km and 25 min; then by distance, time and locality, plus tolls and parking | Estimate before booking, live tracking, driver contact, cash / Porter credit / Paytm, same-day within 300 km of the city | [porter.in Chennai](https://porter.in/two-wheelers/chennai), [Delhi](https://porter.in/two-wheelers/delhi), [Mumbai](https://porter.in/two-wheelers/mumbai) |
| **Uber Parcel (bike)** | Up to 5 kg, must fit in a backpack; trucks up to 500 kg | Per delivery, varies by city (no figures) | Prohibited: alcohol, certain medicines, drugs, dangerous or illegal items; couriers may cancel on sight of a prohibited item; per-vehicle value limits; **items are not insured** | [Uber Hyderabad](https://www.uber.com/in/en/b/courier-services/hyderabad-telangana-in/), [Uber Mumbai](https://www.uber.com/in/en/b/courier-services/mumbai-maharashtra-in/) |
| **Ola Parcel** (Bengaluru, Oct 2023, electric scooters) | Not published (press assumed under 5 kg) | Slabs: ₹25 for 5 km, ₹50 for 10 km, ₹75 for 15 km, ₹100 for 20 km (+ ₹1 convenience) | Sender enters pickup, drop, weight and dimensions; 24×7; "don't send valuables, fragile or restricted items" | [Ola Electric newsroom](https://olaelectric.com/newsroom/ola-launches-ola-parcel), [Inc42](https://inc42.com/buzz/ola-launches-parcel-service-to-taken-on-swiggy-genie-dunzo) |
| **Rapido Box** (2020) and today's Rapido parcel | Not published | 2020: ₹35 for 2 km, then ₹15 per km | Person-to-person pick and drop on the bike fleet; the 2026 "Bus 5 Minute Me" campaign sells parcel delivery across 400+ cities | [YourStory](https://yourstory.com/2020/05/rapido-launches-delivery-service-rapido-box), [Campaign India](https://www.campaignindia.in/article/rapido-launches-bus-5-minute-me-campaign-with-khullar-g/506252) |
| **Swiggy Genie** | — | Distance-based | **Shut down** (suspended 2025, closed by Jan 2026) to focus on food and quick commerce; peaked at about 60 cities but never made money | [Entrepreneur India](https://india.entrepreneur.com/news-and-trends/swiggy-shuts-down-genie-to-focus-on-core-services/491167), [Business Today](https://www.businesstoday.in/technology/news/story/swiggys-genie-service-quietly-goes-offline-in-key-cities-no-return-date-yet-474648-2025-05-04) |

**What this tells us.** The winning shape is a ride booking with a package: pickup, drop, weight band, an upfront fare, a driver with OTPs at both ends, live tracking. Genie's exit says a standalone pick-and-drop app is hard to sustain; it works as an add-on to a fleet that is already on the road, which is QuikFly's position. Weight caps cluster at 5 kg (backpack) and 20 kg (bike carrier); QuikFly should show the cap and refuse above it rather than discover it at pickup.

### 2.3 Door-to-door intercity courier (the Porter Intercity / Delhivery model)

| Service | Coverage and limits | Pricing and time | Source |
|---|---|---|---|
| **Porter Intercity courier** | 19,000+ pin codes; surface or air; 15–20 kg per package (pages disagree) | From ₹40; Bengaluru → Ahmedabad quoted about 6 days express, 7–9 days standard; real-time tracking | [Autocar Pro](https://www.autocarpro.in/news/porter-launches-intercity-courier-service-for-seamless-shipping-across-india-115926), [porter.in route page](https://porter.in/courier/bangalore-to-ahmedabad) |
| **Delhivery Direct** (consumer, since 2021) | 19,000 pin codes, 2,500 locations | App: book, schedule doorstep pickup, track, estimate | [Business Standard](https://business-standard.com/article/companies/ipo-bound-delhivery-begins-consumer-to-consumer-parcel-shipping-121061701174_1.html) |
| **DTDC (MyDTDC)**, **Blue Dart (My Blue Dart)** | National; store finder | Real-time tracking, online booking, cancellation | [Shiprocket roundup](https://www.shiprocket.in/blog/courier-delivery-apps) (vendor blog) |

**What this tells us.** National couriers win on reach and lose on speed: a week between metros. A bus parcel between two cities on the same bus route is overnight. QuikFly should not compete on pin codes; it should promise "on tonight's bus, collect tomorrow morning" between the cities it already serves, and offer door pickup and delivery only where it has bikes.

### 2.4 Rules the product must respect

Flagged for the owner and the accountant, as the pricing plan did for GST (step 4). Not legal advice.

- **Prohibited and restricted items.** Carrier lists agree on: cash and currency, jewellery and precious metals, alcohol, drugs and narcotics, weapons and ammunition, explosives and fireworks, flammable liquids and gas cylinders, loose batteries, perishables without packing, live animals and plants, hazardous chemicals, counterfeit goods, pornographic material, and maps with incorrect boundaries of India ([Blue Dart](https://api.bluedart.com/international-import), [customs FAQ](https://bangalorecustoms.gov.in/wp-content/uploads/2026/01/acc_faq_2025.pdf)). The sender must declare contents and tick that none of these are inside; the driver or counter can refuse on sight (Uber's rule).
- **Sender identity.** Carriers take ID at the counter. QuikFly's phone-OTP account is the sender's identity record; the booking stores who sent what to whom. Guest booking is out of scope for this reason.
- **Consignment value.** Goods over ₹50,000 moving between states need an e-way bill under GST ([UPS India page](https://verykship.com/ups/IN/PorhibitedAndRestrictedItems)). Version 1 caps the declared value well below that (a setting) and refuses higher values with a message, so no e-way bill flow is needed.
- **Liability.** Uber states parcels are not insured. QuikFly should state a liability cap (a setting, e.g. the lower of the declared value and ₹5,000) on the quote and the receipt, and say that insurance is not offered until a partner exists (free-tier rule, decision 2026-11-16).
- **GST.** Courier services are generally taxed at 18%; transport of goods by road by a goods transport agency at 5% without input credit. Which applies depends on how QuikFly contracts. Make it a setting (`gstParcel`, default 18) and ask the accountant, as with pricing step 4.
- **DPDP.** The receiver's name and phone are personal data of someone who is not the customer. The privacy notice gains a section ("when you send a parcel, we hold the receiver's name and number to deliver it and to tell them it is coming"), the export includes the parcels the account sent and received, and erasure anonymises both sides (see [privacy.md](privacy.md)).

---

## 3. Product design

### 3.1 Customer flows

**Quick parcel (city).** Parcel tile → pickup and drop (saved places work) → what is it (category from a short list: documents, clothes, food, electronics, medicines, gifts, other), weight band (up to 2 kg, 5 kg, 10 kg, 20 kg), size (fits a backpack / a box), declared value (₹, capped) → receiver name and phone (contacts picker in the app) → tick the declaration → fare, like a ride quote: base + per km after the included km, the weight band's extra, surge and night charge as for rides, GST → pay (wallet, cash on pickup, UPI demo) → a captain is assigned with an OTP for pickup → live trip page (the ride tracker reused) → **delivery OTP** for the receiver (demo: shown on the sender's screen and in the receiver's QuikFly inbox when they have an account) → delivered, receipt and invoice; credits earned.

**Bus parcel (intercity).** Parcel tile → from city, to city (the bus cities) → the same package details and receiver → **how it starts**: drop at the counter yourself (free) or door pickup (a Quick parcel leg, priced as one) → **how it ends**: receiver collects at the destination counter (free) or door delivery (a Quick parcel leg) → departure: the next buses on the route with the counter cut-off time (e.g. "hand in by 8:30 PM for the 9:30 PM bus, collect from 6 AM") → price: route slab by weight (catalog) or the Settings per-kg fallback, minimum charge, handling, door legs, GST → pay → **LR number** (e.g. `QFP-MAA-CBE-7K3Q`) and a QR on the receipt; the receiver gets a notification (in-app when they have an account; "demo: no SMS sent" otherwise) → the tracking page shows the timeline: Booked → At counter → On the bus (bus, departure) → Reached destination → Ready for collection → Collected (OTP), and for door legs the city trip in between → invoice.

**Tracking without sign-in.** `GET /track/:lr` (public, like the m-ticket page): the LR, the route, the status timeline, first names only, no phone numbers, counter address and hours for collection. The receiver gets this link.

**Cancellation.** Quick parcel: the ride rules (free within `rideCancelFreeMinutes`, then the ride cancellation fee). Bus parcel: a tiered policy `cancelPolicyParcel` counting down to the bus departure ("3h:100, 1h:50"), nothing back once it is on the bus; the booking stores its terms as today (decision 2026-11-20, `terms.ts`).

**Unclaimed parcels.** A bus parcel not collected within `parcelCounterHoldDays` is marked `unclaimed`; staff can return it to the sender (a new booking, paid by the sender) or dispose per policy. The tracker says so.

### 3.2 States

```
Quick parcel:  booked → pickup (captain on the way) → in_transit → delivered
                        ↘ cancelled                 ↘ returned (receiver unreachable: back to sender, same fare)

Bus parcel:    booked → at_counter → on_bus → reached → ready → collected
                 ↘ cancelled (before on_bus)                      ↘ unclaimed → returned
               with door legs: pickup_leg (a Quick parcel) before at_counter, delivery_leg (a Quick parcel) after reached
```

These are the sequences a customer sees. Underneath, a parcel is a list of **legs** (section 4): a `bike` leg (a ride from the roster), a `bus` leg (an operator's bus on a date) or a `counter` leg (held at a counter until collected). Each leg has its own state (`pending → active → done`, or `failed`), and the parcel's state is derived from them: the first active leg names the stage, all legs done means delivered or collected, a failed leg means returned or unclaimed. A city parcel is one bike leg. Counter-to-counter is counter → bus → counter. Door-to-door is bike → counter → bus → counter → bike. A later transfer between two buses is counter → bus → counter → bus → counter with no new code.

The allowed transitions live in one table in `packages/shared/src/parcel.ts` (`PARCEL_TRANSITIONS`), read by the API, the admin buttons, the app chips and the mock, so no screen can show an action the API refuses.

The booking row keeps `confirmed / ongoing / completed / cancelled` (ongoing from the first movement, completed at delivered or collected), and the `parcels` row keeps the fine-grained state, exactly as `rentals` does for self-drive.

### 3.3 Staff flows (admin)

- **Parcels queue** (new section, permission `parcels.manage`: owner, operations): filter by counter city, status, date; search by LR or phone. Each row: LR, route, weight, sender and receiver (full details for staff), status, next action.
- **Counter actions**, each an audited event: **Receive at counter** (confirms weight and size; a different weight re-prices with the difference charged or refunded, like the bus reschedule), **Load on bus** (pick the bus from the day's departures), **Mark reached**, **Ready for collection** (sends the receiver the OTP), **Hand over** (enter the OTP), **Mark unclaimed / Return to sender**, **Cancel with reason** (refund by policy, as other bookings).
- **Catalog:** `parcelRate` kind (operator, route → weight slabs and prices, transit hours, counter cut-off), `parcelCounter` kind (operator, city → counter address, hours, phone), both with `pricing` flags where money is set. The operator is a `busOperator` id; "QuikFly" is one of them. New "Parcels" group in `CatalogKindDef.group`.
- **Settings:** a Parcels tab (section 5).
- **Dashboard:** parcels today, on the bus, ready, unclaimed; revenue in the existing per-service stats.

### 3.4 Partner angle (later)

Today's bus operators and counters are catalog data; the Partner app serves car and vehicle owners. Two later extensions: (a) a **counter role** in the admin panel scoped to one operator and city (a `scope` field on `admin_users`), so a counter clerk sees only their parcels; (b) **bus operators as partners** carrying parcels for a share (the backlog's "bus operator portal"), paid through the existing partner ledger because every bus leg already names its operator. Both come after v1, and neither needs a schema change.

### 3.5 Designed so it doesn't need a rewrite

The business model for intercity parcels is not settled (section 10.8): QuikFly may run counters, aggregate operators like KPN and SRS, or pay partner operators. The design below is the same in all three cases. These are the seams that stay fixed; everything behind them may change.

| Seam | Fixed from day one | What can change behind it without touching screens or schema |
|---|---|---|
| **Operator on every counter, rate and bus leg** | `operatorId` on `parcelCounter`, `parcelRate` and `parcel_legs` | Who carries the parcel: QuikFly, a listed operator, a partner paid a share |
| **Journey as legs** | `parcel_legs` with kind `bike`, `bus` or `counter` | Counter-to-counter, door-to-door, city-only, bus-to-bus transfer, a third-party courier leg later |
| **One transition table** | `PARCEL_TRANSITIONS` in shared | Which actor fires a transition: the cron (demo), a staff member (counter), an operator's API, a driver app, the receiver's OTP |
| **One carrier interface** | `services/parcels/carriers.ts`: `advance(leg, by)` with `simulated`, `staff` and later `operatorApi` implementations | Replacing the simulation with a real feed changes one file |
| **Money only through quotes and the wallet** | Price from `POST /quotes`; weight re-pricing, door legs and returns as new quoted lines, in one `db.batch()` with the ledger row | Tariffs, GST rate, who gets paid |
| **Terms stored on the booking** | `cancelPolicyParcel`, `gstParcel`, `parcelLiabilityCap`, the declaration version | Staff can change any of them without changing a parcel already booked |
| **Identity and OTP** | Sender is the signed-in account; receiver releases with an OTP whose hash is stored | OTP shown in-app (demo) → SMS → receiver's own account; the endpoint is the same |
| **Public tracking by LR** | `GET /track/:lr`, first names only | Sharing by link, QR, WhatsApp or SMS later |
| **Prohibited list and declaration versioned** | `PARCEL_DECLARATION.version` stored with the parcel | The list can grow; old bookings keep the text they agreed to (same pattern as the privacy notice) |

Known failure points and where the design handles them: a wrong weight at the counter (re-price as a quoted adjustment, charge or refund), a receiver who never comes (`unclaimed` after the hold, return as a new leg), a parcel refused on sight (cancel with reason, full refund, audited), a cancelled bus (staff move the bus leg to another departure; the parcel keeps its LR and price), a deleted account (erasure blanks names and phones, keeps the row for the invoice), two staff acting at once (the transition table rejects a stale move with 409), the 50-query cap (one batch per transition; the cron moves at most 20 parcels per run).

What this cannot make issue-free: the commercial agreements, the GST classification, liability for lost goods, and the legal duties of a goods carrier. Those are decisions in section 10, and the settings exist so the answers can be entered rather than coded.

---

## 4. Data model

New migration `0028_parcels.sql` (0027 is Phase 6; never edit an applied one).

```sql
CREATE TABLE parcels (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  user_id TEXT NOT NULL,                   -- sender (for export and erasure)
  lr TEXT NOT NULL UNIQUE,                 -- QFP-<from>-<to>-<4 chars>; city parcels QFP-<city>-<5 chars>
  mode TEXT NOT NULL CHECK (mode IN ('city','intercity')),
  state TEXT NOT NULL,                     -- section 3.2
  from_city TEXT, to_city TEXT,            -- intercity
  pickup_place_id TEXT, drop_place_id TEXT,-- city, and door legs
  depart_at TEXT,                          -- intercity: the bus departure the parcel is booked on (ISO)
  bus_id TEXT, bus_date TEXT,              -- set when loaded
  category TEXT NOT NULL, weight_band TEXT NOT NULL, size TEXT NOT NULL,
  declared_value INTEGER NOT NULL,         -- ₹
  liability_cap INTEGER NOT NULL,          -- ₹ at booking (terms)
  contents TEXT NOT NULL,                  -- the sender's one-line description
  receiver_name TEXT NOT NULL, receiver_phone TEXT NOT NULL,
  receiver_user_id TEXT,                   -- when the phone belongs to a QuikFly account (for their inbox and export)
  pickup_kind TEXT NOT NULL CHECK (pickup_kind IN ('counter','door')),
  delivery_kind TEXT NOT NULL CHECK (delivery_kind IN ('counter','door')),
  declaration_version TEXT NOT NULL,       -- the prohibited list and terms the sender agreed to
  collect_otp_hash TEXT,                   -- hashed like session tokens; set when the last leg becomes active
  hold_until TEXT,                         -- counter leg active + parcelCounterHoldDays
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX parcels_by_state ON parcels (state, to_city);
CREATE INDEX parcels_by_receiver ON parcels (receiver_user_id);

-- The journey: one row per leg, in order. The parcel's state is derived from these.
CREATE TABLE parcel_legs (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES parcels(booking_id),
  seq INTEGER NOT NULL,                    -- 0, 1, 2 ... in travel order
  kind TEXT NOT NULL CHECK (kind IN ('bike','bus','counter')),
  state TEXT NOT NULL CHECK (state IN ('pending','active','done','failed')),
  operator_id TEXT,                        -- busOperator id for bus and counter legs ("quikfly" for own counters)
  counter_id TEXT,                         -- counter legs: the parcelCounter catalog id
  bus_id TEXT, bus_date TEXT, depart_at TEXT,  -- bus legs
  ride_id TEXT, leg_booking_id TEXT,       -- bike legs: the ride, and its own booking when priced as a Quick parcel (same trip_id)
  planned_at TEXT, started_at TEXT, ended_at TEXT,
  note TEXT,                               -- "Moved to the 10:30 PM bus: 9:30 PM cancelled"
  UNIQUE (booking_id, seq)
);
CREATE INDEX parcel_legs_open ON parcel_legs (state, kind, depart_at);

CREATE TABLE parcel_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES parcels(booking_id),
  state TEXT NOT NULL,
  note TEXT,                               -- "Loaded on KPN 9:30 PM Chennai → Coimbatore"
  by_admin_id TEXT,                        -- null for customer and simulated events
  at TEXT NOT NULL
);
CREATE INDEX parcel_events_by_booking ON parcel_events (booking_id, at);
```

- `bookings.service` gets the value `parcel` (the column is free text today; `SERVICE_KEYS` in `apps/api/src/config.ts` and `ServiceKey` in `types.ts` gain it).
- Every state change is one `db.batch()`: the `parcel_legs` update, the derived `parcels.state`, the `parcel_events` row, the `bookings.status` change when it crosses ongoing or completed, the wallet refund with its `wallet_transactions` row when money moves (Rule 6), and the `auditStatement` for staff actions (Rule 4). The update is conditional on the leg's current state (`WHERE state = ?`), so two actors moving the same parcel at once get a 409 instead of a double move.
- Privacy: `exportData()` adds parcels sent (`user_id`) and received (`receiver_user_id`), with the other party's phone masked; `eraseAccounts()` blanks `receiver_name`, `receiver_phone` and `contents` for both roles and keeps the row for the invoice, as it does for bookings.

---

## 5. Shared package

`packages/shared/src/parcel.ts` (new), plus edits to the existing files:

| File | Change |
|---|---|
| `types.ts` | `ServiceKey` += `"parcel"`; `Booking.parcelState: ParcelState \| null`; `QuoteRequest` += `{ service: "parcel"; mode: "city"; pickupId; dropId; category; weightBand; size; declaredValue; scheduledFor? }` and `{ service: "parcel"; mode: "intercity"; from; to; departAt; category; weightBand; size; declaredValue; pickup: "counter" \| "door"; pickupPlaceId?; delivery: "counter" \| "door"; dropPlaceId? }`; `NewBooking` += `receiver: { name; phone }`, `contents`, `declaration: true` |
| `parcel.ts` | `PARCEL_CATEGORIES`, `PARCEL_WEIGHT_BANDS` (`"2" \| "5" \| "10" \| "20"` kg, label and max), `PARCEL_SIZES`, `PARCEL_DECLARATION` (`version` + the prohibited list in 2.4, shown before the tick), `PARCEL_RULES` (LR format, contents 3–80 chars, hold-days range; the phone pattern comes from `rules.ts`), `ParcelLegKind`, `ParcelLeg`, `ParcelState`, `Parcel`, `ParcelEvent`, `PublicTracking` (first names only), `PARCEL_TRANSITIONS` (leg kind × from-state → allowed to-states and who may fire them), `parcelState(legs)` (the derived state), `planLegs(quote)` (the leg list for a quote: one bike leg, or counter/bus/counter with optional bike legs), `parcelCutoff(departAt, settings)`, `describeParcelPolicy()` |
| `pricing.ts` | `priceParcelCity(option, distanceKm, minutes, band, settings)` built on `rideBaseFare()` plus the band's extra; `priceParcelIntercity(rate \| null, band, pickup, delivery, settings)` = max(`parcelIntercityMinCharge`, slab price or `parcelIntercityPerKg × band max`) + `parcelHandlingFee` + door legs (quoted as Quick parcels, shown as one total) + GST `gstParcel` |
| `settings.ts` | `serviceParcel` (false by default), `parcelCityMaxKg` 20, `parcelCityBandExtra` text like `"2:0, 5:10, 10:25, 20:50"` (₹ per band, validated like `surgeHours`), `parcelIntercityMinCharge` ₹60, `parcelIntercityPerKg` ₹12, `parcelHandlingFee` ₹10, `parcelMaxDeclaredValue` ₹10,000, `parcelLiabilityCap` ₹5,000, `parcelCounterHoldDays` 7, `parcelCutoffMinutes` 60, `cancelPolicyParcel` `"3h:100, 1h:50"`, `gstParcel` 18, `creditsParcel` 2, `parcelSimulateTransit` true (demo: a cron advances intercity parcels; the UI says "demo: simulated transit") |
| `cancellation.ts` | `CANCEL_EVENT.parcel = "departure"`; `cancelPolicyFor` reads `cancelPolicyParcel`; `quoteStartsAt` returns `departAt` for intercity and now for city |
| `terms.ts` | `TERM_KEYS.parcel = ["cancelPolicyParcel", "gstParcel", "parcelLiabilityCap"]` |
| `switches.ts` | `serviceOn(settings, "parcel")` reads `serviceParcel` |
| `credits.ts` | the parcel earn rate |
| `catalog-kinds.ts` | `parcelRate` (operatorId, from, to, transitHours, cutoffMinutes, a price per band with `pricing: true`), `parcelCounter` (operatorId, city, name, address, hours, phone); group `"Parcels"` |
| `catalog.ts` | seed: a "QuikFly" operator with counters in the bus cities and rates for the popular routes; staff add real operators' counters and tariffs when agreements exist |
| `admin.ts` | `PERMISSIONS["parcels.manage"] = ["owner", "operations"]` |
| `privacy.ts` | the receiver-data section; bump the notice version so everyone agrees again |
| `i18n/*.arb` | new strings in all three files, then `flutter gen-l10n` |

---

## 6. API

Routes stay HTTP-only; `services/parcels/` holds the logic and SQL: `parcels.ts` (quotes, booking, tracking, cancel), `legs.ts` (the one function that moves a leg, `advanceLeg(bookingId, seq, to, by)`, used by the cron, the admin route and the customer OTP routes alike) and `carriers.ts` (the `simulated` and `staff` carriers now; an `operatorApi` carrier later).

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/quotes` | the two new `parcel` shapes (section 5) → `{ id, service: "parcel", lines, total, expiresAt }`; 400 above `parcelCityMaxKg` or `parcelMaxDeclaredValue`, when the service switch is off, past the cut-off, or for a route with no bus; the quote records `departAt` as `startsAt` |
| POST 🔒 | `/bookings` | with a parcel `quoteId` plus `receiver`, `contents`, `declaration: true` (400 without). Creates the `parcels` row and the first event in the booking batch; door legs create their Quick parcel bookings in the same trip (`tripId`); city mode creates the ride like `POST /rides` and stores `rideId` |
| GET 🔒 | `/bookings/:id/parcel` | the sender's (or the receiver's, when signed in with the receiver phone) parcel with its events; 404 otherwise |
| POST 🔒 | `/bookings/:id/parcel/handover` | city mode: the sender confirms the captain took it (pickup OTP as for rides) |
| POST 🔒 | `/bookings/:id/parcel/deliver` | demo: the sender's screen completes the simulated city trip and enters the delivery OTP (the driver app will own this, decision 2026-11-16 "rides are completed by the website") |
| GET | `/track/:lr` | public: `PublicTracking` (route, timeline, first names, counter address and hours; no phones) |
| POST 🔒 | `/bookings/:id/cancel` | existing; parcels refund by `cancelPolicyParcel` until `on_bus`, 409 after |
| GET 🛡 | `/admin/parcels?city=&state=&q=` | the queue (`parcels.manage`) |
| POST 🛡 | `/admin/parcels/:id/legs/:seq` | `{ to, note?, busId?, busDate?, weightBand?, otp? }`: one of the counter actions in 3.3 as a leg transition; checked against `PARCEL_TRANSITIONS`; re-prices on a weight change (charge or refund in the same batch); hands over only with the right OTP; moving a bus leg to another departure keeps the LR and price; writes the event, the derived state, the booking status and the audit row together; 409 when the leg already moved |
| cron | every minute | when `parcelSimulateTransit` is on, the `simulated` carrier advances legs on their planned times: a bus leg goes active at `departAt` and done at `departAt + transitHours`, the next counter leg goes active with the OTP; a counter leg past `hold_until` fails as `unclaimed`. Each move writes an event and a notification. Stays under the 50-query cap by moving at most `PARCEL_SIM_BATCH` (20) legs per run |

Notifications: new kinds `parcel.booked`, `parcel.moved`, `parcel.ready` (receiver, with the OTP in the demo), `parcel.collected`, `parcel.unclaimed`; the receiver gets them when `receiver_user_id` is set.

Smoke: `scripts/smoke.mjs` books both modes, tracks, cancels one by policy and checks the refund; `smoke-admin.mjs` walks a parcel through the counter actions and checks the audit rows. `apps/api/README.md` gets the rows above.

---

## 7. Website and admin

**Website** (`apps/web`):
- `src/lib/services.ts`: the seventh tile (`key: "parcel"`, nav "Parcels", `href: "/parcels"`, a new photo under `/assets/services/`).
- `src/app/parcels/page.tsx` + `src/screens/ParcelScreens.tsx` (chooser, Quick parcel form, Bus parcel form with departures, receiver and declaration, quote panel reusing the `RidePanel` patterns) and `src/app/track/[lr]` → `TrackParcelScreen` (public). Both added to `src/spa/SpaApp.tsx` (Rule 9).
- `TripScreen.tsx`: a parcel card shows the LR, the state chip and "Track"; `InvoiceScreen.tsx` prints the LR and the liability line.
- `lib/api/contract.ts`, `http.ts`, `mock.ts`: the new endpoints; the mock simulates transit in localStorage for the single-file demo.
- New text goes through `useT()` where the string catalog already covers the screen.

**Admin** (`apps/admin`): `src/app/parcels` (queue, detail with the timeline and the action buttons), a `lib/nav.ts` entry hidden without `parcels.manage`, a Settings tab "Parcels" from the new fields in `settings-fields.ts`; the two catalog kinds appear in the catalog screen automatically from `catalog-kinds.ts`.

Both at 390 px, tablet and desktop, light and dark, checked in a browser before the step is called done (Rule 8).

---

## 8. Apps

**QuikFly (customer):** `lib/core/services.dart` seventh service; `lib/screens/parcel/` (chooser, forms, tracking); `lib/api/models.dart` + `api.dart` for the new shapes and endpoints; the Trips tab shows parcel cards; `test/api_contract_test.dart` books and tracks a parcel. The receiver is picked from the phone's contacts (free picker plugin) or typed. Ships in the app release after the API step lands, as every Phase 5 item did.

**QuikFly Partner:** nothing in v1. Captains carrying Quick parcels are the ride roster (simulated); when the driver app exists, pickup and delivery OTPs move there.

---

## 9. Plan: steps the owner approves one at a time

Each step is one PR from `main`, off by default behind `serviceParcel`, with docs updated in the same PR (Rule 11). Sizes: S under a day, M two to three days, L about a week.

| # | Step | Size | Done when |
|---|---|---|---|
| 0 | **Decisions** (section 10) and the accountant's answer on `gstParcel` | — | The owner has answered 10.1–10.9 |
| 1 | **Foundation**: `parcel.ts` (legs, transitions, declaration), `ServiceKey`, settings, operator-aware catalog kinds and seed, migration 0028 (`parcels`, `parcel_legs`, `parcel_events`), `priceParcelIntercity` + `priceParcelCity`, the two quote shapes, `advanceLeg` with the `simulated` and `staff` carriers, `/track/:lr`, cron, privacy export and erasure, notice bump, smoke checks, README rows, mock API | L | `npm run typecheck` and `npm run smoke` pass locally; a bus parcel can be quoted, booked, tracked and cancelled over curl; refunds follow `cancelPolicyParcel`; `GET /me/export` lists it |
| 2 | **Bus parcel in admin and on the website**: parcels queue and counter actions with audit; Settings tab; the website Parcels page (intercity only, counter to counter), tracking page, trip card, invoice | L | Smoke-admin walks a parcel through every state; browser check at 390 px and desktop, both themes; the demo shows "demo: simulated transit" |
| 3 | **Quick parcel (city)**: the ride engine carries a package: quote, captain, pickup OTP, simulated trip, delivery OTP, returned-to-sender path; website form and tracker | M | A city parcel books from the wallet, completes in the simulation, earns credits, and the invoice prints |
| 4 | **Door pickup and delivery as trips**: the intercity quote adds Quick parcel legs; one total, one tracking page across legs, `tripId` groups the bookings | M | A door-to-door intercity parcel shows three bookings in one trip with one timeline |
| 5 | **Customer app**: screens, models, contract test; released as the next app version with the release recipe | L | `flutter analyze` clean, contract test green against the local API, phone check of booking and tracking |
| 6 | **Operations polish**: unclaimed handling and return-to-sender booking, weight re-pricing at the counter, dashboard tiles, CSV in the Phase 6 export | M | Each action audited; the dashboard counts match the queue |
| 7 | **Counter role and bus operators as partners** (section 3.4) | L | A counter login sees only its city; the operator's share lands on the partner ledger |

Rollout: steps 1–2 together make the KPN-style product demoable; `serviceParcel` stays off on production until the owner turns it on in admin → Settings → Services. The demo script gains a parcel scene (book on the laptop, track on the phone, hand over in admin).

Docs touched by every step: `roadmap.md` (a Phase 7 "Parcels" row and work log), `decisions.md` (the entries below when taken), `apps/api/README.md`, `apps/web/README.md`, `apps/admin/README.md`, `apps/mobile/README.md`, `privacy.md`.

Decisions this plan would add to `decisions.md` when step 1 lands:
- Parcels are one service key with two modes (city, intercity), not two services, so one tile, one switch, one GST rate and one policy text.
- A parcel is a booking plus a `parcels` row whose journey is ordered legs (bike, bus, counter) with an event log, the way self-drive has `rentals`; the parcel's state is derived from its legs and every transition goes through one function and one shared transition table.
- Every counter, rate and bus leg names an operator ("QuikFly" is one), so own counters, aggregated operators and partner operators are data, not code paths.
- Door-to-door intercity is a bus parcel with bike legs grouped as a trip, not a third mode.
- A receiver OTP, not a paper slip, releases a parcel; the OTP hash is stored like session tokens.
- No insurance and a liability cap stated on the quote until an insurer exists (free-tier rule).
- Transit is simulated by the cron and labelled in the UI until counters are staffed.

---

## 10. Decisions for the owner

1. **Name and positioning.** "QuikFly Parcel" with "Quick parcel" (city) and "Bus parcel" (intercity)? Or lead with the KPN-style bus parcel only and add the city courier later (steps 3–4 move after 5)?
2. **Which cities and routes first.** Counters in all bus cities in the seed, or Chennai, Coimbatore, Madurai, Salem and Bengaluru to start? Rates per route (catalog) or one per-kg tariff (settings) for the demo?
3. **Weight and value caps.** 20 kg and ₹10,000 declared value as proposed, or lower for launch?
4. **Liability cap and the no-insurance line.** ₹5,000 or the declared value, whichever is lower?
5. **GST.** 18% courier or 5% GTA: the accountant's call, as in pricing step 4.
6. **Who staffs the counters in the demo.** Simulation on (the cron moves parcels and says so), or a staff member clicks through the admin queue live?
7. **Receiver without an account.** Show the OTP on the sender's screen (the sender tells the receiver) until SMS exists, or require the receiver to sign in to collect?
8. **Who carries the intercity parcel.** QuikFly's own counters and bus space, an aggregation of existing operators' parcel arms (KPN, SRS, Parveen), or partner operators paid a share through the partner ledger? The design is the same for all three (section 3.5); the answer decides the seed data, the first agreement to sign and whether step 7 comes earlier.
9. **Which mode ships first.** Bus parcel first (this plan's order) or Quick parcel first (steps 3 and 4 move before 2) if the bike fleet will be the real operation at launch.

---

## Prompt to start step 1

Paste into a new chat after the decisions above are answered:

> Implement step 1 of docs/parcel-service-plan.md (foundation for the parcel service). Read AGENTS.md, docs/roadmap.md, docs/decisions.md and the plan first. Branch from main. Follow Rule 1 (shared types → API route + service + migration 0028 → web contract/http/mock → smoke → API README). Keep `serviceParcel` off by default. Add the decisions listed in section 9 to docs/decisions.md and a Phase 7 row to docs/roadmap.md. Run `npm run typecheck` and `npm run smoke` against a local API on a free port; do not touch production. Commit at each checkpoint and open a PR.
