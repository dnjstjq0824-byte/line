import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/main.dart';

void main() {
  testWidgets('MessengerApp boots and displays LUNO authentication UI and brand elements', (WidgetTester tester) async {
    await tester.pumpWidget(const MessengerApp());
    await tester.pumpAndSettle();

    // Verify LUNO Brand Name and Slogan
    expect(find.text('LUNO'), findsWidgets);
    expect(find.text('Connect Beyond Borders'), findsWidgets);
    expect(find.text('로그인'), findsWidgets);
    expect(find.text('이메일'), findsOneWidget);
    expect(find.text('비밀번호 (12자 이상 권장)'), findsOneWidget);

    // Switch to Register form
    await tester.tap(find.text('새 LUNO 계정 만들기'));
    await tester.pumpAndSettle();

    expect(find.text('회원가입'), findsWidgets);
    expect(find.text('표시 이름'), findsOneWidget);
    expect(find.text('가입'), findsOneWidget);
  });

  test('LUNO brand color tokens conform to PO Master Directive', () {
    expect(lunoDeepBlue, equals(const Color(0xFF315BCD)));
    expect(lunoPrimary, equals(const Color(0xFF4F7CFF)));
    expect(lunoSky, equals(const Color(0xFF8EC5FF)));
    expect(lunoMint, equals(const Color(0xFF5EE6C2)));
    expect(lunoNavy, equals(const Color(0xFF14213D)));
    expect(lunoBg, equals(const Color(0xFFF7FAFF)));
  });

  test('LUNO Orbit Crew stickers contain all 6 official characters', () {
    expect(lunoOrbitCrewStickers.length, equals(6));
    final characters = lunoOrbitCrewStickers.map((s) => s['character']).toList();
    expect(characters, containsAll(['Lumi', 'Nori', 'Poko', 'Luno', 'Comet', 'Astro']));
  });

  test('Api client helper constructs proper headers and points to production gateway', () {
    final api = Api();
    expect(api.baseUrl, equals('https://luno-messenger.dnjstjqppk.workers.dev'));
    expect(api.token, isNull);
    api.token = 'test-token';
    expect(api.token, equals('test-token'));
  });
}
