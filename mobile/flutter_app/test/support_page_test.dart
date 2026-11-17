import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/settings.dart';
import 'package:luno_messenger/pages/support.dart';
import 'package:luno_messenger/state/session.dart';

// A5 (F30 app): settings > support files an inquiry (category, body, auto
// app version) and lists my tickets with admin answers.
class _SupportFake extends http.BaseClient {
  final List<Map<String, dynamic>> calls = [];
  Map<String, dynamic> ticketList = {'tickets': []};

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    dynamic data;
    if (request is http.Request && request.body.isNotEmpty) {
      data = jsonDecode(request.body);
    }
    calls.add({
      'method': request.method,
      'path': request.url.path,
      'data': data,
    });
    Object body = {};
    if (request.method == 'POST' &&
        request.url.path.endsWith('/support/tickets')) {
      body = {'id': 'sup-1'};
    } else if (request.method == 'GET' &&
        request.url.path.endsWith('/support/tickets')) {
      body = ticketList;
    }
    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(body))),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
}

SessionController _session(_SupportFake fake) {
  final s = SessionController(httpClient: fake)
    ..selfName = '도도'
    ..currentAppVersion = '2.0.0+11';
  addTearDown(s.disposeAll);
  return s;
}

Widget _wrap(SessionController session, Widget child) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: Scaffold(body: child),
    ),
  );
}

void main() {
  test('filing posts path and body with auto app version', () async {
    final fake = _SupportFake();
    final s = _session(fake);
    await s.fileSupportTicket('bug', '사진이 안 보여요');
    final post = fake.calls.firstWhere((c) => c['method'] == 'POST');
    expect(post['path'], endsWith('/api/v1/support/tickets'));
    final data = post['data'] as Map;
    expect(data['category'], 'bug');
    expect(data['body'], '사진이 안 보여요');
    expect(data['app_version'], '2.0.0+11');
    expect(data['device_info'], isNotEmpty);
    expect(fake.calls.any((c) => c['method'] == 'GET'), isTrue,
        reason: 'list reloads after filing');
    expect(s.notice, '문의가 접수되었습니다.');
  });

  testWidgets('support page files from the form and shows the answer',
      (WidgetTester tester) async {
    final fake = _SupportFake();
    await tester.pumpWidget(_wrap(_session(fake), const SupportPage()));
    await tester.pumpAndSettle();
    expect(find.text('문의하기'), findsOneWidget);
    expect(find.text('오류 신고'), findsOneWidget);
    expect(find.text('접수한 문의가 없습니다.'), findsOneWidget);
    // An empty body never posts.
    await tester.tap(find.byKey(const ValueKey('support-submit')));
    await tester.pumpAndSettle();
    expect(fake.calls.where((c) => c['method'] == 'POST'), isEmpty);
    // Filing posts, clears the field, and the reload shows the ticket.
    fake.ticketList = {
      'tickets': [
        {
          'id': 'sup-1',
          'category': 'bug',
          'body': '사진이 안 보여요',
          'status': 'answered',
          'answer': '최신 버전으로 업데이트해 보세요.',
        }
      ]
    };
    await tester.enterText(
        find.byKey(const ValueKey('support-body')), '사진이 안 보여요');
    await tester.tap(find.byKey(const ValueKey('support-submit')));
    await tester.pumpAndSettle();
    final post = fake.calls.firstWhere((c) => c['method'] == 'POST');
    expect((post['data'] as Map)['category'], 'bug');
    expect(find.textContaining('사진이 안 보여요'), findsOneWidget);
    expect(find.textContaining('최신 버전으로 업데이트해 보세요.'),
        findsOneWidget);
    expect(find.textContaining('답변 완료'), findsOneWidget);
  });

  testWidgets('settings links to support', (WidgetTester tester) async {
    final fake = _SupportFake();
    await tester.pumpWidget(_wrap(_session(fake), const SettingsPage()));
    await tester.pumpAndSettle();
    expect(find.text('문의하기'), findsOneWidget);
  });
}
