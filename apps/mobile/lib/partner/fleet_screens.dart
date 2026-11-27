// A live partner's app shell: Home (revenue, cab and driver performance, fleet at a glance,
// what needs attention), Trips, Vehicles, Drivers and Money (money_screens.dart); Account
// opens from the app bar.
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
import '../widgets/licence_panel.dart' show formatLicence;
import '../widgets/theme_toggle.dart';
import '../widgets/ui.dart';
import '../widgets/push_prompt.dart';
import 'home_screen.dart' show partnerSettings;
import 'money_screens.dart';
import 'partner_app.dart';

const _vehicleStatus = {
  'pending': 'In application',
  'draft': 'Being filled',
  'submitted': 'With QuikFly for review',
  'approved': 'Approved · book sticker & paint',
  'active': 'On duty',
  'inactive': 'Off duty',
  'blocked': 'Blocked',
  'rejected': 'Not accepted',
};
const _driverStatus = {'submitted': 'With QuikFly for review', 'active': 'Approved', 'rejected': 'Not approved', 'blocked': 'Blocked'};
const _vehicleIcon = {'car': Icons.directions_car_outlined, 'auto': Icons.electric_rickshaw_outlined, 'tempo': Icons.airport_shuttle_outlined, 'bus': Icons.directions_bus_outlined};

Color _statusColor(QfColors c, String status) => switch (status) {
      'active' => c.success,
      'blocked' || 'rejected' => c.danger,
      'submitted' || 'approved' || 'draft' => c.warning,
      _ => c.fgMuted,
    };

Widget _chip(BuildContext context, String label, Color color) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(Brand.radiusChip)),
      child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );

/// Days from today (India) to a YYYY-MM-DD date; negative when it has passed.
int _daysTo(String date) {
  final d = DateTime.tryParse(date);
  if (d == null) return 9999;
  final now = DateTime.now();
  return DateTime(d.year, d.month, d.day).difference(DateTime(now.year, now.month, now.day)).inDays;
}

/// Runs a fleet call and refreshes; shows the API's message on failure.
Future<bool> _fleetCall(BuildContext context, WidgetRef ref, Future<VendorFleet> Function() call, String done) async {
  try {
    await call();
    ref.invalidate(fleetProvider);
    if (context.mounted) toast(context, done);
    return true;
  } catch (e) {
    if (context.mounted) toast(context, errorText(e));
    return false;
  }
}

/// The live partner's app shell with bottom tabs.
class PartnerShell extends ConsumerStatefulWidget {
  const PartnerShell(this.a, {super.key});
  final VendorApplication a;
  @override
  ConsumerState<PartnerShell> createState() => _PartnerShellState();
}

class _PartnerShellState extends ConsumerState<PartnerShell> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) {
    final fleet = ref.watch(fleetProvider);
    final titles = ['QuikFly Partner', 'Trips', 'Vehicles', 'Drivers', 'Money'];
    final body = fleet.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(fleetProvider))]),
      data: (f) => f == null
          ? const Center(child: CircularProgressIndicator())
          : switch (_tab) {
              0 => _HomeTab(widget.a, f, onTab: (t) => setState(() => _tab = t)),
              1 => const TripsTab(),
              2 => _VehiclesTab(f),
              3 => _DriversTab(f),
              _ => const MoneyTab(),
            },
    );
    return Scaffold(
      appBar: AppBar(title: Text(titles[_tab]), actions: [
        IconButton(
          tooltip: 'Notifications',
          onPressed: () async {
            await context.push('/notifications');
            ref.invalidate(fleetProvider);
            refreshMoney(ref);
          },
          icon: const Icon(Icons.notifications_none),
        ),
        const ThemeToggle(),
        IconButton(tooltip: 'Account', onPressed: () => context.push('/account'), icon: const Icon(Icons.account_circle_outlined)),
      ]),
      floatingActionButton: _tab == 2
          ? FloatingActionButton.extended(onPressed: () => context.push('/vehicles/new'), icon: const Icon(Icons.add), label: const Text('Add vehicle'))
          : _tab == 3
              ? FloatingActionButton.extended(onPressed: () => context.push('/drivers/new'), icon: const Icon(Icons.person_add_alt), label: const Text('Add driver'))
              : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (t) => setState(() => _tab = t),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.route_outlined), selectedIcon: Icon(Icons.route), label: 'Trips'),
          NavigationDestination(icon: Icon(Icons.local_taxi_outlined), selectedIcon: Icon(Icons.local_taxi), label: 'Vehicles'),
          NavigationDestination(icon: Icon(Icons.badge_outlined), selectedIcon: Icon(Icons.badge), label: 'Drivers'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Money'),
        ],
      ),
      body: body,
    );
  }
}

/// One thing the partner should look at, with where tapping goes.
typedef _Alert = ({IconData icon, String title, String body, Color color, String route});

List<_Alert> _alerts(QfColors c, VendorFleet f, int warnDays) {
  final out = <_Alert>[];
  for (final v in f.vehicles) {
    final reg = VendorRules.formatReg(v.regNumber);
    final route = '/vehicle/${v.id}';
    if (v.status == 'blocked') out.add((icon: Icons.block, title: '$reg is blocked', body: v.blockedReason ?? 'Call partner support.', color: c.danger, route: route));
    if (v.status == 'draft' && v.reviewNote != null) out.add((icon: Icons.edit_note, title: '$reg needs changes', body: v.reviewNote!, color: c.warning, route: route));
    if (v.status == 'draft' && v.reviewNote == null) out.add((icon: Icons.edit_note, title: 'Finish adding $reg', body: 'Add the RC, insurance and an audit day, then send it.', color: c.warning, route: route));
    if (v.status == 'approved') out.add((icon: Icons.format_paint_outlined, title: '$reg approved', body: 'QuikFly will call you to fit the sticker; it goes live after that.', color: c.success, route: route));
    if (v.status == 'active' || v.status == 'inactive') {
      for (final (label, date) in [('Insurance', v.insurance?.validTill), ('RC', v.rc?.validTill)]) {
        if (date == null) continue;
        final days = _daysTo(date);
        if (days <= warnDays && !v.docsPending) {
          out.add((icon: Icons.event_busy, title: '$label for $reg ${days < 0 ? 'has expired' : 'expires in $days day${days == 1 ? '' : 's'}'}', body: 'Upload the renewal before $date.', color: c.warning, route: route));
        }
      }
      if (v.driverId == null) out.add((icon: Icons.person_off_outlined, title: '$reg has no driver', body: 'Assign an approved driver so it can take trips.', color: c.fgMuted, route: route));
    }
  }
  for (final d in f.drivers) {
    final route = '/driver/${d.id}';
    if (d.status == 'blocked') out.add((icon: Icons.block, title: '${d.name} is blocked', body: d.blockedReason ?? 'Call partner support.', color: c.danger, route: route));
    if (d.status == 'rejected') out.add((icon: Icons.edit_note, title: '${d.name} wasn\'t approved', body: d.reviewNote ?? 'Check the licence details and send again.', color: c.warning, route: route));
    if (d.status == 'submitted' && !d.hasDlPhoto) out.add((icon: Icons.photo_camera_outlined, title: 'Add ${d.name}\'s licence photo', body: 'QuikFly reviews the driver once the photo is in.', color: c.warning, route: route));
    if (d.status == 'active') {
      final days = _daysTo(d.dlValidTill);
      if (days <= warnDays && !d.docsPending) out.add((icon: Icons.event_busy, title: '${d.name}\'s licence expires in $days day${days == 1 ? '' : 's'}', body: 'Upload the renewed licence.', color: c.warning, route: route));
    }
  }
  return out;
}

class _HomeTab extends ConsumerWidget {
  const _HomeTab(this.a, this.f, {required this.onTab});
  final VendorApplication a;
  final VendorFleet f;
  final ValueChanged<int> onTab;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final count = {for (final s in ['active', 'inactive', 'blocked']) s: f.vehicles.where((v) => v.status == s).length};
    final alerts = _alerts(c, f, partnerSettings(ref).vendorExpiryWarnDays);
    Widget stat(int n, String label, IconData icon, Color color) => Expanded(
          child: Panel(
            onTap: () => onTab(2),
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(height: 3, width: 28, color: color),
              const SizedBox(height: 8),
              Row(children: [Text('$n', style: Theme.of(context).textTheme.headlineSmall), const Spacer(), Icon(icon, size: 20, color: c.fgMuted)]),
              Text(label, style: TextStyle(color: c.fgMuted, fontSize: 12)),
            ]),
          ),
        );
    return ScreenList(onRefresh: () async {
      ref.invalidate(fleetProvider);
      refreshMoney(ref);
    }, children: [
      const PushPrompt(title: 'Hear about new trips', message: 'Get a notification for each trip, payout and review, and before a document expires, even when the app is closed.'),
      RevenueSection(fleet: f),
      const SizedBox(height: 16),
      Row(children: [
        stat(count['active']!, 'On duty', Icons.local_taxi_outlined, c.success),
        const SizedBox(width: 8),
        stat(count['inactive']!, 'Off duty', Icons.pause_circle_outline, c.fgMuted),
        const SizedBox(width: 8),
        stat(count['blocked']!, 'Blocked', Icons.block, c.danger),
      ]),
      const SizedBox(height: 16),
      Text('NEEDS ATTENTION', style: TextStyle(color: c.fgSubtle, fontSize: 12, letterSpacing: 1, fontWeight: FontWeight.w600)),
      const SizedBox(height: 8),
      if (alerts.isEmpty)
        Panel(child: Row(children: [Icon(Icons.check_circle_outline, color: c.success), const SizedBox(width: 10), const Expanded(child: Text('All good. Nothing needs your attention.'))]))
      else
        for (final al in alerts)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Panel(
              onTap: () => context.push(al.route),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(al.icon, color: al.color),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(al.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(al.body, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                ])),
                const Icon(Icons.chevron_right),
              ]),
            ),
          ),
    ]);
  }
}

class _VehiclesTab extends ConsumerWidget {
  const _VehiclesTab(this.f);
  final VendorFleet f;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    if (f.vehicles.isEmpty) return const EmptyState(icon: Icons.local_taxi_outlined, title: 'No vehicles yet');
    return ScreenList(onRefresh: () async => ref.invalidate(fleetProvider), children: [
      for (final v in f.vehicles)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Panel(
            onTap: () => context.push('/vehicle/${v.id}'),
            child: Row(children: [
              Icon(_vehicleIcon[v.type], color: c.accent, size: 30),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(VendorRules.formatReg(v.regNumber), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                Text('${vendorVehicleLabel[v.type]} · ${f.driver(v.driverId)?.name ?? 'No driver'}', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                const SizedBox(height: 6),
                Wrap(spacing: 6, runSpacing: 4, children: [
                  _chip(context, _vehicleStatus[v.status] ?? v.status, _statusColor(c, v.status)),
                  if (v.docsPending) _chip(context, 'Renewal being checked', c.warning),
                ]),
              ])),
              const Icon(Icons.chevron_right),
            ]),
          ),
        ),
      const SizedBox(height: 70),
    ]);
  }
}

/// One vehicle: its parts, documents, driver, on/off duty, send or remove.
class VehicleScreen extends ConsumerWidget {
  const VehicleScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final f = ref.watch(fleetProvider).value;
    final v = f?.vehicle(id);
    if (f == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    if (v == null) return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.local_taxi_outlined, title: 'Vehicle not found'));
    final api = ref.read(apiProvider);
    final draft = v.status == 'draft';
    final settings = partnerSettings(ref);
    Widget part(String key, String title, String? sub, {bool done = false, bool warn = false, bool enabled = true}) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Panel(
            onTap: enabled ? () => context.push('/vehicle/$id/$key') : null,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              Icon(done ? Icons.check_circle : Icons.radio_button_unchecked, color: warn ? c.warning : done ? c.success : c.fgSubtle),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                if (sub != null) Text(sub, style: TextStyle(color: warn ? c.warning : c.fgMuted, fontSize: 12.5)),
              ])),
              if (enabled) const Icon(Icons.chevron_right),
            ]),
          ),
        );
    String validity(String date) {
      final days = _daysTo(date);
      return days < 0 ? 'Expired on $date' : 'Valid till $date';
    }
    bool soon(String? date) => date != null && _daysTo(date) <= settings.vendorExpiryWarnDays;
    final renew = v.live;
    return Scaffold(
      appBar: AppBar(title: Text(VendorRules.formatReg(v.regNumber))),
      body: ScreenList(onRefresh: () async => ref.invalidate(fleetProvider), children: [
        Row(children: [
          Icon(_vehicleIcon[v.type], color: c.accent, size: 34),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${vendorVehicleLabel[v.type]} · ${fuelLabel[v.fuel]}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            _chip(context, _vehicleStatus[v.status] ?? v.status, _statusColor(c, v.status)),
          ])),
        ]),
        if (v.blockedReason != null && v.status == 'blocked') ...[const SizedBox(height: 12), _Note(text: 'Blocked: ${v.blockedReason}', color: c.danger)],
        if (v.reviewNote != null && (draft || v.status == 'rejected')) ...[const SizedBox(height: 12), _Note(text: 'QuikFly asked: ${v.reviewNote}', color: c.warning)],
        if (v.docsPending) ...[const SizedBox(height: 12), _Note(text: 'QuikFly is checking your renewed document.', color: c.warning)],
        if (v.status == 'active' || v.status == 'inactive') ...[
          const SizedBox(height: 12),
          Panel(
            padding: EdgeInsets.zero,
            child: SwitchListTile(
              value: v.status == 'active',
              onChanged: (on) => _fleetCall(context, ref, () => api.setVendorVehicleActive(id, on), on ? 'On duty' : 'Off duty'),
              title: const Text('On duty'),
              subtitle: Text(v.status == 'active' ? 'Takes QuikFly trips' : 'Paused: takes no trips'),
            ),
          ),
        ],
        const SizedBox(height: 16),
        part('vehicle', 'Vehicle details', '${VendorRules.formatReg(v.regNumber)} · bought ${v.purchaseDate}', done: true, enabled: draft),
        part('rc', 'Registration certificate (RC)', v.rc == null ? (draft ? 'Add the RC details and photo' : null) : '${validity(v.rc!.validTill)}${renew ? ' · tap to renew' : ''}',
            done: v.rc?.hasPhoto ?? false, warn: renew && soon(v.rc?.validTill), enabled: draft || renew),
        part('insurance', 'Insurance', v.insurance == null ? (draft ? 'Add the insurance details and photo' : null) : '${v.insurance!.insurer} · ${validity(v.insurance!.validTill)}${renew ? ' · tap to renew' : ''}',
            done: v.insurance?.hasPhoto ?? false, warn: renew && soon(v.insurance?.validTill), enabled: draft || renew),
        part('audit', 'Vehicle audit', v.audit == null ? 'Pick a day at ${settings.vendorAuditAddress}' : '${v.audit!.date} · ${auditSlotLabel[v.audit!.slot]}${v.audit!.result == 'passed' ? ' · passed' : ''}',
            done: v.audit != null, enabled: draft),
        if (v.live) ...[
          const SizedBox(height: 8),
          Text('DRIVER', style: TextStyle(color: c.fgSubtle, fontSize: 12, letterSpacing: 1, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Panel(child: Row(children: [
            Icon(Icons.badge_outlined, color: c.accent),
            const SizedBox(width: 12),
            Expanded(child: Text(f.driver(v.driverId)?.name ?? 'No driver yet. Open a driver in the Drivers tab to assign them.')),
          ])),
        ],
        const SizedBox(height: 16),
        if (draft)
          GoldButton(label: 'Send to QuikFly for review', onPressed: () => _fleetCall(context, ref, () => api.submitVendorVehicle(id), 'Sent. QuikFly will review it after the audit.')),
        if (draft || v.status == 'rejected')
          TextButton.icon(
            onPressed: () async {
              if (await _fleetCall(context, ref, () => api.deleteVendorVehicle(id), 'Vehicle removed') && context.mounted) context.pop();
            },
            icon: Icon(Icons.delete_outline, color: c.danger),
            label: Text('Remove this vehicle', style: TextStyle(color: c.danger)),
          ),
      ]),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text, required this.color});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.info_outline, color: color),
          const SizedBox(width: 10),
          Expanded(child: Text(text)),
        ]),
      );
}

class _DriversTab extends ConsumerWidget {
  const _DriversTab(this.f);
  final VendorFleet f;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    if (f.drivers.isEmpty) {
      return const EmptyState(icon: Icons.badge_outlined, title: 'No drivers yet', message: 'Add the people who drive your vehicles, or yourself. QuikFly checks each licence first.');
    }
    return ScreenList(onRefresh: () async => ref.invalidate(fleetProvider), children: [
      for (final d in f.drivers)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Panel(
            onTap: () => context.push('/driver/${d.id}'),
            child: Row(children: [
              CircleAvatar(backgroundColor: c.accent.withValues(alpha: 0.15), child: Text(d.name.isEmpty ? '?' : d.name[0].toUpperCase(), style: TextStyle(color: c.accent))),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(d.self ? '${d.name} (you)' : d.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(f.vehicle(d.vehicleId) == null ? 'No vehicle' : VendorRules.formatReg(f.vehicle(d.vehicleId)!.regNumber), style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                const SizedBox(height: 6),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  _chip(context, _driverStatus[d.status] ?? d.status, _statusColor(c, d.status == 'submitted' ? 'submitted' : d.status)),
                  // Live in QuikFly Captain: who is online or on a ride right now.
                  if (d.captainStatus != null)
                    _chip(context, 'Captain: ${captainStatusLabel[d.captainStatus] ?? d.captainStatus}', switch (d.captainStatus) {
                      'onRide' => c.accent,
                      'online' => c.success,
                      'silent' => c.warning,
                      _ => c.fgMuted,
                    }),
                ]),
              ])),
              const Icon(Icons.chevron_right),
            ]),
          ),
        ),
      const SizedBox(height: 70),
    ]);
  }
}

/// One driver: details, assign to a vehicle, renew the licence, remove.
class DriverScreen extends ConsumerWidget {
  const DriverScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final f = ref.watch(fleetProvider).value;
    final d = f?.driver(id);
    if (f == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    if (d == null) return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.badge_outlined, title: 'Driver not found'));
    final api = ref.read(apiProvider);
    final liveVehicles = f.vehicles.where((v) => v.status == 'active' || v.status == 'inactive').toList();
    final expired = _daysTo(d.dlValidTill) < 0;
    return Scaffold(
      appBar: AppBar(title: Text(d.name)),
      body: ScreenList(onRefresh: () async => ref.invalidate(fleetProvider), children: [
        _chip(context, _driverStatus[d.status] ?? d.status, _statusColor(c, d.status)),
        if (d.status == 'blocked' && d.blockedReason != null) ...[const SizedBox(height: 12), _Note(text: 'Blocked: ${d.blockedReason}', color: c.danger)],
        if (d.status == 'rejected' && d.reviewNote != null) ...[const SizedBox(height: 12), _Note(text: 'QuikFly said: ${d.reviewNote}. Fix the licence details to send again.', color: c.warning)],
        if (d.docsPending) ...[const SizedBox(height: 12), _Note(text: 'QuikFly is checking the renewed licence.', color: c.warning)],
        const SizedBox(height: 14),
        Panel(child: Column(children: [
          KeyValue('Phone', d.phone),
          KeyValue('Licence', formatLicence(d.dlNumber)),
          KeyValue('Valid till', expired ? '${d.dlValidTill} (expired)' : d.dlValidTill),
          KeyValue('Police verification', d.policeVerifiedAt == null ? 'Not yet' : 'Confirmed by QuikFly'),
        ])),
        if (d.status == 'active') ...[
          const SizedBox(height: 16),
          DropdownButtonFormField<String?>(
            initialValue: liveVehicles.any((v) => v.id == d.vehicleId) ? d.vehicleId : null,
            decoration: const InputDecoration(labelText: 'Drives'),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('No vehicle')),
              for (final v in liveVehicles) DropdownMenuItem<String?>(value: v.id, child: Text('${VendorRules.formatReg(v.regNumber)} · ${vendorVehicleLabel[v.type]}')),
            ],
            onChanged: (vid) => _fleetCall(context, ref, () => api.assignVendorDriver(id, vid), vid == null ? 'Taken off the vehicle' : 'Assigned'),
          ),
          if (liveVehicles.isEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('No live vehicles yet.', style: TextStyle(color: c.fgSubtle, fontSize: 12))),
        ],
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () => context.push('/driver/$id/licence'),
          icon: const Icon(Icons.badge_outlined),
          label: Text(d.status == 'active' || d.status == 'blocked' ? 'Renew licence' : d.hasDlPhoto ? 'Edit licence' : 'Add licence photo'),
        ),
        TextButton.icon(
          onPressed: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: Text('Remove ${d.name}?'),
                content: const Text('They\'re taken off any vehicle and can\'t drive QuikFly trips for you.'),
                actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove'))],
              ),
            );
            if (ok == true && context.mounted && await _fleetCall(context, ref, () => api.removeVendorDriver(id), 'Driver removed') && context.mounted) context.pop();
          },
          icon: Icon(Icons.person_remove_outlined, color: c.danger),
          label: Text('Remove driver', style: TextStyle(color: c.danger)),
        ),
      ]),
    );
  }
}

/// Add a driver (or yourself), or correct / renew an existing driver's licence.
class DriverFormScreen extends ConsumerStatefulWidget {
  const DriverFormScreen({super.key, this.driverId});
  final String? driverId;
  @override
  ConsumerState<DriverFormScreen> createState() => _DriverFormScreenState();
}

class _DriverFormScreenState extends ConsumerState<DriverFormScreen> {
  final _name = TextEditingController(), _phone = TextEditingController(), _dl = TextEditingController();
  DateTime? _till;
  bool _self = false, _busy = false, _filled = false;
  Uint8List? _photo;
  String? _err;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _dl.dispose();
    super.dispose();
  }

  Future<void> _save(VendorDriver? existing) async {
    final dl = _dl.text.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');
    final phone = _phone.text.replaceAll(RegExp(r'\D'), '');
    String? problem;
    if (existing == null && !_self && _name.text.trim().length < 2) problem = 'Enter the driver\'s name';
    if (problem == null && existing == null && !_self && phone.length != 10) problem = 'Enter the driver\'s 10-digit mobile number';
    if (problem == null && !Rules.licence.hasMatch(dl)) problem = 'Enter the licence number, e.g. TN0920190001234';
    if (problem == null && _till == null) problem = 'Pick the licence validity date';
    if (problem == null && _photo == null && !(existing?.hasDlPhoto ?? false)) problem = 'Add a clear photo of the licence (front)';
    if (problem != null) return setState(() => _err = problem);
    setState(() { _busy = true; _err = null; });
    final api = ref.read(apiProvider);
    try {
      var id = existing?.id;
      final body = {'dlNumber': dl, 'dlValidTill': isoDate(_till!)};
      if (existing == null) {
        final f = await api.addVendorDriver(_self ? {'self': true, ...body} : {'name': _name.text.trim(), 'phone': phone, ...body});
        id = f.drivers.where((d) => d.dlNumber == dl).firstOrNull?.id;
      } else if (dl != existing.dlNumber || isoDate(_till!) != existing.dlValidTill) {
        await api.saveVendorDriverLicence(existing.id, body);
      }
      if (_photo != null && id != null) await api.uploadVendorDriverLicence(id, _photo!);
      ref.invalidate(fleetProvider);
      if (mounted) {
        toast(context, existing == null ? 'Driver added. QuikFly will review them.' : 'Sent to QuikFly to check');
        context.pop();
      }
    } catch (e) {
      setState(() => _err = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _pick(ImageSource source) async {
    try {
      final f = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 80);
      if (f != null) {
        final bytes = await f.readAsBytes();
        setState(() { _photo = bytes; _err = null; });
      }
    } catch (_) {
      setState(() => _err = 'Couldn\'t open the ${source == ImageSource.camera ? 'camera' : 'gallery'}. Check the app\'s permissions.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final f = ref.watch(fleetProvider).value;
    final existing = widget.driverId == null ? null : f?.driver(widget.driverId);
    if (!_filled && existing != null) {
      _filled = true;
      _dl.text = existing.dlNumber;
      _till = DateTime.tryParse(existing.dlValidTill);
    }
    final hasSelf = f?.drivers.any((d) => d.self) ?? false;
    final api = ref.read(apiProvider);
    final now = DateTime.now();
    return Scaffold(
      appBar: AppBar(title: Text(existing == null ? 'Add a driver' : 'Driving licence')),
      bottomNavigationBar: SafeArea(child: Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: GoldButton(label: existing == null ? 'Add driver' : 'Send to QuikFly', loading: _busy, onPressed: () => _save(existing)))),
      body: ScreenList(children: [
        Text(existing == null ? 'QuikFly checks the licence, police verification and induction training before a driver takes trips.' : 'Renewed or corrected? Enter the details and a new photo.',
            style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 12),
        if (existing == null) ...[
          if (!hasSelf)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _self,
              onChanged: (v) => setState(() => _self = v),
              title: const Text('I\'ll drive myself'),
              subtitle: const Text('Uses your name and number'),
            ),
          if (!_self) ...[
            TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Driver\'s full name')),
            const SizedBox(height: 14),
            TextField(controller: _phone, keyboardType: TextInputType.phone, inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
                decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91 ')),
            const SizedBox(height: 14),
          ],
        ],
        TextField(controller: _dl, textCapitalization: TextCapitalization.characters, inputFormatters: [LengthLimitingTextInputFormatter(18)],
            decoration: const InputDecoration(labelText: 'Driving licence number', hintText: 'TN0920190001234')),
        const SizedBox(height: 14),
        InkWell(
          borderRadius: BorderRadius.circular(Brand.radiusField),
          onTap: () async {
            final d = await showDatePicker(context: context, firstDate: now, lastDate: DateTime(now.year + 25), initialDate: _till != null && _till!.isAfter(now) ? _till! : now.add(const Duration(days: 365)));
            if (d != null) setState(() => _till = d);
          },
          child: InputDecorator(
            decoration: InputDecoration(labelText: 'Valid till', suffixIcon: Icon(Icons.calendar_month, color: c.accent)),
            child: Text(_till == null ? 'Choose a date' : longDate(_till!), style: TextStyle(color: _till == null ? c.fgSubtle : c.fg)),
          ),
        ),
        const SizedBox(height: 16),
        Text('A clear photo of the licence (front), all text readable.', style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Container(
            height: 190,
            width: double.infinity,
            decoration: BoxDecoration(color: c.field, border: Border.all(color: c.border), borderRadius: BorderRadius.circular(16)),
            child: _photo != null
                ? Image.memory(_photo!, fit: BoxFit.cover)
                : existing?.hasDlPhoto ?? false
                    ? Image.network(api.vendorDriverLicenceUrl(existing!.id), headers: api.authHeaders, fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => Center(child: Text('Saved photo', style: TextStyle(color: c.fgMuted))))
                    : Center(child: Icon(Icons.badge_outlined, size: 44, color: c.fgSubtle)),
          ),
        ),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined), label: const Text('Camera'))),
          const SizedBox(width: 10),
          Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined), label: const Text('Gallery'))),
        ]),
        FormError(_err),
      ]),
    );
  }
}
