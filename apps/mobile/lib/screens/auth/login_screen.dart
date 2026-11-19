// Sign in / sign up: phone → OTP → (first time only) "complete your profile".
// Same steps and messages as the website's LoginModal. Pops with true once signed in.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/env.dart';
import '../../core/format.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/logo.dart';
import '../../widgets/ui.dart';

/// Opens the login screen unless already signed in. Returns true when signed in.
Future<bool> ensureSignedIn(BuildContext context, WidgetRef ref) async {
  if (ref.read(userProvider) != null) return true;
  final ok = await context.push<bool>('/login');
  return ok == true;
}

enum _Step { phone, otp, profile }

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.showReferral = true, this.intro = customerIntro});

  static const customerIntro = "One account for rides, buses, holidays and rentals. New here? We'll create your account after the OTP.";

  /// The QuikFly Partner app hides the customer referral code.
  final bool showReferral;

  /// The line under the logo (the Partner app passes its own).
  final String intro;
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  var _step = _Step.phone;
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _code = TextEditingController();
  var _showCode = false;
  var _busy = false;
  String? _err;

  static const _titles = {_Step.phone: 'Login or sign up', _Step.otp: 'Verify OTP', _Step.profile: 'Complete your profile'};

  @override
  void dispose() {
    for (final c in [_phone, _otp, _name, _email, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await fn();
    } catch (e) {
      if (mounted) setState(() => _err = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  void _send() {
    if (!Rules.phone.hasMatch(_phone.text)) {
      setState(() => _err = 'Enter a valid 10-digit mobile number');
      return;
    }
    _run(() async {
      await ref.read(apiProvider).sendOtp(_phone.text);
      setState(() => _step = _Step.otp);
    });
  }

  void _verify() => _run(() async {
        final r = await ref.read(apiProvider).verifyOtp('+91 ${_phone.text}', _otp.text);
        await ref.read(sessionProvider.notifier).signIn(r);
        if (!mounted) return;
        if (r.restored) toast(context, 'Welcome back! Your account deletion was cancelled.');
        if (r.isNew) {
          setState(() => _step = _Step.profile);
          return;
        }
        if (!r.restored) toast(context, 'Welcome back, ${r.user.firstName}!');
        context.pop(true);
      });

  void _finish() {
    final name = _name.text.trim();
    final email = _email.text.trim();
    if (name.length < Rules.nameMin) {
      setState(() => _err = 'Please enter your name');
      return;
    }
    if (email.isNotEmpty && !Rules.email.hasMatch(email)) {
      setState(() => _err = 'Enter a valid email or leave it empty');
      return;
    }
    _run(() async {
      final api = ref.read(apiProvider);
      final session = ref.read(sessionProvider.notifier);
      final settings = ref.read(configProvider).value?.settings;
      var user = await api.updateProfile({'name': name, if (email.isNotEmpty) 'email': email});
      session.setUser(user);
      final code = Rules.compactCode(_code.text);
      if (code.isNotEmpty) {
        try {
          user = await api.applyReferral(code);
          session.setUser(user);
          if (mounted) toast(context, 'Referral applied: ${inr(settings?.referralBonus ?? 0)} added to your wallet');
        } catch (e) {
          // The profile is saved; let them fix the code or skip it.
          _code.clear();
          setState(() => _showCode = true);
          throw Exception('${errorText(e)} You can try another code or continue without one.');
        }
      }
      if (!mounted) return;
      final credit = settings?.welcomeCredit ?? 0;
      toast(context, 'Welcome to QuikFly, ${user.firstName}!${credit > 0 ? ' ${inr(credit)} is in your wallet.' : ''}');
      context.pop(true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final t = Theme.of(context).textTheme;
    return PopScope(
      // Sign-up can't be abandoned half-way: the account exists, so leaving counts as signed in.
      canPop: _step != _Step.profile,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _step == _Step.profile) context.pop(true);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(_titles[_step]!),
          leading: _step == _Step.otp
              ? IconButton(icon: const Icon(Icons.arrow_back), tooltip: 'Change number', onPressed: () => setState(() {
                    _step = _Step.phone;
                    _otp.clear();
                    _err = null;
                  }))
              : null,
        ),
        body: SafeArea(
          child: ScreenList(children: [
            if (_step == _Step.phone) ...[
              const Center(child: AppLogo(height: 72)),
              const SizedBox(height: 16),
              Text(widget.intro, style: TextStyle(color: c.fgMuted)),
              const SizedBox(height: 20),
              TextField(
                controller: _phone,
                autofocus: true,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumberNational],
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
                decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91  ', hintText: '98765 43210'),
                onSubmitted: (_) => _send(),
              ),
              FormError(_err),
              const SizedBox(height: 12),
              GoldButton(label: 'Send OTP', loading: _busy, onPressed: _send),
              const SizedBox(height: 12),
              Text("By continuing you agree to QuikFly's Terms and Privacy Policy.",
                  textAlign: TextAlign.center, style: t.bodySmall?.copyWith(color: c.fgSubtle)),
            ],
            if (_step == _Step.otp) ...[
              Text('Enter the 4-digit code sent to ${phoneDisplay(_phone.text)}.', style: TextStyle(color: c.fgMuted)),
              const SizedBox(height: 20),
              _OtpBoxes(controller: _otp, onChanged: () => setState(() {}), onDone: _verify),
              if (demoOtp.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text.rich(TextSpan(style: TextStyle(color: c.accent, fontSize: 13), children: [
                  const TextSpan(text: 'Demo: no SMS is sent. Use OTP '),
                  TextSpan(text: demoOtp, style: const TextStyle(fontWeight: FontWeight.w700)),
                ])),
              ],
              FormError(_err),
              const SizedBox(height: 12),
              GoldButton(label: 'Verify & continue', loading: _busy, onPressed: _otp.text.length == 4 ? _verify : null),
            ],
            if (_step == _Step.profile) ...[
              Text("You're in! Tell us your name so drivers and bus operators know who to look for.", style: TextStyle(color: c.fgMuted)),
              const SizedBox(height: 20),
              TextField(
                controller: _name,
                autofocus: true,
                textCapitalization: TextCapitalization.words,
                autofillHints: const [AutofillHints.name],
                maxLength: Rules.nameMax,
                decoration: const InputDecoration(labelText: 'Full name', hintText: 'e.g. Priya Raman', counterText: ''),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(labelText: 'Email (optional)', helperText: 'For tickets and invoices', hintText: 'you@example.com'),
              ),
              const SizedBox(height: 10),
              if (!widget.showReferral || !(ref.watch(configProvider).value?.settings.featureReferral ?? true))
                const SizedBox.shrink()
              else if (_showCode)
                TextField(
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(
                    labelText: 'Referral code',
                    hintText: 'e.g. QF7K2M9P',
                    helperText: 'You and your friend each get ${inr(ref.watch(configProvider).value?.settings.referralBonus ?? 0)} in your wallets.',
                  ),
                )
              else
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                      onPressed: () => setState(() => _showCode = true), icon: const Icon(Icons.card_giftcard, size: 18), label: const Text('Have a referral code?')),
                ),
              FormError(_err),
              const SizedBox(height: 12),
              GoldButton(label: 'Create my account', loading: _busy, onPressed: _finish),
            ],
          ]),
        ),
      ),
    );
  }
}

/// Four boxes over one hidden field, so paste and SMS autofill work.
class _OtpBoxes extends StatelessWidget {
  const _OtpBoxes({required this.controller, required this.onChanged, required this.onDone});
  final TextEditingController controller;
  final VoidCallback onChanged;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final v = controller.text;
    return Stack(children: [
      Row(children: [
        for (var i = 0; i < 4; i++) ...[
          if (i > 0) const SizedBox(width: 12),
          Expanded(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              height: 58,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: c.field,
                borderRadius: BorderRadius.circular(Brand.radiusField),
                border: Border.all(color: v.length == i ? c.accent : c.border, width: v.length == i ? 1.6 : 1),
              ),
              child: Text(i < v.length ? v[i] : '', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: c.fgStrong)),
            ),
          ),
        ],
      ]),
      Positioned.fill(
        child: Opacity(
          opacity: 0,
          child: TextField(
            controller: controller,
            autofocus: true,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
            showCursor: false,
            decoration: const InputDecoration(border: InputBorder.none, filled: false, counterText: ''),
            onChanged: (s) {
              onChanged();
              if (s.length == 4) onDone();
            },
          ),
        ),
      ),
    ]);
  }
}
