import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/pages/contact_find.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/app_permissions.dart';
import 'package:luno_messenger/util/contact_source.dart';
import 'package:luno_messenger/util/e164.dart';
import 'package:permission_handler/permission_handler.dart';

// A11 (F26 app): find-by-contacts runs consent -> permission -> results,
// posts E.164 only, and shows guidance when the server is off.
class _ContactFake extends http.BaseClient {
  final List<Map<String, dynamic>> calls = [];
  bool consented = false;
  bool match503 = false;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    dynamic data;
    if (request is http.Request && request.body.isNotEmpty) {
      data = jsonDecode(request.body);
    }
    calls.add({
      'method': request.method,
      'path': request.url.path,
      'data': data,
    });
    Object body = {};
    var status = 200;
    if (request.url.path.endsWith('/contacts/consent')) {
      if (request.method == 'POST') {
        consented = (data as Map)['consented'] == true;
      }
      body = {
        'consented': consented,
        'consented_at': consented ? '2026-11-17T00:00:00Z' : ''
      };
    } else if (request.url.path.endsWith('/contacts/match')) {
      if (match503) {
        status = 503;
        body = {'error': 'off', 'code': 'PHONE_AUTH_DISABLED'};
      } else {
        body = {
          'matches': [
            {
              'phone': '+821012345678',
              'user': {'id': 'u9', 'display_name': 'Nina', 'handle': 'nina'}
            }
          ]
        };
      }
    } else if (request.url.path.endsWith('/friends') && request.method == 'POST') {
      body = {'status': 'friend_added'};
    }
    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(body))),
      status,
      headers: {'content-type': 'application/json'},
    );
  }
}

class _GrantedGateway extends PermissionGateway {
  @override
  Future<bool> isGranted(Permission p) async => true;
}

class _FakeSource extends ContactSource {
  final List<ContactEntry> entries;
  int reads = 0;
  _FakeSource(this.entries);
  @override
  Future<List<ContactEntry>> readContacts() async {
    reads++;
    return entries;
  }
}

SessionController _session(_ContactFake fake) {
  final s = SessionController(httpClient: fake)..selfName = '도도';
  addTearDown(s.disposeAll);
  return s;
}

Widget _wrap(SessionController session, Widget child) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(home: Scaffold(body: child)),
  );
}

void main() {
  group('e164', () {
    test('keeps valid international forms, drops the rest', () {
      expect(toE164('+821012345678'), '+821012345678');
      expect(toE164('+82 10-1234-5678'), '+821012345678');
      expect(toE164('00821012345678'), '+821012345678');
      expect(toE164('01012345678', countryCode: '82'), '+821012345678');
      expect(toE164('010-1234-5678', countryCode: '82'), '+821012345678');
      expect(toE164('01012345678'), isNull, reason: 'no country, no guess');
      expect(toE164('abc'), isNull);
      expect(toE164(''), isNull);
      expect(toE164('+1'), isNull, reason: 'too short');
      expect(toE164('012345678901234567890'), isNull, reason: 'too long');
    });
    test('region map covers the app locales, nothing else', () {
      expect(regionCallingCode('ko_KR'), '82');
      expect(regionCallingCode('ja_JP'), '81');
      expect(regionCallingCode('th_TH'), '66');
      expect(regionCallingCode('en_US'), '1');
      expect(regionCallingCode('en'), isNull);
      expect(regionCallingCode('fr_FR'), isNull);
    });
  });

  group('contact find page', () {
    testWidgets('nothing leaves before consent', (WidgetTester tester) async {
      final fake = _ContactFake();
      final source = _FakeSource(
          [const ContactEntry(name: 'Nina', phones: ['01012345678'])]);
      await tester.pumpWidget(_wrap(_session(fake),
          ContactFindPage(source: source, countryCode: '82')));
      await tester.pumpAndSettle();
      expect(find.text('연락처 찾기 동의'), findsOneWidget);
      expect(find.byKey(const ValueKey('contact-load')), findsNothing);
      expect(source.reads, 0);
      expect(fake.calls.where((c) => c['method'] == 'POST'), isEmpty,
          reason: 'no consent POST, no match POST');
    });

    testWidgets('later stays without requests', (WidgetTester tester) async {
      final fake = _ContactFake();
      await tester.pumpWidget(_wrap(_session(fake),
          ContactFindPage(source: _FakeSource([]), countryCode: '82')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('contact-later')));
      await tester.pumpAndSettle();
      expect(find.text('연락처 찾기 동의'), findsOneWidget);
      expect(fake.calls.where((c) => c['method'] == 'POST'), isEmpty);
    });

    testWidgets('agree, permission, results, add', (WidgetTester tester) async {
      PermissionGateway.debugOverride = _GrantedGateway();
      addTearDown(() => PermissionGateway.debugOverride = null);
      final fake = _ContactFake();
      final source = _FakeSource([
        const ContactEntry(name: 'Nina', phones: ['010-1234-5678', 'junk']),
      ]);
      final session = _session(fake);
      await tester.pumpWidget(
          _wrap(session, ContactFindPage(source: source, countryCode: '82')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('contact-agree')));
      await tester.pumpAndSettle();
      final consentPost = fake.calls.firstWhere(
          (c) => (c['path'] as String).endsWith('/contacts/consent') && c['method'] == 'POST');
      expect((consentPost['data'] as Map)['consented'], isTrue);
      expect(session.contactConsent, isTrue);
      await tester.tap(find.byKey(const ValueKey('contact-load')));
      await tester.pumpAndSettle();
      expect(source.reads, 1);
      final match = fake.calls.firstWhere(
          (c) => (c['path'] as String).endsWith('/contacts/match'));
      expect((match['data'] as Map)['phones'], ['+821012345678']);
      expect(find.text('Nina'), findsWidgets);
      await tester.tap(find.text('추가'));
      await tester.pumpAndSettle();
      final add = fake.calls.firstWhere(
          (c) => (c['path'] as String).endsWith('/friends') && c['method'] == 'POST');
      expect((add['data'] as Map)['friend_id'], 'u9');
    });

    testWidgets('server 503 shows guidance only', (WidgetTester tester) async {
      PermissionGateway.debugOverride = _GrantedGateway();
      addTearDown(() => PermissionGateway.debugOverride = null);
      final fake = _ContactFake()..match503 = true;
      final source = _FakeSource(
          [const ContactEntry(name: 'Nina', phones: ['+821012345678'])]);
      await tester.pumpWidget(_wrap(
          _session(fake), ContactFindPage(source: source, countryCode: '82')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('contact-agree')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('contact-load')));
      await tester.pumpAndSettle();
      expect(find.text('연락처 찾기를 사용할 수 없습니다.'), findsOneWidget);
      expect(find.byType(ListTile), findsNothing);
    });
  });
}
