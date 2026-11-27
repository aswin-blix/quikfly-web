// QuikFly Captain: my trips, my account and "How it works". The rules come from the API (GET /driver →
// rules), never typed in here, so a change staff make reaches captains without an app release.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../core/format.dart';
import '../theme/tokens.dart';
import '../widgets/theme_toggle.dart';
import '../widgets/ui.dart';
import 'captain_state.dart';
import 'home_screen.dart';
import 'offer_card.dart';
import 'speech.dart';

class CaptainTripsScreen extends ConsumerWidget {
  const CaptainTripsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final trips = ref.watch(captainTripsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My trips')),
      body: trips.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(captainTripsProvider))]),
        data: (list) => ScreenList(
          onRefresh: () async {
            ref.invalidate(captainTripsProvider);
            ref.invalidate(captainSummaryProvider);
          },
          children: [
            if (list.isEmpty) const EmptyState(icon: Icons.route_outlined, title: 'No trips yet', message: 'Trips you complete show here, with what each one earned.'),
            for (final t in list)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Panel(
                  child: Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(t.subtitle.isEmpty ? t.title : t.subtitle, style: const TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text('${dateTime(t.completedAt)} · ${t.payment == PaymentMethod.cash ? 'Cash ${rupees(t.paidPaise)}' : 'Paid online'}',
                          style: TextStyle(color: c.fgMuted, fontSize: 13)),
                    ])),
                    Text(rupees(t.earningPaise), style: TextStyle(fontWeight: FontWeight.w700, color: c.success)),
                  ]),
                ),
              ),
            if (list.isNotEmpty) Text('Amounts are what each trip earned the vehicle. Your fleet owner is paid by QuikFly.', style: TextStyle(color: c.fgSubtle, fontSize: 12.5)),
          ],
        ),
      ),
    );
  }
}

class CaptainAccountScreen extends ConsumerWidget {
  const CaptainAccountScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final p = ref.watch(captainLookupProvider).value?.captain;
    final voice = ref.watch(voiceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Account'), actions: const [ThemeToggle()]),
      body: ScreenList(children: [
        if (p != null)
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.name, style: Theme.of(context).textTheme.titleLarge),
              Text(phoneDisplay(p.phone), style: TextStyle(color: c.fgMuted)),
              const Divider(height: 24),
              KeyValue('Vehicle', p.regNumber ?? 'None assigned'),
              KeyValue(p.self ? 'Your partner account' : 'Fleet owner', p.ownerName),
              if (p.gender == 'female') const KeyValue('Women-only rides', 'Yes'),
            ]),
          ),
        const SizedBox(height: 12),
        Panel(
          padding: EdgeInsets.zero,
          child: Column(children: [
            SwitchListTile(
              title: const Text('Read offers aloud'),
              subtitle: const Text('The ride, the places, the distance and the fare.'),
              value: voice.on,
              onChanged: (v) => ref.read(voiceProvider.notifier).set(on: v),
            ),
            ListTile(
              title: const Text('Voice language'),
              trailing: DropdownButton<String>(
                value: voice.lang,
                underline: const SizedBox.shrink(),
                items: [for (final e in voiceLanguages.entries) DropdownMenuItem(value: e.key, child: Text(e.value.$1))],
                onChanged: (v) => v == null ? null : ref.read(voiceProvider.notifier).set(lang: v),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        Panel(
          padding: EdgeInsets.zero,
          child: Column(children: [
            ListTile(leading: const Icon(Icons.help_outline), title: const Text('How it works'), trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/how')),
            ListTile(leading: const Icon(Icons.shield_outlined), title: const Text('Privacy & data'), trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/privacy/data')),
            ListTile(leading: const Icon(Icons.policy_outlined), title: const Text('Privacy notice'), trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/privacy')),
          ]),
        ),
        const SizedBox(height: 20),
        OutlinedButton(
          onPressed: () async {
            if (await signOutCaptain(context, ref) && context.mounted) context.go('/');
          },
          child: const Text('Sign out'),
        ),
      ]),
    );
  }
}

class HowItWorksScreen extends ConsumerWidget {
  const HowItWorksScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = ref.watch(captainRulesProvider);
    final c = context.qf;
    Widget item(IconData icon, String title, String text) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Panel(
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, color: c.accent),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(text, style: TextStyle(color: c.fgMuted)),
              ])),
            ]),
          ),
        );
    final valid = r.releaseReasons.where((x) => x.valid).map((x) => x.label.toLowerCase()).join(', ');
    return Scaffold(
      appBar: AppBar(title: const Text('How it works')),
      body: ScreenList(children: [
        item(Icons.timer_outlined, 'Offers', 'Rides go to the nearest free captain within ${_km(r.searchRadiusKm)} of the pickup, one at a time. You have ${r.offerSeconds} seconds to answer. When captains are about as near, the one who has waited longest is asked first.'),
        item(Icons.thumb_up_alt_outlined, 'Declining is free', 'Saying no, or letting an offer run out, never counts against you. There is no acceptance score.'),
        item(Icons.place_outlined, 'At the pickup', r.arrivedRadiusKm > 0
            ? '"I\'ve arrived" works within ${_km(r.arrivedRadiusKm)} of the pickup. The rider confirms the booking in their app, then tells you their 4-digit PIN.'
            : 'Say you\'ve arrived at the pickup. The rider confirms the booking in their app, then tells you their 4-digit PIN.'),
        item(Icons.pin_outlined, 'The ride PIN', 'The trip starts only with the rider\'s PIN. After ${r.pinTries} wrong PINs the start is locked for ${r.pinLockMinutes} minutes.'),
        item(Icons.undo, 'Giving a ride back', r.cancelPenaltyPercent > 0
            ? 'Before the trip starts you can give a ride back. These reasons are always free: $valid. For any other reason your owner is charged ${r.cancelPenaltyPercent}% of the fare, at most ${inr(r.cancelPenaltyCap)}.'
            : 'Before the trip starts you can give a ride back with a reason. It costs nothing right now. These reasons are always free: $valid.'),
        item(Icons.account_balance_wallet_outlined, 'What QuikFly takes', r.onDailyFee
            ? 'No share of your rides. Your owner pays a fee of ${rupees(r.dailyFeePaise)} once on each day you complete a ride; no rides, no fee.'
            : 'QuikFly keeps ${r.commissionPercent.toStringAsFixed(r.commissionPercent % 1 == 0 ? 0 : 1)}% of each fare (after GST), and 0.1% TDS is deducted. Every offer shows the exact split.'),
        item(Icons.payments_outlined, 'Cash', 'On a cash ride you collect what the rider pays at the end. The app shows it full screen, and "Cash you hold" adds up the day. You hand it to your owner.'),
        item(Icons.phone_android, 'Keep the app open', 'In this version you stay online only while QuikFly Captain is on screen. Locations are demo locations: you pick where you start and the app moves you during a trip.'),
      ]),
    );
  }

  String _km(double km) => '${km.toStringAsFixed(km % 1 == 0 ? 0 : 1)} km';
}
