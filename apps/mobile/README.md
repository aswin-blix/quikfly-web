# QuikFly Android app

(iPhone test builds from the same project: see **iPhone** below.)

Three Android apps from one Flutter project, on the same REST API as the website (`apps/api`), shared as signed APKs on GitHub Releases (no Play Store until the client signs off):

| App | Flavor | Package id | Entry point |
|---|---|---|---|
| **QuikFly** (customers, seven services; parcels show only while switched on) | `customer` (default) | `com.quikfly.app` | `lib/main.dart` |
| **QuikFly Partner** (vehicle owners: registration, onboarding, vehicles, drivers, renewals, trips, revenue dashboard, statements and payouts) | `partner` | `com.quikfly.partner` | `lib/main_partner.dart`, screens in `lib/partner/` |
| **QuikFly Captain** (drivers: go online, ride offers read aloud, PIN start, cash at the end, trips; [docs/driver-app-plan.md](../../docs/driver-app-plan.md)) | `captain` | `com.quikfly.captain` | `lib/main_captain.dart`, screens in `lib/captain/` |

They share `lib/api`, `lib/theme`, `lib/widgets` and the login screen. On Android the login screen first opens Google's "Choose a phone number" sheet (`lib/core/phone_hint.dart`, `smart_auth` plugin, free via Play services); elsewhere the number is typed. `pubspec.yaml` sets `default-flavor: customer`, so plain `flutter run` / `flutter build apk` build the customer app; add `--flavor partner -t lib/main_partner.dart` for the Partner app and `--flavor captain -t lib/main_captain.dart` for Captain.

Flutter 3.47 · Dart 3.13 (releases are built with **Flutter 3.47.9**; on a Mac it's pinned with `fvm global 3.47.9`. 3.50 deprecates importing `package:flutter/material.dart`: upgrade in its own PR after sign-off, decisions.md 2026-11-26) · Riverpod 3 · go_router · Dio · flutter_secure_storage · smart_auth (phone-number hint)

## Run

```bash
cd apps/mobile
flutter pub get
flutter run                                                      # device/emulator → production API
flutter run --dart-define=API_URL=http://10.0.2.2:8787/v1        # emulator → local API (npm run dev:api)
flutter run --dart-define=API_URL=http://<PC LAN IP>:8787/v1     # phone on the same Wi-Fi → local API (start wrangler with --ip 0.0.0.0)
flutter run --flavor partner -t lib/main_partner.dart --dart-define=API_URL=http://10.0.2.2:8787/v1   # the Partner app
flutter run --flavor captain -t lib/main_captain.dart --dart-define=API_URL=http://10.0.2.2:8787/v1   # QuikFly Captain
```

Quick UI checks without an emulator: build the web target and open it in Chrome at phone width (the web build is for development only, not shipped):

```bash
flutter build web --dart-define=API_URL=http://127.0.0.1:8787/v1
python -m http.server 5181 --directory build/web     # then open http://127.0.0.1:5181
```

Build-time settings (`lib/core/env.dart`, passed with `--dart-define`):

| Name | Default | Purpose |
|---|---|---|
| `API_URL` | production API (`https://api.quikfly.in/v1` from 0.1.19; 0.1.18 and older use the workers.dev address) | Base URL ending in `/v1` |
| `DEMO_OTP` | `1234` | Hint on the OTP screen ("Demo: no SMS is sent"); empty hides it |
| `WEB_URL` | production website | Shared ride links and help links |

Debug builds allow plain `http` (local API); release builds use `https` only.

## Test

```bash
flutter analyze                                                   # must be clean
flutter test --dart-define=API_URL=http://127.0.0.1:8787/v1      # contract test against a running API
```

`test/api_contract_test.dart` signs in a throwaway number, then parses real responses into the Dart models and checks the flows the app uses: config, user, ride booking + share link, catalog, quote + coupon + booking, bus seats, rent and group quotes, licence, account writes (profile, places, travellers, contacts, GST), wallet, and a parcel booked, tracked and cancelled (skipped on production and while parcels are off). Run it whenever `packages/shared/src/types.ts` changes. Without `API_URL` it runs against production with the test number +91 90000 00002.

## Layout

```
lib/
  main.dart            ProviderScope + MaterialApp.router (light/dark themes)
  router.dart          every screen's path: tab shell (/, /offers, /trips, /account) + full-screen routes
  core/                env.dart (dart-defines) · format.dart (₹, dates, phone) · services.dart (the seven services) · parcels.dart (India times, tracking link, share text) · contact_picker.dart
  theme/               tokens.dart (colours, fonts, radii; mirrors apps/web tokens.css) · theme.dart (Material themes from tokens)
  api/                 api.dart (one method per endpoint, ApiException) · models.dart (mirrors packages/shared types + Rules) · vendor_models.dart · support_models.dart · rental_models.dart · parcel_models.dart
  state/               providers.dart (api, /config, session, theme mode) · catalog.dart (tours, cars, vehicles, bookings)
  widgets/             ui.dart (Panel, GoldButton, ErrorBox, EmptyState, Skeleton, Pill, KeyValue, toast, confirm, ScreenList) · art.dart · logo.dart · offer_card.dart
  screens/             auth, home, offers, trips (+ bus m-ticket with QR, self-drive rental and its photo checklist in rental_screen.dart), account (hub + account_sections, notifications inbox opened from the Home bell, privacy_screens: `/privacy` notice, `PrivacyGate` consent page above the router in both apps, Privacy & data with the JSON export), help (+ support_screens: tickets, thread, new ticket, callback sheet, WhatsApp button), ride (+ place search),
                       bus, holidays, checkout (checkout, confirmed, invoice), rent (cars, group travel), parcel (`/parcels` form, `/parcels/track` public tracking, `/parcel/:id` with the code), not_found
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
- Show errors with `FormError`, `ErrorBox` or a field's `errorText`; wrap one drawn another way in `LiveError`, or screen readers won't read it out (`test/error_announce_test.dart` checks).

## Parcels

- Every request declares the services this app shows (`ServiceKey.clientAccept`); without it the API keeps parcels back. Add a service to `ServiceKey.declared` only when every screen that lists bookings can show it. Bookings of a service the app doesn't know are dropped, never shown as a cab.
- The collection code shows only on `/parcel/:id`. A receiver's details live in the checkout draft (memory only, dropped at sign-out), never in booking lines.
- Two kinds on one form: Bus parcel and Quick parcel. `isQuickParcel(booking)` (no start time) switches the refund preview and the wording; `courier_steps.dart` shows the captain, the pickup code and the demo's hand-offs.
- The receiver can be picked from contacts: `MainActivity.kt` opens Android's own picker over the `quikfly/contact_picker` channel. No contacts permission, so don't add a plugin that declares one.
- Times are shown in India time whatever the phone's zone.

## Languages

`l10n.yaml` generates `lib/l10n` (`L.of(context).key`) from `packages/shared/i18n/app_<lang>.arb`, the same strings as the website; `flutter build` regenerates it, but after editing the `.arb` files run `flutter gen-l10n` before analyze or tests (`test/l10n_test.dart` checks). `core/language.dart` keeps the chosen language (`quikfly.lang`) and gives MaterialApp its locale; the `LanguagePicker` (Account, Partner account) and Tamil/Hindi appear only while the owner's `featureLanguages` setting is on. Screens move their text into the catalog at the feature freeze (docs/roadmap.md).

## Phone notifications

Both apps get push notifications through Firebase Cloud Messaging (`lib/state/push.dart`); the API's cron sends every new inbox row to the account's registered phones.

- **Switching it on (owner):** in the Firebase project, add two Android apps (`com.quikfly.app` and `com.quikfly.partner`), download each one's `google-services.json`, and put them at `android/app/src/customer/google-services.json` and `android/app/src/partner/google-services.json`. They are git-ignored (this repo is public), so keep a copy next to the upload key. With both files present the Google services plugin is applied (`android/app/build.gradle.kts`); without them the apps build exactly as before and push stays off: no prompt, no registration. **QuikFly Captain** needs a third Android app in the same Firebase project (`com.quikfly.captain`) and its file at `android/app/src/captain/google-services.json`; until then its Firebase step is skipped, so it builds and runs with push off (offers still arrive through its heartbeat). The API side needs `FCM_SERVICE_ACCOUNT` (docs/operations.md → Push notifications).
- **Asking:** never at launch. A card offers it in the inbox ("Get these on your phone"), after a confirmed booking ("Want updates on this trip?") and on a live partner's home ("Hear about new trips"); "Turn on" shows Android 13's own prompt. "Not now" hides the card; the inbox keeps a **Notifications on this phone** switch, which also turns them off inside QuikFly without touching Android's settings, and says how to unblock them in Android settings.
- **What happens:** after sign-in the phone's FCM token is registered (`POST /me/push-devices`, platform `android`, `app` = this app's `NotificationScope`, so QuikFly Partner gets only partner updates and QuikFly only the rest), and again when Firebase refreshes it; signing out removes it first, while the session is still valid. In the background or when closed, Android shows the notification itself on the `quikfly_updates` channel (created in `MainActivity.kt`) with the bell icon `res/drawable/ic_stat_quikfly.xml` and the gold accent. In the foreground a banner shows with **View** and the inbox refreshes. A tap opens the same screen as the inbox row (`core/notifications.dart`; QuikFly Partner always opens its inbox).
- **Token API:** `getToken`, `onTokenRefresh` and `deleteToken` are deprecated in firebase_messaging 17 in favour of `register()`/`onRegistered`, which hand out a Firebase Installation ID. The API sends with FCM HTTP v1's `message.token` (the registration token), so the app keeps the token calls until the sender changes.
- The bell's count refreshes when the app returns to the foreground.

## iPhone (iOS, test builds only)

`ios/` holds the iPhone project (added 2026-11-27, [docs/ios-app-plan.md](../../docs/ios-app-plan.md)). Until the client signs off there's no Apple Developer Program: builds are installed from the Mac with a free Apple ID, keep opening for **7 days**, and have **no push** (`PushStatus.unavailable`, as on an Android build without `google-services.json`). The Android-only parts (phone-number hint, contact picker) already hide themselves on iOS.

- **Flavors:** the `customer`, `partner` and `captain` schemes with `Debug/Release/Profile-<flavor>` configurations, bundle ids `com.quikfly.app` / `com.quikfly.partner` / `com.quikfly.captain`, names "QuikFly" / "QuikFly Partner" / "QuikFly Captain", icons `AppIcon` / `AppIcon-partner` / `AppIcon-captain`. Made by `tool/ios_flavors.rb` (re-run it if `flutter create` ever regenerates the project): `GEM_HOME=$(brew --prefix cocoapods)/libexec $(brew --prefix ruby)/bin/ruby tool/ios_flavors.rb`.
- **Icons:** iOS wants one opaque 1024 px icon; `swift tool/ios_icons.swift` makes all three from the squares `node scripts/app-icons.mjs` draws (`assets/icon/icon.png`, `icon-partner.png`, `icon-captain.png`). Run it after that script.
- **Plugins** come in through Swift Package Manager (no CocoaPods); `Package.resolved` is committed. Minimum iOS 15.
- **Info.plist:** camera and photo-library reasons (image_picker uploads) and `NSAllowsLocalNetworking`, so debug builds reach a local API over http. Links open with `launchUrl` only, so no `LSApplicationQueriesSchemes` list is needed.
- **Simulator** (no Apple ID needed):
  ```bash
  flutter build ios --simulator --debug --flavor customer --dart-define=API_URL=http://127.0.0.1:8787/v1
  xcrun simctl boot "iPhone 17"; xcrun simctl install "iPhone 17" build/ios/iphonesimulator/Runner.app
  xcrun simctl launch "iPhone 17" com.quikfly.app        # Partner: --flavor partner -t lib/main_partner.dart, com.quikfly.partner
  xcrun simctl io "iPhone 17" screenshot shot.png         # xcrun simctl ui "iPhone 17" appearance dark for dark mode
  ```
- **Your own iPhone** (free Apple ID): sign in once in Xcode → Settings → Accounts (the owner does this; agents never type the Apple ID password). On the iPhone turn on Settings → Privacy & Security → **Developer Mode** (it restarts) and trust the Mac. Then, with the phone unlocked and connected: `flutter run --release --flavor customer -d <iPhone id>` (`flutter devices` lists it); Flutter picks the signing team from Xcode. The first time, trust the developer on the phone: Settings → General → VPN & Device Management. Reinstall the same way after 7 days. A free Apple ID may find `com.quikfly.app` already registered by someone else; then build with another bundle id for testing only.
- `GoogleService-Info.plist` (Firebase for iOS, after sign-off) is git-ignored like `google-services.json`.

## QuikFly Captain (version 1)

`lib/captain/` (state in `captain_state.dart`, screens next to it), on the `/driver` endpoints (apps/api/README.md → Captain).
- **Who can sign in:** a driver a partner added in QuikFly Partner, with the same mobile number. Anyone else sees "Not set up as a captain yet" and why (the API's words).
- **Online:** only while the app is on screen (background location is step 7). A heartbeat (`POST /driver/ping`) every 15 s, every 5 s with an offer or a ride (`rules.pingIdleSeconds` / `pingBusySeconds` from the API); a push for an offer asks at once. Positions are **demo locations**: the captain picks a place to start from, and on a trip the app moves itself `demoStepUnits` (about 1 km) per heartbeat towards the pickup, then the drop. With the owner's `driverDemoLocation` off, the app explains that GPS comes later.
- **Offers** show the whole trip and the whole money split (exact paise, so it adds up), with a countdown; declining is free. They are read aloud by the phone's own text-to-speech (`speech.dart` → the `quikfly/speech` channel: `TextToSpeech` in `MainActivity.kt`, `AVSpeechSynthesizer` in `AppDelegate.swift`; no plugin, so the iPhone project stays on Swift Package Manager) in the captain's voice language (English, Tamil, Hindi; set in Account, apart from the app's language). The Tamil and Hindi phrases need a native speaker's check.
- **The ride:** directions link to Google Maps (`CityGeo.toLatLng`, a plain link, no paid maps), call the rider (until the trip starts), "I've arrived", the rider's PIN (tries left, lock), "End the trip", "I can't do this ride" with the API's reasons. A cash ride ends on a full-screen **Collect ₹X**.
- **How it works** is built from `GET /driver` → `rules`, never typed in the app.
- Tests: `test/captain_test.dart` (models, voice, screens at phone/tablet/large text in light and dark), `test/captain_routes_test.dart`, the contract test (`GET /driver`).

## Icons and fonts

- Launcher icons: all three are drawn from the Q of the logo (`brand/quikfly-logo.svg`) by `node scripts/app-icons.mjs` (repo root; needs Chrome or Edge). Never edit the PNGs by hand: change the script and run it again.
  - **QuikFly (customer):** the gold Q on the navy background (`assets/icon/background.png`, the one hand-made source).
  - **QuikFly Partner:** the gold Q with a blue tick on the brand's near-black, so the apps are easy to tell apart on one phone.
  - **QuikFly Captain:** the gold Q with a green navigation arrow on a deep green.
  - The script writes every density into each flavor's `android/app/src/<flavor>/res` (`mipmap-*`: legacy and round icons, the adaptive background, foreground and monochrome layers, and `mipmap-anydpi-v26/ic_launcher*.xml`; the monochrome layer is Android 13+'s themed icon), the full squares `assets/icon/icon.png`, `icon-partner.png` and `icon-captain.png` (the iPhone sources), and the shared icon in `src/main/res`, which no flavor shows.
  - Sizes, colours and the Q's position inside the logo are constants at the top of the script. If the logo is redrawn, re-measure `Q` and `Q_OUTLINE` there.
- Outfit is shipped as static weights (400/500/600/700) cut from the variable font with `fonttools varLib.instancer`, because Flutter doesn't map `FontWeight` onto a variable font's axis.
- `lib/core/cancellation.dart` is a Dart copy of `packages/shared/src/cancellation.ts`: it previews the refund before cancelling; the API decides the amount.
- `assets/images/logo.png` is rendered from `brand/quikfly-logo.svg` by `node scripts/logo.mjs` (transparent, 1240×378; Flutter's SVG support drops the logo's glow filters, so the apps use a sharp PNG). `AppLogo` shows it bare in dark mode and on a dark plate (the dark theme's `surface`, shape in `Brand.logoPlate*`) in light mode, because the logo was drawn on black; the padding is the same in both themes so nothing moves (`test/logo_test.dart`).

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
