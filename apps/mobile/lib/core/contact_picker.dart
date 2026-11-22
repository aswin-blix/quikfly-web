// The phone's own "choose a contact number" screen (MainActivity.kt). It needs no contacts
// permission: Android hands over only the one number the person picks. Elsewhere, type it.
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'phone_hint.dart' show tenDigitMobile;

const contactPickerChannel = MethodChannel('quikfly/contact_picker');

bool get contactPickerSupported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

/// What was picked: `phone` is null when it isn't an Indian mobile.
typedef PickedContact = ({String name, String? phone});

/// Null when the person closed the picker or the phone has none.
Future<PickedContact?> pickContact() async {
  if (!contactPickerSupported) return null;
  try {
    final r = await contactPickerChannel.invokeMapMethod<String, String>('pick');
    if (r == null) return null;
    return (name: (r['name'] ?? '').trim(), phone: tenDigitMobile(r['phone'] ?? ''));
  } on PlatformException {
    return null;
  } on MissingPluginException {
    return null;
  }
}
