# iPhone apps: plan

Status: **step 1 done (2026-11-27):** the iOS project, flavors, icons and Info.plist are in `main` (#161); both apps ran in the iPhone Simulator and are installed on the owner's iPhone (0.1.19, release builds against production, free personal team; they stop opening around 2026-12-04). Waiting for the owner's hands-on findings (step 3). Step 2 (Partner on iPhone) is largely covered: it builds, installs and opens; its screens get checked with step 3. How to build: [apps/mobile/README.md](../apps/mobile/README.md) → iPhone.

Both QuikFly apps are Android only today: `apps/mobile` has no `ios/` folder, and every release (up to 0.1.19) is an APK. On an iPhone, customers can already use the website (https://quikfly.in in Safari, Share → Add to Home Screen). This plan adds real iPhone builds of the same Flutter apps, without paying for anything before the client signs off.

## What it costs, and what free can and can't do

| | Free Apple ID (now) | Apple Developer Program (₹8,700 / year, after sign-off) |
|---|---|---|
| Install on the owner's own iPhone from the Mac (Xcode) | Yes | Yes |
| How long an install keeps opening | **7 days**, then reinstall from the Mac | A year |
| Apps at once | 3 | No limit |
| Share with testers (TestFlight) | No | Yes |
| Push notifications (APNs) | **No** (personal teams can't use the capability) | Yes |
| App Store | No | Yes |

So until sign-off, iPhone builds are for the owner's and the demo's own phones, reinstalled from the Mac, with notifications off. That's honest to show in a demo: the inbox still works; only the push to a closed app is missing.

## What the code already handles

The Android-only parts already turn themselves off elsewhere, so the shared Dart code mostly runs as it is:

- **Google's phone-number picker** at login: `phoneHintSupported` is Android only (`lib/core/phone_hint.dart`). iPhone users type the number, which iOS autofills from contacts.
- **Receiver contact picker** for parcels: `contactPickerSupported` is Android only (`lib/core/contact_picker.dart`, our own `quikfly/contact_picker` channel in `MainActivity.kt`). iPhone users type the receiver's number.
- **Push**: `Firebase.initializeApp()` sits in a try/catch (`lib/state/push.dart`), so without Firebase's iOS file the apps run with push off, the same as an Android build without `google-services.json`.
- **Packages:** dio, Riverpod, go_router, flutter_secure_storage (Keychain), shared_preferences, image_picker, share_plus, url_launcher, qr_flutter and firebase_* all support iOS. smart_auth is used only behind the Android check.

## Steps

**1. The iPhone project and a test build of QuikFly (free).**
- `flutter create --platforms=ios --org com.quikfly .` in `apps/mobile` adds `ios/`. Bundle ids follow Android: `com.quikfly.app` and `com.quikfly.partner`.
- **Flavors:** `pubspec.yaml` sets `default-flavor: customer`, so iOS needs matching Xcode schemes and build configurations (`customer` and `partner`, each Debug/Release/Profile) with their own bundle id and display name ("QuikFly", "QuikFly Partner"). Without them, `flutter run` on iOS fails.
- **Info.plist:** camera and photo library reasons (rental checklist photos, partner documents and vehicle photos, through image_picker); `NSAllowsLocalNetworking` for local test APIs; no location permission (the apps don't use it). No `LSApplicationQueriesSchemes`: the apps open tel, mailto and wa.me links with `launchUrl` and never ask `canLaunchUrl` (found while building step 1).
- **Icons:** iOS icons must be square and opaque. `tool/ios_icons.swift` renders one 1024 px icon per app from the Android art (QuikFly on its dark background; Partner from its adaptive layers, zoomed 1.3× so the sparkle clears iOS's rounded corners). The transparent logo rule (never on a badge) applies to screens, not to the app icon, which already has a background on Android.
- **Sign and install:** the owner signs in to Xcode with their Apple ID (Xcode → Settings → Accounts) and picks their personal team; on the iPhone: Settings → Privacy & Security → Developer Mode on, trust the Mac and then the developer profile (Settings → General → VPN & Device Management). Claude never types the Apple ID password.
- **Check:** home, sign-in with OTP 1234, a bus search, a ride quote, My Trips, wallet, a share sheet, a camera upload, dark mode, at iPhone sizes. `flutter analyze` and `flutter test` stay green (the tests don't depend on the platform).

**2. QuikFly Partner on iPhone (free).** The `partner` scheme from step 1 with `-t lib/main_partner.dart`, its icon and name; check registration, fleet, documents upload and payouts. A free Apple ID allows 3 apps at once, so both fit.

**3. iPhone details found in step 1's check.** Expected small fixes, each its own PR: safe areas (notch, home bar) on full-screen pages and sheets, the keyboard covering inputs, iOS back-swipe on pages that guard leaving (unsaved forms, the ride screen), date and time pickers, and text that assumes Android words ("Android settings").

**4. After sign-off (paid): notifications, testers, App Store.** Join the Apple Developer Program in the client's company name; add the two iOS apps to Firebase project `quikfly-dfe56`, download each `GoogleService-Info.plist` (git-ignored, like `google-services.json`), upload an APNs key to Firebase; turn on the Push Notifications capability; then TestFlight builds for testers, and an App Store listing (privacy answers from docs/privacy.md, screenshots, review). The API side needs nothing new: `POST /me/push-devices` already takes `platform`, and FCM HTTP v1 delivers to iOS tokens too.

## Rules that carry over

- The customer app (QuikFly) never gets partner screens, on iOS too.
- Same API, same contract test; no iOS-only endpoints.
- Release builds stay with the owner (signing), Claude verifies and checks on the phone, as for Android.
- Free tier until sign-off: no Apple Developer Program fee before then (decisions.md 2026-11-27).
