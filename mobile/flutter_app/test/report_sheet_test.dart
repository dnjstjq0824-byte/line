import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/pages/home.dart';
import 'package:luno_messenger/state/session.dart';

// A7 (F29 sheets): the report sheet offers the enlarged category set and
// files the chosen wire value.
class _ReportFake extends http.BaseClient {
  final List<Map<String, dynamic>> calls = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    dynamic data;
    if (request is http.Request && request.body.isNotEmpty) {
      data = jsonDecode(request.body);
    }
    calls.add(
        {'method': request.method, 'path': request.url.path, 'data': data});
    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode({'id': 'rep-1'}))),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
}

void main() {
  testWidgets('report sheet files an F29 category',
      (WidgetTester tester) async {
    final fake = _ReportFake();
    final s = SessionController(httpClient: fake)..selfName = '도도';
    addTearDown(s.disposeAll);
    await tester.pumpWidget(SessionScope(
      notifier: s,
      child: MaterialApp(
        home: Scaffold(body: Builder(builder: (context) {
          return ElevatedButton(
            onPressed: () => reportUserSheet(context, s, 'u9', 'Nina'),
            child: const Text('open'),
          );
        })),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    expect(find.text('불법촬영물'), findsOneWidget);
    expect(find.text('아동 성착취물'), findsOneWidget);
    expect(find.text('폭력'), findsOneWidget);
    await tester.tap(find.text('불법촬영물'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('신고 접수'));
    await tester.pumpAndSettle();
    final post = fake.calls.firstWhere((c) => c['method'] == 'POST');
    expect(post['path'], endsWith('/api/v1/reports'));
    expect((post['data'] as Map)['category'], 'illegal_filming');
    expect((post['data'] as Map)['subject_user_id'], 'u9');
  });
}
