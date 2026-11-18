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

/// Credits usable on a booking: up to creditsMaxRedeemPercent of the payable amount (deposit excluded), within the balance.
int creditsUsable(Settings s, int balance, int payable, [int deposit = 0]) {
  final limit = (payable - deposit).clamp(0, 1 << 31) * s.creditsMaxRedeemPercent ~/ 100;
  return balance < limit ? balance.clamp(0, 1 << 31) : limit;
}
