import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';

// Opening another room must never keep showing the previous room's
// messages, even while another session action is still in flight
// (run() drops nested calls, so openChat waits instead of vanishing).
class _Fake extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final path = request.url.path;
    Object body = {};
    if (path.endsWith('/c2/messages')) {
      body = {
        'messages': [
          {'id': 'b1', 'sender_id': 'u2', 'kind': 'text', 'body': 'room two', 'sequence': 1, 'created_at': '2026-11-16T00:00:00Z'}
        ]
      };
    }
    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(body))),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
}

void main() {
  test('switching rooms clears the old messages and loads the new room', () async {
    final s = SessionController(httpClient: _Fake())
      ..selfId = 'u1'
      ..selectedId = 'c1'
      ..messages = [
        {'id': 'a1', 'sender_id': 'u2', 'kind': 'text', 'body': 'room one'}
      ];
    addTearDown(s.disposeAll);
    s.busy = true; // another action is still running
    final opening = s.openChat('c2', 'Two');
    expect(s.selectedId, 'c2');
    expect(s.messages, isEmpty, reason: 'old room is cleared at once');
    s.busy = false; // that action finishes
    await opening;
    expect(s.messages.map((m) => m['body']), ['room two']);
  });
}
