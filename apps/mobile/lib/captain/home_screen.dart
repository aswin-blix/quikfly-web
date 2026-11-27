// QuikFly Captain's home: signed out → what Captain is and "Sign in"; a number with no driver record →
// what to do; otherwise the online switch, the offer or the ride, and today's trips, earnings and cash.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api.dart';
import '../api/models.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import '../widgets/city_map.dart';
import '../widgets/logo.dart';
import '../widgets/push_prompt.dart';
import '../widgets/theme_toggle.dart';
import '../widgets/ui.dart';
import 'captain_state.dart';
import 'offer_card.dart';
import 'ride_panel.dart';

class CaptainHomeScreen extends ConsumerWidget {
  const CaptainHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    if (session.isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    // A saved login that couldn't be checked (no network at start) is not a sign-out.
    if (session.hasError && session.value == null) {
      return Scaffold(appBar: _bar(context, ref), body: ScreenList(children: [ErrorBox(errorText(session.error!), onRetry: () => ref.invalidate(sessionProvider))]));
    }
    if (session.value == null) return const _Welcome();
    final lookup = ref.watch(captainLookupProvider);
    return lookup.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(appBar: _bar(context, ref), body: ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(captainLookupProvider))])),
      data: (l) => l?.captain == null ? _NotACaptain(l?.reason) : _Home(l!.captain!),
    );
  }
}

PreferredSizeWidget _bar(BuildContext context, WidgetRef ref, {bool signedIn = true}) => AppBar(
      title: const Text('QuikFly Captain'),
      actions: [
        if (signedIn) IconButton(tooltip: 'My trips', icon: const Icon(Icons.receipt_long_outlined), onPressed: () => context.push('/trips')),
        const ThemeToggle(),
        if (signedIn) IconButton(tooltip: 'Account', icon: const Icon(Icons.person_outline), onPressed: () => context.push('/account')),
      ],
    );

class _Welcome extends StatelessWidget {
  const _Welcome();
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    Widget point(IconData icon, String title, String text) => Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: c.accent),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(text, style: TextStyle(color: c.fgMuted)),
            ])),
          ]),
        );
    return Scaffold(
      appBar: AppBar(actions: const [ThemeToggle()]),
      body: ScreenList(children: [
        const Center(child: AppLogo(height: 40)),
        const SizedBox(height: 16),
        Text('Drive with QuikFly', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 6),
        Text('For drivers your fleet owner has added in QuikFly Partner.', textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 24),
        point(Icons.visibility_outlined, 'See the whole trip first', 'Every offer shows the pickup, the drop, what the rider pays and what your vehicle earns.'),
        point(Icons.record_voice_over_outlined, 'Offers read aloud', 'In English, Tamil or Hindi, so you don\'t have to read the phone while riding.'),
        point(Icons.thumb_up_alt_outlined, 'Declining is free', 'No acceptance score and no penalty for saying no.'),
        point(Icons.payments_outlined, 'Cash you can\'t miss', 'A full-screen "Collect ₹" at the end of every cash ride.'),
        const SizedBox(height: 8),
        GoldButton(label: 'Sign in with your mobile number', icon: Icons.arrow_forward, onPressed: () => context.push('/login')),
      ]),
    );
  }
}

class _NotACaptain extends ConsumerWidget {
  const _NotACaptain(this.reason);
  final String? reason;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final phone = ref.watch(userProvider)?.phone ?? '';
    return Scaffold(
      appBar: _bar(context, ref, signedIn: false),
      body: ScreenList(children: [
        EmptyState(
          icon: Icons.badge_outlined,
          title: 'Not set up as a captain yet',
          message: '${reason ?? "This number isn't registered as a QuikFly captain yet."}\n\nSigned in as $phone. Your owner must add you with this same number.',
          action: Column(children: [
            OutlinedButton(onPressed: () => ref.invalidate(captainLookupProvider), child: const Text('Check again')),
            TextButton(onPressed: () => signOutCaptain(context, ref), child: const Text('Use another number')),
          ]),
        ),
      ]),
    );
  }
}

/// Signs out after a confirmation (not while online). Returns true when signed out.
Future<bool> signOutCaptain(BuildContext context, WidgetRef ref) async {
  if (ref.read(captainProvider).online) {
    toast(context, 'Go offline first.');
    return false;
  }
  if (!await confirm(context, title: 'Sign out of QuikFly Captain?', message: 'You can sign in again with your number at any time.', yes: 'Sign out', danger: true)) return false;
  await ref.read(sessionProvider.notifier).signOut();
  ref.invalidate(captainLookupProvider);
  return true;
}

class _Home extends ConsumerStatefulWidget {
  const _Home(this.profile);
  final CaptainProfile profile;
  @override
  ConsumerState<_Home> createState() => _HomeState();
}

class _HomeState extends ConsumerState<_Home> {
  Place? _start;

  @override
  Widget build(BuildContext context) {
    final live = ref.watch(captainProvider);
    if (live.done != null) return TripDoneScreen(live.done!);
    final c = context.qf;
    final p = widget.profile;
    final s = live.state;
    final places = ref.watch(configProvider).value?.places ?? const <Place>[];
    final pos = s?.duty.position ?? p.duty.position;
    return Scaffold(
      appBar: _bar(context, ref),
      body: ScreenList(
        onRefresh: () async {
          ref.invalidate(captainLookupProvider);
          ref.invalidate(captainSummaryProvider);
          await ref.read(captainProvider.notifier).refresh();
        },
        children: [
          if (p.blocker != null) ...[ErrorBox(p.blocker!, onRetry: () => ref.invalidate(captainLookupProvider)), const SizedBox(height: 12)],
          if (s?.ride != null) ...[RidePanel(s!.ride!, key: ValueKey(s.ride!.trip.rideId)), const SizedBox(height: 12)]
          else if (s?.offer != null) ...[OfferCard(s!.offer!, key: ValueKey(s.offer!.trip.rideId)), const SizedBox(height: 12)],
          _DutyCard(profile: p, live: live, places: places, start: _start ?? _nearest(places, pos), onStart: (pl) => setState(() => _start = pl)),
          const SizedBox(height: 12),
          if (places.isNotEmpty && pos != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(Brand.radiusPanel),
              child: AspectRatio(
                aspectRatio: 1.4,
                child: CityMap(
                  places: places,
                  pickup: s?.ride?.trip.pickup ?? s?.offer?.trip.pickup,
                  drop: s?.ride?.trip.drop ?? s?.offer?.trip.drop,
                  stops: s?.ride?.trip.stops ?? const [],
                  vehicle: Offset(pos.x, pos.y),
                  showRoute: s?.ride != null || s?.offer != null,
                  searching: live.online && s?.ride == null && s?.offer == null,
                  bike: (s?.ride?.trip ?? s?.offer?.trip)?.service == 'bike',
                ),
              ),
            ),
          if (live.online && (s?.duty.demo ?? false) && pos != null)
            Padding(padding: const EdgeInsets.only(top: 6), child: Text('Demo location: the app moves you along the route during a trip.', style: TextStyle(color: c.fgSubtle, fontSize: 12.5))),
          const SizedBox(height: 12),
          const _Today(),
          const SizedBox(height: 12),
          if (live.online) const PushPrompt(title: 'Hear offers when the screen is off', message: 'Get a notification for each ride offer, so you can answer in time.'),
        ],
      ),
    );
  }

  /// The place nearest the captain's last position (the default start), or the first place.
  Place? _nearest(List<Place> places, MapPoint? at) {
    if (places.isEmpty) return null;
    if (at == null) return places.first;
    return places.reduce((a, b) => CityGeo.distanceKm(at, a.x, a.y) <= CityGeo.distanceKm(at, b.x, b.y) ? a : b);
  }
}

class _DutyCard extends ConsumerWidget {
  const _DutyCard({required this.profile, required this.live, required this.places, required this.start, required this.onStart});
  final CaptainProfile profile;
  final CaptainLive live;
  final List<Place> places;
  final Place? start;
  final ValueChanged<Place> onStart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final rules = ref.watch(captainRulesProvider);
    final ctl = ref.read(captainProvider.notifier);
    final onRide = live.state?.ride != null;
    if (live.online) {
      return Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.circle, size: 12, color: c.success),
            const SizedBox(width: 8),
            Expanded(child: Text(onRide ? 'On a ride' : "You're online", style: Theme.of(context).textTheme.titleMedium)),
            if (!onRide) TextButton(onPressed: live.busy ? null : () => ctl.goOffline(), child: const Text('Go offline')),
          ]),
          if (!onRide && live.state?.offer == null)
            Text('Waiting for rides near you. Keep the app open: QuikFly Captain stays online only while it is on screen.', style: TextStyle(color: c.fgMuted)),
          if (!onRide && live.state?.offer == null && live.error != null) FormError(live.error),
        ]),
      );
    }
    if (!rules.demoLocation) {
      return const Panel(child: Text('Going online needs your phone\'s location, which arrives in the next version of QuikFly Captain. Ask QuikFly to turn on demo locations meanwhile.'));
    }
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.circle_outlined, size: 12, color: c.fgMuted),
          const SizedBox(width: 8),
          Text("You're offline", style: Theme.of(context).textTheme.titleMedium),
        ]),
        const SizedBox(height: 10),
        // The demo locations are the city's places, from GET /config.
        if (places.isEmpty)
          ref.watch(configProvider).hasError
              ? ErrorBox("Couldn't load the places to start from.", onRetry: () => ref.invalidate(configProvider))
              : Text('Loading places…', style: TextStyle(color: c.fgMuted))
        else
          DropdownButtonFormField<Place>(
            initialValue: start,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Start from (demo location)', helperText: 'Pretend you are here; no GPS is used.'),
            items: [for (final p in places) DropdownMenuItem(value: p, child: Text('${p.name} · ${p.area}', overflow: TextOverflow.ellipsis))],
            onChanged: (p) => p == null ? null : onStart(p),
          ),
        const SizedBox(height: 12),
        if (live.error != null) FormError(live.error),
        GoldButton(
          label: 'Go online',
          icon: Icons.power_settings_new,
          loading: live.busy,
          onPressed: profile.blocker != null || start == null ? null : () => ctl.goOnline(MapPoint(start!.x, start!.y)),
        ),
      ]),
    );
  }
}

class _Today extends ConsumerWidget {
  const _Today();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final s = ref.watch(captainSummaryProvider).value;
    Widget stat(String label, String value, {Color? color}) => Expanded(
          child: Column(children: [
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
            const SizedBox(height: 2),
            Text(label, textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
          ]),
        );
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Today', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 10),
        Row(children: [
          stat('Trips', '${s?.trips ?? 0}'),
          stat('Vehicle earned', rupees(s?.earningPaise ?? 0), color: c.success),
          stat('Cash you hold', rupees(s?.cashPaise ?? 0), color: (s?.cashPaise ?? 0) > 0 ? c.warning : null),
        ]),
      ]),
    );
  }
}
