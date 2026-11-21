// N1-L: background notifications with a fake notifier sink + fake HTTP:
// peer messages and incoming rings notify only while backgrounded, taps
// route to the room, and returning to the foreground resyncs.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/e2ee/store.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/app_notify.dart';

class CannedE2ee extends E2eeStore {
  CannedE2ee(this.open)
      : super(
            kv: MemoryKV(),
            api: (_, [__, ___]) async => {},
            userId: 'me',
            deviceId: 't1');
  final InnerMessage? open;

  @override
  Future<InnerMessage?> decryptBody(String senderId, String body) async => open;
}

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  final List<String> paths = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    paths.add('${request.method} ${request.url.path}?${request.url.query}');
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

class FakeNotifier implements AppNotifier {
  final List<Map<String, String>> messages = [];
  final List<Map<String, String>> calls = [];
  int cancels = 0;
  Future<void> Function(String? payload)? tap;

  @override
  Future<void> init(
      {Future<void> Function(String? payload)? onTap,
      String locale = 'ko'}) async {
    tap = onTap;
  }

  @override
  Future<void> showMessage(
      {required String roomId,
      required String title,
      required String body,
      String locale = 'ko'}) async {
    messages.add({'roomId': roomId, 'title': title, 'body': body});
  }

  @override
  Future<void> showIncomingCall(
      {required String callId,
      required String title,
      required String body,
      String locale = 'ko',
      String kind = 'voice',
      String ringToken = ''}) async {
    calls.add({'callId': callId, 'title': title, 'body': body, 'kind': kind, 'ringToken': ringToken});
  }

  @override
  Future<void> cancelCall() async {
    cancels++;
  }
}

SessionController makeSession(FakeHttp fake, FakeNotifier note) {
  final s = SessionController(httpClient: fake);
  s.notifier = note;
  s.selfId = 'me';
  addTearDown(s.disposeAll);
  return s;
}

void main() {
  group('background notifications', () {
    test('background peer message notifies with the room title', () async {
      final fake = FakeHttp();
      final note = FakeNotifier();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, note);
      s.chats = [
        {'id': 'c1', 'title': 'Peer Room'}
      ];
      s.setForeground(false);
      s.maybeNotifyMessage({
        'type': 'message.created',
        'message': {
          'id': 'm1',
          'conversation_id': 'c1',
          'sender_id': 'peer',
          'kind': 'text',
          'body': 'hello there'
        }
      });
      await Future<void>.delayed(Duration.zero);
      expect(note.messages, hasLength(1));
      expect(note.messages.single['roomId'], 'c1');
      expect(note.messages.single['title'], 'Peer Room');
      expect(note.messages.single['body'], 'hello there');
    });

    test('foreground, own, and disabled messages stay silent', () async {
      final fake = FakeHttp();
      final note = FakeNotifier();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, note);
      final peerMsg = {
        'type': 'message.created',
        'message': {
          'id': 'm1',
          'conversation_id': 'c1',
          'sender_id': 'peer',
          'kind': 'text',
          'body': 'hi'
        }
      };
      s.maybeNotifyMessage(peerMsg);
      expect(note.messages, isEmpty, reason: 'foreground stays silent');
      s.setForeground(false);
      s.maybeNotifyMessage({
        'type': 'message.created',
        'message': {
          'id': 'm2',
          'conversation_id': 'c1',
          'sender_id': 'me',
          'kind': 'text',
          'body': 'own'
        }
      });
      expect(note.messages, isEmpty, reason: 'own messages stay silent');
      s.setNotifyEnabled(false);
      s.maybeNotifyMessage(peerMsg);
      expect(note.messages, isEmpty, reason: 'disabled stays silent');
    });

    test('non-text kinds show a kind label', () async {
      final fake = FakeHttp();
      final note = FakeNotifier();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, note);
      s.setForeground(false);
      s.maybeNotifyMessage({
        'type': 'message.created',
        'message': {
          'id': 'm3',
          'conversation_id': 'c9',
          'sender_id': 'peer',
          'kind': 'image',
          'body': ''
        }
      });
      await Future<void>.delayed(Duration.zero);
      expect(note.messages.single['body'], '[사진]');
      expect(note.messages.single['title'], '새 메시지');
    });

    test('E8: sealed tray line decrypts on-device', () async {
      final fake = FakeHttp();
      final note = FakeNotifier();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, note);
      s.e2eeStoreForTests = CannedE2ee(
          const InnerMessage(kind: 'text', body: 'decrypted hello'));
      s.chats = [
        {'id': 'c1', 'title': 'Sealed Room'}
      ];
      s.setForeground(false);
      s.maybeNotifyMessage({
        'type': 'message.created',
        'message': {
          'id': 'm9',
          'conversation_id': 'c1',
          'sender_id': 'peer',
          'kind': 'ciphertext',
          'body': '{"v":1,"secret_bytes":"must-not-show"}'
        }
      });
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(note.messages, hasLength(1));
      expect(note.messages.single['title'], 'Sealed Room');
      expect(note.messages.single['body'], 'decrypted hello');
    });

    test('E8: undecryptable sealed line stays generic', () async {
      final fake = FakeHttp();
      final note = FakeNotifier();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, note);
      s.setForeground(false);
      s.maybeNotifyMessage({
        'type': 'message.created',
        'message': {
          'id': 'm9',
          'conversation_id': 'c1',
          'sender_id': 'peer',
          'kind': 'ciphertext',
          'body': '{"v":1,"secret_bytes":"must-not-show"}'
        }
      });
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(note.messages, hasLength(1));
      expect(note.messages.single['body'], s.strings.msgNewMessage);
      expect(note.messages.single['body'], isNot(contains('secret_bytes')));
    });

    test('background ring notifies and tap routes to the room', () async {
      final fake = FakeHttp();
      final note = FakeNotifier();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, note);
      final routes = <String>[];
      s.notifyTap = (route) async => routes.add(route);
      await s.initNotifier();
      s.setForeground(false);
      s.debugIncomingRing({
        'type': 'call.ringing',
        'call_id': 'call-1',
        'conversation_id': 'c1',
        'kind': 'video',
        'initiated_by': 'peer',
        'caller_name': 'Peer',
      });
      await Future<void>.delayed(Duration.zero);
      expect(note.calls, hasLength(1));
      expect(note.calls.single['title'], 'Peer');
      expect(note.calls.single['body'], '영상 전화가 왔습니다');
      await note.tap?.call('call:call-1');
      expect(routes, ['/chats/c1']);
      await note.tap?.call('room:c2');
      expect(routes, ['/chats/c1', '/chats/c2']);
      await s.declineCall();
      expect(note.cancels, 1);
    });

    test('returning to foreground resyncs with since_sequence', () async {
      final fake = FakeHttp();
      final note = FakeNotifier();
      fake.handler = (req, body) async {
        if (req.url.path.endsWith('/sync')) {
          return jsonRes({'delta_messages': []}, 200);
        }
        return jsonRes({'conversations': []}, 200);
      };
      final s = makeSession(fake, note);
      s.selectedId = 'c1';
      s.messages = [
        {'id': 'm1', 'sequence': 41}
      ];
      s.setForeground(false);
      expect(
          fake.paths.any((p) => p.contains('/sync')), isFalse,
          reason: 'backgrounding alone syncs nothing');
      s.setForeground(true);
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(
          fake.paths.any((p) =>
              p.contains('/api/v1/conversations/c1/sync') &&
              p.contains('since_sequence=41')),
          isTrue);
    });
  });
}
