// End-to-end sign-up on the real LoginPage, the way a person does it:
// open "new account", fill every field, tick both consents, press sign up.
// The register request must leave the app (it never reached production).
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/auth.dart';
import 'package:luno_messenger/state/session.dart';

class _FakeHttp extends http.BaseClient {
  final List<String> paths = [];
  final List<String> bodies = [];
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
    paths.add('${request.method} ${request.url.path}');
    bodies.add(body);
    Object res = {};
    var status = 200;
    if (request.url.path.endsWith('/legal')) {
      res = {'terms_version': '2026-11-15.1', 'privacy_version': '2026-11-15.1'};
    } else if (request.url.path.endsWith('/auth/register')) {
      res = {'id': 'u1', 'email_verified': true};
      status = 201;
    } else if (request.url.path.endsWith('/auth/login')) {
      res = {'error': 'stop here'};
      status = 401;
    }
    return http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode(res))), status,
        headers: {'content-type': 'application/json'});
  }
}

Future<void> _signUp(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final fake = _FakeHttp();
  final s = SessionController(httpClient: fake);
  addTearDown(s.disposeAll);
  await tester.pumpWidget(SessionScope(
    notifier: s,
    child: MaterialApp(
        theme: LunoHarbor.theme(Brightness.light), home: const LoginPage()),
  ));
  await tester.pumpAndSettle();
  await tester.tap(find.text('새 LUNO 계정 만들기'));
  await tester.pumpAndSettle();
  await tester.enterText(find.widgetWithText(TextField, '이메일'), 'new@x.test');
  await tester.enterText(find.widgetWithText(TextField, '표시 이름'), '새사람');
  await tester.enterText(
      find.widgetWithText(TextField, '생년월일 (YYYY-MM-DD)'), '19900505');
  for (final box in find.byType(Checkbox).evaluate().toList()) {
    await tester.ensureVisible(find.byWidget(box.widget));
    await tester.tap(find.byWidget(box.widget));
    await tester.pumpAndSettle();
  }
  await tester.enterText(
      find.widgetWithText(TextField, '비밀번호 (12자 이상 권장)'), 'Abcd1234!xyz');
  final submit = find.widgetWithText(FilledButton, '가입');
  await tester.ensureVisible(submit);
  await tester.tap(submit);
  await tester.pumpAndSettle();
  expect(s.error, isEmpty, reason: 'form error: ${s.error}');
  expect(fake.paths, contains('POST /api/v1/auth/register'),
      reason: 'requests: ${fake.paths}');
  final reg = jsonDecode(
      fake.bodies[fake.paths.indexOf('POST /api/v1/auth/register')]) as Map;
  expect(reg['birthdate'], '1990-05-05');
  expect(reg['consent'], {'terms': '2026-11-15.1', 'privacy': '2026-11-15.1'});
}

void main() {
  testWidgets('phone: sign-up sends the register request', (tester) async {
    await _signUp(tester, const Size(412, 915));
  });
  testWidgets('unfolded Fold: sign-up sends the register request',
      (tester) async {
    await _signUp(tester, const Size(884, 1104));
  });

  // Build 14 field report: "the button did nothing, no message". The form
  // refused (no consent) but its error strip sat under the status bar.
  testWidgets('refused sign-up shows its error below the status bar',
      (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 40);
    addTearDown(tester.view.reset);
    final fake = _FakeHttp();
    final s = SessionController(httpClient: fake);
    addTearDown(s.disposeAll);
    await tester.pumpWidget(SessionScope(
      notifier: s,
      child: MaterialApp(
          theme: LunoHarbor.theme(Brightness.light), home: const LoginPage()),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('새 LUNO 계정 만들기'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, '이메일'), 'new@x.test');
    await tester.enterText(
        find.widgetWithText(TextField, '생년월일 (YYYY-MM-DD)'), '1990-05-05');
    final submit = find.widgetWithText(FilledButton, '가입');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();
    expect(s.error, isNotEmpty);
    expect(fake.paths, isNot(contains('POST /api/v1/auth/register')));
    // Inline line next to the button.
    expect(find.byKey(const Key('gate-form-error')), findsOneWidget);
    // Every copy of the message is drawn below the 40px status bar.
    for (final e in find.text(s.error).evaluate()) {
      final box = e.renderObject! as RenderBox;
      expect(box.localToGlobal(Offset.zero).dy, greaterThanOrEqualTo(40));
    }
  });

  testWidgets('tapping the consent sentence ticks the box', (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final s = SessionController(httpClient: _FakeHttp());
    addTearDown(s.disposeAll);
    await tester.pumpWidget(SessionScope(
      notifier: s,
      child: MaterialApp(
          theme: LunoHarbor.theme(Brightness.light), home: const LoginPage()),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('새 LUNO 계정 만들기'));
    await tester.pumpAndSettle();
    final first = find.byType(Checkbox).first;
    expect(tester.widget<Checkbox>(first).value, isFalse);
    final sentence = find.descendant(
        of: find.ancestor(of: first, matching: find.byType(Row)).first,
        matching: find.byType(InkWell));
    await tester.ensureVisible(sentence.first);
    await tester.tap(sentence.first);
    await tester.pumpAndSettle();
    expect(tester.widget<Checkbox>(find.byType(Checkbox).first).value, isTrue);
  });
}
