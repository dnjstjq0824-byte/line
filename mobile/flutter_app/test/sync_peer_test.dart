import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/sync_delta.dart';
import 'package:luno_messenger/util/send_peer.dart';

void main() {
  test('sync delta reads delta_messages first', () {
    expect(
        syncDeltaOf({
          'delta_messages': [
            {'id': 'm1'}
          ]
        }),
        hasLength(1));
    expect(
        syncDeltaOf({
          'messages': [
            {'id': 'm1'}
          ]
        }),
        hasLength(1));
    expect(syncDeltaOf({}), isEmpty);
    expect(syncDeltaOf(null), isEmpty);
    expect(syncDeltaOf({'delta_messages': 'nope'}), isEmpty);
  });

  test('send peer resolves the 1:1 counterpart only', () {
    expect(
        sendPeerIdOf(
            conversation: {
              'kind': 'direct',
              'members': [
                {'id': 'me'},
                {'id': 'peer'}
              ]
            },
            selfId: 'me'),
        equals('peer'));
    expect(
        sendPeerIdOf(
            conversation: {
              'kind': 'direct',
              'members': ['me', 'peer2']
            },
            selfId: 'me'),
        equals('peer2'));
    expect(
        sendPeerIdOf(
            conversation: {
              'kind': 'group',
              'members': [
                {'id': 'me'},
                {'id': 'peer'}
              ]
            },
            selfId: 'me'),
        isNull);
    expect(sendPeerIdOf(conversation: {'kind': 'direct'}, selfId: 'me'),
        isNull);
    expect(sendPeerIdOf(conversation: null, selfId: 'me'), isNull);
  });
}
