// Build-time settings. Pass them with --dart-define (see apps/mobile/README.md):
//   flutter run --dart-define=API_URL=http://10.0.2.2:8787/v1     (emulator → local API)
//   flutter build apk --release                                     (production API)

/// Base URL of the QuikFly REST API, ending in /v1.
const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://quikfly-api.quikfly-api.workers.dev/v1',
);

/// The fixed login code while there is no SMS provider (decision 2026-11-16).
/// Shown as a hint on the OTP screen; empty hides the hint.
const demoOtp = String.fromEnvironment('DEMO_OTP', defaultValue: '1234');

/// Where the website lives (help links, shared ride links).
const webUrl = String.fromEnvironment(
  'WEB_URL',
  defaultValue: 'https://quikfly-web.quikfly-api.workers.dev',
);
