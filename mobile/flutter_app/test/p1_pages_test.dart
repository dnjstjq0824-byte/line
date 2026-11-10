import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/chat_archive.dart';
import 'package:luno_messenger/pages/chat_room.dart';
import 'package:luno_messenger/pages/home.dart';
import 'package:luno_messenger/pages/lounge.dart';
import 'package:luno_messenger/pages/profile.dart';
import 'package:luno_messenger/state/session.dart';

// Mobile P1: archive/album/lounge/profile/friend/file/QR/translate surfaces.
// Pages render server-keyed state (pinned contract-side in
// scripts/cf_mobile_p1.test.mjs) and gate writes on valid dialog input.
// No HTTP is exercised here.
Widget _wrap(SessionController session, Widget page) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: Scaffold(body: page),
    ),
  );
}

SessionController _chatSession() {
  final s = SessionController()
    ..selfId = 'me'
    ..selfName = '나'
    ..selectedId = 'c1'
    ..chats = [
      {'id': 'c1', 'title': '모임방'}
    ];
  addTearDown(s.disposeAll);
  return s;
}

void main() {
  testWidgets('notes archive renders items and gates save on title',
      (WidgetTester tester) async {
    final session = _chatSession()
      ..notes = [
        {'id': 'n1', 'title': '장보기', 'body': '우유 두부'}
      ];
    await tester.pumpWidget(_wrap(
        session,
        const ChatArchivePage(
            conversationId: 'c1', kind: ChatArchiveKind.notes)));
    await tester.pumpAndSettle();
    expect(find.text('장보기'), findsOneWidget);
    expect(find.text('우유 두부'), findsOneWidget);
    await tester.tap(find.text('새 노트'));
    await tester.pumpAndSettle();
    expect(find.text('제목 (필수)'), findsOneWidget);
    FilledButton saveBtn() =>
        tester.widget<FilledButton>(find.widgetWithText(FilledButton, '저장'));
    expect(saveBtn().onPressed, isNull);
    await tester.enterText(
        find.widgetWithText(TextField, '제목 (필수)'), '메모');
    await tester.pump();
    expect(saveBtn().onPressed, isNotNull);
  });

  testWidgets('polls archive renders options and gates create on 2+ options',
      (WidgetTester tester) async {
    final session = _chatSession()
      ..polls = [
        {
          'id': 'p1',
          'question': '저녁은?',
          'closed': false,
          'total_voters': 1,
          'options': [
            {'id': 'opt-0', 'text': '치킨', 'votes': 1, 'voted': true},
            {'id': 'opt-1', 'text': '피자', 'votes': 0, 'voted': false},
          ]
        }
      ];
    await tester.pumpWidget(_wrap(
        session,
        const ChatArchivePage(
            conversationId: 'c1', kind: ChatArchiveKind.polls)));
    await tester.pumpAndSettle();
    expect(find.text('저녁은?'), findsOneWidget);
    expect(find.textContaining('✓ 치킨 (1)'), findsOneWidget);
    expect(find.textContaining('피자 (0)'), findsOneWidget);
    await tester.tap(find.text('새 투표'));
    await tester.pumpAndSettle();
    FilledButton createBtn() => tester
        .widget<FilledButton>(find.widgetWithText(FilledButton, '만들기'));
    expect(createBtn().onPressed, isNull);
    await tester.enterText(
        find.widgetWithText(TextField, '질문 (필수)'), '점심은?');
    await tester.enterText(
        find.widgetWithText(TextField, '선택지 (줄마다 하나씩, 2~10개)'),
        '김밥\n라면');
    await tester.pump();
    expect(createBtn().onPressed, isNotNull);
  });

  testWidgets('events archive shows rsvp state and choices',
      (WidgetTester tester) async {
    final session = _chatSession()
      ..events = [
        {
          'id': 'e1',
          'title': '등산',
          'starts_at': '2026-11-20T09:00:00Z',
          'location': '북한산',
          'my_rsvp': 'maybe'
        }
      ];
    await tester.pumpWidget(_wrap(
        session,
        const ChatArchivePage(
            conversationId: 'c1', kind: ChatArchiveKind.events)));
    await tester.pumpAndSettle();
    expect(find.text('등산'), findsOneWidget);
    expect(find.text('내 응답: 미정'), findsOneWidget);
    expect(find.text('참석'), findsOneWidget);
    expect(find.text('불참'), findsOneWidget);
  });

  testWidgets('albums archive shows photo counts',
      (WidgetTester tester) async {
    final session = _chatSession()
      ..albums = [
        {
          'id': 'a1',
          'title': '여행',
          'attachment_ids': ['x', 'y'],
          'created_at': '2026-11-10T00:00:00Z'
        }
      ];
    await tester.pumpWidget(_wrap(
        session,
        const ChatArchivePage(
            conversationId: 'c1', kind: ChatArchiveKind.albums)));
    await tester.pumpAndSettle();
    expect(find.text('여행'), findsOneWidget);
    expect(find.textContaining('사진 2장'), findsOneWidget);
  });

  testWidgets('lounge lists rooms by server name key',
      (WidgetTester tester) async {
    final session = SessionController()
      ..selfName = '나'
      ..openRooms = [
        {
          'id': 'r1',
          'name': '등산 모임',
          'description': '주말 산행',
          'member_count': 5,
          'joined': false
        }
      ];
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(session, const LoungePage()));
    await tester.pumpAndSettle();
    expect(find.text('등산 모임'), findsOneWidget);
    expect(find.text('참여'), findsOneWidget);
    await tester.tap(find.text('새 라운지'));
    await tester.pumpAndSettle();
    expect(find.text('라운지 이름 (필수)'), findsOneWidget);
  });

  testWidgets('lounge detail shows posts, likes and back navigation',
      (WidgetTester tester) async {
    final session = SessionController()
      ..selfName = '나'
      ..openRooms = [
        {
          'id': 'r1',
          'name': '등산 모임',
          'description': '',
          'member_count': 5,
          'joined': true
        }
      ]
      ..roomId = 'r1'
      ..roomNickname = '등산왕'
      ..roomJoined = true
      ..roomPosts = [
        {
          'id': 'p1',
          'author_name': '등산왕',
          'body': '토요일 9시 집합',
          'likes': 2,
          'liked': false,
          'created_at': '2026-11-10T00:00:00Z'
        }
      ];
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(session, const LoungePage()));
    await tester.pumpAndSettle();
    expect(find.text('내 닉네임: 등산왕'), findsOneWidget);
    expect(find.text('토요일 9시 집합'), findsOneWidget);
    expect(find.byTooltip('좋아요'), findsOneWidget);
    await tester.tap(find.byTooltip('라운지 목록'));
    await tester.pumpAndSettle();
    expect(find.text('등산 모임'), findsOneWidget);
    expect(find.text('새 라운지'), findsOneWidget);
  });

  testWidgets('profile shows birthday row and opens the edit dialog',
      (WidgetTester tester) async {
    // Item 12 redesign: the combined '생일 01-02' label and the single
    // '프로필 편집' dialog are gone; each row edits in place and photos
    // live in the photo sheet (see profile_page_test.dart).
    final session = SessionController()
      ..selfName = '나'
      ..selfHandle = 'me'
      ..selfBirthday = '01-02';
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(session, const ProfilePage()));
    await tester.pumpAndSettle();
    expect(find.text('생일'), findsOneWidget);
    expect(find.text('01-02'), findsOneWidget);
    await tester.ensureVisible(find.text('01-02'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('01-02'));
    await tester.pumpAndSettle();
    expect(find.text('저장'), findsOneWidget);
  });

  testWidgets('home friend rows star favorites and offer manage menu',
      (WidgetTester tester) async {
    final session = SessionController()
      ..selfName = '나'
      ..friends = [
        {
          'id': 'u1',
          'display_name': '도도',
          'handle': 'dodo',
          'is_favorite': true,
          'is_blocked': false
        }
      ];
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(session, const HomePage()));
    await tester.pumpAndSettle();
    expect(find.text('★ 도도'), findsOneWidget);
    expect(find.byTooltip('친구 관리'), findsOneWidget);
    await tester.tap(find.byTooltip('친구 관리'));
    await tester.pumpAndSettle();
    expect(find.text('즐겨찾기 해제'), findsOneWidget);
    expect(find.text('차단하기'), findsOneWidget);
  });

  testWidgets('home QR button opens the approve dialog',
      (WidgetTester tester) async {
    final session = SessionController()..selfName = '나';
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(session, const HomePage()));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('PC/웹 QR 승인'));
    await tester.pumpAndSettle();
    expect(find.text('QR Challenge ID'), findsOneWidget);
    expect(find.text('승인'), findsOneWidget);
    expect(find.text('새로고침'), findsOneWidget);
  });

  testWidgets('chat room shows translate banner and file save action',
      (WidgetTester tester) async {
    final session = _chatSession()
      ..autoTranslate = true
      ..targetTranslateLang = 'en'
      ..messages = [
        {
          'id': 'm1',
          'sender_id': 'me',
          'kind': 'file',
          'body': 'doc.pdf',
          'metadata': {'attachment_id': 'a1'},
          'created_at': '2026-11-10T00:00:00Z'
        }
      ];
    await tester.pumpWidget(
        _wrap(session, const ChatRoomPage(conversationId: 'c1')));
    await tester.pumpAndSettle();
    expect(find.textContaining('자동 번역 켜짐 · EN'), findsOneWidget);
    expect(find.text('저장'), findsOneWidget);
    expect(find.byTooltip('파일'), findsOneWidget);
  });
}
