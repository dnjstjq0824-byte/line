// Product rule (build 17): no screen reloads when a list is dragged down.
// Guards against RefreshIndicator creeping back into any page.
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/widgets/no_pull_refresh.dart';

void main() {
  test('no RefreshIndicator anywhere in lib/', () {
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      final text = f.readAsStringSync();
      if (RegExp(r'\bRefreshIndicator\s*\(').hasMatch(text)) offenders.add(f.path);
    }
    expect(offenders, isEmpty, reason: 'pull-to-refresh is not allowed');
  });

  testWidgets('NoPullRefresh renders its child and never calls onRefresh',
      (tester) async {
    var refreshed = 0;
    await tester.pumpWidget(Directionality(
      textDirection: TextDirection.ltr,
      child: NoPullRefresh(
        onRefresh: () async => refreshed++,
        child: ListView(children: const [SizedBox(height: 2000, child: Text('row'))]),
      ),
    ));
    await tester.drag(find.text('row'), const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(refreshed, 0);
    expect(find.text('row'), findsOneWidget);
  });
}
