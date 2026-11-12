import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/qr_scan.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/qr_payload.dart';

// Mobile P1-14: the scan page never touches the platform camera here
// (scannerOverride replaces MobileScanner); the payload sheets prove each
// code kind routes to its confirm action. No HTTP is exercised.
Widget _wrap(SessionController session, Widget page) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: Scaffold(body: page),
    ),
  );
}

void main() {
  testWidgets('scan page renders frame and manual entry toggle',
      (WidgetTester tester) async {
    final session = SessionController()..selfName = '나';
    addTearDown(session.disposeAll);
    await tester.pumpWidget(
        _wrap(session, const QrScanPage(scannerOverride: SizedBox())));
    await tester.pumpAndSettle();
    expect(find.text('QR 스캔'), findsOneWidget);
    expect(find.text('직접 입력하기'), findsOneWidget);
  });

  testWidgets('manual form gates approve on both fields',
      (WidgetTester tester) async {
    final session = SessionController()..selfName = '나';
    addTearDown(session.disposeAll);
    await tester.pumpWidget(
        _wrap(session, const QrScanPage(scannerOverride: SizedBox())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('직접 입력하기'));
    await tester.pumpAndSettle();
    FilledButton approveBtn() =>
        tester.widget<FilledButton>(find.widgetWithText(FilledButton, '승인'));
    expect(approveBtn().onPressed, isNull);
    await tester.enterText(
        find.widgetWithText(TextField, 'QR Challenge ID'), 'cid-1');
    await tester.enterText(
        find.widgetWithText(TextField, 'QR Token'), 'qr-tok-2');
    await tester.pump();
    expect(approveBtn().onPressed, isNotNull);
  });

  testWidgets('login sheet confirms via callback',
      (WidgetTester tester) async {
    var confirmed = false;
    final session = SessionController()..selfName = '나';
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(
        session,
        QrPayloadSheet(
          payload: const QrPayload.login('cid-1', 'qr-tok-2'),
          raw: 'LUNO-LOGIN:cid-1:qr-tok-2',
          onConfirm: () async {
            confirmed = true;
          },
        )));
    await tester.pumpAndSettle();
    expect(find.text('PC/웹 로그인 승인'), findsOneWidget);
    expect(find.textContaining('cid-1'), findsOneWidget);
    await tester.tap(find.text('승인하기'));
    await tester.pump();
    expect(confirmed, isTrue);
  });

  testWidgets('friend sheet confirms via callback',
      (WidgetTester tester) async {
    var confirmed = false;
    final session = SessionController()..selfName = '나';
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(
        session,
        QrPayloadSheet(
          payload: const QrPayload.friend('alice_kim'),
          raw: 'LUNO-FRIEND:alice_kim',
          onConfirm: () async {
            confirmed = true;
          },
        )));
    await tester.pumpAndSettle();
    expect(find.text('친구 추가'), findsOneWidget);
    expect(find.textContaining('alice_kim'), findsOneWidget);
    await tester.tap(find.text('추가하기'));
    await tester.pump();
    expect(confirmed, isTrue);
  });

  testWidgets('unknown sheet offers no confirm action',
      (WidgetTester tester) async {
    final session = SessionController()..selfName = '나';
    addTearDown(session.disposeAll);
    await tester.pumpWidget(_wrap(
        session,
        QrPayloadSheet(
          payload: const QrPayload.unknown(),
          raw: 'https://example.com',
          onConfirm: () async {},
        )));
    await tester.pumpAndSettle();
    expect(find.text('LUNO QR 코드가 아닙니다.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, '승인하기'), findsNothing);
    expect(find.widgetWithText(FilledButton, '추가하기'), findsNothing);
  });
}
