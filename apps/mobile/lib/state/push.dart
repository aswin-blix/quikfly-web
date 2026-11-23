// Phone notifications (Firebase Cloud Messaging). The API's cron pushes every new inbox row to the
// phones registered for the account (POST /me/push-devices). Android shows them itself while the
// app is in the background or closed; in the foreground this shows a banner and refreshes the inbox.
// Tapping one opens the same screen as its inbox row (core/notifications.dart).
//
// Switched on by the owner's Firebase project: android/app/src/<flavor>/google-services.json for
// both apps (git-ignored; see apps/mobile/README.md). Without it Firebase doesn't start and nothing
// here does anything: no prompt, no registration, the inbox works as before.
//
// Android 13+ asks the person once, from a prompt card at a moment it helps (the inbox, a confirmed
// booking, going live as a partner), never at launch. "Notifications on this phone" in the inbox
// turns them off for QuikFly without touching Android's settings.
// The registration-token calls (getToken, onTokenRefresh, deleteToken) are deprecated in
// firebase_messaging 17 in favour of register()/onRegistered, which hand out a Firebase Installation
// ID instead. The API sends with FCM HTTP v1's `message.token`, which takes the registration token,
// so these stay until the sender moves to installation IDs.
// ignore_for_file: deprecated_member_use
import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/notifications.dart';
import 'catalog.dart';
import 'providers.dart';

/// Shows foreground notifications as a banner; both apps pass it to MaterialApp.router.
final pushMessengerKey = GlobalKey<ScaffoldMessengerState>();

/// Android's prompt has been shown; the person said "Not now" to our card; turned off inside QuikFly.
const _askedKey = 'quikfly.push.asked';
const _dismissedKey = 'quikfly.push.dismissed';
const _offKey = 'quikfly.push.off';

/// unavailable: no Firebase project yet (or the phone has no Google Play services)
/// notAsked: Android hasn't shown its prompt (or the person dismissed our card: then [dismissed])
/// blocked: notifications are off for the app in Android settings
/// on / off: allowed by Android; [off] = turned off inside QuikFly
enum PushStatus { unavailable, notAsked, blocked, on, off }

class PushState {
  const PushState(this.status, {this.dismissed = false});
  final PushStatus status;
  final bool dismissed;

  /// The prompt card shows: Android can still ask, and the person hasn't said "Not now".
  bool get canAsk => status == PushStatus.notAsked && !dismissed;
}

class PushNotifier extends Notifier<PushState> {
  final _subs = <StreamSubscription<Object?>>[];
  GoRouter? _router;
  String? _token;
  bool _started = false;

  @override
  PushState build() {
    ref.onDispose(() { for (final s in _subs) { s.cancel(); } });
    return const PushState(PushStatus.unavailable);
  }

  /// Called once by each app after its first frame. Does nothing without a Firebase project.
  Future<void> start(GoRouter router) async {
    if (_started) return;
    _started = true;
    _router = router;
    try {
      await Firebase.initializeApp();
    } catch (_) {
      return; // no google-services.json in this build: push stays off
    }
    final fm = FirebaseMessaging.instance;
    await _refreshStatus();
    _subs.add(FirebaseMessaging.onMessage.listen(_foreground));
    _subs.add(FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data)));
    _subs.add(fm.onTokenRefresh.listen((t) => _register(token: t)));
    // A tap that launched the app from closed.
    final initial = await fm.getInitialMessage().catchError((_) => null);
    if (initial != null) WidgetsBinding.instance.addPostFrameCallback((_) => _open(initial.data));
    // Register for whoever is signed in, now and after each sign-in.
    ref.listen(userProvider.select((u) => u?.id), (_, id) { if (id != null) _register(); }, fireImmediately: true);
  }

  Future<void> _refreshStatus() async {
    final prefs = await SharedPreferences.getInstance();
    final settings = await FirebaseMessaging.instance.getNotificationSettings();
    final allowed = settings.authorizationStatus == AuthorizationStatus.authorized || settings.authorizationStatus == AuthorizationStatus.provisional;
    final asked = prefs.getBool(_askedKey) ?? false;
    final PushStatus status;
    if (allowed) {
      status = (prefs.getBool(_offKey) ?? false) ? PushStatus.off : PushStatus.on;
    } else {
      // Android reports "denied" both before and after its prompt; our own flag tells them apart.
      status = asked ? PushStatus.blocked : PushStatus.notAsked;
    }
    state = PushState(status, dismissed: prefs.getBool(_dismissedKey) ?? false);
  }

  /// "Turn on" on a prompt card: Android's own prompt (13+), then this phone is registered.
  Future<void> ask() async {
    if (state.status == PushStatus.unavailable) return;
    final prefs = await SharedPreferences.getInstance();
    await FirebaseMessaging.instance.requestPermission();
    await prefs.setBool(_askedKey, true);
    await prefs.remove(_offKey);
    await _refreshStatus();
    await _register();
  }

  /// "Not now": the card doesn't come back; the inbox still offers it.
  Future<void> dismiss() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_dismissedKey, true);
    state = PushState(state.status, dismissed: true);
  }

  /// The inbox switch: off forgets this phone on the API; on registers it again.
  Future<void> setEnabled(bool on) async {
    if (state.status != PushStatus.on && state.status != PushStatus.off) return;
    final prefs = await SharedPreferences.getInstance();
    if (on) {
      await prefs.remove(_offKey);
      state = const PushState(PushStatus.on);
      await _register();
    } else {
      await prefs.setBool(_offKey, true);
      state = const PushState(PushStatus.off);
      await _unregister();
    }
  }

  /// Before signing out, while the session is still valid: this phone stops getting the account's updates.
  Future<void> forget() async {
    if (state.status == PushStatus.unavailable) return;
    await _unregister();
    await FirebaseMessaging.instance.deleteToken().catchError((_) {});
    _token = null;
  }

  Future<void> _register({String? token}) async {
    if (state.status != PushStatus.on || ref.read(userProvider) == null) return;
    try {
      final t = token ?? await FirebaseMessaging.instance.getToken();
      if (t == null) return;
      _token = t;
      await ref.read(apiProvider).registerPushDevice(t, 'android');
    } catch (_) {/* tried again at the next start or sign-in */}
  }

  Future<void> _unregister() async {
    try {
      final t = _token ?? await FirebaseMessaging.instance.getToken();
      if (t != null && ref.read(apiProvider).token != null) await ref.read(apiProvider).removePushDevice(t);
    } catch (_) {/* the API drops a dead token on its own */}
  }

  void _foreground(RemoteMessage m) {
    ref.invalidate(notificationsProvider);
    final n = m.notification;
    if (n == null) return;
    pushMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 6),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(n.title ?? 'QuikFly', style: const TextStyle(fontWeight: FontWeight.w700)),
          if ((n.body ?? '').isNotEmpty) Text(n.body!, maxLines: 2, overflow: TextOverflow.ellipsis),
        ]),
        action: SnackBarAction(label: 'View', onPressed: () => _open(m.data)),
      ));
  }

  /// Opens what the notification is about: its screen in the customer app, the inbox otherwise.
  void _open(Map<String, dynamic> data) {
    final router = _router;
    if (router == null) return;
    ref.invalidate(notificationsProvider);
    final scope = ref.read(notificationScopeProvider);
    final booking = (data['bookingId'] as String?)?.trim();
    final path = notificationTarget('${data['kind'] ?? ''}', booking == null || booking.isEmpty ? null : booking, scope) ?? '/notifications';
    notificationSwitchesTab(path) ? router.go(path) : router.push(path);
  }
}

final pushProvider = NotifierProvider<PushNotifier, PushState>(PushNotifier.new);
