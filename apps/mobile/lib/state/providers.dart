// App-wide state: the API client, start-up config, the signed-in user and the theme.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api.dart';
import '../api/models.dart';
import 'checkout.dart';

final apiProvider = Provider<QuikFlyApi>((ref) => QuikFlyApi());

/// GET /config: settings and every list the screens show. Pull-to-refresh invalidates it.
final configProvider = FutureProvider<AppConfig>((ref) => ref.watch(apiProvider).config());

const _tokenKey = 'quikfly.token';
const _storage = FlutterSecureStorage();

/// The signed-in customer, or null. Loading while the saved token is checked at start-up.
class SessionNotifier extends AsyncNotifier<User?> {
  QuikFlyApi get _api => ref.read(apiProvider);

  @override
  Future<User?> build() async {
    _api.onUnauthorised = _forget;
    final saved = await _storage.read(key: _tokenKey);
    if (saved == null) return null;
    _api.token = saved;
    try {
      return await _api.me();
    } on ApiException catch (e) {
      if (e.unauthorised) {
        await _forget();
        return null;
      }
      rethrow;
    }
  }

  Future<void> signIn(AuthResult r) async {
    _api.token = r.token;
    await _storage.write(key: _tokenKey, value: r.token);
    state = AsyncData(r.user);
  }

  /// Replace the user after an API call that returns it (profile, licence, referral...).
  void setUser(User u) => state = AsyncData(u);

  /// Reload the user (wallet balance after a booking or cancellation).
  Future<void> refresh() async {
    if (_api.token == null) return;
    try {
      state = AsyncData(await _api.me());
    } on ApiException catch (_) {/* keep the last known user */}
  }

  Future<void> signOut({bool everywhere = false}) async {
    try {
      everywhere ? await _api.logoutEverywhere() : await _api.logout();
    } on ApiException catch (_) {/* signing out locally is what matters */}
    await _forget();
    // A parcel draft holds someone else's name and number.
    if (ref.read(checkoutProvider)?.parcel != null) ref.read(checkoutProvider.notifier).set(null);
  }

  Future<void> _forget() async {
    _api.token = null;
    await _storage.delete(key: _tokenKey);
    state = const AsyncData(null);
  }
}

final sessionProvider = AsyncNotifierProvider<SessionNotifier, User?>(SessionNotifier.new);

/// The signed-in user once known (null while loading or signed out).
final userProvider = Provider<User?>((ref) => ref.watch(sessionProvider).value);

/// Light / dark / device. Follows the device until the user picks one; the choice is saved.
class ThemeModeNotifier extends Notifier<ThemeMode> {
  static const _key = 'quikfly.theme';

  @override
  ThemeMode build() {
    SharedPreferences.getInstance().then((p) {
      final v = p.getString(_key);
      if (v != null) state = ThemeMode.values.firstWhere((m) => m.name == v, orElse: () => ThemeMode.system);
    });
    return ThemeMode.system;
  }

  Future<void> set(ThemeMode m) async {
    state = m;
    (await SharedPreferences.getInstance()).setString(_key, m.name);
  }
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);
