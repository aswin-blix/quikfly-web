// Help centre: FAQs from GET /config grouped by category, plus the support line.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

class HelpScreen extends ConsumerStatefulWidget {
  const HelpScreen({super.key});
  @override
  ConsumerState<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends ConsumerState<HelpScreen> {
  String? _category;
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final c = context.qf.fgMuted;
    final config = ref.watch(configProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Help centre')),
      body: config.when(
        loading: () => const ScreenList(children: [Skeleton(height: 56), SizedBox(height: 12), Skeleton(height: 240)]),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(configProvider))]),
        data: (cfg) {
          final categories = {for (final f in cfg.faqs) f.category}.toList();
          final q = _q.toLowerCase();
          final faqs = cfg.faqs
              .where((f) => (_category == null || f.category == _category) && (q.isEmpty || f.q.toLowerCase().contains(q) || f.a.toLowerCase().contains(q)))
              .toList();
          return ScreenList(children: [
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search help articles'),
              onChanged: (v) => setState(() => _q = v.trim()),
            ),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              ChoiceChip(label: const Text('All'), selected: _category == null, onSelected: (_) => setState(() => _category = null)),
              for (final cat in categories)
                ChoiceChip(label: Text(cat), selected: _category == cat, onSelected: (_) => setState(() => _category = cat)),
            ]),
            const SizedBox(height: 12),
            if (faqs.isEmpty)
              const EmptyState(icon: Icons.search_off, title: 'No matching questions', message: 'Try other words, or call us below.')
            else
              Panel(
                padding: EdgeInsets.zero,
                child: Column(children: [
                  for (final f in faqs)
                    Theme(
                      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                      child: ExpansionTile(
                        title: Text(f.q, style: const TextStyle(fontWeight: FontWeight.w600)),
                        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                        expandedAlignment: Alignment.centerLeft,
                        children: [Text(f.a, style: TextStyle(color: c))],
                      ),
                    ),
                ]),
              ),
            const SizedBox(height: 16),
            Panel(
              onTap: () => launchUrl(Uri(scheme: 'tel', path: cfg.settings.companyPhone.replaceAll(' ', ''))),
              child: Row(children: [
                const Icon(Icons.support_agent),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('24×7 customer support', style: TextStyle(fontWeight: FontWeight.w600)),
                    Text('${cfg.settings.companyPhone} · ${cfg.settings.companyEmail}', style: TextStyle(color: c, fontSize: 13)),
                  ]),
                ),
                const Icon(Icons.call),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}
