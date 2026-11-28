// Privacy (DPDP Act 2023 + Rules 2025), shared by the QuikFly and QuikFly Partner apps:
//   PrivacyScreen      /privacy in both routers: the full notice from GET /privacy.
//   PrivacyGate        wraps each app: asks a signed-in person to agree when their consent
//                      isn't for the current notice version (new accounts, or a changed notice).
//   PrivacyDataPanel   Account → Privacy & data: the notice, download my data, erase, contact.
// The notice text lives once, in packages/shared/src/privacy.ts; the API serves it.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/models.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

final privacyNoticeProvider = FutureProvider<PrivacyNotice>((ref) => ref.watch(apiProvider).privacyNotice());

/// "19 November 2026" from "2026-11-19".
String noticeDate(String ymd) => DateFormat('d MMMM y').format(DateTime.parse(ymd));

class PrivacyScreen extends ConsumerWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notice = ref.watch(privacyNoticeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy notice')),
      body: notice.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(privacyNoticeProvider))]),
        data: (n) => ScreenList(
          onRefresh: () => ref.refresh(privacyNoticeProvider.future),
          children: [_NoticeBody(n)],
        ),
      ),
    );
  }
}

/// The whole notice: summary, every section, and the Grievance Officer.
class _NoticeBody extends StatelessWidget {
  const _NoticeBody(this.n);
  final PrivacyNotice n;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Last updated ${noticeDate(n.updated)}', style: TextStyle(color: c.fgMuted)),
      const SizedBox(height: 14),
      NoticeBlock(title: 'In short', points: n.summary, highlighted: true),
      for (final s in n.sections) NoticeBlock(title: s.title, points: s.points),
      _ContactCard(n.contact),
    ]);
  }
}

/// One titled list of points in a notice (also used by QuikFly Captain's own notice).
class NoticeBlock extends StatelessWidget {
  const NoticeBlock({super.key, required this.title, required this.points, this.highlighted = false});
  final String title;
  final List<String> points;
  final bool highlighted;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Panel(
          highlighted: highlighted,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            _Bullets(points),
          ]),
        ),
      );
}

class _Bullets extends StatelessWidget {
  const _Bullets(this.points);
  final List<String> points;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (final p in points)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.only(top: 7, right: 10), child: Icon(Icons.circle, size: 6, color: c.accent)),
            Expanded(child: Text(p, style: TextStyle(color: c.fgSoft, height: 1.4))),
          ]),
        ),
    ]);
  }
}

class _ContactCard extends StatelessWidget {
  const _ContactCard(this.k);
  final PrivacyContact k;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Contact the ${k.role}', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text('Questions, corrections, complaints or nominating someone. We reply within 30 days.', style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 10),
        Text(k.name, style: TextStyle(color: c.fgStrong, fontWeight: FontWeight.w600)),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.mail_outline, color: c.accent),
          title: Text(k.email),
          onTap: () => launchUrl(Uri(scheme: 'mailto', path: k.email)),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.call_outlined, color: c.accent),
          title: Text(k.phone),
          onTap: () => launchUrl(Uri(scheme: 'tel', path: k.phone.replaceAll(' ', ''))),
        ),
        Text('${k.company}, ${k.address}', style: TextStyle(color: c.fgMuted)),
      ]),
    );
  }
}

/// Covers the app with the consent page while the signed-in person hasn't agreed to the current
/// notice. It sits above the router (MaterialApp.builder) so the screen underneath, such as
/// sign-up, keeps its state. If the notice can't be loaded (offline) it asks next time.
class PrivacyGate extends ConsumerWidget {
  const PrivacyGate({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);
    final notice = user == null ? null : ref.watch(privacyNoticeProvider).value;
    final ask = user != null && notice != null && user.privacyConsent != notice.version;
    if (ask) FocusManager.instance.primaryFocus?.unfocus();
    return Stack(children: [child, if (ask) Positioned.fill(child: _ConsentPage(notice))]);
  }
}

class _ConsentPage extends ConsumerStatefulWidget {
  const _ConsentPage(this.n);
  final PrivacyNotice n;
  @override
  ConsumerState<_ConsentPage> createState() => _ConsentPageState();
}

class _ConsentPageState extends ConsumerState<_ConsentPage> {
  bool _full = false, _busy = false;
  String? _error;

  Future<void> _agree() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final u = await ref.read(apiProvider).giveConsent(widget.n.version);
      ref.read(sessionProvider.notifier).setUser(u);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
      // A changed notice (400) means ours is stale: load the new one.
      ref.invalidate(privacyNoticeProvider);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final n = widget.n;
    return Scaffold(
      body: SafeArea(
        child: ScreenList(children: [
          const SizedBox(height: 12),
          Icon(Icons.verified_user_outlined, size: 40, color: c.accent),
          const SizedBox(height: 12),
          Text('Your privacy', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text("Before you continue, here's how QuikFly uses your data:", style: TextStyle(color: c.fgMuted)),
          const SizedBox(height: 14),
          _Bullets(n.summary),
          const SizedBox(height: 4),
          if (_full)
            Padding(padding: const EdgeInsets.only(top: 8), child: _NoticeBody(n))
          else
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(onPressed: () => setState(() => _full = true), child: const Text('Read the full privacy notice')),
            ),
          FormError(_error),
          const SizedBox(height: 12),
          GoldButton(label: 'I agree, continue', loading: _busy, onPressed: _agree),
          const SizedBox(height: 6),
          TextButton(
            onPressed: _busy ? null : () => ref.read(sessionProvider.notifier).signOut(),
            child: Text("Don't agree, sign me out", style: TextStyle(color: c.fgMuted)),
          ),
        ]),
      ),
    );
  }
}

/// Account → Privacy & data. [deleteRoute] is where this app deletes accounts (null: explain where).
class PrivacyDataPanel extends ConsumerStatefulWidget {
  const PrivacyDataPanel({super.key, this.deleteRoute});
  final String? deleteRoute;
  @override
  ConsumerState<PrivacyDataPanel> createState() => _PrivacyDataPanelState();
}

class _PrivacyDataPanelState extends ConsumerState<PrivacyDataPanel> {
  bool _busy = false;
  String? _error;

  Future<void> _download() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await ref.read(apiProvider).exportData();
      final day = '${data['exportedAt']}'.substring(0, 10);
      final bytes = utf8.encode(const JsonEncoder.withIndent('  ').convert(data));
      await SharePlus.instance.share(ShareParams(
        subject: 'My QuikFly data',
        files: [XFile.fromData(bytes, mimeType: 'application/json', name: 'quikfly-data-$day.json')],
        fileNameOverrides: ['quikfly-data-$day.json'],
      ));
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final user = ref.watch(userProvider);
    final contact = ref.watch(privacyNoticeProvider).value?.contact;
    Widget head(IconData icon, String text) => Row(children: [
          Icon(icon, size: 19, color: c.accent),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: c.fgStrong, fontWeight: FontWeight.w600))),
        ]);
    Widget sub(String text) => Padding(padding: const EdgeInsets.only(top: 4, bottom: 10), child: Text(text, style: TextStyle(color: c.fgMuted)));
    final consent = user?.privacyConsent;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text("Your rights under India's Digital Personal Data Protection Act.", style: TextStyle(color: c.fgMuted)),
      const SizedBox(height: 18),
      head(Icons.description_outlined, 'Privacy notice'),
      sub(consent == null ? "You haven't agreed to the privacy notice yet." : 'You agreed to the notice of ${noticeDate(consent)}.'),
      OutlinedButton(onPressed: () => context.push('/privacy'), child: const Text('Read the privacy notice')),
      const Divider(height: 36),
      head(Icons.download_outlined, 'Download your data'),
      sub('One file with your profile, bookings, wallet, saved places, travellers, contacts, notifications and support requests. Save it or send it anywhere you like.'),
      GoldButton(label: 'Download (JSON)', icon: Icons.download, loading: _busy, onPressed: _download),
      FormError(_error),
      const Divider(height: 36),
      head(Icons.delete_outline, 'Correct or erase'),
      sub(widget.deleteRoute == null
          ? 'Fix your details in your profile. To withdraw consent and erase your data, delete your account in the QuikFly app or on the website (Account → Login & security).'
          : 'Fix your details in your profile. To withdraw consent and erase your data, delete your account: it closes now and is erased after ${Rules.deletionGraceDays} days.'),
      if (widget.deleteRoute != null)
        OutlinedButton(onPressed: () => context.push(widget.deleteRoute!), child: const Text('Go to Login & security')),
      if (contact != null) ...[
        const Divider(height: 36),
        head(Icons.mail_outline, 'Questions or complaints'),
        sub('Write to our ${contact.role}, ${contact.name}, at ${contact.email} or call ${contact.phone}.'),
      ],
      const SizedBox(height: Brand.gutter),
    ]);
  }
}

/// The Partner app's Privacy & data page (/privacy/data). It has no account deletion of its own.
class PrivacyDataScreen extends StatelessWidget {
  const PrivacyDataScreen({super.key});
  @override
  Widget build(BuildContext context) =>
      Scaffold(appBar: AppBar(title: const Text('Privacy & data')), body: const ScreenList(children: [PrivacyDataPanel()]));
}
