// Account sections (route /account/:section), mirroring the website's /account tabs:
// profile, wallet, places, travellers, safety, licence, refer, business, settings.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import '../../api/models.dart';
import '../../core/env.dart';
import '../../core/format.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/licence_panel.dart';
import '../../widgets/safety_sheet.dart' show contactsProvider;
import '../../widgets/ui.dart';
import '../auth/login_screen.dart';
import '../checkout/checkout_screen.dart' show travellersProvider;
import '../ride/place_search_screen.dart';
import 'privacy_screens.dart';

/// Refund timings shown on the wallet page (apps/web/src/lib/account.ts REFUND_TIMINGS).
const refundTimings = [('QuikFly wallet', 'Instant'), ('UPI', '1–3 working days'), ('Card / net banking', '5–7 working days')];

const walletKindLabel = {'welcome': 'Welcome credit', 'payment': 'Payment', 'refund': 'Refund', 'referral': 'Referral bonus', 'opening': 'Opening balance', 'adjustment': 'Adjustment by QuikFly'};

/// Opens one account section, or asks to sign in first.
class AccountSectionScreen extends ConsumerWidget {
  const AccountSectionScreen({super.key, required this.section});
  final String section;

  static const titles = {
    'profile': 'Profile',
    'wallet': 'Wallet',
    'places': 'Saved places',
    'travellers': 'Saved travellers',
    'safety': 'Safety',
    'licence': 'Driving licence',
    'refer': 'Refer & earn',
    'business': 'Business / GST',
    'privacy': 'Privacy & data',
    'settings': 'Login & security',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);
    final title = titles[section] ?? 'Account';
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: ScreenList(children: [
          EmptyState(
            icon: Icons.lock_outline,
            title: 'Sign in to see your account',
            action: GoldButton(label: 'Login or sign up', expand: false, onPressed: () => ensureSignedIn(context, ref)),
          ),
        ]),
      );
    }
    final body = switch (section) {
      'profile' => const _Profile(),
      'wallet' => const _Wallet(),
      'places' => const _Places(),
      'travellers' => const _Travellers(),
      'safety' => const _Safety(),
      'licence' => const _Licence(),
      'refer' => const _Refer(),
      'business' => const _Business(),
      'privacy' => const ScreenList(children: [PrivacyDataPanel(deleteRoute: '/account/settings')]),
      'settings' => const _Settings(),
      _ => const EmptyState(icon: Icons.help_outline, title: 'Nothing here'),
    };
    return Scaffold(appBar: AppBar(title: Text(title)), body: body);
  }
}

/// Busy flag, error text and a runner that catches API errors.
mixin _Action<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  bool busy = false;
  String? error;
  Future<void> run(Future<void> Function() fn) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await fn();
    } catch (e) {
      if (mounted) setState(() => error = errorText(e));
    }
    if (mounted) setState(() => busy = false);
  }
}

Widget _sub(BuildContext context, String s) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(s, style: TextStyle(color: context.qf.fgMuted)),
    );

/* ───────────── Profile ───────────── */

class _Profile extends ConsumerStatefulWidget {
  const _Profile();
  @override
  ConsumerState<_Profile> createState() => _ProfileState();
}

class _ProfileState extends ConsumerState<_Profile> with _Action {
  late final User _u = ref.read(userProvider)!;
  late final _name = TextEditingController(text: _u.name);
  late final _email = TextEditingController(text: _u.email ?? '');
  late Gender? _gender = _u.gender;
  late DateTime? _dob = DateTime.tryParse(_u.dob ?? '');

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  void _save() {
    final name = _name.text.trim(), email = _email.text.trim();
    if (name.length < Rules.nameMin) return setState(() => error = 'Please enter your name');
    if (email.isNotEmpty && !Rules.email.hasMatch(email)) return setState(() => error = 'Enter a valid email or leave it empty');
    if (_dob != null) {
      final now = DateTime.now();
      var age = now.year - _dob!.year;
      if (now.month < _dob!.month || (now.month == _dob!.month && now.day < _dob!.day)) age--;
      if (age < Rules.minAge || age > Rules.maxAge) return setState(() => error = 'Enter a real date of birth (age ${Rules.minAge}–${Rules.maxAge}).');
    }
    run(() async {
      final u = await ref.read(apiProvider).updateProfile({
        'name': name,
        'email': email.isEmpty ? null : email,
        'gender': _gender?.name,
        'dob': _dob == null ? null : isoDate(_dob!),
      });
      ref.read(sessionProvider.notifier).setUser(u);
      if (mounted) toast(context, 'Profile saved');
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return ScreenList(children: [
      _sub(context, 'Used on tickets and invoices, and so drivers know who to look for.'),
      TextField(controller: _name, textCapitalization: TextCapitalization.words, maxLength: Rules.nameMax, decoration: const InputDecoration(labelText: 'Full name', counterText: '')),
      const SizedBox(height: 12),
      InputDecorator(
        decoration: const InputDecoration(labelText: 'Mobile number', helperText: 'Change it under Login & security'),
        child: Text(phoneDisplay(_u.phone), style: TextStyle(color: c.fgMuted)),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _email,
        keyboardType: TextInputType.emailAddress,
        decoration: const InputDecoration(labelText: 'Email', hintText: 'you@example.com', helperText: 'Tickets and invoices are emailed here'),
      ),
      const SizedBox(height: 12),
      DropdownButtonFormField<Gender?>(
        initialValue: _gender,
        decoration: const InputDecoration(labelText: 'Gender', helperText: 'Helps with women-only seats and options'),
        items: const [
          DropdownMenuItem(value: null, child: Text('Prefer not to say')),
          DropdownMenuItem(value: Gender.female, child: Text('Female')),
          DropdownMenuItem(value: Gender.male, child: Text('Male')),
          DropdownMenuItem(value: Gender.other, child: Text('Other')),
        ],
        onChanged: (v) => setState(() => _gender = v),
      ),
      const SizedBox(height: 12),
      InkWell(
        borderRadius: BorderRadius.circular(Brand.radiusField),
        onTap: () async {
          final now = DateTime.now();
          final d = await showDatePicker(
            context: context,
            initialDate: _dob ?? DateTime(now.year - 25),
            firstDate: DateTime(now.year - Rules.maxAge),
            lastDate: DateTime(now.year - Rules.minAge, now.month, now.day),
          );
          if (d != null) setState(() => _dob = d);
        },
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: 'Date of birth',
            helperText: 'Needed for self-drive (18+)',
            suffixIcon: _dob == null ? const Icon(Icons.calendar_today, size: 18) : IconButton(tooltip: 'Clear', icon: const Icon(Icons.close), onPressed: () => setState(() => _dob = null)),
          ),
          child: Text(_dob == null ? 'Not set' : longDate(_dob!), style: TextStyle(color: _dob == null ? c.fgSubtle : c.fg)),
        ),
      ),
      FormError(error),
      const SizedBox(height: 12),
      GoldButton(label: 'Save profile', loading: busy, onPressed: _save),
    ]);
  }
}

/* ───────────── Wallet ───────────── */

/// QuikFly Pass: what it does, when it ends, and buying or extending it from the wallet.
class _PassCard extends ConsumerStatefulWidget {
  const _PassCard();
  @override
  ConsumerState<_PassCard> createState() => _PassCardState();
}

class _PassCardState extends ConsumerState<_PassCard> {
  bool _busy = false;
  String? _error;

  Future<void> _buy() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final until = await ref.read(apiProvider).buyPass();
      await ref.read(sessionProvider.notifier).refresh();
      ref.invalidate(_walletProvider);
      if (mounted) toast(context, 'QuikFly Pass active until ${shortDate(until)}');
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final user = ref.watch(userProvider)!;
    final s = ref.watch(configProvider).value?.settings ?? const Settings({});
    final until = user.passUntil;
    final short = user.walletBalance < s.passPrice;
    final surge = s.effectiveSurge.toStringAsFixed(s.effectiveSurge % 1 == 0 ? 0 : 1);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionTitle('QuikFly Pass'),
      _sub(context, '${(ref.watch(configProvider).value?.surgeRules.isNotEmpty ?? false) ? 'Busy times (${s.surgeHours}, and more by ride type and day) add up to a ×$surge surge' : 'Peak hours (${s.surgeHours}) add a ×$surge surge'} to ride fares. With the pass you pay the normal fare on every bike, auto and cab ride for ${s.passDays} days.'),
      Panel(
        child: Row(children: [
          Icon(Icons.confirmation_number_outlined, color: c.accent, size: 30),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(until != null ? 'Active until' : 'Price', style: TextStyle(color: c.fgMuted, fontSize: 12)),
              Text(until != null ? shortDate(until) : inr(s.passPrice), style: Theme.of(context).textTheme.headlineMedium),
              if (until == null) Text('for ${s.passDays} days', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
            ]),
          ),
        ]),
      ),
      if (s.passOnSale) ...[
        const SizedBox(height: 10),
        GoldButton(
          label: until != null ? 'Add ${s.passDays} days · ${inr(s.passPrice)}' : 'Get QuikFly Pass · ${inr(s.passPrice)}',
          loading: _busy,
          onPressed: short ? null : _buy,
        ),
        const SizedBox(height: 6),
        Text(
          short
              ? 'Your wallet has ${inr(user.walletBalance)}; the pass costs ${inr(s.passPrice)}.'
              : "Paid from your wallet. A pass can't be cancelled or refunded.${until != null ? ' The new days start when this pass ends.' : ''}",
          style: TextStyle(color: c.fgSubtle, fontSize: 12),
        ),
      ],
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 6), child: LiveError(child: Text(_error!, style: TextStyle(color: c.danger, fontSize: 12.5)))),
    ]);
  }
}

final _walletProvider = FutureProvider.autoDispose<List<WalletTransaction>>((ref) => ref.watch(apiProvider).wallet());
final _creditsProvider = FutureProvider.autoDispose<CreditSummary>((ref) => ref.watch(apiProvider).credits());
const _creditKindLabel = {'earned': 'Earned', 'spent': 'Used', 'returned': 'Returned', 'expired': 'Expired'};

class _Wallet extends ConsumerWidget {
  const _Wallet();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final user = ref.watch(userProvider)!;
    final history = ref.watch(_walletProvider);
    final credits = ref.watch(_creditsProvider);
    final settings = ref.watch(configProvider).value?.settings ?? const Settings({});
    final rates = [
      for (final (label, key) in [('Rides', ServiceKey.car), ('Bus', ServiceKey.bus), ('Holidays', ServiceKey.tours), ('Rent a car', ServiceKey.rent), ('Group travel', ServiceKey.rentals)])
        if (settings.creditPercent(key) > 0 && (key == ServiceKey.car ? settings.serviceOn(ServiceKey.car) || settings.serviceOn(ServiceKey.bike) : settings.serviceOn(key))) '$label · ${settings.creditPercent(key)}%',
    ];
    return ScreenList(
      onRefresh: () async {
        ref.invalidate(_walletProvider);
        ref.invalidate(_creditsProvider);
        await ref.read(sessionProvider.notifier).refresh();
      },
      children: [
        Panel(
          highlighted: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('QuikFly wallet', style: TextStyle(color: c.fgMuted)),
            Text(inr(user.walletBalance), style: Theme.of(context).textTheme.headlineLarge),
            const SizedBox(height: 6),
            Text("Use it for any QuikFly booking. Refunds to the wallet are instant. Wallet money can't be withdrawn to a bank.",
                style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
          ]),
        ),
        if (settings.passOnSale || user.passUntil != null) ...[const SizedBox(height: 18), const _PassCard()],
        const SizedBox(height: 18),
        const SectionTitle('QuikFly Credits'),
        _sub(context, "Earned back on completed trips. Credits pay up to ${settings.creditsMaxRedeemPercent}% of a booking, expire ${settings.creditsExpiryDays} days after you get them, and can't be withdrawn."),
        Panel(
          child: Row(children: [
            Icon(Icons.toll_outlined, color: c.accent, size: 30),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Credits to use', style: TextStyle(color: c.fgMuted, fontSize: 12)),
                Text(inr(user.creditBalance), style: Theme.of(context).textTheme.headlineMedium),
                if (credits.value?.nextExpiry != null)
                  Text('${inr(credits.value!.nextExpiryAmount)} expire on ${shortDate(credits.value!.nextExpiry!)}', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
              ]),
            ),
          ]),
        ),
        if (rates.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text('How much comes back (up to ${inr(settings.creditsCap)} a booking)', style: TextStyle(color: c.fgMuted, fontSize: 12)),
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 6, children: [for (final r in rates) Chip(label: Text(r, style: const TextStyle(fontSize: 12)), visualDensity: VisualDensity.compact)]),
        ],
        const SizedBox(height: 8),
        ...credits.when(
          loading: () => const [Skeleton(height: 60)],
          error: (e, _) => [ErrorBox(errorText(e), onRetry: () => ref.invalidate(_creditsProvider))],
          data: (sum) => sum.items.isEmpty
              ? [Text('Complete a trip to earn your first credits.', style: TextStyle(color: c.fgMuted))]
              : [
                  Panel(
                    padding: EdgeInsets.zero,
                    child: Column(children: [
                      for (var i = 0; i < sum.items.length; i++) ...[
                        if (i > 0) Divider(color: c.border),
                        Builder(builder: (_) {
                          final t = sum.items[i];
                          final gained = t.amount >= 0;
                          final left = gained && t.remaining > 0 && t.expiresAt != null
                              ? ' · ${t.remaining < t.amount ? '${inr(t.remaining)} left, ' : ''}expires ${shortDate(t.expiresAt!)}'
                              : '';
                          return ListTile(
                            leading: Icon(Icons.toll_outlined, color: gained ? c.accent : c.fgMuted),
                            title: Text(t.note),
                            subtitle: Text('${_creditKindLabel[t.kind] ?? t.kind} · ${dateTime(t.createdAt)}$left'),
                            trailing: Text(inrSigned(t.amount), style: TextStyle(fontWeight: FontWeight.w700, color: gained ? c.accent : c.fg)),
                          );
                        }),
                      ],
                    ]),
                  ),
                ],
        ),
        const SizedBox(height: 18),
        const SectionTitle('Wallet history'),
        ...history.when(
          loading: () => const [Skeleton(height: 60), SizedBox(height: 8), Skeleton(height: 60)],
          error: (e, _) => [ErrorBox(errorText(e), onRetry: () => ref.invalidate(_walletProvider))],
          data: (list) => list.isEmpty
              ? const [EmptyState(icon: Icons.receipt_long_outlined, title: 'No wallet activity yet')]
              : [
                  Panel(
                    padding: EdgeInsets.zero,
                    child: Column(children: [
                      for (var i = 0; i < list.length; i++) ...[
                        if (i > 0) Divider(color: c.border),
                        ListTile(
                          leading: Icon(list[i].amount >= 0 ? Icons.south_west : Icons.north_east, color: list[i].amount >= 0 ? c.success : c.fgMuted),
                          title: Text(walletKindLabel[list[i].kind] ?? list[i].kind),
                          subtitle: Text([if (list[i].note.isNotEmpty) list[i].note, dateTime(list[i].createdAt)].join(' · ')),
                          trailing: Text(inrSigned(list[i].amount),
                              style: TextStyle(fontWeight: FontWeight.w700, color: list[i].amount >= 0 ? c.success : c.fg)),
                        ),
                      ],
                    ]),
                  ),
                ],
        ),
        const SizedBox(height: 18),
        const SectionTitle('Refund timings'),
        _sub(context, 'How long a cancelled booking takes to reach you, by how you paid.'),
        Panel(child: Column(children: [for (final (k, v) in refundTimings) KeyValue(k, v)])),
      ],
    );
  }
}

/* ───────────── Saved places ───────────── */

class _Places extends ConsumerStatefulWidget {
  const _Places();
  @override
  ConsumerState<_Places> createState() => _PlacesState();
}

class _PlacesState extends ConsumerState<_Places> with _Action {
  Future<void> _add(String kind) async {
    String? label;
    if (kind == 'other') {
      label = await _askText(context, 'Name this place', 'e.g. Gym, Mom\'s house', maxLength: 30);
      if (label == null || label.trim().isEmpty || !mounted) return;
    }
    final p = await Navigator.of(context).push<Place>(MaterialPageRoute(builder: (_) => PlaceSearchScreen(title: kind == 'other' ? label! : kind == 'home' ? 'Home' : 'Work')));
    if (p == null) return;
    await run(() async {
      await ref.read(apiProvider).savePlace(kind, p.id, label: label?.trim());
      ref.invalidate(savedPlacesProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final places = ref.watch(savedPlacesProvider);
    final list = places.value ?? const <SavedPlace>[];
    SavedPlace? slot(String k) => list.where((p) => p.kind == k).firstOrNull;
    return ScreenList(children: [
      _sub(context, 'One tap to set pickup or drop when you book a ride.'),
      if (places.isLoading && list.isEmpty) const Skeleton(height: 120),
      for (final k in const ['home', 'work'])
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Panel(
            padding: EdgeInsets.zero,
            child: ListTile(
              leading: Icon(savedPlaceIcon(k), color: c.accent),
              title: Text(k == 'home' ? 'Home' : 'Work'),
              subtitle: Text(slot(k)?.place.name ?? 'Not set'),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                TextButton(onPressed: busy ? null : () => _add(k), child: Text(slot(k) == null ? 'Add' : 'Change')),
                if (slot(k) != null) _removeButton(context, slot(k)!.label, () => ref.read(apiProvider).removePlace(slot(k)!.id).then((_) => ref.invalidate(savedPlacesProvider))),
              ]),
            ),
          ),
        ),
      for (final p in list.where((p) => p.kind == 'other'))
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Panel(
            padding: EdgeInsets.zero,
            child: ListTile(
              leading: Icon(Icons.place_outlined, color: c.accent),
              title: Text(p.label),
              subtitle: Text(p.place.name),
              trailing: _removeButton(context, p.label, () => ref.read(apiProvider).removePlace(p.id).then((_) => ref.invalidate(savedPlacesProvider))),
            ),
          ),
        ),
      FormError(error),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        onPressed: busy || list.length >= Rules.savedPlaces ? null : () => _add('other'),
        icon: const Icon(Icons.add),
        label: Text(list.length >= Rules.savedPlaces ? 'Up to ${Rules.savedPlaces} places' : 'Add another place'),
      ),
    ]);
  }
}

Widget _removeButton(BuildContext context, String what, Future<void> Function() remove) => IconButton(
      tooltip: 'Remove $what',
      icon: Icon(Icons.delete_outline, color: context.qf.fgMuted),
      onPressed: () async {
        try {
          await remove();
        } catch (e) {
          if (context.mounted) toast(context, errorText(e));
        }
      },
    );

Future<String?> _askText(BuildContext context, String title, String hint, {int maxLength = 60}) {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(controller: ctrl, autofocus: true, maxLength: maxLength, decoration: InputDecoration(hintText: hint)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: const Text('Next')),
      ],
    ),
  );
}

/* ───────────── Travellers ───────────── */

class _Travellers extends ConsumerStatefulWidget {
  const _Travellers();
  @override
  ConsumerState<_Travellers> createState() => _TravellersState();
}

class _TravellersState extends ConsumerState<_Travellers> with _Action {
  final _name = TextEditingController();
  final _age = TextEditingController();
  Gender _gender = Gender.female;

  @override
  void dispose() {
    _name.dispose();
    _age.dispose();
    super.dispose();
  }

  void _add() {
    final name = _name.text.trim();
    final age = int.tryParse(_age.text) ?? -1;
    if (name.length < Rules.nameMin) return setState(() => error = 'Enter their name');
    if (age < 0 || age > Rules.maxAge) return setState(() => error = 'Enter an age between 0 and ${Rules.maxAge}');
    run(() async {
      await ref.read(apiProvider).addTraveller(name, age, _gender);
      ref.invalidate(travellersProvider);
      _name.clear();
      _age.clear();
      if (mounted) toast(context, '$name saved');
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final list = ref.watch(travellersProvider).value ?? const <Traveller>[];
    return ScreenList(children: [
      _sub(context, 'Family and friends you travel with. Tap them at checkout instead of typing names.'),
      for (final t in list)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Panel(
            padding: EdgeInsets.zero,
            child: ListTile(
              leading: Icon(Icons.person_outline, color: c.accent),
              title: Text(t.name),
              subtitle: Text('${t.age} yrs · ${t.gender.name}'),
              trailing: _removeButton(context, t.name, () => ref.read(apiProvider).removeTraveller(t.id).then((_) => ref.invalidate(travellersProvider))),
            ),
          ),
        ),
      if (list.length < Rules.travellers)
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Add a traveller', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Full name')),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _age,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
                  decoration: const InputDecoration(labelText: 'Age'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<Gender>(
                  initialValue: _gender,
                  decoration: const InputDecoration(labelText: 'Gender'),
                  items: [for (final g in Gender.values) DropdownMenuItem(value: g, child: Text(g.name[0].toUpperCase() + g.name.substring(1)))],
                  onChanged: (v) => setState(() => _gender = v ?? _gender),
                ),
              ),
            ]),
            FormError(error),
            const SizedBox(height: 10),
            GoldButton(label: 'Save traveller', loading: busy, onPressed: _add),
          ]),
        )
      else
        Text('You can save up to ${Rules.travellers} travellers.', style: TextStyle(color: c.fgMuted)),
    ]);
  }
}

/* ───────────── Safety ───────────── */

class _Safety extends ConsumerStatefulWidget {
  const _Safety();
  @override
  ConsumerState<_Safety> createState() => _SafetyState();
}

class _SafetyState extends ConsumerState<_Safety> with _Action {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _relation = TextEditingController();
  final _pin = TextEditingController();

  @override
  void dispose() {
    for (final x in [_name, _phone, _relation, _pin]) {
      x.dispose();
    }
    super.dispose();
  }

  void _add() {
    final name = _name.text.trim();
    if (name.length < Rules.nameMin) return setState(() => error = 'Enter their name');
    if (!Rules.phone.hasMatch(_phone.text)) return setState(() => error = 'Enter a valid 10-digit mobile number');
    run(() async {
      await ref.read(apiProvider).addContact(name, _phone.text, relation: _relation.text.trim().isEmpty ? null : _relation.text.trim());
      ref.invalidate(contactsProvider);
      for (final x in [_name, _phone, _relation]) {
        x.clear();
      }
      if (mounted) toast(context, '$name added');
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final user = ref.watch(userProvider)!;
    final contacts = ref.watch(contactsProvider).value ?? const <EmergencyContact>[];
    return ScreenList(children: [
      const SectionTitle('Emergency contacts'),
      _sub(context, 'Up to ${Rules.emergencyContacts} people we alert when you press SOS or share a trip.'),
      for (final x in contacts)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Panel(
            padding: EdgeInsets.zero,
            child: ListTile(
              leading: Icon(Icons.person_outline, color: c.accent),
              title: Text(x.name),
              subtitle: Text([phoneDisplay(x.phone), ?x.relation].join(' · ')),
              trailing: _removeButton(context, x.name, () => ref.read(apiProvider).removeContact(x.id).then((_) => ref.invalidate(contactsProvider))),
            ),
          ),
        ),
      if (contacts.length < Rules.emergencyContacts)
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(controller: _name, textCapitalization: TextCapitalization.words, maxLength: Rules.nameMax, decoration: const InputDecoration(labelText: 'Name', counterText: '')),
            const SizedBox(height: 10),
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
              decoration: const InputDecoration(labelText: 'Mobile', prefixText: '+91  '),
            ),
            const SizedBox(height: 10),
            TextField(controller: _relation, maxLength: 30, decoration: const InputDecoration(labelText: 'Relation (optional)', hintText: 'e.g. Sister', counterText: '')),
            FormError(error),
            const SizedBox(height: 10),
            GoldButton(label: 'Add contact', loading: busy, onPressed: _add),
          ]),
        ),
      const SizedBox(height: 20),
      const SectionTitle('Safety preferences'),
      Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Share my trip automatically', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final (mode, label) in const [('off', 'Off'), ('night', 'Night rides'), ('always', 'Every ride')])
              ChoiceChip(
                label: Text(label),
                selected: user.autoShareRides == mode,
                onSelected: busy || (contacts.isEmpty && mode != 'off')
                    ? null
                    : (_) => run(() async {
                          final u = await ref.read(apiProvider).updateProfile({'autoShareRides': mode});
                          ref.read(sessionProvider.notifier).setUser(u);
                          if (mounted) {
                            toast(this.context, mode == 'always' ? 'Every ride will be shared automatically' : mode == 'night' ? 'Night rides will be shared automatically' : 'Auto-share turned off');
                          }
                        }),
              ),
          ]),
          const SizedBox(height: 8),
          Text(
            contacts.isEmpty
                ? 'Add an emergency contact first.'
                : 'Your contacts get a live trip link as soon as a driver is assigned'
                    '${user.autoShareRides == 'night' ? ' (rides between ${Rules.nightHours.$1}:00 and ${Rules.nightHours.$2}:00)' : user.autoShareRides == 'always' ? ' (every ride)' : ''}. Demo: no SMS is sent.',
            style: TextStyle(color: c.fgMuted, fontSize: 12.5),
          ),
          Divider(color: c.border, height: 28),
          const Text('Ride PIN', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('Use your own 4-digit PIN instead of a new code each ride. Tell it to the driver to start the trip.', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
          const SizedBox(height: 10),
          if (user.ridePin != null)
            Row(children: [
              Text(user.ridePin!, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: 6)),
              const Spacer(),
              TextButton(
                onPressed: busy
                    ? null
                    : () => run(() async {
                          final u = await ref.read(apiProvider).updateProfile({'ridePin': null});
                          ref.read(sessionProvider.notifier).setUser(u);
                          if (mounted) toast(this.context, 'Back to a new code every ride');
                        }),
                child: const Text('Use a new code each ride'),
              ),
            ])
          else
            Row(children: [
              SizedBox(
                width: 120,
                child: TextField(
                  controller: _pin,
                  keyboardType: TextInputType.number,
                  maxLength: 4,
                  obscureText: false,
                  textAlign: TextAlign.center,
                  style: const TextStyle(letterSpacing: 6, fontWeight: FontWeight.w700),
                  decoration: const InputDecoration(hintText: '••••', counterText: ''),
                ),
              ),
              const SizedBox(width: 12),
              GoldButton(
                expand: false,
                label: 'Set PIN',
                loading: busy,
                onPressed: () {
                  if (!Rules.ridePin.hasMatch(_pin.text.trim())) {
                    setState(() => error = 'A ride PIN is 4 digits.');
                    return;
                  }
                  run(() async {
                    final u = await ref.read(apiProvider).updateProfile({'ridePin': _pin.text.trim()});
                    ref.read(sessionProvider.notifier).setUser(u);
                    _pin.clear();
                    if (mounted) toast(this.context, 'Your ride PIN is set');
                  });
                },
              ),
            ]),
        ]),
      ),
      const SizedBox(height: 20),
      const SectionTitle('During every ride'),
      for (final (i, t) in const [
        (Icons.sos, 'SOS button on the ride screen: call 112, our safety line or alert your contacts'),
        (Icons.share_location, 'Share a live trip link with anyone'),
        (Icons.pin, 'Ride OTP (or your own ride PIN): your driver starts only after you share it'),
      ])
        ListTile(contentPadding: EdgeInsets.zero, leading: Icon(i, color: c.accent), title: Text(t)),
    ]);
  }
}

/* ───────────── Licence ───────────── */

class _Licence extends StatelessWidget {
  const _Licence();
  @override
  Widget build(BuildContext context) => ScreenList(children: [
        _sub(context, 'Needed once before your first self-drive rental. Show the original with Aadhaar or passport at pickup.'),
        const LicencePanel(),
      ]);
}

/* ───────────── Refer & earn ───────────── */

class _Refer extends ConsumerStatefulWidget {
  const _Refer();
  @override
  ConsumerState<_Refer> createState() => _ReferState();
}

class _ReferState extends ConsumerState<_Refer> with _Action {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final user = ref.watch(userProvider)!;
    final bonus = inr(ref.watch(configProvider).value?.settings.referralBonus ?? 0);
    final message = 'Join me on QuikFly for rides, buses, holidays and rentals. Use my code ${user.referralCode} when you sign up and we both get $bonus in our wallets. $webUrl';
    return ScreenList(children: [
      _sub(context, 'Invite friends: when they join with your code, you both get $bonus in your wallets.'),
      Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(Brand.radiusPanel), border: Border.all(color: c.accent.withValues(alpha: 0.5), width: 1.5)),
        child: Column(children: [
          Text('Your referral code', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
          const SizedBox(height: 4),
          SelectableText(user.referralCode, style: TextStyle(color: c.accent, fontSize: 30, letterSpacing: 6, fontFamily: 'monospace', fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Wrap(spacing: 10, runSpacing: 10, alignment: WrapAlignment.center, children: [
            OutlinedButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: user.referralCode));
                toast(context, 'Code copied');
              },
              icon: const Icon(Icons.copy, size: 18),
              label: const Text('Copy code'),
            ),
            GoldButton(
              label: 'Invite friends',
              icon: Icons.share,
              expand: false,
              onPressed: () => SharePlus.instance.share(ShareParams(subject: 'QuikFly', text: message)),
            ),
          ]),
        ]),
      ),
      const SizedBox(height: 16),
      for (final (i, s) in [(1, 'Share your code'), (2, 'Your friend signs up and enters it'), (3, 'You both get $bonus wallet credit')])
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: CircleAvatar(radius: 14, backgroundColor: Brand.gold.withValues(alpha: 0.15), child: Text('$i', style: TextStyle(color: c.accent, fontSize: 12))),
          title: Text(s),
        ),
      const SizedBox(height: 12),
      const SectionTitle("Have a friend's code?"),
      if (user.referred)
        Text("You've already used a referral code. Thanks for joining through a friend!", style: TextStyle(color: c.success))
      else ...[
        _sub(context, 'You can use one referral code per account.'),
        TextField(controller: _code, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: "Friend's code", hintText: 'e.g. QF7K2M9P')),
        FormError(error),
        const SizedBox(height: 10),
        GoldButton(
          label: 'Apply',
          loading: busy,
          onPressed: () => run(() async {
            final u = await ref.read(apiProvider).applyReferral(Rules.compactCode(_code.text));
            ref.read(sessionProvider.notifier).setUser(u);
            _code.clear();
            if (mounted) toast(this.context, '$bonus added to your wallet');
          }),
        ),
      ],
    ]);
  }
}

/* ───────────── Business / GST ───────────── */

class _Business extends ConsumerStatefulWidget {
  const _Business();
  @override
  ConsumerState<_Business> createState() => _BusinessState();
}

class _BusinessState extends ConsumerState<_Business> with _Action {
  late final _gstin = TextEditingController(text: ref.read(userProvider)?.gst?.gstin ?? '');
  late final _name = TextEditingController(text: ref.read(userProvider)?.gst?.name ?? '');

  @override
  void dispose() {
    _gstin.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _save(Object? gst, String message) => run(() async {
        final u = await ref.read(apiProvider).updateProfile({'gst': gst});
        ref.read(sessionProvider.notifier).setUser(u);
        if (mounted) toast(context, message);
      });

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(userProvider)!;
    return ScreenList(children: [
      _sub(context, 'Travelling for work? Save your GST details and tick "GST invoice" at checkout to claim input tax credit.'),
      TextField(
        controller: _gstin,
        textCapitalization: TextCapitalization.characters,
        maxLength: 15,
        style: const TextStyle(fontFamily: 'monospace'),
        decoration: const InputDecoration(labelText: 'GSTIN', hintText: '33ABCDE1234F1Z5', counterText: ''),
      ),
      const SizedBox(height: 10),
      TextField(controller: _name, maxLength: 100, decoration: const InputDecoration(labelText: 'Registered business name', counterText: '')),
      FormError(error),
      const SizedBox(height: 10),
      GoldButton(
        label: 'Save GST details',
        loading: busy,
        onPressed: () {
          final gstin = Rules.compactCode(_gstin.text);
          if (!Rules.gstin.hasMatch(gstin)) return setState(() => error = 'Enter a valid 15-character GSTIN, e.g. 33ABCDE1234F1Z5.');
          if (_name.text.trim().length < 2) return setState(() => error = 'Enter the registered business name.');
          _save(GstDetails(gstin, _name.text.trim()).toJson(), 'GST details saved');
        },
      ),
      if (user.gst != null) ...[
        const SizedBox(height: 8),
        TextButton(onPressed: busy ? null : () => _save(null, 'GST details removed'), child: const Text('Remove GST details')),
      ],
    ]);
  }
}

/* ───────────── Login & security ───────────── */

class _Settings extends ConsumerStatefulWidget {
  const _Settings();
  @override
  ConsumerState<_Settings> createState() => _SettingsState();
}

class _SettingsState extends ConsumerState<_Settings> with _Action {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  bool _sent = false;

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<String?> _askOtp(String title, String message) {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(message),
          const SizedBox(height: 10),
          TextField(
            controller: ctrl,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
            decoration: InputDecoration(labelText: 'OTP', helperText: demoOtp.isEmpty ? null : 'Demo: no SMS is sent. Use $demoOtp'),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Keep my account')),
          TextButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: Text('Delete', style: TextStyle(color: ctx.qf.danger))),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final user = ref.watch(userProvider)!;
    return ScreenList(children: [
      const SectionTitle('Change mobile number'),
      _sub(context, 'Now ${phoneDisplay(user.phone)}. We check the new number with an OTP.'),
      TextField(
        controller: _phone,
        enabled: !_sent,
        keyboardType: TextInputType.phone,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
        decoration: const InputDecoration(labelText: 'New mobile number', prefixText: '+91  '),
      ),
      if (_sent) ...[
        const SizedBox(height: 10),
        TextField(
          controller: _otp,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
          decoration: InputDecoration(labelText: 'OTP', helperText: demoOtp.isEmpty ? null : 'Demo: no SMS is sent. Use $demoOtp'),
        ),
      ],
      FormError(error),
      const SizedBox(height: 10),
      Row(children: [
        if (_sent) ...[
          Expanded(child: OutlinedButton(onPressed: () => setState(() => _sent = false), child: const Text('Change number'))),
          const SizedBox(width: 10),
        ],
        Expanded(
          child: GoldButton(
            label: _sent ? 'Confirm' : 'Send OTP',
            loading: busy,
            onPressed: () {
              if (!Rules.phone.hasMatch(_phone.text)) return setState(() => error = 'Enter a valid 10-digit mobile number');
              run(() async {
                final api = ref.read(apiProvider);
                if (!_sent) {
                  await api.sendPhoneChangeOtp(_phone.text);
                  setState(() => _sent = true);
                  return;
                }
                final u = await api.changePhone(_phone.text, _otp.text);
                ref.read(sessionProvider.notifier).setUser(u);
                setState(() {
                  _sent = false;
                  _phone.clear();
                  _otp.clear();
                });
                if (mounted) toast(this.context, 'Mobile number updated');
              });
            },
          ),
        ),
      ]),
      const SizedBox(height: 24),
      const SectionTitle('Devices'),
      _sub(context, 'Lost a phone or signed in somewhere public? Sign out of QuikFly on every device, including this one.'),
      OutlinedButton.icon(
        onPressed: () async {
          if (!await confirm(context, title: 'Sign out everywhere?', message: 'You will need to sign in again on every device.', yes: 'Sign out everywhere')) return;
          await ref.read(sessionProvider.notifier).signOut(everywhere: true);
          if (context.mounted) {
            toast(context, 'Signed out on all devices');
            context.go('/');
          }
        },
        icon: const Icon(Icons.devices),
        label: const Text('Sign out everywhere'),
      ),
      const SizedBox(height: 24),
      Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [Icon(Icons.delete_outline, color: c.danger), const SizedBox(width: 8), Text('Delete account', style: TextStyle(color: c.danger, fontWeight: FontWeight.w700))]),
          const SizedBox(height: 6),
          Text(
            'Your account is closed after ${Rules.deletionGraceDays} days. Sign in before then to keep it. '
            'Wallet balance (${inr(user.walletBalance)}) is lost when it closes.',
            style: TextStyle(color: c.fgMuted),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            style: OutlinedButton.styleFrom(foregroundColor: c.danger, side: BorderSide(color: c.danger.withValues(alpha: 0.5))),
            onPressed: () async {
              final otp = await _askOtp('Delete your account?', 'To confirm, enter the code sent to ${phoneDisplay(user.phone)}.');
              if (otp == null || otp.isEmpty) return;
              await run(() async {
                await ref.read(apiProvider).deleteAccount(otp);
                await ref.read(sessionProvider.notifier).signOut();
                if (mounted) {
                  toast(this.context, 'Account scheduled for deletion. Sign in within ${Rules.deletionGraceDays} days to keep it.');
                  this.context.go('/');
                }
              });
            },
            child: const Text('Delete my account'),
          ),
        ]),
      ),
    ]);
  }
}
