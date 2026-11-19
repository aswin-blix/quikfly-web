// The app language (English, Tamil, Hindi), saved on the phone. Strings come from
// packages/shared/i18n/app_<lang>.arb (shared with the website) through the generated
// lib/l10n (L.of(context).key). Until the owner turns on Settings → featureLanguages the
// app stays English and the picker is hidden; screens move their text into the catalog at
// the feature freeze before launch (docs/roadmap.md).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/app_localizations.dart';
import '../state/providers.dart';

/// Codes with their own names, in menu order.
const appLanguages = {'en': 'English', 'ta': 'தமிழ்', 'hi': 'हिन्दी'};

class LanguageNotifier extends Notifier<String> {
  static const _key = 'quikfly.lang';

  @override
  String build() {
    SharedPreferences.getInstance().then((p) {
      final v = p.getString(_key);
      if (v != null && appLanguages.containsKey(v)) state = v;
    });
    return 'en';
  }

  Future<void> set(String code) async {
    if (!appLanguages.containsKey(code)) return;
    state = code;
    (await SharedPreferences.getInstance()).setString(_key, code);
  }
}

final languageProvider = NotifierProvider<LanguageNotifier, String>(LanguageNotifier.new);

/// The owner's switch (Settings → featureLanguages); off when /config hasn't loaded.
final languagesEnabledProvider = Provider<bool>((ref) => ref.watch(configProvider).value?.settings.featureLanguages ?? false);

/// What MaterialApp uses: the chosen language while the switch is on, otherwise English.
final appLocaleProvider = Provider<Locale>((ref) => Locale(ref.watch(languagesEnabledProvider) ? ref.watch(languageProvider) : 'en'));

/// MaterialApp's localisation setup, shared by both apps.
const localizationsDelegates = L.localizationsDelegates;
const supportedLocales = L.supportedLocales;

/// "Language: English / தமிழ் / हिन्दी", shown only while the owner's switch is on.
class LanguagePicker extends ConsumerWidget {
  const LanguagePicker({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(languagesEnabledProvider)) return const SizedBox.shrink();
    final current = ref.watch(languageProvider);
    return ListTile(
      leading: const Icon(Icons.translate),
      title: Text(L.of(context).langMenu),
      trailing: DropdownButton<String>(
        value: current,
        underline: const SizedBox.shrink(),
        items: [
          for (final e in appLanguages.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
        ],
        onChanged: (v) => v == null ? null : ref.read(languageProvider.notifier).set(v),
      ),
    );
  }
}
