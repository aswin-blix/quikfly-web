// Catalog lists that aren't part of GET /config. Admin edits reach them within 30 s
// (the API's cache); pull-to-refresh invalidates them.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/models.dart';
import 'providers.dart';

final toursProvider = FutureProvider<List<TourPackage>>((ref) => ref.watch(apiProvider).tours());
final tourProvider = FutureProvider.family<TourPackage, String>((ref, slug) => ref.watch(apiProvider).tour(slug));
final carsProvider = FutureProvider<List<RentalCar>>((ref) => ref.watch(apiProvider).cars());
final carProvider = FutureProvider.family<RentalCar, String>((ref, id) => ref.watch(apiProvider).car(id));
final travelVehiclesProvider = FutureProvider<List<TravelVehicle>>((ref) => ref.watch(apiProvider).travelVehicles());

/// Which notifications an app shows. One account has one inbox (bookings and partner updates
/// alike); the customer app shows the customer's, QuikFly Partner only `vendor.*` ones.
enum NotificationScope {
  customer,
  partner,
  captain;

  /// Each app's kinds start with its prefix (PARTNER_ / CAPTAIN_NOTIFICATION_PREFIX); the rest are the customer app's.
  static const prefixes = {NotificationScope.partner: 'vendor.', NotificationScope.captain: 'driver.'};

  bool shows(String kind) {
    final own = prefixes[this];
    return own != null ? kind.startsWith(own) : !prefixes.values.any(kind.startsWith);
  }
}

/// The customer app's scope; QuikFly Partner and QuikFly Captain override it in their main files.
final notificationScopeProvider = Provider<NotificationScope>((ref) => NotificationScope.customer);

/// The notification inbox for this app, with its own unread count. Empty when signed out.
final notificationsProvider = FutureProvider<({List<AppNotification> items, int unread})>((ref) async {
  final user = ref.watch(userProvider.select((u) => u?.id));
  if (user == null) return (items: const <AppNotification>[], unread: 0);
  final scope = ref.watch(notificationScopeProvider);
  final all = await ref.watch(apiProvider).notifications();
  final items = all.items.where((n) => scope.shows(n.kind)).toList();
  return (items: items, unread: items.where((n) => n.readAt == null).length);
});

/// Unread notifications for the bell; re-read after bookings change.
final unreadProvider = FutureProvider<int>((ref) async {
  ref.watch(bookingsProvider);
  return (await ref.watch(notificationsProvider.future)).unread;
});

/// The signed-in user's bookings, newest first. Empty when signed out.
final bookingsProvider = FutureProvider<List<Booking>>((ref) async {
  final user = ref.watch(userProvider.select((u) => u?.id));
  if (user == null) return const [];
  return ref.watch(apiProvider).bookings();
});
