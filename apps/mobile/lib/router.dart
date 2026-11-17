// Every screen's address. Tabs live in the shell; everything else opens full screen above it.
// Paths follow the website where they can (holidays/:slug, bookings by id).
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'api/models.dart';
import 'screens/account/account_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/coming_soon.dart';
import 'screens/help/help_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/offers/offers_screen.dart';
import 'screens/ride/ride_screen.dart';
import 'screens/shell.dart';
import 'screens/trips/trips_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();

GoRoute _soon(String path, String title) => GoRoute(path: path, parentNavigatorKey: _rootKey, builder: (_, _) => ComingSoonScreen(title: title));

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
      builder: (_, s) => RideScreen(key: ValueKey(s.pathParameters['service']), service: s.pathParameters['service'] == 'bike' ? ServiceKey.bike : ServiceKey.car),
    ),
    // Later slices replace these placeholders.
    _soon('/bus', 'Bus booking'),
    _soon('/bus/search', 'Bus search'),
    _soon('/holidays', 'Holidays'),
    _soon('/holidays/:slug', 'Holiday package'),
    _soon('/rent', 'Rent a car'),
    _soon('/rent/:id', 'Rental car'),
    _soon('/group', 'Group travel'),
    _soon('/invoice/:id', 'Invoice'),
    _soon('/account/:section', 'Account settings'),
  ],
  errorBuilder: (_, _) => const ComingSoonScreen(title: 'This page'),
);
