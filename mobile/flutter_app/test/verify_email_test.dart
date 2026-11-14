import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/auth.dart';
import 'package:luno_messenger/state/session.dart';

// F1: email verification on the app. Register/login surface the verify
// step when the server demands it; the card verifies and resends codes.
class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  final List<String> paths = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
    paths.add('${request.method} ${request.url.path}');
    final res = await handler!(request, body);
    return http.StreamedResponse(
      Stream.value(utf8.encode(res.body)),
      res.statusCode,
      headers: {'content-type': 'application/json'},
    );
  }
}

http.Response jsonRes(Object body, int status) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

void main() {
  test('register needing verification arms the verify step', () async {
    final fake = FakeHttp();
    fake.handler = (req, body) async {
      if (req.url.path.endsWith('/auth/register')) {
        return jsonRes({'id': 'u1', 'email_verified': false}, 201);
      }
      return jsonRes({}, 200);
    };
    final s = SessionController(httpClient: fake)..registerMode = true;
    addTearDown(s.disposeAll);
    await s.login(email: 'a@x.test', password: 'pw', displayName: 'A');
    expect(s.needsEmailVerify, isTrue);
    expect(s.verifyEmail, 'a@x.test');
  });

  test('gated login arms the verify step, verify clears it', () async {
    final fake = FakeHttp();
    fake.handler = (req, body) async {
      if (req.url.path.endsWith('/auth/login')) {
        return jsonRes(
            {'error': 'email not verified', 'code': 'EMAIL_NOT_VERIFIED'}, 403);
      }
      if (req.url.path.endsWith('/auth/verify-email')) {
        return jsonRes({'status': 'verified'}, 200);
      }
      return jsonRes({}, 200);
    };
    final s = SessionController(httpClient: fake);
    addTearDown(s.disposeAll);
    await s.login(email: 'a@x.test', password: 'pw', displayName: '');
    expect(s.needsEmailVerify, isTrue);
    expect(s.authed, isFalse);
    await s.verifyEmailCode('123456');
    expect(s.needsEmailVerify, isFalse);
    expect(
        fake.paths,
        contains('POST /api/v1/auth/verify-email'));
    await s.resendVerifyCode();
    expect(fake.paths, contains('POST /api/v1/auth/verify-email/resend'));
  });

  testWidgets('login page swaps to the verify card', (WidgetTester tester) async {
    final fake = FakeHttp();
    fake.handler = (req, body) async => jsonRes({'status': 'verified'}, 200);
    final s = SessionController(httpClient: fake)
      ..needsEmailVerify = true
      ..verifyEmail = 'a@x.test';
    addTearDown(s.disposeAll);
    await tester.pumpWidget(
      SessionScope(
        notifier: s,
        child: MaterialApp(
          theme: LunoHarbor.theme(Brightness.light),
          home: const LoginPage(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('이메일 인증'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, '인증번호'), '123456');
    await tester.tap(find.text('인증하기'));
    await tester.pumpAndSettle();
    expect(fake.paths, contains('POST /api/v1/auth/verify-email'));
    expect(s.needsEmailVerify, isFalse);
  });
}
