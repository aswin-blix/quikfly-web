// A refused referral code at sign-up says why, and leaves the new user free to try another or skip it.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:quikfly/api/api.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/screens/auth/login_screen.dart';
import 'package:quikfly/state/providers.dart';
import 'package:quikfly/theme/theme.dart';

const _next = ' You can try another code or continue without one.';

final _user = User.fromJson({'id': 'U1', 'name': 'Priya', 'phone': '9000000001', 'profileComplete': true});

class _Api extends QuikFlyApi {
  _Api(this.refusal) : super(baseUrl: 'http://test.invalid/v1');

  /// Thrown by the first code applied; a second one works.
  final Object refusal;
  final applied = <String>[];

  @override
  Future<void> sendOtp(String phone) async {}

  @override
  Future<AuthResult> verifyOtp(String phone, String otp) async => AuthResult('t', _user, true, false);

  @override
  Future<User> updateProfile(Map<String, dynamic> patch) async => _user;

  @override
  Future<User> applyReferral(String code) async {
    applied.add(code);
    if (applied.length == 1) throw refusal;
    return _user;
  }
}

class _Session extends SessionNotifier {
  @override
  Future<User?> build() async => null;

  @override
  Future<void> signIn(AuthResult r) async => state = AsyncData(r.user);

  @override
  void setUser(User u) => state = AsyncData(u);
}

/// Signs up as far as a refused code.
Future<_Api> _refused(WidgetTester t, Object refusal) async {
  final api = _Api(refusal);
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, _) => const Scaffold(body: Text('Home'))),
    GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
  ]);
  addTearDown(router.dispose);
  await t.pumpWidget(ProviderScope(
    overrides: [
      apiProvider.overrideWithValue(api),
      sessionProvider.overrideWith(_Session.new),
      configProvider.overrideWith((ref) => throw const ApiException('offline')),
    ],
    child: MaterialApp.router(theme: buildTheme(Brightness.light), routerConfig: router),
  ));
  router.push('/login');
  await t.pumpAndSettle();
  await t.enterText(find.byType(TextField).first, '9000000001');
  await t.tap(find.text('Send OTP'));
  await t.pumpAndSettle();
  await t.enterText(find.byType(TextField), '1234');
  await t.pumpAndSettle();
  await t.enterText(find.byType(TextField).first, 'Priya');
  await t.tap(find.text('Have a referral code?'));
  await t.pumpAndSettle();
  await t.enterText(find.byType(TextField).last, 'QF7K2M9P');
  await _create(t);
  return api;
}

Future<void> _create(WidgetTester t) async {
  await t.ensureVisible(find.text('Create my account'));
  await t.tap(find.text('Create my account'));
  await t.pumpAndSettle();
}

void main() {
  for (final reason in const [
    "That referral code doesn't exist.", // unknown
    "That referral code doesn't look right.", // wrong shape
    "You can't use your own referral code.",
    "You've already used a referral code.",
  ]) {
    testWidgets('says why: $reason', (t) async {
      final handle = t.ensureSemantics();
      await _refused(t, ApiException(reason, status: 400));
      expect(find.text('$reason$_next'), findsOneWidget);
      final spoken = find.semantics.byPredicate((n) => n.getSemanticsData().flagsCollection.isLiveRegion).evaluate();
      expect(spoken.map((n) => n.getSemanticsData().label), contains('$reason$_next'));
      expect(t.widget<TextField>(find.byType(TextField).last).controller!.text, isEmpty, reason: 'the refused code is cleared');
      handle.dispose();
    });
  }

  testWidgets('an unexpected failure stays generic, and still says what to do', (t) async {
    await _refused(t, StateError('internal detail'));
    expect(find.text('Something went wrong. Please try again.$_next'), findsOneWidget);
    expect(find.textContaining('internal detail'), findsNothing);
  });

  testWidgets('can continue without a code', (t) async {
    final api = await _refused(t, const ApiException("That referral code doesn't exist.", status: 400));
    await _create(t);
    expect(find.text('Home'), findsOneWidget);
    expect(api.applied, ['QF7K2M9P']);
  });

  testWidgets('can try another code', (t) async {
    final api = await _refused(t, const ApiException("That referral code doesn't exist.", status: 400));
    await t.enterText(find.byType(TextField).last, 'QF2222BB');
    await _create(t);
    expect(find.text('Home'), findsOneWidget);
    expect(api.applied, ['QF7K2M9P', 'QF2222BB']);
  });
}
