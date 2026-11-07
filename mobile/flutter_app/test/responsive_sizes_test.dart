import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/main.dart';

void main() {
  const sizes = <String, Size>{
    'phone-small 360x740': Size(360, 740),
    'phone 390x844': Size(390, 844),
    'tablet-portrait 768x1024': Size(768, 1024),
    'tablet-landscape 1024x768': Size(1024, 768),
    'desktop 1280x800': Size(1280, 800),
  };

  for (final entry in sizes.entries) {
    testWidgets('auth UI renders without overflow on ${entry.key}', (WidgetTester tester) async {
      tester.view.physicalSize = entry.value;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(const MessengerApp());
      await tester.pumpAndSettle();

      expect(find.text('LUNO'), findsWidgets);
      expect(find.text('로그인'), findsWidgets);

      await tester.tap(find.text('새 LUNO 계정 만들기'));
      await tester.pumpAndSettle();
      expect(find.text('회원가입'), findsWidgets);
    });
  }
}
