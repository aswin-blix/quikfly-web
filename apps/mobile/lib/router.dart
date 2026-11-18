// Every screen's address. Tabs live in the shell; everything else opens full screen above it.
// Paths follow the website where they can (holidays/:slug, bookings by id).
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'api/models.dart';
import 'screens/account/account_screen.dart';
import 'screens/account/account_sections.dart';
import 'screens/auth/login_screen.dart';
import 'screens/bus/bus_screens.dart';
import 'screens/checkout/checkout_screen.dart';
import 'screens/checkout/confirmed_screen.dart';
import 'screens/trips/trip_screen.dart';
import 'screens/account/notifications_screen.dart';
import 'screens/checkout/invoice_screen.dart';
import 'screens/not_found.dart';
import 'screens/help/help_screen.dart';
import 'screens/holidays/holiday_screens.dart';
import 'screens/home/home_screen.dart';
import 'screens/offers/offers_screen.dart';
import 'screens/rent/group_screen.dart';
import 'screens/rent/rent_screens.dart';
import 'screens/ride/ride_screen.dart';
import 'screens/shell.dart';
import 'screens/trips/trips_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();

final router = GoRouter(
  navigatorKey: _rootKey,
  initialLocation: '/',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (_, _, shell) => AppShell(shell: shell),
      branches: [
        StatefulShellBranch(routes: [GoRoute(path: '/', builder: (_, _) => const HomeScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/offers', builder: (_, _) => const OffersScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/trips', builder: (_, _) => const TripsScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountScreen())]),
      ],
    ),
    GoRoute(path: '/login', parentNavigatorKey: _rootKey, builder: (_, _) => const LoginScreen()),
    GoRoute(path: '/help', parentNavigatorKey: _rootKey, builder: (_, _) => const HelpScreen()),
    GoRoute(
      path: '/ride/:service',
      parentNavigatorKey: _rootKey,
      // ?ride=&booking= starts a scheduled ride (from My Trips).
      // ?to=&at=&trip= prefill a ride that joins a trip (from a booking's confirmation).
      builder: (_, s) => RideScreen(
        key: ValueKey('${s.pathParameters['service']}${s.uri.query}'),
        service: s.pathParameters['service'] == 'bike' ? ServiceKey.bike : ServiceKey.car,
        resumeRideId: s.uri.queryParameters['ride'],
        resumeBookingId: s.uri.queryParameters['booking'],
        toPlaceId: s.uri.queryParameters['to'],
        scheduleAt: s.uri.queryParameters['at'],
        tripOf: s.uri.queryParameters['trip'],
      ),
    ),
    GoRoute(path: '/bus', parentNavigatorKey: _rootKey, builder: (_, _) => const BusScreen()),
    GoRoute(
      path: '/bus/search',
      parentNavigatorKey: _rootKey,
      builder: (_, s) {
        final q = s.uri.queryParameters;
        return BusResultsScreen(
          key: ValueKey(s.uri.toString()),
          from: q['from'] ?? 'Chennai',
          to: q['to'] ?? 'Bengaluru',
          date: parseIso(q['date'], DateTime.now().add(const Duration(days: 1))),
        );
      },
    ),
    GoRoute(path: '/holidays', parentNavigatorKey: _rootKey, builder: (_, _) => const HolidaysScreen()),
    GoRoute(path: '/holidays/:slug', parentNavigatorKey: _rootKey, builder: (_, s) => HolidayDetailScreen(slug: s.pathParameters['slug']!)),
    GoRoute(path: '/checkout', parentNavigatorKey: _rootKey, builder: (_, _) => const CheckoutScreen()),
    GoRoute(
      path: '/confirmed/:id',
      parentNavigatorKey: _rootKey,
      builder: (_, s) => ConfirmedScreen(id: s.pathParameters['id']!, booking: s.extra is Booking ? s.extra as Booking : null),
    ),
    GoRoute(path: '/invoice/:id', parentNavigatorKey: _rootKey, builder: (_, s) => InvoiceScreen(id: s.pathParameters['id']!)),
    GoRoute(path: '/trip/:id', parentNavigatorKey: _rootKey, builder: (_, s) => TripScreen(id: s.pathParameters['id']!)),
    GoRoute(path: '/notifications', parentNavigatorKey: _rootKey, builder: (_, _) => const NotificationsScreen()),
    GoRoute(path: '/rent', parentNavigatorKey: _rootKey, builder: (_, _) => const RentScreen()),
    GoRoute(path: '/rent/:id', parentNavigatorKey: _rootKey, builder: (_, s) => RentDetailScreen(id: s.pathParameters['id']!)),
    GoRoute(
      path: '/group',
      parentNavigatorKey: _rootKey,
      builder: (_, s) => GroupScreen(
        key: ValueKey(s.uri.query),
        initialTrip: s.uri.queryParameters['type'],
        initialPax: int.tryParse(s.uri.queryParameters['pax'] ?? ''),
      ),
    ),
    GoRoute(path: '/account/:section', parentNavigatorKey: _rootKey, builder: (_, s) => AccountSectionScreen(section: s.pathParameters['section']!)),
  ],
  errorBuilder: (_, _) => const NotFoundScreen(),
);
