// Route: /login — harbour gate. One page, one job: authenticate.
// Contract strings pinned by messenger_test.dart are preserved verbatim.
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';
import '../util/legal.dart';

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
  final birthdate = TextEditingController();
  bool agreeTerms = false;
  bool agreePrivacy = false;
  bool _legalLoaded = false;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
    code.dispose();
    birthdate.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_legalLoaded) {
      _legalLoaded = true;
      SessionScope.of(context, listen: false).loadLegalVersions();
    }
  }

  Future<void> _openLegal(SessionController session, String doc) async {
    // Canonical Korean docs keep their short names; others are suffixed.
    final file =
        session.locale == 'ko' ? '$doc.html' : '$doc.${session.locale}.html';
    final uri = Uri.parse('${session.api.baseUrl}/legal/$file');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      session.formError(uri.host);
    }
  }

  Future<void> _submit(SessionController session) async {
    // Client pre-checks are UX only (and keep an under-14 birthdate on the
    // device); the server re-verifies everything.
    if (session.registerMode) {
      if (!agreeTerms || !agreePrivacy) {
        session.formError(context.l10n.consentRequiredErr);
        return;
      }
      birthdate.text = normalizeBirthdate(birthdate.text);
      final age = ageOnDate(birthdate.text, todayUtc());
      if (birthdate.text.trim().isEmpty || age == null) {
        session.formError(context.l10n.birthdateRequiredErr);
        return;
      }
      if (age < 14) {
        session.formError(context.l10n.underageErr);
        return;
      }
    }
    await session.login(
      email: email.text,
      password: password.text,
      displayName: name.text,
      birthdate: birthdate.text.trim(),
      agreeTerms: agreeTerms,
      agreePrivacy: agreePrivacy,
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
                              child: session.needsReconsent
                                  ? _ReconsentCard(
                                      agreeTerms: agreeTerms,
                                      agreePrivacy: agreePrivacy,
                                      onAgreeTerms: (v) =>
                                          setState(() => agreeTerms = v),
                                      onAgreePrivacy: (v) =>
                                          setState(() => agreePrivacy = v),
                                      onOpenLegal: (doc) =>
                                          _openLegal(session, doc),
                                      onSubmit: () => session.submitReconsent(
                                          email: email.text,
                                          password: password.text),
                                    )
                                  : session.needsEmailVerify
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
                                      birthdate: birthdate,
                                      agreeTerms: agreeTerms,
                                      agreePrivacy: agreePrivacy,
                                      onAgreeTerms: (v) =>
                                          setState(() => agreeTerms = v),
                                      onAgreePrivacy: (v) =>
                                          setState(() => agreePrivacy = v),
                                      onOpenLegal: (doc) =>
                                          _openLegal(session, doc),
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
                          if (session.needsReconsent)
                            _ReconsentCard(
                              agreeTerms: agreeTerms,
                              agreePrivacy: agreePrivacy,
                              onAgreeTerms: (v) =>
                                  setState(() => agreeTerms = v),
                              onAgreePrivacy: (v) =>
                                  setState(() => agreePrivacy = v),
                              onOpenLegal: (doc) => _openLegal(session, doc),
                              onSubmit: () => session.submitReconsent(
                                  email: email.text, password: password.text),
                            )
                          else if (session.needsEmailVerify)
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
                              birthdate: birthdate,
                              agreeTerms: agreeTerms,
                              agreePrivacy: agreePrivacy,
                              onAgreeTerms: (v) =>
                                  setState(() => agreeTerms = v),
                              onAgreePrivacy: (v) =>
                                  setState(() => agreePrivacy = v),
                              onOpenLegal: (doc) => _openLegal(session, doc),
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
  final TextEditingController birthdate;
  final bool agreeTerms;
  final bool agreePrivacy;
  final ValueChanged<bool> onAgreeTerms;
  final ValueChanged<bool> onAgreePrivacy;
  final ValueChanged<String> onOpenLegal;
  final Future<void> Function() onSubmit;
  const _GateForm({
    required this.email,
    required this.password,
    required this.name,
    required this.birthdate,
    required this.agreeTerms,
    required this.agreePrivacy,
    required this.onAgreeTerms,
    required this.onAgreePrivacy,
    required this.onOpenLegal,
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
            const SizedBox(height: 16),
            TextField(controller: email, decoration: InputDecoration(labelText: context.l10n.verifyEmailLabel)),
            if (register)
              TextField(controller: name, decoration: InputDecoration(labelText: context.l10n.authDisplayName)),
            // F24: birthdate verifies age (never stored); both consents are
            // mandatory. Client checks are UX only — the server re-verifies.
            if (register)
              TextField(
                controller: birthdate,
                decoration: InputDecoration(
                  labelText: context.l10n.birthdateLabel,
                  hintText: '1990-01-01',
                  suffixIcon: IconButton(
                    tooltip: context.l10n.birthdateLabel,
                    icon: const Icon(Icons.calendar_month_outlined),
                    onPressed: () async {
                      final now = DateTime.now();
                      final initial = DateTime.tryParse(
                              normalizeBirthdate(birthdate.text)) ??
                          DateTime(now.year - 20, 1, 1);
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: initial.isAfter(now) ? now : initial,
                        firstDate: DateTime(1900),
                        lastDate: now,
                        initialEntryMode: DatePickerEntryMode.calendarOnly,
                      );
                      if (picked != null) {
                        String two(int v) => v.toString().padLeft(2, '0');
                        birthdate.text =
                            '${picked.year}-${two(picked.month)}-${two(picked.day)}';
                      }
                    },
                  ),
                ),
                keyboardType: TextInputType.datetime,
              ),
            if (register)
              _ConsentRow(
                value: agreeTerms,
                onChanged: onAgreeTerms,
                label: context.l10n.consentTerms,
                linkLabel: context.l10n.consentViewTerms,
                onOpenLink: () => onOpenLegal('terms'),
              ),
            if (register)
              _ConsentRow(
                value: agreePrivacy,
                onChanged: onAgreePrivacy,
                label: context.l10n.consentPrivacy,
                linkLabel: context.l10n.consentViewPrivacy,
                onOpenLink: () => onOpenLegal('privacy'),
              ),
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

/// F24: one mandatory consent checkbox with a link to the full document.
class _ConsentRow extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  final String label;
  final String linkLabel;
  final VoidCallback onOpenLink;
  const _ConsentRow({
    required this.value,
    required this.onChanged,
    required this.label,
    required this.linkLabel,
    required this.onOpenLink,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Checkbox(
          value: value,
          onChanged: (v) => onChanged(v ?? false),
        ),
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.bodySmall),
        ),
        TextButton(
          onPressed: onOpenLink,
          child: Text(linkLabel),
        ),
      ],
    );
  }
}

/// F24: re-consent step after a CONSENT_STALE login. Same checkboxes as
/// signup; submitting retries the login with fresh agreement attached.
class _ReconsentCard extends StatelessWidget {
  final bool agreeTerms;
  final bool agreePrivacy;
  final ValueChanged<bool> onAgreeTerms;
  final ValueChanged<bool> onAgreePrivacy;
  final ValueChanged<String> onOpenLegal;
  final Future<void> Function() onSubmit;
  const _ReconsentCard({
    required this.agreeTerms,
    required this.agreePrivacy,
    required this.onAgreeTerms,
    required this.onAgreePrivacy,
    required this.onOpenLegal,
    required this.onSubmit,
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
            Text(context.l10n.consentStaleTitle, style: text.headlineSmall),
            const SizedBox(height: 4),
            Text(context.l10n.consentStaleNote, style: text.bodySmall),
            const SizedBox(height: 12),
            _ConsentRow(
              value: agreeTerms,
              onChanged: onAgreeTerms,
              label: context.l10n.consentTerms,
              linkLabel: context.l10n.consentViewTerms,
              onOpenLink: () => onOpenLegal('terms'),
            ),
            _ConsentRow(
              value: agreePrivacy,
              onChanged: onAgreePrivacy,
              label: context.l10n.consentPrivacy,
              linkLabel: context.l10n.consentViewPrivacy,
              onOpenLink: () => onOpenLegal('privacy'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: session.busy || !agreeTerms || !agreePrivacy
                  ? null
                  : onSubmit,
              child: Text(context.l10n.signInBtn),
            ),
          ],
        ),
      ),
    );
  }
}
