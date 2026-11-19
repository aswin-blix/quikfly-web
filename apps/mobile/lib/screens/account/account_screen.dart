// Account tab: profile header, wallet, every account section, theme, help and sign out.
// Signed out, it offers sign-in. Mirrors the website's account sheet.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/format.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/logo.dart';
import '../../widgets/ui.dart';
import '../auth/login_screen.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final user = ref.watch(userProvider);
    final mode = ref.watch(themeModeProvider);

    Widget group(List<Widget> tiles) => Panel(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (var i = 0; i < tiles.length; i++) ...[if (i > 0) Divider(color: c.border, indent: 52), tiles[i]],
          ]),
        );
    Widget link(IconData icon, String label, String route, {String? trailing}) => ListTile(
          leading: Icon(icon),
          title: Text(label),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            if (trailing != null) Text(trailing, style: TextStyle(color: c.fgMuted, fontSize: 13)),
            Icon(Icons.chevron_right, color: c.fgSubtle),
          ]),
          onTap: () => context.push(route),
        );

    return Scaffold(
      appBar: AppBar(title: Text(user == null ? 'Account' : 'Your account')),
      body: ScreenList(
        onRefresh: () => ref.read(sessionProvider.notifier).refresh(),
        children: [
          if (user == null)
            Panel(
              child: Column(children: [
                const AppLogo(height: 60),
                const SizedBox(height: 12),
                const Text('One account for rides, buses, holidays and rentals', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text('New accounts start with ${inr(ref.watch(configProvider).value?.settings.welcomeCredit ?? 0)} in the wallet.',
                    textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted)),
                const SizedBox(height: 16),
                GoldButton(label: 'Login or sign up', onPressed: () => ensureSignedIn(context, ref)),
              ]),
            )
          else ...[
            Panel(
              onTap: () => context.push('/account/profile'),
              child: Row(children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: Brand.gold,
                  child: Text(user.name.isEmpty ? '?' : user.name[0].toUpperCase(),
                      style: const TextStyle(color: Brand.onGold, fontWeight: FontWeight.w700, fontSize: 20)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(user.name.isEmpty ? 'Add your name' : user.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                    Text.rich(TextSpan(children: [
                      TextSpan(text: '${phoneDisplay(user.phone)} · '),
                      TextSpan(text: 'Edit profile', style: TextStyle(color: c.accent)),
                    ]), style: TextStyle(color: c.fgMuted, fontSize: 13)),
                  ]),
                ),
                Icon(Icons.chevron_right, color: c.fgSubtle),
              ]),
            ),
            const SizedBox(height: 12),
            Panel(
              highlighted: true,
              onTap: () => context.push('/account/wallet'),
              child: Row(children: [
                Icon(Icons.account_balance_wallet_outlined, color: c.accent, size: 26),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('QuikFly wallet', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                    Text(inr(user.walletBalance), style: Theme.of(context).textTheme.headlineSmall),
                  ]),
                ),
                Text('History', style: TextStyle(color: c.accent, fontWeight: FontWeight.w600)),
              ]),
            ),
            const SizedBox(height: 12),
            group([
              link(Icons.place_outlined, 'Saved places', '/account/places'),
              link(Icons.group_outlined, 'Saved travellers', '/account/travellers'),
              link(Icons.shield_outlined, 'Safety & emergency contacts', '/account/safety'),
              link(Icons.badge_outlined, 'Driving licence', '/account/licence', trailing: switch (user.licence.status.name) {
                'verified' => 'Verified',
                'pending' => 'In review',
                'rejected' => 'Not approved',
                _ => 'Add',
              }),
              if (ref.watch(configProvider).value?.settings.featureReferral ?? true) link(Icons.card_giftcard, 'Refer & earn', '/account/refer'),
              link(Icons.support_agent, 'Support tickets', '/support'),
              link(Icons.settings_outlined, 'Account settings', '/account/settings'),
            ]),
          ],
          const SizedBox(height: 12),
          group([
            ListTile(
              leading: const Icon(Icons.contrast),
              title: const Text('Theme'),
              trailing: SegmentedButton<ThemeMode>(
                showSelectedIcon: false,
                style: const ButtonStyle(visualDensity: VisualDensity.compact),
                segments: const [
                  ButtonSegment(value: ThemeMode.system, label: Text('Auto')),
                  ButtonSegment(value: ThemeMode.light, label: Text('Light')),
                  ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
                ],
                selected: {mode},
                onSelectionChanged: (s) => ref.read(themeModeProvider.notifier).set(s.first),
              ),
            ),
            link(Icons.local_offer_outlined, 'Offers & coupons', '/offers'),
            link(Icons.help_outline, 'Help centre', '/help'),
          ]),
          if (user != null) ...[
            const SizedBox(height: 16),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: c.danger, side: BorderSide(color: c.danger.withValues(alpha: 0.4))),
              onPressed: () async {
                await ref.read(sessionProvider.notifier).signOut();
                if (context.mounted) toast(context, 'Signed out');
              },
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('Sign out'),
            ),
          ],
        ],
      ),
    );
  }
}
