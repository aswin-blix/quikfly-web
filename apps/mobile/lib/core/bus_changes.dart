// Dart copy of packages/shared/src/bus-changes.ts: cancel some seats of a bus booking, or
// move it once to another bus or date. The API applies the rules; the app previews the same
// numbers. Keep the two in step.
import '../api/models.dart';
import 'cancellation.dart';

/// The part of [total] that belongs to the seats in [ids], by seat price (even split when prices are 0). Rounded down.
int seatsShare(int total, List<BookingSeat> seats, List<String> ids) {
  if (seats.isEmpty) return 0;
  final picked = seats.where((s) => ids.contains(s.id));
  final all = seats.fold<int>(0, (a, s) => a + s.price);
  final part = picked.fold<int>(0, (a, s) => a + s.price);
  return (all > 0 ? total * part / all : total * picked.length / seats.length).floor();
}

/// Why these seats can't be cancelled on their own, or null when they can.
String? seatCancelError(Booking b, List<String> ids) {
  if (b.service != ServiceKey.bus) return 'Only bus tickets can cancel single seats.';
  if (b.status != BookingStatus.confirmed) return 'This booking is already ${b.status.name}.';
  if (ids.isEmpty) return 'Choose the seats to cancel.';
  if (ids.any((id) => !b.seats.any((s) => s.id == id))) return "That seat isn't on this booking.";
  if (ids.length >= b.seats.length) return 'To cancel every seat, cancel the whole booking.';
  return null;
}

/// What cancelling these seats now gives back: (refund, percent).
(int, int) seatCancelRefund(Settings s, Booking b, List<String> ids) {
  final share = seatsShare(b.amount, b.seats, ids);
  final percent = refundPercent(parseCancelPolicy(s.cancelPolicy(ServiceKey.bus)), b.startsAt);
  return (refundAmount(share, percent), percent);
}

/// Why this booking can't move to another bus now, or null when it can.
String? rescheduleError(Settings s, Booking b, {DateTime? now}) {
  if (b.service != ServiceKey.bus) return 'Only bus tickets can change to another bus.';
  if (b.status != BookingStatus.confirmed) return 'This booking is already ${b.status.name}.';
  if (b.rescheduledAt != null) return 'This ticket was already changed once.';
  if (b.startsAt == null) return 'This ticket has no departure time to change from.';
  final hoursLeft = b.startsAt!.difference(now ?? DateTime.now()).inMinutes / 60;
  if (hoursLeft < s.busRescheduleHours) return 'Bus changes close ${s.busRescheduleHours} hours before departure.';
  return null;
}

/// Money for a change to a bus whose quote totals [newTotal]: what's paid now (charge) or comes back (refund).
({int newAmount, int charge, int refund, int fee}) rescheduleAmounts(Settings s, Booking b, int newTotal) {
  final newAmount = (newTotal - b.discount - b.creditsUsed).clamp(0, 1 << 31) + s.busRescheduleFee;
  return (
    newAmount: newAmount,
    charge: (newAmount - b.amount).clamp(0, 1 << 31),
    refund: (b.amount - newAmount).clamp(0, 1 << 31),
    fee: s.busRescheduleFee,
  );
}
