# QuikFly Android app

Two Android apps from one Flutter project, on the same REST API as the website (`apps/api`), shared as signed APKs on GitHub Releases (no Play Store until the client signs off):

| App | Flavor | Package id | Entry point |
|---|---|---|---|
| **QuikFly** (customers, all six services) | `customer` (default) | `com.quikfly.app` | `lib/main.dart` |
| **QuikFly Partner** (vehicle owners: registration, onboarding, vehicles, drivers, renewals, trips, revenue dashboard, statements and payouts) | `partner` | `com.quikfly.partner` | `lib/main_partner.dart`, screens in `lib/partner/` |

They share `lib/api`, `lib/theme`, `lib/widgets` and the login screen. On Android the login screen first opens Google's "Choose a phone number" sheet (`lib/core/phone_hint.dart`, `smart_auth` plugin, free via Play services); elsewhere the number is typed. `pubspec.yaml` sets `default-flavor: customer`, so plain `flutter run` / `flutter build apk` build the customer app; add `--flavor partner -t lib/main_partner.dart` for the Partner app.

Flutter 3.47 · Dart 3.13 · Riverpod 3 · go_router · Dio · flutter_secure_storage · smart_auth (phone-number hint)

## Run

```bash
cd apps/mobile
flutter pub get
flutter run                                                      # device/emulator → production API
flutter run --dart-define=API_URL=http://10.0.2.2:8787/v1        # emulator → local API (npm run dev:api)
flutter run --dart-define=API_URL=http://<PC LAN IP>:8787/v1     # phone on the same Wi-Fi → local API (start wrangler with --ip 0.0.0.0)
flutter run --flavor partner -t lib/main_partner.dart --dart-define=API_URL=http://10.0.2.2:8787/v1   # the Partner app
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

`test/api_contract_test.dart` signs in a throwaway number, then parses real responses into the Dart models and checks the flows the app uses: config, user, ride booking + share link, catalog, quote + coupon + booking, bus seats, rent and group quotes, licence, account writes (profile, places, travellers, contacts, GST), wallet. Run it whenever `packages/shared/src/types.ts` changes. Without `API_URL` it runs against production with the test number +91 90000 00002.

## Layout

```
lib/
  main.dart            ProviderScope + MaterialApp.router (light/dark themes)
  router.dart          every screen's path: tab shell (/, /offers, /trips, /account) + full-screen routes
  core/                env.dart (dart-defines) · format.dart (₹, dates, phone) · services.dart (the six services)
  theme/               tokens.dart (colours, fonts, radii; mirrors apps/web tokens.css) · theme.dart (Material themes from tokens)
  api/                 api.dart (one method per endpoint, ApiException) · models.dart (mirrors packages/shared types + Rules) · vendor_models.dart · support_models.dart · rental_models.dart
  state/               providers.dart (api, /config, session, theme mode) · catalog.dart (tours, cars, vehicles, bookings)
  widgets/             ui.dart (Panel, GoldButton, ErrorBox, EmptyState, Skeleton, Pill, KeyValue, toast, confirm, ScreenList) · art.dart · logo.dart · offer_card.dart
  screens/             auth, home, offers, trips (+ bus m-ticket with QR, self-drive rental and its photo checklist in rental_screen.dart), account (hub + account_sections, notifications inbox opened from the Home bell, privacy_screens: `/privacy` notice, `PrivacyGate` consent page above the router in both apps, Privacy & data with the JSON export), help (+ support_screens: tickets, thread, new ticket, callback sheet, WhatsApp button), ride (+ place search),
                       bus, holidays, checkout (checkout, confirmed, invoice), rent (cars, group travel), not_found
  state/checkout.dart  CheckoutDraft (what a service screen hands to checkout) + LiveQuote (debounced POST /quotes)
  widgets/             also city_map.dart (painted demo map), safety_sheet.dart, licence_panel.dart, counter.dart
assets/                fonts (Outfit static weights, Archivo Black), images/ (logo) and images/services/ (one 1200 px WebP per service,
                       same files as the website; screens use serviceOf(key).image), icon (launcher icon sources)
```

## Rules (same as the website)

- **The API sets every price.** Live estimates call `POST /quotes` (or `/rides/quote`); bookings send a `quoteId` or `rideId`, never an amount. No price maths in Dart.
- **Lists come from the API**: `GET /config` (settings, places, ride options, cities, operators, routes, destinations, offers, FAQs) and the catalog endpoints. No hard-coded catalog data.
- **Colours only from `theme/tokens.dart`** through `context.qf` (or the Material theme). No raw `Color(0x...)` in screens, except artwork in `widgets/art.dart`.
- **Validation rules** are copied from `packages/shared/src/rules.ts` into `Rules` in `models.dart`. Change both together.
- Every screen works at 390 px wide and on tablets (content is capped at 720 px), in light and dark mode.
- Simulations are labelled honestly ("Demo: no SMS is sent").

## Languages

`l10n.yaml` generates `lib/l10n` (`L.of(context).key`) from `packages/shared/i18n/app_<lang>.arb`, the same strings as the website; `flutter build` regenerates it, but after editing the `.arb` files run `flutter gen-l10n` before analyze or tests (`test/l10n_test.dart` checks). `core/language.dart` keeps the chosen language (`quikfly.lang`) and gives MaterialApp its locale; the `LanguagePicker` (Account, Partner account) and Tamil/Hindi appear only while the owner's `featureLanguages` setting is on. Screens move their text into the catalog at the feature freeze (docs/roadmap.md).

## Icons and fonts

- Launcher icons: the two apps have different icons.
  - **QuikFly (customer):** an Android Studio Image Asset export, copied as is into `android/app/src/customer/res` (`mipmap-*`: legacy and round icons, adaptive background, foreground and monochrome layers, and `mipmap-anydpi-v26/ic_launcher.xml`). It overrides `src/main` for the customer flavor only. To change it, export a new set and replace those `mipmap-*` folders. The monochrome layer is Android 13+'s themed icon.
  - **QuikFly Partner:** the shared icon in `src/main/res`, from `assets/icon/icon.png` and `icon-foreground.png` via `dart run flutter_launcher_icons`. Running that command rewrites `src/main` only, so it doesn't touch the customer icon.
- Outfit is shipped as static weights (400/500/600/700) cut from the variable font with `fonttools varLib.instancer`, because Flutter doesn't map `FontWeight` onto a variable font's axis.
- `lib/core/cancellation.dart` is a Dart copy of `packages/shared/src/cancellation.ts`: it previews the refund before cancelling; the API decides the amount.
- `assets/images/logo.png` is rendered from `brand/quikfly-logo.svg` by `node scripts/logo.mjs` (transparent; Flutter's SVG support drops the logo's glow filters, so the apps use a sharp PNG). `AppLogo` shows it bare in both themes, never on a badge or background (`test/logo_test.dart`).

## Release (signed APK)

The upload key signs every APK shared with the client. Android installs an update only when it is signed with the same key, so **losing the key or its password means the client's app can never be updated**. The owner keeps both and backs them up.

1. Once per machine, the owner creates the key in their own terminal (keytool asks for the password; it never goes into a file or a chat):
   ```powershell
   keytool -genkeypair -v -keystore "$env:USERPROFILE\keys\quikfly-upload.jks" -storetype PKCS12 -keyalg RSA -keysize 2048 -validity 10000 -alias quikfly -dname "CN=QuikFly, O=QuikFly Mobility Pvt. Ltd., L=Chennai, ST=Tamil Nadu, C=IN"
   ```
   If `keytool` isn't on the PATH, it's in the JDK's `bin` folder. PKCS12 uses one password for the store and the key.
2. `apps/mobile/android/key.properties` (git-ignored) points at the key, without the password:
   ```
   storeFile=C:/Users/<you>/keys/quikfly-upload.jks
   keyAlias=quikfly
   ```
3. Give the build the password through the environment (or add a `storePassword=` line to `key.properties` if you accept it on disk):
   ```powershell
   $env:QUIKFLY_KEYSTORE_PASSWORD = Read-Host "Keystore password" -MaskInput     # this terminal only; hidden, not in history
   ```
   Don't type the password inside double quotes: PowerShell expands `$` in `"..."`, which silently changes a password containing `$` ("keystore password was incorrect").
   With `key.properties` present and no password, release builds stop with an error instead of falling back to the debug key. Without `key.properties`, release builds use the debug key (fine for testing, never for sharing).
4. Bump `version:` in `pubspec.yaml` (`1.2.0+5`: the number after `+` must go up every release), then build one APK per phone type (about 20 MB each instead of one 58 MB file):
   ```bash
   flutter build apk --release --split-per-abi   # build/app/outputs/flutter-apk/app-arm64-v8a-customer-release.apk (most phones), armeabi-v7a, x86_64
   # Partner app: flutter build apk --release --split-per-abi --flavor partner -t lib/main_partner.dart  → app-arm64-v8a-partner-release.apk
   # (publish as QuikFlyPartner-arm64.apk / QuikFlyPartner-armv7.apk; the customer app keeps QuikFly-arm64.apk / QuikFly-armv7.apk)
   ```
   Check the signature with the SDK's `apksigner` (`keytool -printcert -jarfile` prints nothing: these APKs use signature scheme v2 only):
   ```bash
   <android-sdk>/build-tools/<version>/apksigner verify --print-certs build/app/outputs/flutter-apk/app-arm64-v8a-customer-release.apk
   ```
   It must show `CN=QuikFly, O=QuikFly Mobility Pvt. Ltd.` and certificate SHA-256 `c784cef550dc5fa5fc64c55a2ec6eec89981fd2d750aff9a496c9b4017033aae`, never `CN=Android Debug`.
   Split APKs get version codes per ABI (e.g. 2001 for arm64-v8a with `+1`); that's normal.
5. Publish as a GitHub Release (owner's approval for each release). Copy the arm64 and armeabi-v7a APKs to the **stable names** `QuikFly-arm64.apk` and `QuikFly-armv7.apk`, so `https://github.com/aswin-blix/quikfly-web/releases/latest/download/QuikFly-arm64.apk` always serves the newest build:
   ```bash
   gh release create app-v<version> QuikFly-arm64.apk QuikFly-armv7.apk QuikFlyPartner-arm64.apk QuikFlyPartner-armv7.apk \
     --target <full commit sha> --title "QuikFly <version> + QuikFly Partner <version>" --notes-file notes.md --latest
   ```
   Notes are written for testers: which file to pick, how to install from outside the Play Store, demo OTP and simulated payments, SHA-256 of each file and the certificate fingerprint (copy the layout of the previous release, e.g. `app-v0.1.12`: what's new per app, which file to pick, install steps, demo notes, checksums). `--target` needs the full 40-character SHA. Don't mark it pre-release: `releases/latest` skips pre-releases.
