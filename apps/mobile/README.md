# QuikFly Android app

Flutter app for all six QuikFly services, on the same REST API as the website (`apps/api`). Package id **`com.quikfly.app`**. Shared by a signed APK on GitHub Releases (no Play Store until the client signs off).

Flutter 3.47 · Dart 3.13 · Riverpod 3 · go_router · Dio · flutter_secure_storage

## Run

```bash
cd apps/mobile
flutter pub get
flutter run                                                      # device/emulator → production API
flutter run --dart-define=API_URL=http://10.0.2.2:8787/v1        # emulator → local API (npm run dev:api)
flutter run --dart-define=API_URL=http://<PC LAN IP>:8787/v1     # phone on the same Wi-Fi → local API (start wrangler with --ip 0.0.0.0)
```

Quick UI checks without an emulator: build the web target and open it in Chrome at phone width (the web build is for development only, not shipped):

```bash
flutter build web --dart-define=API_URL=http://127.0.0.1:8787/v1
python -m http.server 5181 --directory build/web     # then open http://127.0.0.1:5181
```

Build-time settings (`lib/core/env.dart`, passed with `--dart-define`):

| Name | Default | Purpose |
|---|---|---|
| `API_URL` | production API | Base URL ending in `/v1` |
| `DEMO_OTP` | `1234` | Hint on the OTP screen ("Demo: no SMS is sent"); empty hides it |
| `WEB_URL` | production website | Shared ride links and help links |

Debug builds allow plain `http` (local API); release builds use `https` only.

## Test

```bash
flutter analyze                                                   # must be clean
flutter test --dart-define=API_URL=http://127.0.0.1:8787/v1      # contract test against a running API
```

`test/api_contract_test.dart` signs in a throwaway number, then parses real responses (config, user, rides, bookings, catalog, quotes, buses, seats, wallet, saved lists) into the Dart models. Run it whenever `packages/shared/src/types.ts` changes. Without `API_URL` it runs against production with the test number +91 90000 00002.

## Layout

```
lib/
  main.dart            ProviderScope + MaterialApp.router (light/dark themes)
  router.dart          every screen's path: tab shell (/, /offers, /trips, /account) + full-screen routes
  core/                env.dart (dart-defines) · format.dart (₹, dates, phone) · services.dart (the six services)
  theme/               tokens.dart (colours, fonts, radii; mirrors apps/web tokens.css) · theme.dart (Material themes from tokens)
  api/                 api.dart (one method per endpoint, ApiException) · models.dart (mirrors packages/shared types + Rules)
  state/               providers.dart (api, /config, session, theme mode) · catalog.dart (tours, cars, vehicles, bookings)
  widgets/             ui.dart (Panel, GoldButton, ErrorBox, EmptyState, Skeleton, Pill, KeyValue, toast, confirm, ScreenList) · art.dart · logo.dart · offer_card.dart
  screens/             one folder per area: auth, home, offers, trips, account, help (more per slice)
assets/                fonts (Outfit static weights, Archivo Black), images (service photos, logo), icon (launcher icon sources)
```

## Rules (same as the website)

- **The API sets every price.** Live estimates call `POST /quotes` (or `/rides/quote`); bookings send a `quoteId` or `rideId`, never an amount. No price maths in Dart.
- **Lists come from the API**: `GET /config` (settings, places, ride options, cities, operators, routes, destinations, offers, FAQs) and the catalog endpoints. No hard-coded catalog data.
- **Colours only from `theme/tokens.dart`** through `context.qf` (or the Material theme). No raw `Color(0x...)` in screens, except artwork in `widgets/art.dart`.
- **Validation rules** are copied from `packages/shared/src/rules.ts` into `Rules` in `models.dart`. Change both together.
- Every screen works at 390 px wide and on tablets (content is capped at 720 px), in light and dark mode.
- Simulations are labelled honestly ("Demo: no SMS is sent").

## Icons and fonts

- Launcher icon: edit `assets/icon/icon.png` (full icon) and `icon-foreground.png` (adaptive foreground, mark inside the centre 60 %), then `dart run flutter_launcher_icons`.
- Outfit is shipped as static weights (400/500/600/700) cut from the variable font with `fonttools varLib.instancer`, because Flutter doesn't map `FontWeight` onto a variable font's axis.
- The logo is made for dark backgrounds; `AppLogo` puts it on a dark badge in light mode until a light-mode logo file exists.

## Release (signed APK)

1. Once per machine, create the upload key (keep it and its passwords outside the repo, and back them up: losing the key means the app can't be updated):
   ```bash
   keytool -genkey -v -keystore %USERPROFILE%\keys\quikfly-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias quikfly
   ```
2. Create `apps/mobile/android/key.properties` (git-ignored):
   ```
   storeFile=C:/Users/<you>/keys/quikfly-upload.jks
   storePassword=...
   keyAlias=quikfly
   keyPassword=...
   ```
   Without it, release builds are signed with the debug key (fine for testing, not for sharing).
3. Bump `version:` in `pubspec.yaml` (`1.2.0+5`: the number after `+` must go up every release), then:
   ```bash
   flutter build apk --release      # build/app/outputs/flutter-apk/app-release.apk
   ```
4. Publish it as a GitHub Release (see `docs/operations.md`); the website's "Get it on Google Play" button links to the latest release.
