import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/channels.dart';
import 'package:luno_messenger/pages/chats.dart';
import 'package:luno_messenger/pages/feed.dart';
import 'package:luno_messenger/pages/stories.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/feed_posts.dart';
import 'package:luno_messenger/util/official_accounts.dart';
import 'package:luno_messenger/util/story_cards.dart';

// P0 mobile audit: pages read different keys than the server sends, so whole
// screens rendered empty. These pin util-output keys against what the pages
// read, plus the render path of the two new dialogs. No HTTP is exercised:
// payloads are pinned contract-side (scripts/cf_mobile_shapes.test.mjs).
Widget _wrap(SessionController session, Widget page) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: page,
    ),
  );
}

void main() {
  testWidgets('feed renders parsed posts with relative time',
      (WidgetTester tester) async {
    final session = SessionController()
      ..feedPosts = feedPostsOf({
        'videos': [
          {
            'id': 'v1',
            'title': '첫 소식',
            'emoji': '🎬',
            'author': {'display_name': '도도', 'handle': 'dodo'},
            'created_at': '2026-11-10T00:00:00Z',
            'like_count': 3,
            'liked': false,
            'comments': [],
          }
        ]
      });
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(session, const FeedPage()));
    await tester.pumpAndSettle();
    expect(find.text('도도 @dodo'), findsOneWidget);
    expect(find.text('첫 소식'), findsOneWidget);
    expect(find.textContaining('전'), findsWidgets);
  });

  testWidgets('channels render parsed official accounts',
      (WidgetTester tester) async {
    final session = SessionController()
      ..officialAccounts = officialAccountsOf({
        'accounts': [
          {
            'id': 'oa1',
            'name': 'LUNO 공지',
            'handle': 'luno_notice',
            'description': '소식 전달',
            'color': '#4F7CFF',
            'followed': true,
          }
        ]
      });
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(session, const ChannelsPage()));
    await tester.pumpAndSettle();
    expect(find.text('LUNO 공지 ✓'), findsOneWidget);
    expect(find.text('소식 전달'), findsOneWidget);
  });

  testWidgets('stories render parsed cards and open the post dialog',
      (WidgetTester tester) async {
    final session = SessionController()
      ..stories = storyCardsOf({
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
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(session, const StoriesPage()));
    await tester.pumpAndSettle();
    expect(find.textContaining('앨리스'), findsOneWidget);
    expect(find.text('오늘 기록'), findsOneWidget);
    await tester.tap(find.text('스토리 쓰기'));
    await tester.pumpAndSettle();
    expect(find.text('가벼운 일상 한 줄'), findsWidgets);
    expect(find.widgetWithText(FilledButton, '게시'), findsOneWidget);
  });

  testWidgets('group dialog gates creation on title plus members',
      (WidgetTester tester) async {
    final session = SessionController()
      ..friends = [
        {'id': 'u1', 'display_name': '앨리스'},
        {'id': 'u2', 'display_name': '밥'},
      ];
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(session, const ChatsPage()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('그룹 만들기'));
    await tester.pumpAndSettle();
    expect(find.text('앨리스'), findsOneWidget);
    FilledButton createBtn() => tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, '만들기'));
    expect(createBtn().onPressed, isNull);
    await tester.enterText(find.byType(TextField), '모임방');
    await tester.pump();
    expect(createBtn().onPressed, isNull);
    await tester.tap(find.byType(CheckboxListTile).first);
    await tester.pump();
    expect(createBtn().onPressed, isNotNull);
  });
}
