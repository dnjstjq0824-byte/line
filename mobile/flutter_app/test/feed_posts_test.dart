import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/feed_posts.dart';

void main() {
  test('feed parses the worker videos shape', () {
    final posts = feedPostsOf({
      'videos': [
        {
          'id': 'v1',
          'title': '첫 소식',
          'emoji': '🎬',
          'author': {'display_name': '도도', 'handle': 'dodo'},
          'created_at': '2026-11-10T00:00:00Z',
          'like_count': 3,
          'liked': true,
          'comments': [
            {'id': 'c1'}
          ],
        }
      ]
    });
    expect(posts, hasLength(1));
    final p = posts.first;
    expect(p['id'], equals('v1'));
    expect(p['body'], equals('첫 소식'));
    expect(p['author'], equals('도도'));
    expect(p['handle'], equals('@dodo'));
    expect(p['created_at'], equals('2026-11-10T00:00:00Z'));
    expect(p['likes'], equals(3));
    expect(p['liked'], isTrue);
    expect(p['comments'], hasLength(1));
  });

  test('feed tolerates the legacy posts key and misshapen input', () {
    expect(feedPostsOf({'posts': []}), isEmpty);
    expect(feedPostsOf({}), isEmpty);
    expect(feedPostsOf(null), isEmpty);
    expect(feedPostsOf('nope'), isEmpty);
    expect(feedPostsOf({'videos': 'nope'}), isEmpty);
    expect(feedPostsOf({'videos': [null, 42]}), isEmpty);
  });

  test('feed post title is the first non-empty line, clipped to 100', () {
    expect(feedPostTitleOf('hello'), equals('hello'));
    expect(feedPostTitleOf('  \nsecond\nthird'), equals('second'));
    expect(feedPostTitleOf('   '), isEmpty);
    final long = '${'x' * 150}\ntail';
    expect(feedPostTitleOf(long), equals('x' * 100));
  });
}
