import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/story_cards.dart';

void main() {
  test('story cards map the worker story shape', () {
    final cards = storyCardsOf({
      'stories': [
        {
          'id': 's1',
          'author': {'display_name': '앨리스'},
          'body': '오늘 기록',
          'bg': '',
          'created_at': '2026-11-10T00:00:00Z',
        }
      ]
    });
    expect(cards, hasLength(1));
    final c = cards.first;
    expect(c['author_name'], equals('앨리스'));
    expect(c['text'], equals('오늘 기록'));
  });

  test('story cards tolerate legacy keys and misshapen input', () {
    expect(storyCardsOf({}), isEmpty);
    expect(storyCardsOf(null), isEmpty);
    expect(storyCardsOf('nope'), isEmpty);
    expect(storyCardsOf({'stories': 'nope'}), isEmpty);
    final legacy = storyCardsOf({
      'stories': [
        {'author_name': '구형', 'text': '내용'}
      ]
    });
    expect(legacy.first['author_name'], equals('구형'));
    expect(legacy.first['text'], equals('내용'));
  });
}
