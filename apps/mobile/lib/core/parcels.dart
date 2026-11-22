// Parcel helpers without widgets: times, the tracking link, what "Share" sends, typed numbers.
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'env.dart';

/// "28 Nov, 4:00 pm". Always India time, like the timetable, whatever the phone's time zone.
String parcelTime(DateTime at) {
  final india = at.toUtc().add(const Duration(hours: 5, minutes: 30));
  return DateFormat('d MMM, h:mm a').format(india).replaceAll('AM', 'am').replaceAll('PM', 'pm');
}

/// The website's public tracking page, for the receiver and the QR code.
String parcelTrackUrl(String lr) => '$webUrl/parcels/track?lr=${Uri.encodeQueryComponent(lr)}';

/// What "Share" sends. Never the collection code, a name or the contents.
String parcelShareText(String lr, String from, String to) =>
    "A QuikFly parcel ($lr) is booked from $from to $to. Follow it here; to collect it you'll need the code from the sender. ${parcelTrackUrl(lr)}";

/// A typed or pasted number as up to 10 digits. A digit too many never shifts the others along,
/// which would leave a valid-looking number belonging to someone else.
String mobileDigits(String input) {
  var d = input.replaceAll(RegExp(r'\D'), '');
  if (d.length == 12 && d.startsWith('91')) {
    d = d.substring(2);
  } else if (d.length == 11 && d.startsWith('0')) {
    d = d.substring(1);
  }
  return d.length > 10 ? d.substring(0, 10) : d;
}

class MobileNumberFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = mobileDigits(newValue.text);
    return digits == newValue.text ? newValue : TextEditingValue(text: digits, selection: TextSelection.collapsed(offset: digits.length));
  }
}
