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

/// The notification inbox. Empty when signed out.
final notificationsProvider = FutureProvider<({List<AppNotification> items, int unread})>((ref) async {
  final user = ref.watch(userProvider.select((u) => u?.id));
  if (user == null) return (items: const <AppNotification>[], unread: 0);
  return ref.watch(apiProvider).notifications();
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
