// Route: /login — harbour gate. One page, one job: authenticate.
// Contract strings pinned by messenger_test.dart are preserved verbatim.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  final name = TextEditingController();
  final code = TextEditingController();

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
    code.dispose();
    super.dispose();
  }

  Future<void> _submit(SessionController session) async {
    await session.login(
      email: email.text,
      password: password.text,
      displayName: name.text,
    );
    if (session.authed) password.clear();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    return Scaffold(
      body: Column(
        children: [
          const StatusStrip(),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final wide = constraints.maxWidth >= 700;
                if (wide) {
                  return Row(
                    children: [
                      const SizedBox(width: 360, child: _GatePanel()),
                      Expanded(
                        child: Center(
                          child: SingleChildScrollView(
                            padding: const EdgeInsets.all(32),
                            child: SizedBox(
                              width: 400,
                              child: session.needsEmailVerify
                                  ? _VerifyCard(
                                      code: code,
                                      onVerify: () =>
                                          session.verifyEmailCode(code.text),
                                      onResend: session.resendVerifyCode,
                                    )
                                  : _GateForm(
                                      email: email,
                                      password: password,
                                      name: name,
                                      onSubmit: () => _submit(session),
                                    ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                }
                return Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 380),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const HarborWordmark(compact: false),
                          const SizedBox(height: 12),
                          if (session.needsEmailVerify)
                            _VerifyCard(
                              code: code,
                              onVerify: () => session.verifyEmailCode(code.text),
                              onResend: session.resendVerifyCode,
                            )
                          else
                            _GateForm(
                              email: email,
                              password: password,
                              name: name,
                              onSubmit: () => _submit(session),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Dispatch-board side panel: a working arrival board, not a hero.
class _GatePanel extends StatelessWidget {
  const _GatePanel();

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      color: dark ? HarborDark.surface : HarborLight.harbor,
      padding: const EdgeInsets.all(28),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: dark ? HarborDark.harbor : Colors.white,
                borderRadius: BorderRadius.circular(7),
              ),
              child: Text('LUNO',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.8,
                      color: dark ? HarborDark.onHarbor : HarborLight.harbor)),
            ),
            SizedBox(height: 10),
            Text('Connect Beyond Borders',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: dark ? HarborDark.ink : Colors.white.withValues(alpha: 0.85))),
            SizedBox(height: 28),
            for (final row in [
              ('01', context.l10n.authFastChat, context.l10n.authRealtimeSync),
              ('02', context.l10n.authGroups, context.l10n.authPollsEtc),
              ('03', context.l10n.authPaySend, context.l10n.authRightInRoom),
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(row.$1,
                        style: TextStyle(
                            fontSize: HarborType.small,
                            fontWeight: FontWeight.w800,
                            color: dark ? HarborDark.beacon : HarborLight.seaGlass)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(row.$2,
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: dark ? HarborDark.ink : Colors.white)),
                          const SizedBox(height: 2),
                          Text(row.$3,
                              style: TextStyle(
                                  fontSize: HarborType.small,
                                  color: dark
                                      ? HarborDark.drift
                                      : Colors.white.withValues(alpha: 0.7))),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            const Spacer(),
            Text(context.l10n.authHarborGate,
                style: TextStyle(
                    fontSize: HarborType.micro,
                    color: dark ? HarborDark.drift : Colors.white.withValues(alpha: 0.6))),
          ],
        ),
      ),
    );
  }
}

// F1: email verification step. Shown instead of the gate form while the
// account needs a code from its inbox.
class _VerifyCard extends StatelessWidget {
  final TextEditingController code;
  final Future<void> Function() onVerify;
  final Future<void> Function() onResend;
  const _VerifyCard({
    required this.code,
    required this.onVerify,
    required this.onResend,
  });

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final text = Theme.of(context).textTheme;
    return Card(
      color: dark ? HarborDark.surface : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(HarborRadius.card),
        side: BorderSide(color: dark ? HarborDark.channel : HarborLight.channel),
      ),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(context.l10n.verifyTitle, style: text.headlineSmall),
            const SizedBox(height: 4),
            Text(context.l10n.verifyCodeHint(session.verifyEmail),
                style: text.bodySmall),
            const SizedBox(height: 12),
            TextField(
              controller: code,
              decoration: InputDecoration(labelText: context.l10n.verifyCodeLabel),
              keyboardType: TextInputType.number,
              maxLength: 6,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: session.busy ? null : onVerify,
              child: Text(context.l10n.verifySubmit),
            ),
            TextButton(
              onPressed: session.busy ? null : onResend,
              child: Text(context.l10n.verifyResend),
            ),
          ],
        ),
      ),
    );
  }
}

class _GateForm extends StatelessWidget {
  final TextEditingController email;
  final TextEditingController password;
  final TextEditingController name;
  final Future<void> Function() onSubmit;
  const _GateForm({
    required this.email,
    required this.password,
    required this.name,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final register = session.registerMode;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final text = Theme.of(context).textTheme;
    return Card(
      color: dark ? HarborDark.surface : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(HarborRadius.card),
        side: BorderSide(color: dark ? HarborDark.channel : HarborLight.channel),
      ),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Image.asset(
              'assets/brand/luno-logo-horizontal-512.png',
              width: 150,
              height: 52,
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => const HarborWordmark(compact: false),
            ),
            const SizedBox(height: 10),
            Text(register ? context.l10n.createAccount : context.l10n.signInBtn, style: text.headlineSmall),
            const SizedBox(height: 4),
            Text('Connect Beyond Borders', style: text.bodySmall),
            Container(
              margin: const EdgeInsets.symmetric(vertical: 12),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
                borderRadius: BorderRadius.circular(HarborRadius.control),
              ),
              child: Text(context.l10n.authDemoHint,
                  style: TextStyle(
                      fontSize: HarborType.small,
                      fontWeight: FontWeight.w700,
                      color: dark ? HarborDark.ink : HarborLight.harbor)),
            ),
            TextField(controller: email, decoration: InputDecoration(labelText: context.l10n.verifyEmailLabel)),
            if (register)
              TextField(controller: name, decoration: InputDecoration(labelText: context.l10n.authDisplayName)),
            TextField(
              controller: password,
              obscureText: true,
              decoration: InputDecoration(labelText: context.l10n.authPasswordHint),
              onSubmitted: (_) => onSubmit(),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: session.busy ? null : onSubmit,
              child: Text(register ? context.l10n.authSignUp : context.l10n.signInBtn),
            ),
            TextButton(
              onPressed: () => SessionScope.of(context, listen: false)
                  .setRegisterMode(!register),
              child: Text(register ? context.l10n.authLoginExisting : context.l10n.authCreateNew),
            ),
          ],
        ),
      ),
    );
  }
}
