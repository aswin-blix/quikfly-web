# Prompt: admin settings and pricing audit

Written 2026-11-19 at the owner's request, to start in a new chat. The file paths in it were checked against the repo that day. Paste everything below the line.

---

Audit QuikFly's admin settings and pricing, and suggest how to make everything fully configurable from the admin panel in a way staff find easy. This is an audit: do not change app code. Work in two stages and stop after Stage 1 for my review.

Read AGENTS.md, docs/roadmap.md and docs/decisions.md first. Don't recommend reversing a recorded decision without naming it and saying why.

## Stage 1: inventory and findings

### 1. Inventory every tunable business value
- Runtime settings: packages/shared/src/settings.ts (Settings, DEFAULT_SETTINGS, SETTING_RULES) and the admin form apps/admin/src/lib/settings-fields.ts.
- Price maths: packages/shared/src/pricing.ts (ride quotes, priceBus, priceTour, priceRent, priceGroup, surge, GST), cancellation.ts, credits.ts, pass.ts, rental.ts, vendor.ts, switches.ts.
- Catalog data staff edit: packages/shared/src/catalog-kinds.ts (13 kinds and their fields, offers included) and the admin catalog screen (apps/admin/src/app/catalog); catalog.ts is seed data only.
- Constants that are not runtime settings: apps/api/src/config.ts, packages/shared/src/rules.ts.
- Hard-coded business values in screens: search apps/web/src, apps/admin/src and apps/mobile/lib for fees, percentages, km/hour limits and text that states a price or policy. Ignore display formatting and test data.

One table row per value: name, file:line, current value, who can change it (code only / admin role), validation, services affected, and what reads it (API, website, app).

### 2. Check pricing per service
For bike, auto, cab, bus, holidays, self-drive, chauffeur rental and group/outstation: how is the fare built (base, per km, per minute, minimum, night charges, surge, tolls/parking, GST, deposits, add-ons)? Which parts can staff change in admin, and which need code?

Then trace two changes end to end, **locally only, never production**:
- Run `npm run db:migrate:local` and `npm run dev` (API on :8787).
- Create a local owner login with `node apps/api/scripts/create-admin.mjs`.
- Run `npm run dev:admin` with the admin pointed at the local API.
- Point the website at http://localhost:8787/v1 through NEXT_PUBLIC_API_URL; if you need a separate dev server, use a free port.
- The two changes: one runtime setting (e.g. a GST rate or surge cap) and one catalog price (e.g. a ride option's per-km rate).
- Confirm the API quote changes, then the website's fare. For the app, check through the code and the contract test that it reads the same values.
- Note the 30-second caches (CATALOG_CACHE_MS, SETTINGS_CACHE_MS), what happens to existing quotes and bookings, and whether each change is audited.

### 3. Findings
List, by severity (high / medium / low) with file:line:
- values that should be settings but are hard-coded, and settings nobody reads;
- missing or weak validation (ranges, units, cross-field rules such as a cap below the base);
- pricing that can't vary where operators need it: by city/zone, vehicle, time band, day, season, airport or long distance; scheduled price changes; per-partner commission;
- admin usability problems: unclear labels, missing units or help, no fare preview, no change history, no bulk edit, no undo, unclear role permissions;
- risks of overcharging, undercharging or breaking bookings.

Write Stage 1 into docs/admin-settings-audit.md, show me a summary, and stop.

## Stage 2 (after my go-ahead): research and recommendations

### 4. Research (use the web; cite sources with dates)
- India's Motor Vehicle Aggregator Guidelines 2025 and Tamil Nadu, Karnataka and Maharashtra rules: base fare, surge caps, cancellation fees, driver share.
- Current GST rates for passenger transport, bus tickets, tour packages and car rental.
- How Uber, Ola, Rapido, Namma Yatri, redBus, MakeMyTrip and Zoomcar structure fares and what operators can configure.
- Admin UX patterns for pricing: fare cards, rate tables, preview calculators, versioning, approvals.

### 5. Recommendations
For each one: the problem, the proposed setting or screen, example values, the benefit for staff and customers, effort (S/M/L), and which layers change (shared → API → website → admin → app, per AGENTS.md rule 1). Add a prioritised plan, quick wins first, all free-tier. Append it to the same doc and open a docs-only PR. Don't implement anything until I approve.

Constraints: free tier only. The API stays the only source of prices and money changes stay atomic (AGENTS.md rules 5 and 6). Verify every claim in code before stating it, and say plainly what you didn't check.
