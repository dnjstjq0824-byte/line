// A-23: reconnect backoff, delta merge, and in-place event application.
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/state/session.dart';

void main() {
  group('reconnectDelaySeconds', () {
    test('doubles from 1s and caps at 30s', () {
      expect(reconnectDelaySeconds(1, jitter: () => 0), 1);
      expect(reconnectDelaySeconds(2, jitter: () => 0), 2);
      expect(reconnectDelaySeconds(3, jitter: () => 0), 4);
      expect(reconnectDelaySeconds(5, jitter: () => 0), 16);
      expect(reconnectDelaySeconds(6, jitter: () => 0), 30);
      expect(reconnectDelaySeconds(20, jitter: () => 0), 30);
    });

    test('adds jitter on top of the base delay', () {
      expect(reconnectDelaySeconds(1, jitter: () => 0.5), 1.5);
      expect(reconnectDelaySeconds(6, jitter: () => 0.25), 30.25);
    });
  });

  group('mergeDeltaMessages', () {
    test('dedupes by id and restores sequence order', () {
      final existing = [
        {'id': 'a', 'sequence': 1},
        {'id': 'b', 'sequence': 2},
      ];
      final delta = [
        {'id': 'c', 'sequence': 3},
        {'id': 'b', 'sequence': 2},
      ];
      final merged = mergeDeltaMessages(existing, delta);
      expect(merged.map((m) => m['id']).toList(), ['a', 'b', 'c']);
    });
  });

  group('applyMessageCreated', () {
    SessionController makeSession() {
      final s = SessionController();
      s.selfId = 'u1';
      s.selectedId = 'c1';
      s.chats = [
        {'id': 'c1', 'unread_count': 0, 'last_message': null},
        {'id': 'c2', 'unread_count': 0, 'last_message': null},
      ];
      return s;
    }

    test('appends to the open room without marking unread', () {
      final s = makeSession();
      s.applyMessageCreated({
        'type': 'message.created',
        'message': {
          'id': 'm1',
          'conversation_id': 'c1',
          'sender_id': 'u2',
          'kind': 'text',
          'body': 'hi',
          'sequence': 5,
        },
      });
      expect(s.messages.map((m) => m['id']).toList(), ['m1']);
      expect(s.chats[0]['id'], 'c1');
      expect(s.chats[0]['unread_count'], 0);
      expect(s.chats[0]['last_message']['body'], 'hi');
    });

    test('bumps unread and moves a background room to top', () {
      final s = makeSession();
      s.applyMessageCreated({
        'type': 'message.created',
        'message': {
          'id': 'm2',
          'conversation_id': 'c2',
          'sender_id': 'u2',
          'kind': 'text',
          'body': 'yo',
          'sequence': 7,
        },
      });
      expect(s.messages, isEmpty);
      expect(s.chats[0]['id'], 'c2');
      expect(s.chats[0]['unread_count'], 1);
      expect(s.chats[0]['last_message']['body'], 'yo');
    });

    test('ignores duplicates and never bumps for own messages', () {
      final s = makeSession();
      final event = {
        'type': 'message.created',
        'message': {
          'id': 'm3',
          'conversation_id': 'c1',
          'sender_id': 'u1',
          'kind': 'text',
          'body': 'self',
          'sequence': 6,
        },
      };
      s.applyMessageCreated(event);
      s.applyMessageCreated(event);
      expect(s.messages.length, 1);
      expect(s.chats[0]['unread_count'], 0);
    });
  });

  group('applyConversationRead', () {
    test('zeroes exactly one row', () {
      final s = SessionController();
      s.chats = [
        {'id': 'c1', 'unread_count': 0},
        {'id': 'c2', 'unread_count': 3},
      ];
      s.applyConversationRead({'type': 'conversation.read', 'conversation_id': 'c2'});
      expect(s.chats[0]['unread_count'], 0);
      expect(s.chats[1]['unread_count'], 0);
    });
  });
}
