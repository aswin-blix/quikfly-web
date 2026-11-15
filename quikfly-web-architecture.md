# QuikFly Web — All in One Super App

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · GSAP 3 · Framer Motion · lucide-react

A clickable website for all six QuikFly services. Every service has its own page, and everything runs on a built-in mock API until the real backend is ready.

## Pages

| Route | What it does | Pattern borrowed from |
|---|---|---|
| `/` | Hero with a booking widget for every service, service cards, swipeable "six ways to move" carousel (arrows + progress bar), count-up stats, offers, popular bus routes, trending holidays, safety, testimonials, app download, FAQ | Uber (booking form in the hero), Rapido (big service tiles) |
| `/bike-taxi`, `/cab` | Pickup/drop → fare per vehicle type → driver search → live tracking with ride OTP → rating; plus ride options, fare rates and FAQ | Uber / Ola / Rapido |
| `/bus` | Route search with swap, quick date chips, popular routes, offers | redBus |
| `/bus/search` | 7-day date strip, filter sidebar (departure time, AC/sleeper, max price, rating, operator), sort, expandable seat map with boarding/dropping points | redBus |
| `/holidays` | Theme and duration filters, package cards | MakeMyTrip Holidays |
| `/holidays/[slug]` | Hero art, quick facts, Itinerary / Inclusions / Policies tabs, sticky price card, similar getaways | MakeMyTrip Holidays |
| `/rent-a-car` | City and dates, self-drive or chauffeur, filters (category, transmission, fuel, seats), hourly pricing | Zoomcar |
| `/rent-a-car/[id]` | Car details, specs, price breakdown, licence check | Zoomcar |
| `/travel-rentals` | Tempo traveller → 45-seat coach, local or outstation fare estimate, side-by-side compare | Savaari / group-travel operators |
| `/checkout` | Shared checkout for every service: traveller and contact details with validation, coupons, payment methods, fare breakdown | redBus / MakeMyTrip |
| `/booking-confirmed` | Animated confirmation and booking summary | — |
| `/bookings` | My trips: Upcoming / Past / Cancelled, expandable details, cancel | — |
| `/offers`, `/partner`, `/help` | Coupons, driver/fleet partner signup, help centre FAQ | — |

Demo login OTP: **1234**. Demo coupons are listed on `/offers`.

## Motion

- **GSAP** (`src/lib/gsap.ts`, `src/components/motion.tsx`): SplitText headline reveals, the hero plane flying along an SVG route (MotionPath), ScrollTrigger scroll reveals, parallax, count-up numbers, marquees and confetti on the confirmation page.
- **Framer Motion**: page transitions (`app/template.tsx`), shared-layout tab and segment indicators (`layoutId`), step changes in the ride and checkout flows, the expandable seat map, modals and sheets, magnetic buttons and toasts.
- `prefers-reduced-motion` is respected: GSAP effects are skipped and Framer uses `reducedMotion="user"`.

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

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # multi-page static export to ./out (deploy to any static host)
npm run build:demo   # single self-contained quikfly-demo.html for sharing (in-memory router)
```

`npm run build` and `npm run build:demo` render the same screens. The demo build swaps Next routing for an in-memory router (`src/lib/nav.tsx`, `src/spa/SpaApp.tsx`), so the whole site fits in one HTML file. Screens only use `Link`, `useNav`, `usePath` and `useQuery` from `src/lib/nav.tsx`, never `next/navigation` directly.

## Architecture: one API for the website and the app

```
src/
  app/            routes (thin: metadata + screen)
  screens/        page-level UI per service
  components/     shell (header, footer, login, toasts), ThemeProvider, ThemeToggle, RidePanel, CityMap, BookingWidget, motion, ui
  styles/         tokens.css (design tokens per theme), components.css, animations.css
  lib/
    types.ts      domain types shared with the backend
    nav.tsx       routing helpers (Next routes or in-memory)
    gsap.ts       GSAP + plugins registration
    theme.ts      light/dark theme logic (storage, system preference, no-flash script)
    api/
      contract.ts QuikflyApi interface: the only thing screens depend on
      mock.ts     demo implementation (seeded data, simulated latency, localStorage)
      http.ts     real REST implementation (Bearer token, JSON)
      index.ts    mock or http, based on NEXT_PUBLIC_API_URL
```

Set `NEXT_PUBLIC_API_URL=https://api.quikfly.in/v1` to switch to the real backend; no screen changes are needed. The mobile app should call the same endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/otp` | send OTP to phone |
| POST | `/auth/verify` | verify OTP → `{ token, user }` |
| GET | `/places?q=` | place autocomplete |
| POST | `/rides/quote` | fares for all ride options |
| POST | `/rides` | book ride → driver, OTP |
| POST | `/rides/:id/cancel` | cancel ride |
| GET | `/buses?from=&to=&date=` | bus search |
| GET | `/buses/:id/seats?date=` | seat layout & availability |
| GET | `/tours` | tour packages |
| GET | `/rentals/cars?city=` | self-drive / chauffeur cars |
| GET | `/rentals/travel-vehicles` | group vehicles |
| GET / POST | `/bookings` | list / create bookings |
| POST | `/bookings/:id/cancel` | cancel booking |

Responses may be bare JSON or wrapped in `{ "data": ... }` (Laravel API Resources style). Both work.

## Before production

- **Images:** the service photos are cropped from the client's small banner (about 120×80 px each) and look soft at large sizes. Get high-resolution originals of the vehicles, plus real photos for holiday packages (currently illustrated SVG scenes).
- **Logo:** `public/assets/logo.png` is 1.3 MB and its silver lettering is designed for dark backgrounds. Export a compressed version and consider a light-mode variant.
- **Maps:** replace the illustrated map in `CityMap.tsx` with Google Maps, Mapbox or Ola Maps; the props stay the same.
- **Live tracking:** WebSockets (e.g. Laravel Reverb or Socket.IO) instead of the simulated vehicle animation.
- **Payments:** Razorpay or Cashfree at checkout.
- **SEO / SSR:** drop `output: "export"` if you need server rendering, middleware or route handlers.
- Driver/partner app and admin panel (fleet, pricing, bookings, payouts).
