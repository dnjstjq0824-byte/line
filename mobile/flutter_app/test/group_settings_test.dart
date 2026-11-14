import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/pages/group_settings.dart';
import 'package:luno_messenger/state/session.dart';

// F6: group methods hit the room endpoints, and the settings page shows
// roles while hiding privileged controls from plain members.
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

Map<String, dynamic> _room(String myRole) => {
      'id': 'c1',
      'kind': 'group',
      'title': '모임방',
      'notice': '토요일 7시',
      'owner_id': 'u1',
      'my_role': myRole,
      'avatar_url': '',
      'member_count': 3,
      'members': [
        {
          'id': 'u1',
          'display_name': '방장',
          'role': 'owner',
          'avatar_color': '#4F7CFF'
        },
        {
          'id': 'u2',
          'display_name': '관리자',
          'role': 'admin',
          'avatar_color': '#22c55e'
        },
        {
          'id': 'u3',
          'display_name': '일반',
          'role': 'member',
          'avatar_color': '#f59e0b'
        },
      ],
    };

SessionController _session(FakeHttp httpClient, {String selfId = 'u1'}) {
  final s = SessionController(httpClient: httpClient)..selfId = selfId;
  addTearDown(s.disposeAll);
  return s;
}

void main() {
  group('group methods', () {
    test('rename/invite/kick/role/transfer/leave hit room endpoints',
        () async {
      final httpClient = FakeHttp();
      final s = _session(httpClient);
      httpClient.handler = (req, body) async {
        if (req.url.path == '/api/v1/conversations/c1') {
          return jsonRes(_room('owner'), 200);
        }
        return jsonRes({}, 200);
      };
      await s.renameRoom('c1', '새 이름');
      await s.setRoomNotice('c1', '공지');
      await s.inviteMembers('c1', ['u9']);
      await s.kickMember('c1', 'u3');
      await s.setMemberRole('c1', 'u3', 'admin');
      await s.transferRoom('c1', 'u2');
      await s.leaveChat('c1');
      for (final want in [
        'PATCH /api/v1/conversations/c1',
        'POST /api/v1/conversations/c1/members',
        'DELETE /api/v1/conversations/c1/members/u3',
        'PATCH /api/v1/conversations/c1/members/u3/role',
        'DELETE /api/v1/conversations/c1',
      ]) {
        expect(httpClient.paths, contains(want), reason: want);
      }
    });

    test('invites list/create/revoke and join round-trip', () async {
      final httpClient = FakeHttp();
      final s = _session(httpClient);
      httpClient.handler = (req, body) async {
        if (req.url.path == '/api/v1/conversations/c1/invites') {
          return jsonRes({
            'invites': [
              {'token': 'tok', 'invite_url': 'https://x/invite/tok'}
            ]
          }, 200);
        }
        if (req.url.path == '/api/v1/conversations/join') {
          return jsonRes({'id': 'c9'}, 200);
        }
        return jsonRes({}, 200);
      };
      await s.loadRoomInvites('c1');
      expect(s.roomInvites.length, 1);
      await s.createRoomInvite('c1', 24);
      await s.revokeRoomInvite('c1', 'tok');
      expect(await s.joinGroup('tok'), 'c9');
      for (final want in [
        'GET /api/v1/conversations/c1/invites',
        'POST /api/v1/conversations/c1/invites',
        'DELETE /api/v1/conversations/c1/invites/tok',
        'POST /api/v1/conversations/join',
      ]) {
        expect(httpClient.paths, contains(want), reason: want);
      }
    });

    test('group admins can decide proposals', () {
      final s = _session(FakeHttp(), selfId: 'u2');
      expect(
          s.canDecideIn(
              {'id': 'c', 'kind': 'group', 'owner_id': 'u1', 'my_role': 'admin'}),
          isTrue);
      expect(
          s.canDecideIn(
              {'id': 'c', 'kind': 'group', 'owner_id': 'u1', 'my_role': 'member'}),
          isFalse);
    });
  });

  group('GroupSettingsPage', () {
    testWidgets('owner sees roles and privileged controls',
        (WidgetTester tester) async {
      final httpClient = FakeHttp();
      final s = _session(httpClient);
      httpClient.handler = (req, body) async {
        if (req.url.path == '/api/v1/conversations/c1/invites') {
          return jsonRes({'invites': []}, 200);
        }
        return jsonRes(_room('owner'), 200);
      };
      await tester.pumpWidget(SessionScope(
        notifier: s,
        child: MaterialApp(home: _TestPage()),
      ));
      await tester.pumpAndSettle();
      expect(find.text('모임방'), findsWidgets);
      expect(find.text('사진 변경'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('그룹 나가기'), 300);
      expect(find.text('방장'), findsWidgets);
      expect(find.text('관리자'), findsWidgets);
      expect(find.text('일반'), findsWidgets);
      expect(find.text('초대 링크'), findsOneWidget);
    });

    testWidgets('plain member sees no privileged controls',
        (WidgetTester tester) async {
      final httpClient = FakeHttp();
      final s = _session(httpClient, selfId: 'u3');
      httpClient.handler = (req, body) async {
        if (req.url.path == '/api/v1/conversations/c1/invites') {
          return jsonRes({'error': 'forbidden'}, 403);
        }
        return jsonRes(_room('member'), 200);
      };
      await tester.pumpWidget(SessionScope(
        notifier: s,
        child: MaterialApp(home: _TestPage()),
      ));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('그룹 나가기'), 300);
      expect(find.text('모임방'), findsWidgets);
      expect(find.text('초대 링크'), findsNothing);
      expect(find.text('사진 변경'), findsNothing);
      expect(find.text('그룹 나가기'), findsOneWidget);
    });
  });
}

class _TestPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
      const GroupSettingsPage(conversationId: 'c1');
}
