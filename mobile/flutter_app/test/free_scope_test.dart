// Audit P0-7: launch is 100% free — wallet entries hide while the
// server reports payments off, and return when it reports on.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/nav.dart';
import 'package:luno_messenger/pages/apps.dart';
import 'package:luno_messenger/pages/more.dart';
import 'package:luno_messenger/pages/wallet.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/app_l10n.dart';

SessionController scopedSession({required bool payments}) {
  final session = SessionController()
    ..selfId = 'u-test'
    ..selfName = 'Free Scope'
    ..paymentsEnabled = payments;
  addTearDown(session.disposeAll);
  return session;
}

Widget scopedApp(SessionController session, Widget home) => SessionScope(
      notifier: session,
      child: MaterialApp(
        theme: LunoHarbor.theme(Brightness.light),
        home: Scaffold(body: home),
      ),
    );

void main() {
  test('secondaryFor hides only /wallet while payments are off', () {
    final off = LunoNav.secondaryFor(payments: false).map((d) => d.route);
    expect(off, isNot(contains('/wallet')));
    expect(off.length, LunoNav.secondary.length - 1);
    expect(LunoNav.secondaryFor(payments: true).map((d) => d.route),
        contains('/wallet'));
    expect(
        LunoNav.railFor(payments: false).map((d) => d.route),
        isNot(contains('/wallet')));
    expect(LunoNav.railFor(payments: true).map((d) => d.route),
        contains('/wallet'));
  });

  testWidgets('apps directory hides the wallet tile while off',
      (WidgetTester tester) async {
    await tester.pumpWidget(
        scopedApp(scopedSession(payments: false), const AppsPage()));
    await tester.pumpAndSettle();
    expect(find.text(stringsFor('ko').mvWallet), findsNothing);
    expect(find.text(stringsFor('ko').mvRailShop), findsOneWidget);
  });

  testWidgets('more page hides wallet off, shows it on',
      (WidgetTester tester) async {
    await tester.pumpWidget(
        scopedApp(scopedSession(payments: false), const MorePage()));
    await tester.pumpAndSettle();
    expect(find.text(stringsFor('ko').mvWallet), findsNothing);

    await tester.pumpWidget(
        scopedApp(scopedSession(payments: true), const MorePage()));
    await tester.pumpAndSettle();
    expect(find.text(stringsFor('ko').mvWallet), findsOneWidget);
  });

  testWidgets('wallet route stays mounted as a preparing panel while off',
      (WidgetTester tester) async {
    await tester.pumpWidget(
        scopedApp(scopedSession(payments: false), const WalletPage()));
    await tester.pumpAndSettle();
    expect(find.text('결제 기능은 준비 중입니다.'), findsOneWidget);
    expect(find.text(stringsFor('ko').walletTopup), findsNothing);

    await tester.pumpWidget(
        scopedApp(scopedSession(payments: true), const WalletPage()));
    await tester.pumpAndSettle();
    expect(find.text('결제 기능은 준비 중입니다.'), findsNothing);
    expect(find.text(stringsFor('ko').walletTopup), findsOneWidget);
  });
}
