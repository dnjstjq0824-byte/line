// F21: inbound links + shares — pure link parsing, the channel handler
// with fakes, token join outcomes, the JoinPage flow on a real router,
// and the share banner → composer prefill chain.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/chat_room.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/deep_links.dart';

const host = 'luno-messenger.dnjstjqppk.workers.dev';

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
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

void main() {
  group('parseAppLink', () {
    test('accepts invite + room links on the serving host', () {
      expect(parseAppLink(Uri.parse('https://$host/invite/abc-123'), host)?.route, '/invite/abc-123');
      expect(parseAppLink(Uri.parse('https://$host/chats/room-9'), host)?.route, '/chats/room-9');
      expect(parseAppLink(Uri.parse('https://$host/chats'), host)?.route, '/chats');
      expect(parseAppLink(Uri.parse('https://$host/invite/abc-123/'), host)?.route, '/invite/abc-123');
    });
    test('accepts the luno://app mirror', () {
      expect(parseAppLink(Uri.parse('luno://app/invite/abc-123'), host)?.route, '/invite/abc-123');
      expect(parseAppLink(Uri.parse('luno://app/chats/room-9'), host)?.route, '/chats/room-9');
    });
    test('rejects foreign hosts, schemes and paths', () {
      expect(parseAppLink(Uri.parse('https://evil.test/invite/abc'), host), isNull);
      expect(parseAppLink(Uri.parse('http://$host/invite/abc'), host), isNull);
      expect(parseAppLink(Uri.parse('luno://other/invite/abc'), host), isNull);
      expect(parseAppLink(Uri.parse('https://$host/admin/users'), host), isNull);
      expect(parseAppLink(Uri.parse('https://$host/invite/'), host), isNull);
      expect(parseAppLink(Uri.parse('https://$host/chats/a/b'), host), isNull);
    });
  });

  group('DeepLinkHandler', () {
    test('warm links route, unknown links are ignored', () {
      final s = SessionController();
      addTearDown(s.disposeAll);
      final went = <String>[];
      final h = DeepLinkHandler(session: s, go: went.add);
      addTearDown(h.dispose);
      // Default API base is the prod host, so prod links route at once.
      h.onLink(Uri.parse('https://$host/invite/tok-1'));
      h.onLink(Uri.parse('https://evil.test/invite/tok-1'));
      h.onLink(Uri.parse('luno://app/chats/r1'));
      expect(went, ['/invite/tok-1', '/chats/r1']);
      // Rebased builds only trust their own host (custom scheme excepted).
      s.api.baseUrl = 'https://other.example';
      went.clear();
      h.onLink(Uri.parse('https://$host/invite/tok-1'));
      h.onLink(Uri.parse('luno://app/chats/r1'));
      expect(went, ['/chats/r1']);
    });
    test('links bind to the configured API host', () {
      final s = SessionController();
      addTearDown(s.disposeAll);
      s.api.baseUrl = 'https://$host';
      final went = <String>[];
      final h = DeepLinkHandler(session: s, go: went.add);
      addTearDown(h.dispose);
      h.onLink(Uri.parse('https://$host/invite/tok-1'));
      h.onLink(Uri.parse('luno://app/chats/r1'));
      h.onLink(Uri.parse('https://$host/admin/users'));
      expect(went, ['/invite/tok-1', '/chats/r1']);
    });
    test('shares stage text and flag photos honestly', () {
      final s = SessionController();
      addTearDown(s.disposeAll);
      final went = <String>[];
      final h = DeepLinkHandler(session: s, go: went.add);
      addTearDown(h.dispose);
      h.onShare({'text': 'hello room', 'hasImages': false});
      expect(s.pendingShareText, 'hello room');
      expect(went, ['/chats']);
      s.pendingShareText = null;
      went.clear();
      h.onShare({'text': '', 'hasImages': true});
      expect(s.pendingShareText, isNull);
      expect(s.notice, '사진 공유는 준비 중입니다.');
      expect(went, isEmpty);
    });
    test('cold share arrives through the channel', () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      const channel = MethodChannel('luno.links.probe');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'getInitialShare') {
          return {'text': 'cold hello', 'hasImages': false};
        }
        return null;
      });
      final s = SessionController();
      addTearDown(s.disposeAll);
      final went = <String>[];
      final h = DeepLinkHandler(session: s, go: went.add, channel: channel);
      addTearDown(h.dispose);
      await h.start();
      expect(s.pendingShareText, 'cold hello');
      expect(went, ['/chats']);
    });
  });

  group('joinGroup', () {
    SessionController makeSession(FakeHttp fake) {
      final s = SessionController(httpClient: fake);
      s.selfId = 'me';
      addTearDown(s.disposeAll);
      return s;
    }

    test('200 returns the room id', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/conversations/join') {
          return jsonRes({'id': 'room-7', 'title': 'Study'}, 200);
        }
        return jsonRes({}, 200);
      };
      final s = makeSession(fake);
      expect(await s.joinGroup('tok-1'), 'room-7');
      expect(s.notice, '그룹에 참여했습니다.');
    });
    test('404/410/409 surface localized notices', () async {
      for (final entry in {
        404: '유효하지 않은 초대 링크입니다.',
        410: '만료된 초대 링크입니다.',
        409: '이미 참여한 방입니다.',
        500: '일시적인 오류입니다. 다시 시도해주세요.',
      }.entries) {
        final fake = FakeHttp();
        fake.handler = (req, body) async => jsonRes({'error': 'x'}, entry.key);
        final s = makeSession(fake);
        expect(await s.joinGroup('tok-1'), isNull);
        expect(s.notice, entry.value, reason: 'status ${entry.key}');
      }
    });
  });

  group('join + share screens', () {
    Future<GoRouter> pumpRouter(WidgetTester tester, SessionController s) async {
      final router = buildRouter(s);
      addTearDown(router.dispose);
      await tester.pumpWidget(SessionScope(
        notifier: s,
        child: MaterialApp.router(
          theme: LunoHarbor.theme(Brightness.light),
          routerConfig: router,
        ),
      ));
      await tester.pumpAndSettle();
      return router;
    }

    testWidgets('invite link opens JoinPage and joins into the room',
        (WidgetTester tester) async {
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/conversations/join') {
          return jsonRes({'id': 'room-7', 'title': 'Study'}, 200);
        }
        return jsonRes({}, 200);
      };
      final s = SessionController(httpClient: fake)..selfId = 'me';
      addTearDown(s.disposeAll);
      final router = await pumpRouter(tester, s);
      router.go('/invite/tok-1');
      await tester.pumpAndSettle();
      expect(find.text('초대 수락'), findsOneWidget);
      await tester.tap(find.text('참여하기'));
      await tester.pumpAndSettle();
      expect(router.state.uri.toString(), '/chats/room-7');
    });

    testWidgets('share banner shows and the room consumes it',
        (WidgetTester tester) async {
      final s = SessionController()
        ..selfId = 'me'
        ..pendingShareText = 'shared hello';
      addTearDown(s.disposeAll);
      final router = await pumpRouter(tester, s);
      router.go('/chats');
      await tester.pumpAndSettle();
      expect(find.text('공유 도착'), findsOneWidget);
      // Dismissing clears without navigating.
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();
      expect(s.pendingShareText, isNull);
    });

    testWidgets('opening a room prefills the composer with the share',
        (WidgetTester tester) async {
      final s = SessionController()
        ..selfId = 'me'
        ..selectedId = 'c1'
        ..pendingShareText = 'shared hello';
      addTearDown(s.disposeAll);
      await tester.pumpWidget(SessionScope(
        notifier: s,
        child: MaterialApp(
          theme: LunoHarbor.theme(Brightness.light),
          home: const Scaffold(body: ChatRoomPage(conversationId: 'c1')),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('shared hello'), findsOneWidget);
      expect(s.pendingShareText, isNull);
    });
  });
}
