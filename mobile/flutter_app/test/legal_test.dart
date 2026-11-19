// F24: ageOnDate boundary parity — the same pinned cases as the worker
// gate, the Go gate, and apps/shared/legal.ts.
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/legal.dart';

void main() {
  test('age boundaries match the shared spec', () {
    const today = '2026-11-15';
    expect(ageOnDate('2012-11-15', today), 14);
    expect(ageOnDate('2012-11-16', today), 13);
    expect(ageOnDate('1990-01-01', today), 36);
    expect(ageOnDate('2026-11-15', today), 0);
    expect(ageOnDate('2026-11-16', today), isNull);
    expect(ageOnDate('2012-02-30', today), isNull);
    expect(ageOnDate('2012-13-01', today), isNull);
    expect(ageOnDate('not-a-date', today), isNull);
    expect(ageOnDate('', today), isNull);
    expect(ageOnDate('1990-01-01', 'not-a-day'), isNull);
  });

  test('todayUtc is a valid UTC day', () {
    final day = todayUtc();
    expect(RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(day), isTrue);
    expect(ageOnDate('1990-01-01', day), isNotNull);
  });

  test('birthdates typed in common phone formats are normalized', () {
    for (final input in [
      '19900505',
      '1990.05.05',
      '1990.5.5',
      '1990/05/05',
      '1990 05 05',
      '1990-5-5',
      ' 1990. 5. 5. ',
      '1990-05-05',
    ]) {
      expect(normalizeBirthdate(input), '1990-05-05', reason: input);
    }
    expect(normalizeBirthdate('hello'), 'hello');
    expect(ageOnDate(normalizeBirthdate('1990.5.5'), '2026-11-19'), 36);
  });
}
