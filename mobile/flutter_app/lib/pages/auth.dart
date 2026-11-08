// Route: /login — harbour gate. One page, one job: authenticate.
// Contract strings pinned by messenger_test.dart are preserved verbatim.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  final name = TextEditingController();

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
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
                final wide = constraints.maxWidth >= 760;
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
                              child: _GateForm(
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
            const SizedBox(height: 10),
            Text('Connect Beyond Borders',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: dark ? HarborDark.ink : Colors.white.withValues(alpha: 0.85))),
            const SizedBox(height: 28),
            for (final row in const [
              ('01', '종단간 암호화 대화', 'Letter Sealing'),
              ('02', '실시간 AI 번역', '6개 언어'),
              ('03', 'LUNO Pay 송금', '대화방에서 바로'),
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(row.$1,
                        style: TextStyle(
                            fontSize: 12,
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
                                  fontSize: 12,
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
            Text('하버 게이트 v3',
                style: TextStyle(
                    fontSize: 11,
                    color: dark ? HarborDark.drift : Colors.white.withValues(alpha: 0.6))),
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
            Text(register ? '회원가입' : '로그인', style: text.headlineSmall),
            const SizedBox(height: 4),
            Text('Connect Beyond Borders', style: text.bodySmall),
            Container(
              margin: const EdgeInsets.symmetric(vertical: 12),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
                borderRadius: BorderRadius.circular(HarborRadius.control),
              ),
              child: Text('💡 데모 계정: user@luno.local / LunoUser#2026!',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: dark ? HarborDark.ink : HarborLight.harbor)),
            ),
            TextField(controller: email, decoration: const InputDecoration(labelText: '이메일')),
            if (register)
              TextField(controller: name, decoration: const InputDecoration(labelText: '표시 이름')),
            TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: '비밀번호 (12자 이상 권장)'),
              onSubmitted: (_) => onSubmit(),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: session.busy ? null : onSubmit,
              child: Text(register ? '가입' : '로그인'),
            ),
            TextButton(
              onPressed: () => SessionScope.of(context, listen: false)
                  .setRegisterMode(!register),
              child: Text(register ? '기존 계정으로 로그인' : '새 LUNO 계정 만들기'),
            ),
          ],
        ),
      ),
    );
  }
}
