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

/// The signed-in user's bookings, newest first. Empty when signed out.
final bookingsProvider = FutureProvider<List<Booking>>((ref) async {
  final user = ref.watch(userProvider.select((u) => u?.id));
  if (user == null) return const [];
  return ref.watch(apiProvider).bookings();
});
