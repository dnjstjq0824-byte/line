// F24: signup consent UI — birthdate + mandatory checkboxes render in
// register mode, and the client pre-checks (no-consent, under-14) surface
// localized errors without a round trip.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/main.dart';

void main() {
  testWidgets('register mode shows birthdate and consent, blocks without them',
      (WidgetTester tester) async {
    await tester.pumpWidget(const MessengerApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('새 LUNO 계정 만들기'));
    await tester.pumpAndSettle();

    expect(find.text('생년월일 (YYYY-MM-DD)'), findsOneWidget);
    expect(find.text('이용약관에 동의합니다 (필수)'), findsOneWidget);
    expect(find.text('개인정보 처리방침에 동의합니다 (필수)'), findsOneWidget);
    expect(find.byType(Checkbox), findsNWidgets(2));

    // Submit with nothing agreed: consent error, no network call.
    await tester.ensureVisible(find.widgetWithText(FilledButton, '가입'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, '가입'));
    await tester.pumpAndSettle();
    // Shown in the top strip and again right above the button (build 15).
    expect(find.text('이용약관과 개인정보 처리방침에 모두 동의해 주세요.'),
        findsNWidgets(2));

    // Agree + under-14 birthdate: blocked on-device.
    await tester.tap(find.byType(Checkbox).at(0));
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.enterText(
        find.widgetWithText(TextField, '생년월일 (YYYY-MM-DD)'), '2020-01-01');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.widgetWithText(FilledButton, '가입'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, '가입'));
    await tester.pumpAndSettle();
    expect(find.text('만 14세 이상만 가입할 수 있습니다.'), findsNWidgets(2));
  });
}
