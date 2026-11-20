// QuikFly Credits rules: a Dart copy of packages/shared/src/credits.ts. The API applies them;
// the app uses them to preview the same numbers (what a booking can use and will earn).
import '../api/models.dart';

/// The fare line a booking paid partly with credits shows.
const creditsLine = 'QuikFly Credits';

/// Credits a completed booking earns: its % of what was paid (not the deposit), at most creditsCap.
int creditsEarned(Settings s, ServiceKey service, int paid, [int deposit = 0]) {
  final base = (paid - deposit).clamp(0, 1 << 31);
  return (base * s.creditPercent(service) ~/ 100).clamp(0, s.creditsCap);
}

/// Credits usable on a booking: up to creditsMaxRedeemPercent of the payable amount (deposit excluded), within the balance,
/// and within [maxOff] (a ride's discount floor room, rideDiscountRoom).
int creditsUsable(Settings s, int balance, int payable, [int deposit = 0, int? maxOff]) {
  final limit = (payable - deposit).clamp(0, 1 << 31) * s.creditsMaxRedeemPercent ~/ 100;
  final usable = balance < limit ? balance.clamp(0, 1 << 31) : limit;
  return maxOff == null ? usable : usable.clamp(0, maxOff.clamp(0, 1 << 31));
}

/// Most ₹ coupons and credits may take off a ride fare (rideDiscountRoom in packages/shared/src/pricing.ts); null = no limit.
int? rideDiscountRoom(Settings s, ServiceKey service, int fare) =>
    service == ServiceKey.bike || service == ServiceKey.car ? fare * s.rideMaxDiscountPercent ~/ 100 : null;
