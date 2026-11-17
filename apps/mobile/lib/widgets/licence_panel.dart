// Driving licence: status badge, message and the add / resubmit form. Used in self-drive
// checkout and the account's licence screen. Staff approve or reject it in the admin panel
// (or it's verified at once when the licenceAutoApprove setting is on). Mirrors LicenceSection.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/models.dart';
import '../core/format.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import 'ui.dart';

/// While a licence is under review, re-check the account this often.
const licencePollEvery = Duration(seconds: 5);

/// "TN0920190001234" → "TN09 20190001234"
String formatLicence(String n) => n.length > 4 ? '${n.substring(0, 4)} ${n.substring(4)}' : n;

/// One line explaining the current licence state.
String licenceMessage(User u) => switch (u.licence.status) {
      LicenceStatus.pending => 'Under review by our team, usually within a few hours. You can book now; it must be verified before pickup.',
      LicenceStatus.verified => 'Verified. Bring the original licence and Aadhaar or passport to pickup.',
      LicenceStatus.rejected => u.licence.note != null ? 'Not approved: ${u.licence.note}' : 'Not approved. Check the details and submit again.',
      LicenceStatus.none => 'Add your licence to book a self-drive car.',
    };

class LicenceBadge extends StatelessWidget {
  const LicenceBadge(this.status, {super.key});
  final LicenceStatus status;
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final (label, icon, color) = switch (status) {
      LicenceStatus.none => ('Not added', Icons.badge_outlined, c.fgMuted),
      LicenceStatus.pending => ('Under review', Icons.schedule, c.warning),
      LicenceStatus.verified => ('Verified', Icons.verified, c.success),
      LicenceStatus.rejected => ('Not approved', Icons.gpp_bad_outlined, c.danger),
    };
    return Pill(label, color: color, icon: icon);
  }
}

class LicencePanel extends ConsumerStatefulWidget {
  const LicencePanel({super.key, this.error, this.onSaved, this.showForm = true});
  final String? error;
  final VoidCallback? onSaved;
  /// Account screen always shows the form (update); checkout only when it's needed.
  final bool showForm;

  @override
  ConsumerState<LicencePanel> createState() => _LicencePanelState();
}

class _LicencePanelState extends ConsumerState<LicencePanel> {
  final _number = TextEditingController();
  DateTime? _expiry;
  bool _busy = false;
  String? _err;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    final l = ref.read(userProvider)?.licence;
    if (l?.number != null) _number.text = formatLicence(l!.number!);
    _expiry = DateTime.tryParse(l?.expiry ?? '');
  }

  @override
  void dispose() {
    _poll?.cancel();
    _number.dispose();
    super.dispose();
  }

  /// Keep checking while a review is pending so an approval in the admin panel shows up here.
  void _syncPolling(bool pending) {
    if (pending && _poll == null) {
      _poll = Timer.periodic(licencePollEvery, (_) => ref.read(sessionProvider.notifier).refresh());
    } else if (!pending && _poll != null) {
      _poll!.cancel();
      _poll = null;
    }
  }

  Future<void> _submit() async {
    final number = Rules.compactCode(_number.text);
    final today = DateTime.now();
    setState(() => _err = null);
    if (!Rules.licence.hasMatch(number)) {
      setState(() => _err = 'Enter the number as printed, e.g. TN09 20190001234.');
      return;
    }
    if (_expiry == null || !_expiry!.isAfter(DateTime(today.year, today.month, today.day))) {
      setState(() => _err = 'Enter a future expiry date.');
      return;
    }
    setState(() => _busy = true);
    try {
      final u = await ref.read(apiProvider).submitLicence(number, isoDate(_expiry!));
      ref.read(sessionProvider.notifier).setUser(u);
      if (mounted) toast(context, u.licence.status == LicenceStatus.verified ? 'Licence verified' : 'Licence submitted for review');
      widget.onSaved?.call();
    } catch (e) {
      setState(() => _err = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final user = ref.watch(userProvider);
    _syncPolling(user?.licence.status == LicenceStatus.pending);
    final status = user?.licence.status ?? LicenceStatus.none;
    final needsForm = status == LicenceStatus.none || status == LicenceStatus.rejected;
    return Panel(
      highlighted: widget.error != null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(child: Text('Driving licence', style: TextStyle(fontWeight: FontWeight.w700))),
          if (user != null) LicenceBadge(status),
        ]),
        const SizedBox(height: 8),
        if (user == null)
          Text("Self-drive needs a verified licence. You'll add it after signing in.", style: TextStyle(color: c.fgMuted))
        else ...[
          if (user.licence.number != null && !needsForm)
            Text('${formatLicence(user.licence.number!)}${user.licence.expiry != null ? ' · valid till ${user.licence.expiry}' : ''}',
                style: TextStyle(color: c.fgSoft, fontFamily: 'monospace')),
          Text(licenceMessage(user), style: TextStyle(color: status == LicenceStatus.rejected ? c.danger : c.fgMuted)),
          if (needsForm || widget.showForm) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _number,
              textCapitalization: TextCapitalization.characters,
              maxLength: 20,
              decoration: const InputDecoration(
                labelText: 'Driving licence number',
                hintText: 'TN09 20190001234',
                helperText: '15 characters: state, RTO, year, number',
                counterText: '',
              ),
            ),
            const SizedBox(height: 10),
            InkWell(
              borderRadius: BorderRadius.circular(Brand.radiusField),
              onTap: () async {
                final now = DateTime.now();
                final d = await showDatePicker(
                  context: context,
                  initialDate: _expiry != null && _expiry!.isAfter(now) ? _expiry! : now.add(const Duration(days: 365)),
                  firstDate: now.add(const Duration(days: 1)),
                  lastDate: DateTime(now.year + 40),
                );
                if (d != null) setState(() => _expiry = d);
              },
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'Valid till', suffixIcon: Icon(Icons.calendar_today, size: 18)),
                child: Text(_expiry == null ? 'Pick a date' : longDate(_expiry!), style: TextStyle(color: _expiry == null ? c.fgSubtle : c.fg)),
              ),
            ),
            FormError(_err),
            const SizedBox(height: 8),
            GoldButton(
              label: switch (status) { LicenceStatus.none => 'Submit licence', LicenceStatus.rejected => 'Submit again', _ => 'Update licence' },
              loading: _busy,
              onPressed: _submit,
            ),
          ],
        ],
        if (widget.error != null) FormError(widget.error),
      ]),
    );
  }
}
