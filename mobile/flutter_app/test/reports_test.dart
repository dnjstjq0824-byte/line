import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/home.dart';
import 'package:luno_messenger/pages/reports.dart';
import 'package:luno_messenger/state/session.dart';

// F4: friend-row report sheet files a report; the reports page lists mine.
class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  final List<String> calls = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
    calls.add('${request.method} ${request.url.path} $body');
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

Widget _wrap(SessionController s, Widget home) => SessionScope(
      notifier: s,
      child: MaterialApp(
        theme: LunoHarbor.theme(Brightness.light),
        home: Scaffold(body: home),
      ),
    );

void main() {
  testWidgets('friend menu files a report', (WidgetTester tester) async {
    final fake = FakeHttp();
    fake.handler = (req, body) async {
      if (req.url.path.endsWith('/reports') && req.method == 'POST') {
        return jsonRes({'id': 'r1'}, 201);
      }
      return jsonRes({'reports': []}, 200);
    };
    final s = SessionController(httpClient: fake)
      ..selfId = 'u1'
      ..selfName = 'Me'
      ..friends = [
        {'id': 'u2', 'display_name': 'Spammer'}
      ];
    addTearDown(s.disposeAll);
    await tester.pumpWidget(_wrap(s, const HomePage()));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('친구 관리').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('신고하기'));
    await tester.pumpAndSettle();
    expect(find.textContaining('사용자 신고'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, '상세 내용 (선택)'), 'ads daily');
    await tester.tap(find.text('신고 접수'));
    await tester.pumpAndSettle();
    expect(
        fake.calls.any((c) =>
            c.contains('POST /api/v1/reports') &&
            c.contains('"subject_user_id":"u2"') &&
            c.contains('"category":"spam"') &&
            c.contains('"details":"ads daily"')),
        isTrue);
  });

  testWidgets('reports page lists my history', (WidgetTester tester) async {
    final fake = FakeHttp();
    fake.handler = (req, body) async => jsonRes({
          'reports': [
            {
              'id': 'r1',
              'subject_user_id': 'u2',
              'category': 'spam',
              'details': 'ads',
              'state': 'open',
              'created_at': '2026-11-14'
            },
            {
              'id': 'r2',
              'subject_user_id': 'u3',
              'category': 'abuse',
              'details': '',
              'state': 'resolved',
              'created_at': '2026-11-13'
            },
          ]
        }, 200);
    final s = SessionController(httpClient: fake)..selfId = 'u1';
    addTearDown(s.disposeAll);
    await tester.pumpWidget(_wrap(s, const ReportsPage()));
    await tester.pumpAndSettle();
    expect(find.text('내 신고 내역'), findsOneWidget);
    expect(find.text('spam'), findsOneWidget);
    expect(find.textContaining('처리 중'), findsOneWidget);
    expect(find.textContaining('처리 완료'), findsOneWidget);
    expect(fake.calls, contains('GET /api/v1/reports/mine '));
  });
}
