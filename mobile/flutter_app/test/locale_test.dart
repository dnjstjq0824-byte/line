// F20: app locales (ko/en/th/ja) — context lookup per locale with a
// Korean fallback, session locale persistence, time/call helpers per
// locale, and the settings language picker.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/pages/settings.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/app_l10n.dart';
import 'package:luno_messenger/util/call_groups.dart';
import 'package:luno_messenger/util/chat_time.dart';

final Map<String, String> localeVault = {};

void mockVault() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (call) async {
    final args =
        (call.arguments as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    final key = args['key'] as String?;
    if (call.method == 'write' && key != null) {
      localeVault[key] = args['value'] as String? ?? '';
      return null;
    }
    if (call.method == 'read') return localeVault[key];
    if (call.method == 'delete') {
      if (key != null) localeVault.remove(key);
      return null;
    }
    if (call.method == 'deleteAll') {
      localeVault.clear();
      return null;
    }
    return null;
  });
}

Widget localizedProbe(String code, Widget Function(BuildContext) build) {
  return MaterialApp(
    locale: Locale(code),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: Builder(builder: build)),
  );
}

void main() {
  mockVault();
  setUp(localeVault.clear);

  group('stringsFor', () {
    test('each locale renders its own words', () {
      expect(stringsFor('ko').settingsTitle, '설정');
      expect(stringsFor('en').settingsTitle, 'Settings');
      expect(stringsFor('th').settingsTitle, 'ตั้งค่า');
      expect(stringsFor('ja').settingsTitle, '設定');
      expect(stringsFor('ko').photoCountMeta(3, 'd'), '사진 3장 · d');
      expect(stringsFor('en').photoCountMeta(3, 'd'), '3 photos · d');
      expect(stringsFor('ja').groupSelfName('Bob'), 'Bob（自分）');
      expect(stringsFor('th').groupSelfName('Bob'), 'Bob (ฉัน)');
    });
    test('unknown codes fall back to Korean', () {
      expect(stringsFor('xx').settingsTitle, '설정');
      expect(stringsFor('').settingsTitle, '설정');
    });
  });

  group('context.l10n', () {
    testWidgets('follows the installed delegates per locale',
        (WidgetTester tester) async {
      for (final entry in {
        'ko': '설정',
        'en': 'Settings',
        'th': 'ตั้งค่า',
        'ja': '設定'
      }.entries) {
        await tester.pumpWidget(localizedProbe(
            entry.key, (context) => Text(context.l10n.settingsTitle)));
        await tester.pumpAndSettle();
        expect(find.text(entry.value), findsOneWidget,
            reason: 'locale ${entry.key}');
      }
    });
    testWidgets('falls back to Korean without delegates',
        (WidgetTester tester) async {
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: Builder(
                  builder: (context) =>
                      Text(context.l10n.settingsTitle)))));
      await tester.pumpAndSettle();
      expect(find.text('설정'), findsOneWidget);
      expect(appLocaleOf(tester.element(find.byType(Scaffold))), 'ko');
    });
  });

  group('session locale', () {
    test('setLocale persists and restore reloads it', () async {
      final s = SessionController();
      addTearDown(s.disposeAll);
      await s.setLocale('ja');
      expect(s.locale, 'ja');
      expect(s.strings.settingsTitle, '設定');
      final s2 = SessionController();
      addTearDown(s2.disposeAll);
      await s2.restore();
      expect(s2.locale, 'ja', reason: 'locale survives restart');
    });
    test('bogus codes are refused', () async {
      final s = SessionController();
      addTearDown(s.disposeAll);
      await s.setLocale('xx');
      expect(s.locale, 'ko');
    });
  });

  group('helpers per locale', () {
    test('bubble/divider/list times translate', () {
      expect(bubbleTime('2026-07-21T09:05:00', 'en'), '9:05 AM');
      expect(bubbleTime('2026-07-21T09:05:00', 'ko'), '오전 9:05');
      expect(bubbleTime('2026-07-21T21:05:00', 'ja'), '午後9:05');
      expect(dividerLabel('2026-07-21T09:05:00',
          now: DateTime(2026, 7, 21, 12), locale: 'th'), 'วันนี้'.isEmpty ? '' : 'วันนี้');
      expect(listTime('2026-07-21T09:05:00',
          now: DateTime(2026, 7, 21, 12), locale: 'en'), '9:05 AM');
      expect(listTime('2026-05-01T09:05:00',
          now: DateTime(2026, 7, 21, 12), locale: 'en'), '5/1');
    });
    test('call ledger labels translate', () {
      expect(callOutcome('missed', 'en'), 'Missed call');
      expect(callOutcome('declined', 'ja'), '拒否された通話');
      expect(callOutcome('canceled', 'th'), 'ยกเลิก');
      expect(callBubbleTitle({'body': '', 'metadata': {'call_type': 'video'}}, 'th'), 'วิดีโอคอล');
      expect(callRowDate('2026-07-21T09:05:00',
          now: DateTime(2026, 7, 21, 12), locale: 'en'), '9:05 AM');
    });
  });

  group('settings picker', () {
    testWidgets('language row switches the session locale',
        (WidgetTester tester) async {
      final s = SessionController()
        ..myPrefs = {'searchable_by_id': true}
        ..prefsLoaded = true;
      addTearDown(s.disposeAll);
      await tester.pumpWidget(SessionScope(
        notifier: s,
        child: MaterialApp(home: const Scaffold(body: SettingsPage())),
      ));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('언어'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('한국어'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();
      expect(s.locale, 'en');
    });
  });
}
