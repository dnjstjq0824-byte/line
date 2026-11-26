// 2026-11-26 UX sweep: list previews by kind, Keep seed localization and
// grouped shop prices.
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/pages/chats.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/app_l10n.dart';
import 'package:luno_messenger/util/store_packs.dart';

void main() {
  group('chat list preview', () {
    test('non-text kinds show a label, never their raw body', () {
      expect(
          previewOfLastMessage(
              {'kind': 'ciphertext', 'body': 'eyJ2IjoxLCJjIjoiQUFBQSJ9'}, 'ko'),
          '암호화된 메시지');
      expect(previewOfLastMessage({'kind': 'image', 'body': 'IMG_0001.jpg'}, 'ko'),
          '사진');
      expect(previewOfLastMessage({'kind': 'sticker', 'body': 'basic-1'}, 'en'),
          stringsFor('en').mvSticker);
      expect(previewOfLastMessage({'kind': 'voice', 'body': 'v.m4a'}, 'ko'),
          stringsFor('ko').voiceMsgWord);
    });

    test('text keeps its body', () {
      expect(previewOfLastMessage({'kind': 'text', 'body': '안녕'}, 'ko'), '안녕');
    });
  });

  group('Keep seed', () {
    test('room title and welcome notes follow the app language', () {
      final rooms = localizeKeepRooms([
        {
          'id': 'conv-keep-u1',
          'title': 'Keep 메모',
          'last_message': {
            'id': 'm-keep-u1-2',
            'body': 'PC에서도 같은 대화를 이어갈 수 있어요: https://lunotalk.com/login',
          },
        },
        {'id': 'c-other', 'title': 'Keep 메모'},
      ], stringsFor('en'));
      expect(rooms[0]['title'], 'Keep memo');
      expect(rooms[0]['last_message']['body'],
          'Pick up the same chats on your computer: https://lunotalk.com/login');
      expect(rooms[1]['title'], 'Keep 메모', reason: 'only the Keep room');
    });

    test('only the two seed notes are rewritten', () {
      final msgs = localizeKeepSeeds([
        {'id': 'm-keep-u1-1', 'client_id': 'keep-1', 'body': '나에게 보내는 Keep 메모입니다.'},
        {'id': 'm-abc', 'client_id': 'x', 'body': '내 메모'},
      ], stringsFor('ja'));
      expect(msgs[0]['body'], stringsFor('ja').keepSeedWelcome);
      expect(msgs[1]['body'], '내 메모');
    });
  });

  test('shop prices group thousands', () {
    expect(groupThousands(2500), '2,500');
    expect(groupThousands(1234567), '1,234,567');
    expect(groupThousands(999), '999');
  });
}
