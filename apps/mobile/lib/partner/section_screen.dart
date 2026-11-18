// One application section: a form (and a document photo where needed), "Save & continue".
// Read-only while the application is with QuikFly or after it's approved.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../api/api.dart';
import '../api/models.dart';
import '../core/format.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';
import 'home_screen.dart' show partnerSettings;
import 'partner_app.dart';

class SectionScreen extends ConsumerStatefulWidget {
  const SectionScreen({super.key, required this.section});
  final String section;
  @override
  ConsumerState<SectionScreen> createState() => _SectionScreenState();
}

class _SectionScreenState extends ConsumerState<SectionScreen> {
  final _a = TextEditingController(), _b = TextEditingController(), _c = TextEditingController(), _d = TextEditingController();
  String? _city, _type, _fuel, _slot;
  DateTime? _date;
  Uint8List? _photo; // picked, not uploaded yet
  bool _busy = false, _filledIn = false;
  String? _err;

  String get s => widget.section;

  @override
  void dispose() {
    for (final c in [_a, _b, _c, _d]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Fill the form from what's saved, once.
  void _prefill(VendorApplication a) {
    if (_filledIn) return;
    _filledIn = true;
    final v = a.vehicle;
    switch (s) {
      case 'vehicle':
        _city = a.city;
        _type = v?.type;
        _fuel = v?.fuel;
        _a.text = v?.regNumber ?? '';
        _date = v == null ? null : DateTime.tryParse(v.purchaseDate);
      case 'bank':
        _a.text = a.bank?.holder ?? ref.read(sessionProvider).value?.name ?? '';
        _d.text = a.bank?.ifsc ?? '';
      case 'rc':
        _a.text = v?.rc?.ownerName ?? ref.read(sessionProvider).value?.name ?? '';
        _date = v?.rc == null ? null : DateTime.tryParse(v!.rc!.validTill);
      case 'insurance':
        _a.text = v?.insurance?.insurer ?? '';
        _b.text = v?.insurance?.policyNumber ?? '';
        _date = v?.insurance == null ? null : DateTime.tryParse(v!.insurance!.validTill);
      case 'audit':
        _date = v?.audit == null ? null : DateTime.tryParse(v!.audit!.date);
        _slot = v?.audit?.slot;
    }
  }

  String? _validate() {
    String? need(bool ok, String msg) => ok ? null : msg;
    switch (s) {
      case 'vehicle':
        return need(_city != null, 'Choose your city') ??
            need(_type != null, 'Choose the vehicle type') ??
            need(_fuel != null, 'Choose the fuel type') ??
            need(VendorRules.regNumber.hasMatch(VendorRules.normaliseReg(_a.text)), 'Enter the registration number as on the RC, e.g. TN57AX9979') ??
            need(_date != null, 'Pick the purchase date');
      case 'bank':
        final acct = _b.text.replaceAll(' ', '');
        return need(_a.text.trim().length >= VendorRules.nameMin, 'Enter the account holder\'s name') ??
            need(VendorRules.account.hasMatch(acct), 'Enter the account number (9 to 18 digits)') ??
            need(acct == _c.text.replaceAll(' ', ''), 'The account numbers don\'t match') ??
            need(VendorRules.ifsc.hasMatch(_d.text.trim().toUpperCase()), 'Enter the 11-character IFSC, e.g. SBIN0001234');
      case 'rc':
        return need(_a.text.trim().length >= VendorRules.nameMin, 'Enter the owner\'s name as on the RC') ?? need(_date != null, 'Pick the registration validity date');
      case 'insurance':
        return need(_a.text.trim().length >= 2, 'Enter the insurance company') ??
            need(VendorRules.policyNumber.hasMatch(_b.text.trim().toUpperCase().replaceAll(' ', '')), 'Enter the policy number as on the certificate') ??
            need(_date != null, 'Pick the insurance validity date');
      case 'audit':
        return need(_date != null, 'Pick a day for the audit') ?? need(_slot != null, 'Pick a time slot');
    }
    return null;
  }

  Json _body() => switch (s) {
        'vehicle' => {'city': _city, 'type': _type, 'fuel': _fuel, 'regNumber': VendorRules.normaliseReg(_a.text), 'purchaseDate': isoDate(_date!)},
        'bank' => {'holder': _a.text.trim(), 'account': _b.text.replaceAll(' ', ''), 'ifsc': _d.text.trim().toUpperCase()},
        'rc' => {'ownerName': _a.text.trim(), 'validTill': isoDate(_date!)},
        'insurance' => {'insurer': _a.text.trim(), 'policyNumber': _b.text.trim().toUpperCase(), 'validTill': isoDate(_date!)},
        'audit' => {'date': isoDate(_date!), 'slot': _slot},
        _ => const {},
      };

  bool get _hasDocument => s == 'photo' || s == 'rc' || s == 'insurance';

  Future<void> _save(VendorApplication a) async {
    final problem = s == 'photo' ? null : _validate();
    final needPhoto = _hasDocument && _photo == null && !_savedPhoto(a);
    if (problem != null || needPhoto) {
      setState(() => _err = problem ?? 'Add a clear photo of the ${s == 'photo' ? 'your face' : 'document'}');
      return;
    }
    setState(() { _busy = true; _err = null; });
    final api = ref.read(apiProvider);
    try {
      VendorApplication latest = a;
      if (s != 'photo') latest = await api.saveVendorSection(s, _body());
      if (_photo != null) latest = await api.uploadVendorDocument(s, _photo!);
      setVendor(ref, latest);
      if (mounted) {
        toast(context, '${vendorSectionLabel[s]} saved');
        context.pop();
      }
    } catch (e) {
      setState(() => _err = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  bool _savedPhoto(VendorApplication a) => switch (s) {
        'photo' => a.hasPhoto,
        'rc' => a.vehicle?.rc?.hasPhoto ?? false,
        'insurance' => a.vehicle?.insurance?.hasPhoto ?? false,
        _ => false,
      };

  Future<void> _pick(ImageSource source) async {
    try {
      final f = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 80);
      if (f == null) return;
      final bytes = await f.readAsBytes();
      setState(() { _photo = bytes; _err = null; });
    } catch (_) {
      setState(() => _err = 'Couldn\'t open the ${source == ImageSource.camera ? 'camera' : 'gallery'}. Check the app\'s permissions.');
    }
  }

  Future<void> _pickDate({required DateTime first, required DateTime last, required DateTime initial}) async {
    final d = await showDatePicker(context: context, firstDate: first, lastDate: last, initialDate: initial.isBefore(first) ? first : initial.isAfter(last) ? last : initial);
    if (d != null) setState(() => _date = d);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final a = ref.watch(vendorProvider).value;
    if (a == null) return Scaffold(appBar: AppBar(title: Text(vendorSectionLabel[s] ?? 'Section')), body: const Center(child: CircularProgressIndicator()));
    _prefill(a);
    final st = a.sections[s];
    final ro = !a.editable;

    InputDecoration deco(String label, {String? hint, String? helper}) => InputDecoration(labelText: label, hintText: hint, helperText: helper);
    Widget radio(String label, List<String> values, Map<String, String> labels, String? value, ValueChanged<String> on, {Map<String, IconData>? icons}) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(padding: const EdgeInsets.only(top: 14, bottom: 6), child: Text(label, style: TextStyle(color: c.fgMuted))),
            Panel(
              padding: EdgeInsets.zero,
              child: RadioGroup<String>(
                groupValue: value,
                onChanged: (v) { if (!ro && v != null) setState(() => on(v)); },
                child: Column(children: [
                  for (var i = 0; i < values.length; i++) ...[
                    if (i > 0) Divider(height: 1, color: c.border),
                    RadioListTile<String>(
                      value: values[i],
                      enabled: !ro,
                      title: Row(children: [if (icons != null) ...[Icon(icons[values[i]], color: c.accent), const SizedBox(width: 12)], Text(labels[values[i]]!)]),
                      controlAffinity: ListTileControlAffinity.trailing,
                    ),
                  ],
                ]),
              ),
            ),
          ],
        );
    Widget dateField(String label, VoidCallback onTap) => Padding(
          padding: const EdgeInsets.only(top: 14),
          child: InkWell(
            borderRadius: BorderRadius.circular(Brand.radiusField),
            onTap: ro ? null : onTap,
            child: InputDecorator(
              decoration: deco(label).copyWith(suffixIcon: Icon(Icons.calendar_month, color: c.accent)),
              child: Text(_date == null ? 'Choose a date' : longDate(_date!), style: TextStyle(color: _date == null ? c.fgSubtle : c.fg)),
            ),
          ),
        );
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final settings = partnerSettings(ref);
    final cities = (ref.watch(configProvider).value?.cities ?? const <NamedItem>[]).map((x) => x.name).toList();

    final fields = <Widget>[
      if (s == 'vehicle') ...[
        DropdownButtonFormField<String>(
          initialValue: cities.contains(_city) ? _city : null,
          decoration: deco('Preferred city'),
          items: [for (final x in cities) DropdownMenuItem(value: x, child: Text(x))],
          onChanged: ro ? null : (v) => setState(() => _city = v),
        ),
        radio('Vehicle type', vendorVehicleTypes, vendorVehicleLabel, _type, (v) => _type = v,
            icons: const {'car': Icons.directions_car_outlined, 'auto': Icons.electric_rickshaw_outlined, 'tempo': Icons.airport_shuttle_outlined, 'bus': Icons.directions_bus_outlined}),
        radio('Fuel type', fuelTypes, fuelLabel, _fuel, (v) => _fuel = v,
            icons: const {'petrol_diesel': Icons.local_gas_station_outlined, 'cng_lpg': Icons.propane_tank_outlined, 'electric': Icons.ev_station_outlined}),
        const SizedBox(height: 14),
        TextField(
          controller: _a,
          readOnly: ro,
          textCapitalization: TextCapitalization.characters,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9 -]')), LengthLimitingTextInputFormatter(16)],
          decoration: deco('Vehicle registration number', hint: 'TN57AX9979'),
        ),
        dateField('Vehicle purchase date', () => _pickDate(first: DateTime(today.year - settings.vendorMaxVehicleAgeYears, today.month, today.day + 1), last: today, initial: _date ?? today)),
        Padding(padding: const EdgeInsets.only(top: 6), child: Text('Vehicles up to ${settings.vendorMaxVehicleAgeYears} years old can join.', style: TextStyle(color: c.fgSubtle, fontSize: 12))),
      ],
      if (s == 'bank') ...[
        TextField(controller: _a, readOnly: ro, textCapitalization: TextCapitalization.words, decoration: deco('Account holder name', helper: 'As in your bank records')),
        const SizedBox(height: 14),
        if (a.bank != null && _b.text.isEmpty && ro)
          InputDecorator(decoration: deco('Account number'), child: Text('•••• ${a.bank!.accountLast4}'))
        else ...[
          TextField(controller: _b, readOnly: ro, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(18)],
              decoration: deco('Account number', helper: a.bank == null ? null : 'Saved account ends in ${a.bank!.accountLast4}. Enter it again to change it.')),
          const SizedBox(height: 14),
          TextField(controller: _c, readOnly: ro, keyboardType: TextInputType.number, obscureText: true, inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(18)],
              decoration: deco('Confirm account number')),
        ],
        const SizedBox(height: 14),
        TextField(controller: _d, readOnly: ro, textCapitalization: TextCapitalization.characters, inputFormatters: [LengthLimitingTextInputFormatter(11)], decoration: deco('IFSC', hint: 'SBIN0001234')),
        Padding(padding: const EdgeInsets.only(top: 8), child: Text('Your earnings are paid to this account.', style: TextStyle(color: c.fgSubtle, fontSize: 12))),
      ],
      if (s == 'rc') ...[
        TextField(controller: _a, readOnly: ro, textCapitalization: TextCapitalization.words, decoration: deco('Owner name as on the RC')),
        dateField('Registration valid till', () => _pickDate(first: today, last: DateTime(today.year + 20), initial: _date ?? today.add(const Duration(days: 365)))),
      ],
      if (s == 'insurance') ...[
        TextField(controller: _a, readOnly: ro, textCapitalization: TextCapitalization.words, decoration: deco('Insurance company')),
        const SizedBox(height: 14),
        TextField(controller: _b, readOnly: ro, textCapitalization: TextCapitalization.characters, decoration: deco('Policy number')),
        dateField('Insurance valid till', () => _pickDate(first: today, last: DateTime(today.year + 3), initial: _date ?? today.add(const Duration(days: 180)))),
      ],
      if (s == 'audit') ...[
        Panel(child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.place_outlined, color: c.accent),
          const SizedBox(width: 10),
          Expanded(child: Text('Bring your vehicle and original documents to ${settings.vendorAuditAddress}. Our team checks its condition, safety kit and papers.', style: TextStyle(color: c.fgMuted))),
        ])),
        dateField('Audit day', () => _pickDate(first: today.add(const Duration(days: 1)), last: today.add(const Duration(days: VendorRules.auditMaxDays)), initial: _date ?? today.add(const Duration(days: 2)))),
        radio('Time slot', auditSlots, auditSlotLabel, _slot, (v) => _slot = v),
        if (a.vehicle?.audit?.result == 'passed') Padding(padding: const EdgeInsets.only(top: 12), child: Text('Audit passed.', style: TextStyle(color: c.success))),
      ],
      if (_hasDocument) ...[
        const SizedBox(height: 18),
        Text(s == 'photo' ? 'A clear photo of your face, no sunglasses or cap.' : 'A clear photo of the whole ${s == 'rc' ? 'RC (front)' : 'insurance certificate'}, all text readable.',
            style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 10),
        _PhotoBox(kind: s, picked: _photo, saved: _savedPhoto(a)),
        if (!ro)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined), label: const Text('Camera'))),
              const SizedBox(width: 10),
              Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined), label: const Text('Gallery'))),
            ]),
          ),
      ],
    ];

    return Scaffold(
      appBar: AppBar(title: Text(vendorSectionLabel[s] ?? 'Section')),
      bottomNavigationBar: ro
          ? null
          : SafeArea(child: Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 12), child: GoldButton(label: 'Save & continue', loading: _busy, onPressed: () => _save(a)))),
      body: ScreenList(children: [
        Text(ro ? (a.status == 'submitted' ? 'With QuikFly for review. You can\'t change this now.' : 'Already approved.') : 'Please provide the details below.',
            style: TextStyle(color: c.fgMuted)),
        if (st?.state == 'changes' && st?.note != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.warning.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.info_outline, color: c.warning),
                const SizedBox(width: 10),
                Expanded(child: Text('QuikFly asked: ${st!.note}')),
              ]),
            ),
          ),
        const SizedBox(height: 16),
        ...fields,
        const SizedBox(height: 8),
        FormError(_err),
      ]),
    );
  }
}

/// The picked photo, else the saved one (loaded with the partner's token), else a placeholder.
class _PhotoBox extends ConsumerWidget {
  const _PhotoBox({required this.kind, required this.picked, required this.saved});
  final String kind;
  final Uint8List? picked;
  final bool saved;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final api = ref.read(apiProvider);
    final Widget child = picked != null
        ? Image.memory(picked!, fit: BoxFit.cover)
        : saved
            ? Image.network(api.vendorDocumentUrl(kind), headers: api.authHeaders, fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Center(child: Text('Saved photo', style: TextStyle(color: c.fgMuted))))
            : Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(kind == 'photo' ? Icons.account_circle_outlined : Icons.description_outlined, size: 44, color: c.fgSubtle),
                const SizedBox(height: 6),
                Text('No photo yet', style: TextStyle(color: c.fgSubtle)),
              ]));
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: kind == 'photo' ? 220 : 200,
        width: double.infinity,
        decoration: BoxDecoration(color: c.field, border: Border.all(color: c.border), borderRadius: BorderRadius.circular(16)),
        child: child,
      ),
    );
  }
}
