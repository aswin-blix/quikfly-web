// Cancellation policies: a Dart copy of packages/shared/src/cancellation.ts, used to show
// the policy and the refund before the customer confirms. The API applies the same rule
// when it cancels, so the app only previews; it never decides the amount.
import '../api/models.dart';

class CancelTier {
  const CancelTier(this.hoursBefore, this.refundPercent);

  /// Cancel at least this many hours before the start, and this much comes back.
  final int hoursBefore, refundPercent;
}

final _tier = RegExp(r'^(\d+)([dh]):(\d+)$', caseSensitive: false);

/// "15d:100, 7d:50" → tiers with the longest notice first. Empty or malformed text → no tiers.
List<CancelTier> parseCancelPolicy(String text) {
  final tiers = <CancelTier>[];
  for (final part in text.split(',')) {
    if (part.trim().isEmpty) continue;
    final m = _tier.firstMatch(part.replaceAll(RegExp(r'\s+'), ''));
    if (m == null) return const [];
    final n = int.parse(m[1]!);
    tiers.add(CancelTier(m[2]!.toLowerCase() == 'd' ? n * 24 : n, int.parse(m[3]!).clamp(0, 100)));
  }
  tiers.sort((a, b) => b.hoursBefore.compareTo(a.hoursBefore));
  return tiers;
}

/// Percentage refunded for a cancellation now. No policy or no known start → 100; past the last tier → 0.
int refundPercent(List<CancelTier> tiers, DateTime? startsAt, {DateTime? now}) {
  if (tiers.isEmpty || startsAt == null) return 100;
  final hoursLeft = startsAt.difference(now ?? DateTime.now()).inMinutes / 60;
  for (final t in tiers) {
    if (hoursLeft >= t.hoursBefore) return t.refundPercent;
  }
  return 0;
}

/// Rupees refunded, rounded to whole rupees. A refundable deposit always comes back in full; the policy's percentage applies to the rest.
int refundAmount(int amount, int percent, [int deposit = 0]) {
  final held = deposit.clamp(0, amount);
  return held + ((amount - held) * percent / 100).round();
}

String noticeLabel(int hours) => hours >= 48 && hours % 24 == 0 ? '${hours ~/ 24} days' : '$hours hour${hours == 1 ? '' : 's'}';

/// Customer wording, e.g. "Free cancellation up to 15 days before travel; 50% refund up to 7 days before; no refund after that."
String describeCancelPolicy(List<CancelTier> tiers, String event) {
  if (tiers.isEmpty) return 'Free cancellation any time before $event.';
  final parts = <String>[];
  for (final t in tiers.where((t) => t.refundPercent > 0)) {
    parts.add('${t.refundPercent == 100 ? 'Free cancellation' : '${t.refundPercent}% refund'} up to ${noticeLabel(t.hoursBefore)} before${parts.isEmpty ? ' $event' : ''}');
  }
  if (parts.isEmpty) return 'Non-refundable once booked.';
  return '${parts.join('; ')}; no refund after that.';
}

/// Why a rider cancels (RIDE_CANCEL_REASONS in packages/shared/src/rules.ts): key, label, waives the fee.
const rideCancelReasons = [
  ('driver_late', 'Driver is taking too long', true),
  ('driver_not_moving', "Driver isn't coming towards me", true),
  ('driver_asked', 'Driver asked me to cancel', true),
  ('wrong_address', 'I entered the wrong pickup or drop', false),
  ('plans_changed', 'My plans changed', false),
  ('other_ride', 'I found another ride', false),
];

/// Ride cancellation fee (MVAG 2025): free within the window after booking or with a valid reason; else % of the fare, capped.
int rideCancelFee(Settings s, int fare, String? reason, DateTime bookedAt, {DateTime? now, DateTime? scheduledFor}) {
  final t = now ?? DateTime.now();
  if (rideCancelReasons.any((r) => r.$1 == reason && r.$3)) return 0;
  if (t.difference(bookedAt).inSeconds / 60 < s.rideCancelFreeMinutes) return 0;
  // A ride booked ahead is free to cancel until the free window before pickup.
  if (scheduledFor != null && scheduledFor.difference(t).inSeconds / 60 >= s.rideScheduleFreeCancelMinutes) return 0;
  final fee = (fare * s.rideCancelFeePercent / 100).round();
  return [fee, s.rideCancelFeeCap, fare].reduce((a, b) => a < b ? a : b);
}

/// What the countdown runs to, per service, for policy text.
const cancelEvent = {
  ServiceKey.bike: 'pickup',
  ServiceKey.car: 'pickup',
  ServiceKey.bus: 'departure',
  ServiceKey.tours: 'travel',
  ServiceKey.rent: 'pickup',
  ServiceKey.rentals: 'the trip',
};

/// The customer wording of a service's current policy.
String cancelPolicyText(Settings settings, ServiceKey service) =>
    describeCancelPolicy(parseCancelPolicy(settings.cancelPolicy(service)), cancelEvent[service]!);

/// The refund a booking gets if cancelled now: (percent, rupees).
(int, int) refundPreview(Settings settings, Booking b) {
  if (b.service == ServiceKey.bike || b.service == ServiceKey.car) {
    // From My Trips there's no reason, so the fee applies after the free minutes.
    return (100, b.amount - rideCancelFee(settings, b.amount, null, b.createdAt, scheduledFor: b.startsAt));
  }
  final percent = refundPercent(parseCancelPolicy(settings.cancelPolicy(b.service)), b.startsAt);
  return (percent, refundAmount(b.amount, percent, b.deposit));
}
