// Item 6: group rooms show who said what (server name, members fallback).
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/sender_name.dart';

void main() {
  group('senderNameOf', () {
    final members = [
      {'id': 'u1', 'display_name': 'Alice'},
      {'id': 'u2', 'display_name': 'Bob'},
    ];

    test('prefers the server-provided name', () {
      expect(
          senderNameOf(
              {'sender_id': 'u1', 'sender_name': 'Alice R.'}, members),
          'Alice R.');
    });

    test('falls back to the members list', () {
      expect(senderNameOf({'sender_id': 'u2'}, members), 'Bob');
      expect(senderNameOf({'sender_id': 'u2', 'sender_name': ''}, members),
          'Bob');
    });

    test('stays silent on unknown senders and bad input', () {
      expect(senderNameOf({'sender_id': 'ghost'}, members), '');
      expect(senderNameOf({'sender_id': 'u1'}, []), '');
      expect(senderNameOf({}, members), '');
    });
  });
}
