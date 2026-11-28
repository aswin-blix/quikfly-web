# QuikFly Web — All in One Super App

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · GSAP 3 · Framer Motion · lucide-react

The customer website for all six QuikFly services. All data and every price come from the API (`apps/api`): the catalog and business settings are edited in the admin panel (`apps/admin`). Without `NEXT_PUBLIC_API_URL` it runs on a built-in mock API (offline demo) that uses the shared seed and the same pricing code.

## Pages

| Route | What it does | Pattern borrowed from |
|---|---|---|
| `/` | Hero with a booking widget for every service, service cards (one tile per service; the old "six ways to move" carousel repeated them and was removed), count-up stats, offers, popular bus routes, trending holidays, safety, testimonials, Android app download (direct APK from GitHub Releases; footer has the same link), FAQ | Uber (booking form in the hero), Rapido (big service tiles) |
| `/bike-taxi`, `/cab` | Pickup/drop → fare per vehicle type → driver search → live tracking with ride OTP → rating; plus ride options, fare rates and FAQ Women riders (profile gender female) also see women-only types such as Bike Pink, marked "Women only", with a woman captain; rides share themselves with emergency contacts per Account → Safety (off / night / every ride), and a rider's own ride PIN replaces the OTP. With live captains on (`featureLiveDrivers`), a ride-now ride goes to a real captain: "Finding your captain" (polled every 3 s), paid only once one accepts, then the captain on the way / at the pickup / on the trip / done as the API reports them; a captain giving it back searches again (cancel is free then); no captain shows the API's message; a fall back to a simulated captain is labelled. The website sends `LIVE_CLIENT_ACCEPT` (`rides=live`). The mock API is always simulated. | Uber / Ola / Rapido |
| `/bus` | Route search with swap, quick date chips, popular routes, offers | redBus |
| `/bus/search` | 7-day date strip, filter sidebar (departure time, AC/sleeper, max price, rating, operator), sort, expandable seat map with boarding/dropping points | redBus |
| `/holidays` | Theme (incl. Spiritual, Women only, Seniors), duration, budget, and departure month / city filters; package cards show the next group departure with seats left ("Filling fast" at 5 or fewer) or "Private trip · start any date" | MakeMyTrip Holidays |
| `/holidays/[slug]` | Hero art, quick facts, Itinerary / Inclusions / Policies tabs, sticky price card, similar getaways; group packages pick a departure (date, city, seats left, its own price) instead of a start date | MakeMyTrip Holidays |
| `/rent-a-car` | City and dates, self-drive or chauffeur, filters (category, transmission, fuel, seats), hourly pricing | Zoomcar |
| `/rent-a-car/[id]` | Car details, specs, price breakdown, licence check | Zoomcar |
| `/travel-rentals` | Tempo traveller → 45-seat coach, local or outstation fare estimate, side-by-side compare | Savaari / group-travel operators |
| `/parcels` | Bus parcel or Quick parcel (`?mode=city`: two places from `components/PlacePicker.tsx`, the ride policy, cash on pickup), only while `serviceParcel` is on. The bus parcel, counter to counter: route, departures with hand-in cut-offs, category, weight, size, value, receiver, the prohibited list and declaration, the API's price; then checkout. Also a box to track by LR | KPN / bus parcel offices |
| `/parcels/track?lr=` | Public parcel tracking (kept out of search; works while the service is off): timeline, collection counter, first names only, never the code | Courier trackers |
| `/bookings` (parcels) | `components/parcel/ParcelPanel.tsx` (with `CourierSteps.tsx` for a Quick parcel: captain, pickup code and the demo's two hand-offs): state, timeline, counters, share and QR, and the collection code while it's ready (the only place it appears). Cancel until it's on the bus. `?open=<id>` opens a booking (parcel notifications use it) | — |
| `/checkout` | Shared checkout for every service: traveller and contact details with validation, coupons, payment methods, fare breakdown | redBus / MakeMyTrip |
| `/booking-confirmed` | Animated confirmation and booking summary | — |
| `/trip?id=` | Trip summary: the bookings of one trip on a timeline, each with its own invoice, and the trip total (printable) | — |
| `/account?tab=wallet` | Wallet balance and history, QuikFly Pass (buy or add days from the wallet; `#pass`, linked from the ride panel's surge note), plus QuikFly Credits: balance, next expiry, earn rates per service and credits history | Uber One |
| `/notifications` | Inbox: booking confirmed, cancellations and refunds, deposit returned, licence decisions, ride reminders, parcel moves, support replies; opening it marks all read, and it reloads when something new arrives while open. The header bell shows the unread count, checked every minute while the tab is visible and straight away when the tab comes back; something new says so in a toast with **View** and puts "(n)" in the tab title (`lib/title-badge.ts`). A card offers browser notifications (`components/PushCard.tsx`; also on the booking-confirmed screen) until turned on or declined | Uber / Ola |
| `/account?tab=notifications` | **Notifications in this browser**: a switch, what they cover, and what to do when the browser blocks them. Browser push is the Web Push standard: `lib/push.ts` registers `public/sw.js`, subscribes with `config.push.vapidPublicKey` and sends the subscription as the push token (`POST /me/push-devices`, platform `web`). Asked only after the person presses Turn on; signing out takes the browser off the account (the same person signing in again gets it back, anyone else starts off); a session the API ended unsubscribes it. Hidden states: the single-file demo (no service worker) and the mock API show "demo", an API without VAPID keys shows "not switched on yet" | Swiggy / Zomato web |
| `/bookings` | My trips: Upcoming / Past / Cancelled, expandable details, bus tickets: m-Ticket, Change bus (bus search with `change=<id>`, once, difference shown before confirming) and Cancel some seats (refund preview), cancel (shows the refund the service's cancellation policy gives before confirming; policies come from settings via `cancelPolicyText` in `@quikfly/shared`) | — |
| `/bookings` (self-drive) | Rental panel on self-drive bookings (`components/RentalPanel.tsx`): **Start rental** (five photos, shrunk in the browser by `lib/photos.ts`, plus odometer and fuel), **Extend** (the API's price first), **End rental** (same checklist), then the itemised deposit settlement. Demo mode settles straight away | Zoomcar |
| `/ticket?t=` | Public bus m-ticket (no login, kept out of search): status, trip, seats with first names, PNR and a QR code (`qrcode`, dark on white in both themes) that opens this same page for a conductor | KSRTC/IntrCity QR tickets |
| `/offers`, `/partner`, `/help` | Coupons (one for all services shows under every filter, as in the app); how vehicle owners join (steps, vehicles, documents from settings) with a download button for the QuikFly Partner app (latest GitHub Release; `PARTNER_APP` in `lib/site.ts`, null shows "coming soon"); help centre FAQ | Red Taxi Vendor |
| `/help` (support) | Contacts from settings (phone, WhatsApp only when `whatsappNumber` is set, email) and a callback form (`components/support/CallbackForm.tsx`, also on holiday pages with WhatsApp) | — |
| `/privacy`, `/account?tab=privacy` | Privacy notice (text from `packages/shared/src/privacy.ts`, Grievance Officer from settings; footer link) and Privacy & data (notice agreed on, **Download (JSON)** via `GET /me/export`, where to correct or erase). `components/PrivacyConsent.tsx` asks a signed-in person to agree when their consent is not for the current notice version (after sign-up, never on `/privacy`). See [docs/privacy.md](../../docs/privacy.md) | — |
| `/account?tab=support` | Support tickets: list, new ticket (topic, optional booking; `&booking=` prefills it, from **Get help** in My trips), thread with reply and close (`&ticket=` opens one); the `support.reply` notification opens it. Demo mode keeps tickets in this browser and nobody answers | Uber help / Zoomcar |
| `/partner/apply` | Partner application on the website (sign in with the same phone login): step 1's six sections with photo uploads (shrunk in the browser, `lib/partner.ts`), staff notes, submit and reset; step 2's joining fee (demo), agreement (`VENDOR_AGREEMENT_TERMS`) and sticker request. Same `/vendor` endpoints as the QuikFly Partner app, so an application continues in either; fleet, trips and money stay in the app. Demo mode approves by itself after 20 s | Red Taxi Vendor |
| `/captain` | QuikFly Captain for drivers: what the app does (whole trip first, offers read aloud, free declines, cash screen), the vehicles it takes (`CAPTAIN_VEHICLE_TYPES`), how a driver is set up (owner adds them in QuikFly Partner → approved → sign in with that number → captain notice → online; owner-drivers per `captainSelfSignup`), the download (`CAPTAIN_APP` in `lib/site.ts`, null shows "coming soon") and a link to the captain notice on /privacy. A "rides start soon" note while `featureLiveDrivers` is off. Linked from /partner and the footer | — |

Demo login OTP: **1234**. Demo coupons are listed on `/offers`.

## Motion

- **GSAP** (`src/lib/gsap.ts`, `src/components/motion.tsx`): SplitText headline reveals, the hero plane flying along an SVG route (MotionPath), ScrollTrigger scroll reveals, parallax, count-up numbers, marquees and confetti on the confirmation page.
- **Framer Motion**: page transitions (`app/template.tsx`), shared-layout tab and segment indicators (`layoutId`), step changes in the ride and checkout flows, the expandable seat map, modals and sheets, magnetic buttons and toasts.
- `prefers-reduced-motion` is respected: GSAP effects are skipped and Framer uses `reducedMotion="user"`.

## Navigation

- **Desktop (`xl` and up):** service links in the header.
- **Laptop / tablet (`lg` to `xl`):** a grid button in the header opens the "All services" sheet.
- **Phones and small tablets (below `lg`):** a bottom tab bar (`components/BottomNav.tsx`) with Home, Services (opens the services sheet), Offers, My Trips (with an upcoming-trip badge) and Login / Account (opens the account sheet with wallet, links and sign out). The header shrinks to the logo and theme toggle.
- The bar is hidden on `/checkout` (`HIDDEN_ON` in `BottomNav.tsx`) and while a ride is in progress. Any screen can hide it with `useHideBottomNav(condition)`.
- Fixed elements that sit at the bottom of the screen must use `var(--bottom-nav-offset)` for their `bottom` so they clear the bar (see the toasts and the travel-rentals compare bar). Its height is `--bottom-nav-height` in `tokens.css`.

## Theming (light and dark mode)

The header has a sun/moon toggle. The first visit follows the device setting; once a visitor picks a theme it is saved in `localStorage` (`quikfly.theme`) and applied before first paint by a small inline script, so there is no flash.

- **`src/styles/tokens.css` is the single place to customise the look.** It holds the brand gold, fonts, radii and every colour, once for dark (default) and once for light under `[data-theme="light"]`. To add a theme, add another `[data-theme="…"]` block.
- `src/app/globals.css` maps those tokens to Tailwind utilities with `@theme inline`. Use the token utilities, never raw palette classes or hex values:

  | Need | Utilities |
  |---|---|
  | Surfaces and borders | `bg-ink` (page), `bg-coal` (card), `bg-smoke` (raised), `border-line`, `border-line-strong` |
  | Text | `text-fg`, `text-strong`, `text-soft`, `text-muted`, `text-subtle`, `text-faint` |
  | Accent | `text-gold`, `border-gold`, `bg-gold/10` (theme-aware gold: darker in light mode for contrast) |
  | Solid brand fills | `bg-brand` with `text-on-brand` (same gold in both themes) |
  | Status | `text-success`, `text-danger`, `text-warning`, `text-highlight` |

- `src/styles/components.css` holds the shared classes (`.panel`, `.btn-gold`, `.gold-border`, `.field`, `.label`, `.chip`, `.skeleton`); `src/styles/animations.css` holds keyframes.
- **`.on-media`** pins a subtree to the dark palette. Put it on any container whose content sits on a photo or always-dark artwork (card image badges, holiday tiles, the phone mock-up) so the text stays light in both themes.
- The demo map (`CityMap.tsx`) reads its own `--map-*` tokens. The holiday illustrations (`SceneArt.tsx`) are artwork and keep fixed colours.
- Theme logic is in `src/lib/theme.ts` (no React), React state in `components/ThemeProvider.tsx` (`useTheme()`), and the button in `components/ThemeToggle.tsx`. If you change `--bg`, update `THEME_COLORS` in `theme.ts` to match (browser chrome colour).

## Languages (English, Tamil, Hindi)

Strings live in `packages/shared/i18n/app_<lang>.arb`, shared with the apps (English is the template; Turbopack and webpack, which `build:demo` uses, import `.arb` as JSON, see `next.config.ts`). Screens call `t("key", { name })` from `useT()` (`components/LanguageProvider.tsx`, wrapped inside `AppProvider` in `shell.tsx`); a key missing in Tamil or Hindi shows English. `LanguageMenu` (header and footer) saves the choice in this browser (`quikfly.lang`) and sets `<html lang>`. Everything stays English and the menu is hidden while the owner's `featureLanguages` setting is off. Fonts: Noto Sans Tamil and Noto Sans Devanagari (loaded only when those letters appear). Translated so far: the shell, login, account list and privacy screens; the rest follows at the feature freeze (docs/roadmap.md).

## Run

Install once from the repo root (`npm install`), which links the shared package. Then, from `apps/web`:

```bash
npm run dev          # http://localhost:3000
npm run build        # multi-page static export to ./out (deploy to any static host)
npm run build:demo   # single self-contained quikfly-demo.html: offline, mock API, in-memory router (needs Python 3)
npm run typecheck
```

`npm run dev` at the repo root starts this site and the API together.

`npm run build` and `npm run build:demo` render the same screens. The demo build swaps Next routing for an in-memory router (`src/lib/nav.tsx`, `src/spa/SpaApp.tsx`), so the whole site fits in one HTML file. Screens only use `Link`, `useNav`, `usePath` and `useQuery` from `src/lib/nav.tsx`, never `next/navigation` directly.

## Architecture: one API for the website and the app

```
src/
  app/            routes (thin: metadata + screen)
  screens/        page-level UI per service
  components/     shell (header, footer, login, toasts), BottomNav, ServicesSheet, AccountSheet, ThemeProvider, ThemeToggle, RidePanel, CityMap, BookingWidget, motion, ui
  styles/         tokens.css (design tokens per theme), components.css, animations.css
  lib/
    nav.tsx       routing helpers (Next routes or in-memory)
    gsap.ts       GSAP + plugins registration
    theme.ts      light/dark theme logic (storage, system preference, no-flash script)
    site.ts       site-wide facts (author credit, ANDROID_APP download links)
    api/
      contract.ts QuikflyApi interface: the only thing screens depend on
      mock.ts     demo implementation (seeded data, simulated latency, localStorage)
      mock-parcels.ts parcels in the demo (transit follows the clock). Shown only when built with NEXT_PUBLIC_DEMO_PARCELS=1
      http.ts     real REST implementation (Bearer token, JSON; Accept says which newer services the site shows)
      index.ts    mock or http, based on NEXT_PUBLIC_API_URL
  components/ConfigProvider.tsx  loads GET /config once: useConfig() (places, ride types, cities, bus operators,
                                  routes, destinations, offers, FAQs) and useSettings() (fares, GST, bonuses, company...)
  components/catalog-hooks.ts     useTours(), useRentalCars(), useTravelVehicles(): bigger lists, fetched once per page load
```

**Where data comes from.** Screens never import catalog data from `@quikfly/shared` (it's only the seed). Small lists come from `useConfig()`, bigger ones from `catalog-hooks.ts`, and amounts the owner can change from `useSettings()`. While `/config` loads, lists are empty and `useSettings()` returns the defaults (fine for labels; prices are never taken from it).

**Prices.** Service screens show a live estimate with the shared pricing functions (`priceTour`, `priceRent`, `priceGroup`... from `@quikfly/shared`) and the loaded settings, so options update instantly. On "Book" they call `api.quotes.create(...)` and put the returned quote in the checkout draft; checkout shows the quote's lines, checks coupons with `api.offers.check`, and books with `quoteId` (rides book with `rideId`). The API sets the amount.

**Detail pages for new items.** `/holidays/[slug]` and `/rent-a-car/[id]` are pre-built for the seed items. Holidays and cars added in the admin later have no file, so the host serves the 404 page; `app/not-found.tsx` recognises those addresses and renders the detail screen, which loads the item from the API. (`next dev` can't do this: it errors on unknown slugs. Test it on a build served with `npx wrangler dev`.)

Set `NEXT_PUBLIC_API_URL` (see `.env.example`) to switch to the real API in `apps/api`; no screen changes are needed. The endpoint list is in [apps/api/README.md](../api/README.md).

- While the API uses a fixed login code, set `NEXT_PUBLIC_DEMO_OTP` to the same value to show the hint in the header and login form.
- Bookings load only when someone is signed in. Signing out calls `POST /auth/logout`, and any `401` from the API signs the visitor out (`UNAUTHORIZED_EVENT` in `src/lib/api/http.ts`).
- Responses may be bare JSON or wrapped in `{ "data": ... }`. Both work.

## Before production

- **Images:** the service photos are cropped from the client's small banner (about 120×80 px each) and look soft at large sizes. Get high-resolution originals of the vehicles, plus real photos for holiday packages (currently illustrated SVG scenes).
- **Service photos:** `public/assets/services/<service>.webp` (1200 px WebP, about 70–110 KB). `SERVICES` in `src/lib/services.ts` holds each path in full (the single-file demo build inlines images by exact path), and other screens reuse them through `serviceByKey(key).image`. The app ships the same files in `apps/mobile/assets/images/services/`; replace both together (`parcel.webp` is a drawn illustration).
- **Logo:** `public/assets/logo.svg`, a copy of `brand/quikfly-logo.svg` made by `node scripts/logo.mjs` (never edit the copy). Always shown through `components/Logo.tsx`: bare in dark mode, on a dark plate in light mode (token `--logo-plate`, class `.logo-plate`), because the logo was drawn on black. 1504×458.
- **Favicons:** `src/app/favicon.ico` (16, 32, 48 px), `src/app/icon.png` (192 px) and `src/app/apple-icon.png` (180 px, Add to Home Screen on an iPhone): the logo's gold Q on the QuikFly navy, made by `node scripts/app-icons.mjs` with the app icons (never edit them by hand). Next.js adds their `<link>` tags to every page.
- **Maps:** replace the illustrated map in `CityMap.tsx` with Google Maps, Mapbox or Ola Maps; the props stay the same.
- **Live tracking:** WebSockets (e.g. Laravel Reverb or Socket.IO) instead of the simulated vehicle animation.
- **Payments:** Razorpay or Cashfree at checkout.
- **SEO / SSR:** drop `output: "export"` if you need server rendering, middleware or route handlers.
- Driver and partner apps; payouts. (The admin panel is `apps/admin`.)

## Author

Designed and built by [Aswin Blix](https://aswinblix.dev/). The name and link shown in the footer and page metadata come from `src/lib/site.ts`.
