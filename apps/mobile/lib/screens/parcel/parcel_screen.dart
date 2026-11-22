// /parcels: a bus parcel counter to counter, or a Quick parcel across town. The API prices it (POST /quotes) and checkout
// takes the payment. Mirrors the website's ParcelScreens.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../api/parcel_models.dart';
import '../../core/cancellation.dart';
import '../../core/contact_picker.dart';
import '../../core/format.dart';
import '../../core/parcels.dart';
import '../../core/services.dart';
import '../../state/checkout.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../ride/place_search_screen.dart';
import 'parcel_widgets.dart';

enum _Field { departure, pickup, drop, value, contents, name, phone, declaration }

class ParcelScreen extends ConsumerStatefulWidget {
  const ParcelScreen({super.key});
  @override
  ConsumerState<ParcelScreen> createState() => _ParcelScreenState();
}

class _ParcelScreenState extends ConsumerState<ParcelScreen> {
  late final LiveQuote _live;
  final _value = TextEditingController();
  final _contents = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _keys = {for (final f in _Field.values) f: GlobalKey()};
  final _errors = <_Field, String>{};

  bool _city = false;
  Place? _pickup, _drop;
  String? _from, _to;
  ParcelOptions? _options;
  String? _optionsError;
  int _loadSeq = 0;
  String? _bus;
  var _category = parcelCategories.keys.first;
  var _band = parcelWeightBands.first;
  var _size = parcelSizes.keys.first;
  bool _agreed = false, _continuing = false;

  @override
  void initState() {
    super.initState();
    _live = LiveQuote(ref.read(apiProvider));
    // /config may already be loaded, or arrive a moment later.
    ref.listenManual(configProvider, (_, next) {
      final cities = next.value?.cities.map((x) => x.name).toList() ?? const <String>[];
      if (_from != null || cities.length < 2) return;
      _from = cities.contains('Chennai') ? 'Chennai' : cities.first;
      _to = cities.contains('Coimbatore') ? 'Coimbatore' : cities.firstWhere((x) => x != _from);
      // Not during the first build.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _load();
      });
    }, fireImmediately: true);
  }

  @override
  void dispose() {
    _live.dispose();
    for (final c in [_value, _contents, _name, _phone]) {
      c.dispose();
    }
    super.dispose();
  }

  Settings get _settings => ref.read(configProvider).value?.settings ?? const Settings({});

  /// The lightest band always stays, whatever the limit.
  List<String> _bands(Settings s) => [
        for (final (i, b) in parcelWeightBands.indexed)
          if (i == 0 || int.parse(b) <= s.parcelMaxKg) b,
      ];
  String _weight(Settings s) {
    final bands = _bands(s);
    return bands.contains(_band) ? _band : bands.last;
  }

  ParcelDeparture? get _departure => _options?.departures.where((d) => d.key == _bus).firstOrNull;

  Map<String, Object?>? get _request {
    final d = _departure;
    final value = int.tryParse(_value.text) ?? 0;
    final s = _settings;
    if (value < 1 || value > s.parcelMaxDeclaredValue) return null;
    final details = <String, Object?>{'category': _category, 'weightBand': _weight(s), 'size': _size, 'declaredValue': value};
    if (_city) {
      final pickup = _pickup, drop = _drop;
      if (pickup == null || drop == null || pickup.id == drop.id) return null;
      return {'service': 'parcel', 'mode': 'city', 'pickupId': pickup.id, 'dropId': drop.id, ...details};
    }
    if (d == null) return null;
    return {
      'service': 'parcel',
      'mode': 'intercity',
      'from': d.from,
      'to': d.to,
      'busId': d.busId,
      'departAt': d.departIso,
      ...details,
      'pickup': 'counter',
      'delivery': 'counter',
    };
  }

  Future<void> _load() async {
    final from = _from, to = _to;
    if (from == null || to == null) return;
    final seq = ++_loadSeq;
    setState(() {
      _options = null;
      _optionsError = null;
    });
    _live.update(null);
    try {
      final o = await ref.read(apiProvider).parcelOptions(from, to);
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _options = o;
        if (!o.departures.any((d) => d.key == _bus)) _bus = o.departures.firstOrNull?.key;
      });
      _live.update(_request);
    } catch (e) {
      if (mounted && seq == _loadSeq) setState(() => _optionsError = errorText(e));
    }
  }

  /// A change the price may depend on.
  void _change(VoidCallback edit, [_Field? fixes]) {
    setState(() {
      edit();
      _errors.remove(fixes);
    });
    _live.update(_request);
  }

  void _route({String? from, String? to}) {
    final oldFrom = _from;
    if (from != null) {
      if (from == _to) _to = oldFrom;
      _from = from;
    }
    if (to != null) _to = to;
    _load();
  }

  Future<void> _place({required bool pickup}) async {
    final p = await Navigator.of(context).push<Place>(MaterialPageRoute(
      builder: (_) => PlaceSearchScreen(title: pickup ? 'Pick it up from' : 'Deliver it to', exclude: pickup ? _drop?.id : _pickup?.id),
    ));
    if (p == null || !mounted) return;
    _change(() => pickup ? _pickup = p : _drop = p, pickup ? _Field.pickup : _Field.drop);
  }

  Future<void> _pick() async {
    final picked = await pickContact();
    if (picked == null || !mounted) return;
    setState(() {
      if (picked.name.isNotEmpty) {
        _name.text = picked.name.length > Rules.nameMax ? picked.name.substring(0, Rules.nameMax).trim() : picked.name;
        _errors.remove(_Field.name);
      }
      // Never keep an earlier number beside the newly picked name.
      _phone.text = picked.phone ?? '';
      if (picked.phone != null) {
        _errors.remove(_Field.phone);
      } else {
        _errors[_Field.phone] = "That contact's number isn't an Indian mobile. Type the 10 digits.";
      }
    });
  }

  Future<void> _continue() async {
    if (_continuing) return;
    final settings = _settings;
    final value = int.tryParse(_value.text) ?? 0;
    final found = <_Field, String>{
      if (!_city && _departure == null) _Field.departure: 'Pick a bus for this route.',
      if (_city && _pickup == null) _Field.pickup: 'Choose where the captain picks it up.',
      if (_city && _drop == null) _Field.drop: "Choose where it's going.",
      if (_city && _drop != null && _drop!.id == _pickup?.id) _Field.drop: 'Pickup and drop must be different places.',
      if (value < 1 || value > settings.parcelMaxDeclaredValue)
        _Field.value: "Enter what it's worth, from ₹1 to ${inr(settings.parcelMaxDeclaredValue)}.",
      if (_contents.text.trim().length < ParcelRules.contentsMin) _Field.contents: "Say what's inside, in a few words.",
      if (_name.text.trim().length < Rules.nameMin) _Field.name: "Enter the receiver's name.",
      if (!Rules.phone.hasMatch(_phone.text)) _Field.phone: "Enter the receiver's 10-digit mobile number.",
      if (!_agreed) _Field.declaration: 'Read the list and tick the declaration.',
    };
    setState(() => _errors
      ..clear()
      ..addAll(found));
    if (found.isNotEmpty) {
      final target = _keys[found.keys.first]!.currentContext;
      if (target != null) await Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 250), alignment: 0.2);
      return;
    }
    final city = _city;
    final d = _departure;
    final options = _options;
    final request = _request;
    if (options == null || request == null) return;
    setState(() => _continuing = true);
    try {
      // Quotes book once, so checkout gets a fresh one.
      final quote = await _live.fresh(request);
      if (!mounted) return;
      ref.read(checkoutProvider.notifier).set(CheckoutDraft(
            service: ServiceKey.parcel,
            title: city ? '${_pickup!.name} → ${_drop!.name}' : '${d!.from} → ${d.to}',
            subtitle: '${city ? 'Quick parcel' : 'Bus parcel'} · ${parcelBandLabel('${request['weightBand']}')}',
            image: serviceOf(ServiceKey.parcel).image,
            // No names, numbers or contents: a summary is what other services send as booking lines.
            summary: [
              if (city) ...[
                ('Pickup', _pickup!.name),
                ('Deliver to', _drop!.name),
              ] else ...[
                ('Hand in by', parcelTime(d!.cutoffAt)),
                ('At', d.fromCounter.name),
                ('Departs', parcelTime(d.departAt)),
                ('Collect from', parcelTime(d.readyAt)),
              ],
              ('Liability', 'Up to ${inr(quote.liability ?? 0)}, not insured'),
            ],
            quote: quote,
            travellers: const [],
            policy: _policy(settings),
            parcel: ParcelDraft(
              city: city,
              receiverName: _name.text.trim(),
              receiverPhone: _phone.text,
              contents: _contents.text.trim(),
              declaration: options.declaration.version,
              declaredValue: value,
            ),
          ));
      context.push('/checkout');
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    } finally {
      if (mounted) setState(() => _continuing = false);
    }
  }

  String _policy(Settings s) =>
      _city ? quickParcelPolicyText(s) : "${cancelPolicyText(s, ServiceKey.parcel)} It can't be cancelled once it's on the bus.";

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final config = ref.watch(configProvider);
    final settings = config.value?.settings ?? const Settings({});
    return Scaffold(
      appBar: AppBar(title: const Text('Send a parcel')),
      // Not a ScreenList: its lazy list drops off-screen fields, and errors scroll to theirs.
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Brand.gutter, 8, Brand.gutter, 32),
        child: Constrained(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(
              _city
                  ? 'A captain picks it up and takes it across town. The receiver gets it for a code.'
                  : 'Hand it in at a QuikFly counter. It goes on the bus, and the receiver collects it with a code.',
              style: TextStyle(color: c.fgMuted),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => context.push('/parcels/track'),
                icon: const Icon(Icons.search, size: 18),
                label: const Text('Track a parcel by LR number'),
              ),
            ),
            const SizedBox(height: 6),
            _modes(),
            const SizedBox(height: 12),
            if (_city) _placesPanel() else _routePanel(config.value?.cities.map((x) => x.name).toList() ?? const []),
            const SizedBox(height: 12),
            _whatPanel(settings),
            const SizedBox(height: 12),
            _whoPanel(settings),
            if (_options != null) ...[const SizedBox(height: 12), _declarationPanel(_options!.declaration)],
            const SizedBox(height: 12),
            _pricePanel(settings),
            if (settings.parcelSimulateTransit) ...[const SizedBox(height: 12), SimulatedNote(city: _city)],
          ]),
        ),
      ),
    );
  }

  Widget _heading(String text) =>
      Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700)));

  Widget _modes() {
    final c = context.qf;
    Widget mode(bool city, String title, String where) => Expanded(
          child: Semantics(
            button: true,
            selected: _city == city,
            child: Panel(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              highlighted: _city == city,
              onTap: () => _change(() {
                _city = city;
                _errors.clear();
              }),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: TextStyle(color: c.fgStrong, fontWeight: FontWeight.w600)),
                Text(where, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
              ]),
            ),
          ),
        );
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      mode(false, 'Bus parcel', 'Between cities'),
      const SizedBox(width: 8),
      mode(true, 'Quick parcel', 'Across $quickParcelCity'),
    ]);
  }

  Widget _placesPanel() {
    final c = context.qf;
    Widget place(_Field field, String label, Place? value) => Padding(
          key: _keys[field],
          padding: const EdgeInsets.only(bottom: 10),
          child: Semantics(
            button: true,
            child: InkWell(
              borderRadius: BorderRadius.circular(Brand.radiusField),
              onTap: () => _place(pickup: field == _Field.pickup),
              child: InputDecorator(
                decoration: InputDecoration(labelText: label, errorText: _errors[field], errorMaxLines: 2, suffixIcon: const Icon(Icons.search)),
                child: Text(value?.name ?? 'Choose a place', style: TextStyle(color: value == null ? c.fgSubtle : c.fgStrong)),
              ),
            ),
          ),
        );
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _heading('Pickup and drop'),
        place(_Field.pickup, 'Pickup', _pickup),
        place(_Field.drop, 'Drop', _drop),
        if (_optionsError != null) ErrorBox(_optionsError!, onRetry: _load),
      ]),
    );
  }

  Widget _routePanel(List<String> cities) {
    final c = context.qf;
    Widget city(String label, String? value, List<String> choices, void Function(String) pick) => DropdownButtonFormField<String>(
          // The field keeps its first value: a new key shows a swap.
          key: ValueKey('$label-$value-${choices.length}'),
          initialValue: choices.contains(value) ? value : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: label),
          items: [for (final x in choices) DropdownMenuItem(value: x, child: Text(x))],
          onChanged: (v) => v == null ? null : pick(v),
        );
    final options = _options;
    final d = _departure;
    return Panel(
      child: Column(key: _keys[_Field.departure], crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _heading('Route and bus'),
        Row(children: [
          Expanded(
            child: Column(children: [
              city('From', _from, cities, (v) => _route(from: v)),
              const SizedBox(height: 10),
              city('To', _to, cities.where((x) => x != _from).toList(), (v) => _route(to: v)),
            ]),
          ),
          const SizedBox(width: 8),
          IconButton.outlined(tooltip: 'Swap cities', icon: const Icon(Icons.swap_vert), onPressed: _to == null ? null : () => _route(from: _to)),
        ]),
        const SizedBox(height: 12),
        if (_optionsError != null)
          ErrorBox(_optionsError!, onRetry: _load)
        else if (options == null)
          const Skeleton(height: 96)
        else if (options.departures.isEmpty)
          Text('No bus takes parcels on this route in the next ${ParcelRules.bookingDays} days. Try another route.', style: TextStyle(color: c.fgMuted))
        else
          for (final x in options.departures)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Semantics(
                button: true,
                selected: x.key == _bus,
                child: Panel(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  highlighted: x.key == _bus,
                  onTap: () => _change(() => _bus = x.key, _Field.departure),
                  child: Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(parcelTime(x.departAt), style: TextStyle(color: c.fgStrong, fontWeight: FontWeight.w600)),
                        Text('Hand in by ${parcelTime(x.cutoffAt)}', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                      ]),
                    ),
                    if (x.key == _bus) Icon(Icons.check_circle, color: c.accent, size: 20),
                  ]),
                ),
              ),
            ),
        FormError(_errors[_Field.departure]),
        if (d != null) ...[
          Divider(color: c.border, height: 24),
          CounterBlock(title: 'Hand in at', counter: d.fromCounter, when: 'By ${parcelTime(d.cutoffAt)}'),
          const SizedBox(height: 10),
          CounterBlock(title: 'Collect at', counter: d.toCounter, when: 'From ${parcelTime(d.readyAt)}'),
        ],
      ]),
    );
  }

  Widget _choices(String label, Map<String, String> options, String value, void Function(String) pick) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(color: context.qf.fgMuted, fontSize: 12.5)),
      const SizedBox(height: 6),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final o in options.entries) ChoiceChip(label: Text(o.value), selected: value == o.key, onSelected: (_) => pick(o.key)),
      ]),
      const SizedBox(height: 14),
    ]);
  }

  Widget _whatPanel(Settings s) {
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _heading("What you're sending"),
        _choices('Category', parcelCategories, _category, (v) => _change(() => _category = v)),
        _choices('Weight', {for (final b in _bands(s)) b: parcelBandLabel(b)}, _weight(s), (v) => _change(() => _band = v)),
        _choices('Size', parcelSizes, _size, (v) => _change(() => _size = v)),
        TextField(
          key: _keys[_Field.value],
          controller: _value,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(ParcelRules.valueDigitsMax)],
          decoration: InputDecoration(
            labelText: "What it's worth (₹)",
            helperText: 'Up to ${inr(s.parcelMaxDeclaredValue)}.',
            errorText: _errors[_Field.value] ?? ((int.tryParse(_value.text) ?? 0) > s.parcelMaxDeclaredValue ? 'The most is ${inr(s.parcelMaxDeclaredValue)}.' : null),
            errorMaxLines: 2,
          ),
          onChanged: (_) => _change(() {}, _Field.value),
        ),
        const SizedBox(height: 12),
        TextField(
          key: _keys[_Field.contents],
          controller: _contents,
          inputFormatters: [LengthLimitingTextInputFormatter(ParcelRules.contentsMax)],
          decoration: InputDecoration(labelText: "What's inside", hintText: 'e.g. Two cotton shirts', errorText: _errors[_Field.contents]),
          onChanged: (_) => setState(() => _errors.remove(_Field.contents)),
        ),
      ]),
    );
  }

  Widget _whoPanel(Settings s) {
    final c = context.qf;
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _heading(_city ? 'Who receives it' : 'Who collects it'),
        if (contactPickerSupported) ...[
          OutlinedButton.icon(onPressed: _pick, icon: const Icon(Icons.contacts_outlined, size: 18), label: const Text('Choose from contacts')),
          const SizedBox(height: 12),
        ],
        TextField(
          key: _keys[_Field.name],
          controller: _name,
          textCapitalization: TextCapitalization.words,
          inputFormatters: [LengthLimitingTextInputFormatter(Rules.nameMax)],
          decoration: InputDecoration(labelText: "Receiver's name", errorText: _errors[_Field.name]),
          onChanged: (_) => setState(() => _errors.remove(_Field.name)),
        ),
        const SizedBox(height: 12),
        TextField(
          key: _keys[_Field.phone],
          controller: _phone,
          keyboardType: TextInputType.phone,
          inputFormatters: [MobileNumberFormatter()],
          decoration: InputDecoration(labelText: "Receiver's mobile", prefixText: '+91  ', errorText: _errors[_Field.phone], errorMaxLines: 2),
          onChanged: (_) => setState(() => _errors.remove(_Field.phone)),
        ),
        const SizedBox(height: 10),
        Text(
          _city
              ? 'When the captain has it, a delivery code appears on your screen in My Trips. You pass it to the receiver: demo, no SMS is sent.'
              : "When it's ready, a collection code appears on your screen in My Trips. You pass it to the receiver: demo, no SMS is sent. It's held for ${s.parcelCounterHoldDays} days.",
          style: TextStyle(color: c.fgMuted, fontSize: 12.5),
        ),
      ]),
    );
  }

  Widget _declarationPanel(ParcelDeclaration d) {
    final c = context.qf;
    return Panel(
      child: Column(key: _keys[_Field.declaration], crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _heading('Not allowed'),
        for (final item in d.prohibited)
          Padding(
            padding: const EdgeInsets.only(bottom: 3),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('•  ', style: TextStyle(color: c.fgMuted)),
              Expanded(child: Text(item, style: TextStyle(color: c.fgMuted, fontSize: 13))),
            ]),
          ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _agreed,
          onChanged: (v) => setState(() {
            _agreed = v ?? false;
            _errors.remove(_Field.declaration);
          }),
          title: Text(d.text, style: TextStyle(color: c.fgSoft, fontSize: 13.5)),
        ),
        FormError(_errors[_Field.declaration]),
      ]),
    );
  }

  Widget _pricePanel(Settings s) {
    final c = context.qf;
    return Panel(
      highlighted: true,
      child: ListenableBuilder(
        listenable: _live,
        builder: (context, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _heading('Price'),
          if (_live.loading)
            Text('Getting the price…', style: TextStyle(color: c.fgMuted))
          else if (_live.error != null)
            // Reloads the buses too: the usual cause is a hand-in time that has just passed.
            ErrorBox(_live.error!, onRetry: _load)
          else if (_live.quote != null) ...[
            for (final l in _live.quote!.lines) KeyValue(l.label, inr(l.amount)),
            Divider(color: c.border),
            KeyValue('Total', inr(_live.quote!.total), bold: true, valueColor: c.accent),
            Text("If it's lost or damaged QuikFly pays up to ${inr(_live.quote!.liability ?? 0)}. Parcels aren't insured.",
                style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
          ] else
            Text(_city ? "Choose both places and say what it's worth to see the price." : "Pick a bus and say what it's worth to see the price.",
                style: TextStyle(color: c.fgMuted)),
          const SizedBox(height: 8),
          Text(_policy(s), style: TextStyle(color: c.fgSubtle, fontSize: 12)),
          const SizedBox(height: 12),
          GoldButton(label: 'Continue', loading: _continuing, onPressed: _continue),
        ]),
      ),
    );
  }
}
