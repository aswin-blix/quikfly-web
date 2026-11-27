// Where a notification goes when it's tapped, in the inbox or as a phone notification. One map for
// both, so a push and its inbox row always open the same screen.
import '../state/catalog.dart';

/// The page a notification opens, or null when it has none in this app. QuikFly Partner's updates
/// have no page of their own (its home screen shows them), and customer pages don't exist there;
/// QuikFly Captain's open its home screen, where the offer or the ride is.
String? notificationTarget(String kind, String? bookingId, NotificationScope scope) {
  if (scope == NotificationScope.partner) return null;
  // A captain's offer or a cancelled ride: the home screen shows it.
  if (scope == NotificationScope.captain) return '/';
  if (kind == 'credits.earned') return '/account/wallet';
  if (kind == 'support.reply') return '/support';
  if (bookingId != null && kind.startsWith('parcel.')) return '/parcel/$bookingId';
  if (bookingId != null) return '/trips';
  if (kind.startsWith('licence')) return '/account/licence';
  return null;
}

/// My Trips is a tab: it's switched to (go) rather than opened on top (push).
bool notificationSwitchesTab(String path) => path == '/trips' || path == '/';
