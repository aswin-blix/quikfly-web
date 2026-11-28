// QuikFly Captain's home: signed out → what Captain is and "Sign in"; a number with no driver record →
// what to do (or, with captainSelfSignup, registering their own vehicle: QuikFly Partner's checklist, then
// themselves as the driver); otherwise the online switch, the offer or the ride, and today's trips, earnings and cash.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api.dart';
import '../partner/home_screen.dart' show PartnerHomeScreen;
import '../partner/partner_app.dart' show fleetProvider, vendorProvider;
import '../api/models.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import '../widgets/city_map.dart';
import '../widgets/logo.dart';
import '../widgets/push_prompt.dart';
import '../widgets/theme_toggle.dart';
import '../widgets/ui.dart';
import 'captain_state.dart';
import 'location.dart';
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
      data: (l) => l?.captain == null ? _SignUpGate(l) : _Home(l!.captain!),
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

/// No driver record for this number: an application already started (by this account) shows its checklist;
/// a live partner with no driver record for themselves finishes setup; otherwise what to do.
class _SignUpGate extends ConsumerWidget {
  const _SignUpGate(this.lookup);
  final CaptainLookup? lookup;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vendor = ref.watch(vendorProvider);
    return vendor.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      // The application can't be read: still say what this number needs.
      error: (_, _) => _NotACaptain(lookup?.reason, selfSignup: false),
      data: (a) => a == null
          ? _NotACaptain(lookup?.reason, selfSignup: lookup?.selfSignup ?? false)
          : a.status == 'active'
              ? const _FinishSetup()
              : const PartnerHomeScreen(), // the application checklist, sections and onboarding
    );
  }
}

class _NotACaptain extends ConsumerStatefulWidget {
  const _NotACaptain(this.reason, {required this.selfSignup});
  final String? reason;
  final bool selfSignup;
  @override
  ConsumerState<_NotACaptain> createState() => _NotACaptainState();
}

class _NotACaptainState extends ConsumerState<_NotACaptain> {
  bool _starting = false;

  /// Starts the partner application for this account: the same one QuikFly Partner and the website use.
  Future<void> _register() async {
    setState(() => _starting = true);
    try {
      await ref.read(apiProvider).startVendorApplication();
      ref.invalidate(vendorProvider);
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _starting = false);
  }

  @override
  Widget build(BuildContext context) {
    final phone = ref.watch(userProvider)?.phone ?? '';
    return Scaffold(
      appBar: _bar(context, ref, signedIn: false),
      body: ScreenList(children: [
        EmptyState(
          icon: Icons.badge_outlined,
          title: 'Not set up as a captain yet',
          message: '${widget.reason ?? "This number isn't registered as a QuikFly captain yet."}\n\nSigned in as $phone. Your owner must add you with this same number.',
          action: Column(children: [
            if (widget.selfSignup) ...[
              GoldButton(label: 'Register your own vehicle', icon: Icons.two_wheeler, loading: _starting, onPressed: _register),
              const SizedBox(height: 4),
              Text('For a bike, auto or car you own. QuikFly checks your documents and vehicle first.', textAlign: TextAlign.center, style: TextStyle(color: context.qf.fgMuted, fontSize: 12.5)),
              const SizedBox(height: 8),
            ],
            OutlinedButton(onPressed: () => ref.invalidate(captainLookupProvider), child: const Text('Check again')),
            TextButton(onPressed: () => signOutCaptain(context, ref), child: const Text('Use another number')),
          ]),
        ),
      ]),
    );
  }
}

/// A live partner (their application passed) who isn't a captain yet: add themselves as the driver.
class _FinishSetup extends ConsumerWidget {
  const _FinishSetup();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final fleet = ref.watch(fleetProvider);
    final self = fleet.value?.drivers.where((d) => d.self).firstOrNull;
    Widget step(int n, String title, String text, {bool done = false}) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            CircleAvatar(radius: 13, backgroundColor: done ? c.success : c.accent.withValues(alpha: 0.15),
                child: done ? const Icon(Icons.check, size: 16, color: Colors.white) : Text('$n', style: TextStyle(color: c.accent, fontSize: 13, fontWeight: FontWeight.w700))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(text, style: TextStyle(color: c.fgMuted)),
            ])),
          ]),
        );
    return Scaffold(
      appBar: _bar(context, ref, signedIn: false),
      body: ScreenList(onRefresh: () async {
        ref.invalidate(fleetProvider);
        ref.invalidate(captainLookupProvider);
      }, children: [
        Text("You're a QuikFly partner", style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 4),
        Text('Two last steps before you can take rides.', style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 16),
        Panel(child: Column(children: [
          step(1, 'Add yourself as the driver', 'Your driving licence number, validity and a photo of it.', done: self != null),
          step(2, 'QuikFly checks your licence', 'Usually within a day. You can go online once it is approved and you have picked your vehicle.'),
        ])),
        const SizedBox(height: 16),
        if (fleet.hasError) ErrorBox(errorText(fleet.error!), onRetry: () => ref.invalidate(fleetProvider)),
        if (self?.status == 'rejected') ...[
          ErrorBox("QuikFly couldn't approve your licence${self!.reviewNote == null ? '.' : ': ${self.reviewNote}'} Correct it and send it again."),
          const SizedBox(height: 8),
          GoldButton(label: 'Correct your licence', onPressed: () async {
            await context.push('/driver/${self.id}/licence');
            ref.invalidate(fleetProvider);
            ref.invalidate(captainLookupProvider);
          }),
        ] else
        if (self == null)
          GoldButton(
            label: 'Add yourself as the driver',
            icon: Icons.badge_outlined,
            onPressed: () async {
              await context.push('/drivers/new');
              // The new driver record has this number: Captain links it at once.
              ref.invalidate(fleetProvider);
              ref.invalidate(captainLookupProvider);
            },
          )
        else
          OutlinedButton(onPressed: () => ref.invalidate(captainLookupProvider), child: const Text('Check again')),
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
          // The captains' privacy notice, agreed once before going online (notice_screen.dart).
          if (!p.noticeAgreed) ...[_NoticeCard(), const SizedBox(height: 12)],
          if (p.blocker != null && p.blocker != captainNoticeNeeded) ...[
            ErrorBox(p.blocker!, onRetry: () => ref.invalidate(captainLookupProvider)),
            // An owner-driver sorts their own vehicle here (a fleet driver's owner does it in QuikFly Partner).
            if (p.self && p.regNumber == null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: GoldButton(label: 'Choose your vehicle', icon: Icons.two_wheeler, onPressed: () async {
                  await context.push('/driver/${p.driverId}');
                  ref.invalidate(captainLookupProvider);
                }),
              ),
            const SizedBox(height: 12),
          ],
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

class _DutyCard extends ConsumerStatefulWidget {
  const _DutyCard({required this.profile, required this.live, required this.places, required this.start, required this.onStart});
  final CaptainProfile profile;
  final CaptainLive live;
  final List<Place> places;
  final Place? start;
  final ValueChanged<Place> onStart;
  @override
  ConsumerState<_DutyCard> createState() => _DutyCardState();
}

class _DutyCardState extends ConsumerState<_DutyCard> {
  /// Reading the first fix; what stops GPS (with how to fix it); the demo-location picker is open.
  bool _locating = false;
  GpsProblem? _problem;
  bool _demo = false;

  /// Online with the phone's location: the explanation first (once), then Android's or iOS's prompt, then one fix.
  Future<void> _goOnlineGps() async {
    setState(() => _problem = null);
    if (!await gpsDisclosure(context) || !mounted) return;
    setState(() => _locating = true);
    final problem = await CaptainGps.access();
    final fix = problem == null ? await CaptainGps.current() : null;
    if (!mounted) return;
    setState(() {
      _locating = false;
      _problem = problem ?? (fix == null ? GpsProblem.unavailable : null);
    });
    if (fix != null) await ref.read(captainProvider.notifier).goOnlineWithGps(fix);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final live = widget.live, profile = widget.profile, places = widget.places, start = widget.start;
    final rules = ref.watch(captainRulesProvider);
    final ctl = ref.read(captainProvider.notifier);
    final onRide = live.state?.ride != null;
    if (live.online) {
      final demo = live.state?.duty.demo ?? false;
      return Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.circle, size: 12, color: c.success),
            const SizedBox(width: 8),
            Expanded(child: Text(onRide ? 'On a ride' : "You're online", style: Theme.of(context).textTheme.titleMedium)),
            if (!onRide) TextButton(onPressed: live.busy ? null : () => ctl.goOffline(), child: const Text('Go offline')),
          ]),
          if (!onRide && live.state?.offer == null)
            Text(
              demo
                  ? 'Waiting for rides near you. Keep the app open: with a demo location you stay online only while it is on screen.'
                  : 'Waiting for rides near you. Your location is shared while you\'re online, also with the app closed. Go offline to stop.',
              style: TextStyle(color: c.fgMuted),
            ),
          if (!onRide && live.state?.offer == null && live.error != null) FormError(live.error),
        ]),
      );
    }
    final blocked = profile.blocker != null;
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.circle_outlined, size: 12, color: c.fgMuted),
          const SizedBox(width: 8),
          Text("You're offline", style: Theme.of(context).textTheme.titleMedium),
        ]),
        const SizedBox(height: 10),
        if (live.error != null) FormError(live.error),
        if (_problem != null) ...[
          ErrorBox(_problem!.message),
          if (_problem!.hasSettings)
            Align(alignment: Alignment.centerLeft, child: TextButton(onPressed: _problem!.openSettings, child: const Text('Open settings'))),
          const SizedBox(height: 8),
        ],
        if (!_demo) ...[
          GoldButton(label: 'Go online', icon: Icons.power_settings_new, loading: _locating || live.busy, onPressed: blocked ? null : _goOnlineGps),
          const SizedBox(height: 6),
          Text('Uses your phone\'s location while you\'re online.', style: TextStyle(color: c.fgSubtle, fontSize: 12.5)),
          if (rules.demoLocation)
            TextButton(onPressed: () => setState(() => _demo = true), child: const Text('Use a demo location instead')),
        ] else ...[
          // The demo locations are the city's places, from GET /config (the owner's driverDemoLocation allows them).
          if (places.isEmpty)
            ref.watch(configProvider).hasError
                ? ErrorBox("Couldn't load the places to start from.", onRetry: () => ref.invalidate(configProvider))
                : Text('Loading places…', style: TextStyle(color: c.fgMuted))
          else
            DropdownButtonFormField<Place>(
              initialValue: start,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Start from (demo location)', helperText: 'Pretend you are here; no GPS is used. Keep the app open.'),
              items: [for (final p in places) DropdownMenuItem(value: p, child: Text('${p.name} · ${p.area}', overflow: TextOverflow.ellipsis))],
              onChanged: (p) => p == null ? null : widget.onStart(p),
            ),
          const SizedBox(height: 12),
          GoldButton(
            label: 'Go online here',
            icon: Icons.power_settings_new,
            loading: live.busy,
            onPressed: blocked || start == null ? null : () => ctl.goOnline(MapPoint(start.x, start.y)),
          ),
          TextButton(onPressed: () => setState(() => _demo = false), child: const Text('Use my location instead')),
        ],
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

/// Before a captain's first time online: how QuikFly Captain uses their location, and "Read and agree".
class _NoticeCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    return Panel(
      highlighted: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.location_on_outlined, color: c.accent),
          const SizedBox(width: 8),
          Expanded(child: Text('Before your first ride', style: Theme.of(context).textTheme.titleMedium)),
        ]),
        const SizedBox(height: 8),
        Text('While you\'re online, QuikFly Captain shares your location, also with the app closed. Read how it\'s used and agree to go online.',
            style: TextStyle(color: c.fgSoft, height: 1.4)),
        const SizedBox(height: 12),
        GoldButton(label: 'Read and agree', icon: Icons.policy_outlined, onPressed: () async {
          await context.push('/captain-notice');
          ref.invalidate(captainLookupProvider);
        }),
      ]),
    );
  }
}
