// QuikFly Captain's own privacy notice (/captain-notice): what the app does with a captain's location and
// trips, on top of the main QuikFly notice. A captain agrees to it once before going online (the API refuses
// going online until then: CAPTAIN_NOTICE_NEEDED), and again when its version changes. Customers never see
// it in their app (the owner's decision, 2026-11-28); the website shows it on /privacy for anyone.
// The text lives once, in captainNotice() in packages/shared/src/privacy.ts; GET /privacy/captain serves it.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../api/models.dart';
import '../screens/account/privacy_screens.dart' show NoticeBlock, noticeDate;
import '../state/providers.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';
import 'captain_state.dart';

final captainNoticeProvider = FutureProvider<CaptainNotice>((ref) => ref.watch(apiProvider).captainNotice());

class CaptainNoticeScreen extends ConsumerStatefulWidget {
  const CaptainNoticeScreen({super.key});
  @override
  ConsumerState<CaptainNoticeScreen> createState() => _CaptainNoticeScreenState();
}

class _CaptainNoticeScreenState extends ConsumerState<CaptainNoticeScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _agree(CaptainNotice n) async {
    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(apiProvider).agreeCaptainNotice(n.version);
      ref.invalidate(captainLookupProvider);
      if (mounted) context.pop();
    } catch (e) {
      // A changed notice (400) is reloaded so the captain agrees to the text they now see.
      ref.invalidate(captainNoticeProvider);
      if (mounted) setState(() { _busy = false; _error = errorText(e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final notice = ref.watch(captainNoticeProvider);
    final profile = ref.watch(captainLookupProvider).value?.captain;
    // Agreed to this version already (a captain reading it again from Account).
    final agreedAt = profile != null && profile.noticeVersion == notice.value?.version ? profile.noticeAgreedAt : null;
    return Scaffold(
      appBar: AppBar(title: const Text('Captain privacy notice')),
      body: notice.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(captainNoticeProvider))]),
        data: (n) => ScreenList(
          onRefresh: () => ref.refresh(captainNoticeProvider.future),
          children: [
            Text(n.title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text('Last updated ${noticeDate(n.updated)}', style: TextStyle(color: c.fgMuted)),
            const SizedBox(height: 14),
            NoticeBlock(title: 'In short', points: n.summary, highlighted: true),
            for (final s in n.sections) NoticeBlock(title: s.title, points: s.points),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(onPressed: () => context.push('/privacy'), child: const Text('Read the QuikFly privacy notice')),
            ),
            const SizedBox(height: 8),
            if (agreedAt != null)
              Text('You agreed on ${DateFormat('d MMMM y').format(agreedAt)}. To withdraw, go offline and delete your account from Account → Privacy & data.',
                  style: TextStyle(color: c.fgMuted))
            else if (profile != null) ...[
              if (_error != null) FormError(_error),
              GoldButton(label: 'I agree', icon: Icons.check, loading: _busy, onPressed: () => _agree(n)),
              const SizedBox(height: 6),
              Center(child: TextButton(onPressed: _busy ? null : () => context.pop(), child: const Text('Not now'))),
              Text("You can't go online until you agree.", textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 12.5)),
            ],
          ],
        ),
      ),
    );
  }
}
