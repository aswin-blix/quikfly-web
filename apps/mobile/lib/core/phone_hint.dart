// Google's "Choose a phone number" sheet (Phone Number Hint API, part of Play services: free,
// no SMS, no permission). Android only; everywhere else, or if Play services is missing, it
// returns null and the user types the number.
import 'package:flutter/foundation.dart';
import 'package:smart_auth/smart_auth.dart';

import '../api/models.dart';

/// True where the sheet can appear, so the login screen knows whether to wait for it.
bool get phoneHintSupported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

/// Shows the sheet and returns the picked SIM number as 10 digits, or null when the user
/// closes it, the number isn't an Indian mobile, or the sheet can't open.
Future<String?> pickPhoneNumber() async {
  if (!phoneHintSupported) return null;
  try {
    final r = await SmartAuth.instance.requestPhoneNumberHint();
    if (!r.isSuccess || r.data == null) return null;
    return tenDigitMobile(r.data!);
  } catch (_) {
    return null;
  }
}

/// "+91 94881 31904", "094881 31904" or "9488131904" → "9488131904"; null for anything else
/// (foreign numbers included: sign-in is +91 only).
String? tenDigitMobile(String raw) {
  final d = raw.replaceAll(RegExp(r'\D'), '');
  final ten = switch (d.length) {
    10 => d,
    11 when d.startsWith('0') => d.substring(1),
    12 when d.startsWith('91') => d.substring(2),
    _ => null,
  };
  return ten != null && Rules.phone.hasMatch(ten) ? ten : null;
}
