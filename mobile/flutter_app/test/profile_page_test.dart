import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/profile.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:qr_flutter/qr_flutter.dart';

// Item 12: profile rows render real session data, the ID toggle reflects
// loaded prefs (disabled until loaded), and the QR/photo sheets open.
Widget _wrap(SessionController session) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: const ProfilePage(),
    ),
  );
}

SessionController _fixture() {
  final s = SessionController()
    ..selfName = '도도'
    ..selfHandle = 'dodo_genius'
    ..selfStatusMessage = '최고의 개발자'
    ..selfBirthday = '01-17'
    ..myPrefs = {'searchable_by_id': true}
    ..prefsLoaded = true;
  addTearDown(s.disposeAll);
  return s;
}

void main() {
  testWidgets('profile renders rows from session data',
      (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(_fixture()));
    await tester.pumpAndSettle();
    expect(find.text('프로필'), findsOneWidget);
    expect(find.text('도도'), findsOneWidget);
    expect(find.text('최고의 개발자'), findsOneWidget);
    expect(find.text('dodo_genius'), findsOneWidget);
    expect(find.text('01-17'), findsOneWidget);
    expect(find.text('내 QR 코드'), findsOneWidget);
    expect(find.text('ID로 친구 추가 허용'), findsOneWidget);
    expect(find.text('프로필 사진 및 배경 설정'), findsOneWidget);
    final toggle = tester.widget<Switch>(find.byType(Switch));
    expect(toggle.value, isTrue);
    expect(toggle.onChanged, isNotNull);
  });

  testWidgets('toggle stays disabled until prefs load',
      (WidgetTester tester) async {
    final s = SessionController()
      ..selfName = '도도'
      ..prefsLoaded = false;
    addTearDown(s.disposeAll);
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    final toggle = tester.widget<Switch>(find.byType(Switch));
    expect(toggle.onChanged, isNull);
  });

  testWidgets('QR row opens a scannable code sheet',
      (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(_fixture()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('내 QR 코드'));
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsOneWidget);
    expect(find.text('@dodo_genius'), findsOneWidget);
  });

  testWidgets('photo sheet offers camera, gallery, and delete',
      (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(_fixture()));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('프로필 사진 및 배경 설정'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('프로필 사진 및 배경 설정'));
    await tester.pumpAndSettle();
    expect(find.text('카메라'), findsOneWidget);
    expect(find.text('사진 선택'), findsOneWidget);
    expect(find.text('프로필 사진 삭제'), findsOneWidget);
  });

  testWidgets('name edit submits fail-closed without server',
      (WidgetTester tester) async {
    final s = _fixture();
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    await tester.tap(find.text('도도'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('저장'));
    await tester.pumpAndSettle();
    expect(s.error, isNotEmpty);
  });
}
