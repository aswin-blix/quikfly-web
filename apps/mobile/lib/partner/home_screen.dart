// Partner home: signed out → why join and "Get started"; signed in → the registration hub
// (step 1 application checklist, step 2 onboarding), then "You're live" once active.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api.dart';
import '../api/models.dart';
import '../core/format.dart';
import '../state/catalog.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import '../widgets/logo.dart';
import '../widgets/theme_toggle.dart';
import '../widgets/ui.dart';
import 'fleet_screens.dart';
import 'help_button.dart';
import 'partner_app.dart';

class PartnerHomeScreen extends ConsumerWidget {
  const PartnerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    if (session.isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    // A saved login that couldn't be checked (no network at start) is not a sign-out: say so and
    // retry, rather than showing the welcome screen as if the partner had signed out.
    if (session.hasError && session.value == null) {
      return Scaffold(
        appBar: _bar(context, ref),
        body: ScreenList(children: [ErrorBox(errorText(session.error!), onRetry: () => ref.invalidate(sessionProvider))]),
      );
    }
    if (session.value == null) return const _Welcome();
    final vendor = ref.watch(vendorProvider);
    return vendor.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(
        appBar: _bar(context, ref),
        body: ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(vendorProvider))]),
      ),
      data: (a) => a == null ? const _Start() : a.status == 'active' ? PartnerShell(a) : _Hub(a),
    );
  }
}

PreferredSizeWidget _bar(BuildContext context, WidgetRef ref, {String title = 'Partner registration'}) => AppBar(
      title: Text(title),
      actions: [
        const PartnerHelpButton(),
        if (ref.watch(sessionProvider).value != null) const _Bell(),
        const ThemeToggle(),
        if (ref.watch(sessionProvider).value != null)
          // Applicants have no account page until they're live, so the privacy pages are here too.
          // Sign out is last and asks first, so a tap on ⋮ can't sign anyone out by accident.
          PopupMenuButton<String>(
            tooltip: 'More',
            onSelected: (v) {
              if (v == 'signout') {
                signOutPartner(context, ref);
              } else {
                context.push(v);
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: '/privacy/data', child: Text('Privacy & data')),
              PopupMenuItem(value: '/privacy', child: Text('Privacy notice')),
              PopupMenuDivider(),
              PopupMenuItem(value: 'signout', child: Text('Sign out')),
            ],
          ),
      ],
    );

/// Signs out of the Partner app after a confirmation. Returns true when signed out.
Future<bool> signOutPartner(BuildContext context, WidgetRef ref) async {
  if (!await confirm(context, title: 'Sign out of QuikFly Partner?', message: 'Your application and vehicles stay saved on your account.', yes: 'Sign out', danger: true)) {
    return false;
  }
  await ref.read(sessionProvider.notifier).signOut();
  ref.invalidate(vendorProvider);
  return true;
}

class _Bell extends ConsumerWidget {
  const _Bell();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadProvider).value ?? 0;
    return IconButton(
      tooltip: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
      onPressed: () async {
        await context.push('/notifications');
        ref.invalidate(notificationsProvider);
        ref.invalidate(vendorProvider);
      },
      icon: Badge(isLabelVisible: unread > 0, label: Text(unread > 9 ? '9+' : '$unread'), child: const Icon(Icons.notifications_none)),
    );
  }
}

/// Signed out: what the app is for, and sign in.
class _Welcome extends ConsumerWidget {
  const _Welcome();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    Widget point(IconData icon, String title, String body) => Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: c.accent.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: c.accent, size: 21),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(body, style: TextStyle(color: c.fgMuted, fontSize: 13)),
            ])),
          ]),
        );
    return Scaffold(
      appBar: AppBar(title: const AppLogo(height: 30), actions: const [ThemeToggle()]),
      body: ScreenList(children: [
        Text('QuikFly Partner', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 6),
        Text('Put your bike, cab, auto, tempo traveller or bus on QuikFly and manage it from your phone.', style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 22),
        point(Icons.assignment_outlined, '1 · Apply', 'Vehicle details, bank account, RC, insurance and a vehicle audit. Save as you go.'),
        point(Icons.verified_outlined, '2 · Get approved', 'QuikFly checks each part and tells you if anything needs fixing.'),
        point(Icons.handshake_outlined, '3 · Onboard', 'Joining fee, partner agreement, then the QuikFly sticker and paint.'),
        point(Icons.local_taxi_outlined, '4 · Go live', 'Your vehicle takes QuikFly trips; track trips and earnings here.'),
        const SizedBox(height: 10),
        GoldButton(label: 'Get started', icon: Icons.arrow_forward, onPressed: () => context.push('/login')),
        const SizedBox(height: 10),
        Text('You sign in with your mobile number. Already a QuikFly customer? Use the same number.', textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
      ]),
    );
  }
}

/// Signed in, no application yet.
class _Start extends ConsumerStatefulWidget {
  const _Start();
  @override
  ConsumerState<_Start> createState() => _StartState();
}

class _StartState extends ConsumerState<_Start> {
  bool _busy = false;
  String? _err;

  // Straight after sign-up the application starts by itself and the first form opens, so a new
  // partner goes OTP → City & vehicle details → the checklist. The button is only a retry.
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _go());
  }

  Future<void> _go() async {
    setState(() { _busy = true; _err = null; });
    try {
      final a = await ref.read(apiProvider).startVendorApplication(); // idempotent on the API
      if (!mounted) return;
      setVendor(ref, a);
      context.push('/section/${vendorSections.first}');
    } catch (e) {
      if (mounted) setState(() => _err = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final user = ref.watch(sessionProvider).value;
    return Scaffold(
      appBar: _bar(context, ref),
      body: ScreenList(children: [
        Text('Hi ${user?.firstName ?? 'there'}', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 6),
        Text('Register your vehicle with QuikFly. It takes about 10 minutes; keep your RC, insurance and bank details handy.', style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 18),
        Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          for (final s in vendorSections)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [Icon(Icons.check_circle_outline, size: 18, color: c.fgSubtle), const SizedBox(width: 10), Text(vendorSectionLabel[s]!)]),
            ),
        ])),
        const SizedBox(height: 16),
        FormError(_err),
        GoldButton(label: _err == null ? 'Start my application' : 'Try again', loading: _busy, onPressed: _go),
      ]),
    );
  }
}

/// The registration hub: two steps, the checklist, reset and submit.
class _Hub extends ConsumerStatefulWidget {
  const _Hub(this.a);
  final VendorApplication a;
  @override
  ConsumerState<_Hub> createState() => _HubState();
}

class _HubState extends ConsumerState<_Hub> {
  bool _busy = false;
  String? _err;

  Future<void> _run(Future<VendorApplication> Function() call, String done) async {
    setState(() { _busy = true; _err = null; });
    try {
      setVendor(ref, await call());
      if (mounted) toast(context, done);
    } catch (e) {
      setState(() => _err = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _reset() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset your application?'),
        content: const Text('This clears everything you\'ve entered, photos included.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep it')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Reset')),
        ],
      ),
    );
    if (ok == true) await _run(() => ref.read(apiProvider).resetVendorApplication(), 'Application cleared');
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    final c = context.qf;
    final step2 = a.status == 'onboarding' || a.status == 'active';
    final pending = [for (final s in vendorSections) if (!(a.sections[s]!.done)) s];
    final filled = [for (final s in vendorSections) if (a.sections[s]!.done) s];
    final banner = switch (a.status) {
      'draft' when a.anySentBack => 'QuikFly asked for a few changes. Fix the sections marked "Needs changes", then send your application again.',
      'draft' => 'Please complete the pending details to join QuikFly.',
      'submitted' => 'Your application is with QuikFly for review. We\'ll send you a notification when it\'s checked.',
      'onboarding' => 'Approved! Finish these steps to go live.',
      'active' => 'You\'re live on QuikFly.',
      'rejected' => 'Your application wasn\'t accepted${a.note == null ? '.' : ': ${a.note}'}',
      _ => 'Your partner account is blocked. Call partner support.',
    };

    Widget tile(String s) {
      final st = a.sections[s]!;
      final chip = switch (st.state) {
        'changes' => ('Needs changes', c.warning),
        'approved' => ('Approved', c.success),
        'filled' => (a.status == 'submitted' ? 'In review' : 'Filled', c.fgMuted),
        _ => (null, c.fgMuted),
      };
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Panel(
          onTap: () => context.push('/section/$s'),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(children: [
            Icon(st.done ? Icons.check_circle : Icons.radio_button_unchecked, color: st.done ? (st.state == 'approved' ? c.success : c.fg) : c.fgSubtle),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(vendorSectionLabel[s]!, style: const TextStyle(fontWeight: FontWeight.w600)),
              if (chip.$1 != null) Text(chip.$1!, style: TextStyle(color: chip.$2, fontSize: 12)),
              if (st.state == 'changes' && st.note != null) Text(st.note!, style: TextStyle(color: c.fgMuted, fontSize: 12)),
            ])),
            const Icon(Icons.chevron_right),
          ]),
        ),
      );
    }

    Widget stepCard(int n, String label, {required bool active, required bool done, required bool locked}) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: active ? Color.alphaBlend(Brand.gold.withValues(alpha: 0.1), c.surface) : c.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: active ? c.accent : c.border, width: active ? 1.5 : 1),
            ),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('STEP $n', style: TextStyle(color: c.fgSubtle, fontSize: 11, letterSpacing: 1)),
                Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: locked ? c.fgSubtle : c.fg)),
              ])),
              if (done) Icon(Icons.check_circle, color: c.success) else if (locked) Icon(Icons.lock_outline, color: c.accent, size: 20),
            ]),
          ),
        );

    return Scaffold(
      appBar: _bar(context, ref),
      bottomNavigationBar: a.status == 'draft'
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(children: [
                  if (a.submittedAt == null) ...[
                    Expanded(child: OutlinedButton(onPressed: _busy ? null : _reset, child: const Text('Reset'))),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    flex: 2,
                    child: GoldButton(
                      label: a.submittedAt == null ? 'Submit application' : 'Send again',
                      loading: _busy,
                      onPressed: a.readyToSubmit ? () => _run(() => ref.read(apiProvider).submitVendorApplication(), 'Application sent to QuikFly') : null,
                    ),
                  ),
                ]),
              ),
            )
          : null,
      body: ScreenList(
        onRefresh: () async => ref.invalidate(vendorProvider),
        children: [
          Row(children: [
            stepCard(1, 'Application', active: !step2, done: step2, locked: false),
            const SizedBox(width: 10),
            stepCard(2, 'Onboarding', active: a.status == 'onboarding', done: a.status == 'active', locked: !step2),
          ]),
          const SizedBox(height: 12),
          Panel(
            highlighted: a.status == 'onboarding' || a.status == 'active',
            child: Text(banner, textAlign: TextAlign.center, style: TextStyle(color: a.status == 'rejected' ? c.danger : c.fg)),
          ),
          FormError(_err),
          const SizedBox(height: 8),
          if (!step2) ...[
            if (pending.isNotEmpty) ...[_heading(context, 'DETAILS PENDING'), for (final s in pending) tile(s)],
            if (filled.isNotEmpty) ...[_heading(context, 'DETAILS FILLED'), for (final s in filled) tile(s)],
            if (a.status == 'draft' && !a.readyToSubmit)
              Text('Submit opens once every section is filled.', textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
          ] else ...[
            _heading(context, a.status == 'active' ? 'ONBOARDING DONE' : 'DETAILS PENDING'),
            _OnboardingTiles(a),
            if (a.status == 'active') ...[const SizedBox(height: 12), _Live(a)],
          ],
        ],
      ),
    );
  }
}

Widget _heading(BuildContext context, String text) => Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Text(text, style: TextStyle(color: context.qf.fgSubtle, fontSize: 12, letterSpacing: 1, fontWeight: FontWeight.w600)),
    );

/// Step 2: payment → agreement → sticker & paint, each locked until the one before is done.
class _OnboardingTiles extends StatelessWidget {
  const _OnboardingTiles(this.a);
  final VendorApplication a;
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final paid = a.paidAt != null;
    final agreed = a.agreementAt != null;
    final stickered = a.stickerDoneAt != null;
    Widget tile(String title, String? sub, {required bool done, required bool locked, String? route}) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Panel(
            onTap: locked || route == null ? null : () => context.push(route),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(children: [
              Icon(done ? Icons.check_circle : Icons.radio_button_unchecked, color: done ? c.success : c.fgSubtle),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: locked ? c.fgSubtle : c.fg)),
                if (sub != null) Text(sub, style: TextStyle(color: c.fgMuted, fontSize: 12)),
              ])),
              Icon(locked ? Icons.lock_outline : Icons.chevron_right, color: locked ? c.accent : null),
            ]),
          ),
        );
    return Column(children: [
      tile('Payment', a.fee == 0 ? 'No joining fee' : paid ? '${inr(a.fee)} joining fee · done' : '${inr(a.fee)} joining fee', done: paid, locked: false, route: paid ? null : '/onboarding/payment'),
      tile('Partner & vehicle agreement', agreed ? 'Accepted' : paid ? null : 'Available after the payment', done: agreed, locked: !paid, route: agreed ? null : '/onboarding/agreement'),
      tile('Vehicle sticker & paint',
          stickered ? 'Done' : a.stickerRequestedAt != null ? 'Requested · QuikFly will call you to fix a time' : agreed ? null : 'Available after the agreement',
          done: stickered, locked: !agreed, route: '/onboarding/sticker'),
    ]);
  }
}

/// Active partner: the live vehicle. Trips and earnings come in the next release.
class _Live extends StatelessWidget {
  const _Live(this.a);
  final VendorApplication a;
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final v = a.vehicle;
    return Panel(
      highlighted: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.local_taxi, color: c.accent),
          const SizedBox(width: 10),
          Expanded(child: Text(v == null ? 'Your vehicle' : VendorRules.formatReg(v.regNumber), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: c.success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(Brand.radiusChip)),
            child: Text('Live', style: TextStyle(color: c.success, fontWeight: FontWeight.w600)),
          ),
        ]),
        if (v != null) ...[
          const SizedBox(height: 6),
          Text('${vendorVehicleLabel[v.type]} · ${fuelLabel[v.fuel]} · ${a.city ?? ''}', style: TextStyle(color: c.fgMuted)),
          if (v.insurance != null) Text('Insurance valid till ${v.insurance!.validTill}', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
        ],
        const SizedBox(height: 10),
        Text('Trips, earnings and payouts for this vehicle will show here.', style: TextStyle(color: c.fgSubtle, fontSize: 12.5)),
      ]),
    );
  }
}

/// Settings from /config with defaults while loading.
Settings partnerSettings(WidgetRef ref) => ref.watch(configProvider).value?.settings ?? const Settings({});
