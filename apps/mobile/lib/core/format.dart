// Formatting helpers: rupees, dates and times the way the website shows them.
import 'package:intl/intl.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// 35908 → "₹35,908"
String inr(num v) => _inr.format(v);

/// Signed rupees for wallet entries: +₹500 / −₹200
String inrSigned(num v) => '${v < 0 ? '−' : '+'}${_inr.format(v.abs())}';

/// YYYY-MM-DD in local time (what the API expects for dates).
String isoDate(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

/// "Tue, 18 Nov"
String shortDate(DateTime d) => DateFormat('EEE, d MMM').format(d);

/// "18 Nov 2026"
String longDate(DateTime d) => DateFormat('d MMM yyyy').format(d);

/// "18 Nov 2026, 4:05 pm"
String dateTime(DateTime d) => DateFormat('d MMM yyyy, h:mm a').format(d).replaceAll('AM', 'am').replaceAll('PM', 'pm');

/// "9876543210" or "+91 9876543210" (the API's format) → "+91 98765 43210"
String phoneDisplay(String p) {
  final d = p.replaceAll(RegExp(r'\D'), '');
  if (d.length < 10) return p;
  final n = d.substring(d.length - 10);
  return '+91 ${n.substring(0, 5)} ${n.substring(5)}';
}
