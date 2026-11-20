// Build 16 field reports: accept/hang-up did nothing, "읽음" never showed
// up live, the open-room selection stuck after leaving, and nobody saw
// anyone else's profile photo or cover.
import 'package:fake_async/fake_async.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/friend_profile.dart';
import 'package:luno_messenger/state/session.dart';

import 'session_call_test.dart' show FakeHttp, FakeCallMedia, jsonRes, makeSession;

const _png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

void _ring(SessionController s, String id) => s.debugIncomingRing({
      'type': 'call.ringing',
      'call_id': id,
      'conversation_id': 'c1',
      'kind': 'voice',
      'initiated_by': 'peer',
    });

void main() {
  group('call buttons are never swallowed', () {
    test('accept works while another action holds the busy flag', () async {
      final fake = FakeHttp()..handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, FakeCallMedia());
      _ring(s, 'call-1');
      s.busy = true; // e.g. a room load in flight
      await s.acceptCall();
      expect(
          fake.calls.any((c) =>
              c.contains('/api/v1/calls/call-1/state') &&
              c.contains('"state":"connected"')),
          isTrue);
      expect(s.activeCall?['state'], 'connected');
    });

    test('hang-up works while busy and clears the call', () async {
      final fake = FakeHttp()..handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, FakeCallMedia());
      _ring(s, 'call-2');
      s.busy = true;
      await s.declineCall();
      expect(s.activeCall, isNull);
    });

    test('accepting a call the caller already ended stops ringing', () async {
      final fake = FakeHttp()
        ..handler = (req, body) async {
          if (req.url.path.endsWith('/state')) {
            return jsonRes({'error': 'call not found'}, 404);
          }
          return jsonRes({}, 200);
        };
      final s = makeSession(fake, FakeCallMedia());
      _ring(s, 'call-3');
      await s.acceptCall();
      expect(s.activeCall, isNull);
    });
  });

  group('read receipts', () {
    SessionController room(FakeHttp fake, String kind) {
      final s = makeSession(fake, FakeCallMedia());
      s.chats = [
        {'id': 'c1', 'kind': kind, 'unread_count': 0}
      ];
      s.selectedId = 'c1';
      s.messages = [
        {'id': 'm1', 'sender_id': 'me', 'sequence': 1, 'read_count': 0},
        {'id': 'm2', 'sender_id': 'me', 'sequence': 2, 'read_count': 0},
      ];
      return s;
    }

    test('a peer reading lights up 읽음 on my messages right away', () {
      final s = room(FakeHttp()..handler = (r, b) async => jsonRes({}, 200),
          'direct');
      s.applyConversationRead(
          {'conversation_id': 'c1', 'user_id': 'peer', 'sequence': 1});
      expect(s.messages[0]['read_count'], 1);
      expect(s.messages[1]['read_count'], 0);
    });

    test('a message arriving in the open room is marked read', () {
      fakeAsync((async) {
        final fake = FakeHttp()..handler = (r, b) async => jsonRes({}, 200);
        final s = room(fake, 'direct');
        s.applyMessageCreated({
          'message': {
            'id': 'm3',
            'conversation_id': 'c1',
            'sender_id': 'peer',
            'sequence': 3,
            'kind': 'text',
            'body': 'hi',
          }
        });
        async.elapse(const Duration(milliseconds: 600));
        async.flushMicrotasks();
        expect(
            fake.calls.any((c) =>
                c.contains('/api/v1/conversations/c1/read') &&
                c.contains('"sequence":3')),
            isTrue,
            reason: '${fake.calls}');
      });
    });

    test('leaving the room drops the selection so unread counts again', () {
      final s = room(FakeHttp()..handler = (r, b) async => jsonRes({}, 200),
          'direct');
      s.closeChatIfOpen('other-room');
      expect(s.selectedId, 'c1', reason: 'another room keeps its selection');
      s.closeChatIfOpen('c1');
      expect(s.selectedId, isEmpty);
      s.applyMessageCreated({
        'message': {
          'id': 'm4',
          'conversation_id': 'c1',
          'sender_id': 'peer',
          'sequence': 4,
        }
      });
      expect(s.chats.first['unread_count'], 1);
    });
  });

  group('profile photos reach other people', () {
    testWidgets('a friend profile shows their cover and photo', (tester) async {
      final s = makeSession(
          FakeHttp()..handler = (r, b) async => jsonRes({}, 200),
          FakeCallMedia());
      await tester.pumpWidget(SessionScope(
        notifier: s,
        child: const MaterialApp(
          home: FriendProfilePage(user: {
            'id': 'peer',
            'display_name': 'Alice',
            'status_message': 'hello',
            'avatar_url': _png,
            'cover_url': _png,
          }),
        ),
      ));
      await tester.pump();
      expect(find.byKey(const Key('friend-cover')), findsOneWidget);
      final avatar = tester.widget<LineAvatar>(find.byKey(const Key('friend-avatar')));
      expect(avatar.photo, isNotNull);
      expect(find.text('Alice'), findsOneWidget);
      expect(find.text('hello'), findsOneWidget);
    });

    test('the chat list uses the peer photo of a 1:1 room', () {
      final s = makeSession(
          FakeHttp()..handler = (r, b) async => jsonRes({}, 200),
          FakeCallMedia());
      final row = {
        'id': 'c1',
        'kind': 'direct',
        'members': [
          {'id': 'me', 'avatar_url': ''},
          {'id': 'peer', 'avatar_url': _png},
        ],
      };
      expect(s.peerOf(row)?['id'], 'peer');
      expect(s.photoOf(s.peerOf(row)?['avatar_url']), isNotNull);
      expect(s.photoOf(''), isNull);
    });
  });
}
