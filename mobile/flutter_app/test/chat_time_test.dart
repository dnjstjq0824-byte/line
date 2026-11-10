import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/chat_time.dart';

// LINE parity time helpers: bubble HH:MM, list today-time/older-date,
// room date dividers. All pure and deterministic via the `now` parameter.
void main() {
  final now = DateTime(2026, 11, 9, 15, 30);

  test('dayKey groups one local calendar day', () {
    expect(dayKey('2026-11-09T09:00:00'), dayKey('2026-11-09T23:59:00'));
    expect(dayKey('2026-11-09T23:59:00') == dayKey('2026-11-10T00:01:00'),
        isFalse);
    expect(dayKey('not-a-date'), '');
    expect(dayKey(null), '');
  });

  test('bubbleTime renders Korean AM/PM like the web client', () {
    expect(bubbleTime('2026-11-09T09:41:00'), '오전 9:41');
    expect(bubbleTime('2026-11-09T14:05:00'), '오후 2:05');
    expect(bubbleTime('2026-11-09T00:05:00'), '오전 12:05');
    expect(bubbleTime('2026-11-09T12:00:00'), '오후 12:00');
    expect(bubbleTime('not-a-date'), '');
    expect(bubbleTime(null), '');
  });

  test('dividerLabel shows today/yesterday/full date', () {
    expect(dividerLabel('2026-11-09T01:02:00', now: now), '오늘');
    expect(dividerLabel('2026-11-08T23:59:00', now: now), '어제');
    expect(dividerLabel('2026-10-01T10:00:00', now: now), '2026년 10월 1일');
    expect(dividerLabel('not-a-date', now: now), '');
  });

  test('listTime shows time today and date afterwards', () {
    expect(listTime('2026-11-09T09:41:00', now: now), '오전 9:41');
    expect(listTime('2026-11-08T18:20:00', now: now), '어제');
    expect(listTime('2026-05-01T10:00:00', now: now), '5월 1일');
    expect(listTime('2025-12-31T10:00:00', now: now), '2025년 12월 31일');
    expect(listTime('not-a-date', now: now), '');
  });

  test('showDateDivider fires on day change only', () {
    expect(showDateDivider(null, '2026-11-09T09:00:00'), isTrue);
    expect(showDateDivider('2026-11-09T09:00:00', '2026-11-09T18:00:00'),
        isFalse);
    expect(showDateDivider('2026-11-08T23:59:00', '2026-11-09T00:01:00'),
        isTrue);
    expect(showDateDivider('not-a-date', 'also-bad'), isFalse);
    expect(showDateDivider('2026-11-09T09:00:00', 'not-a-date'), isFalse);
  });

  test('sameBurst groups one sender within 60s on one day', () {
    Map<String, Object?> msg(String sender, String at) =>
        {'sender_id': sender, 'created_at': at};
    expect(
        sameBurst(msg('u1', '2026-11-09T09:00:00'),
            msg('u1', '2026-11-09T09:00:59')),
        isTrue);
    expect(
        sameBurst(msg('u1', '2026-11-09T09:00:00'),
            msg('u1', '2026-11-09T09:01:00')),
        isFalse);
    expect(
        sameBurst(msg('u1', '2026-11-09T09:00:00'),
            msg('u2', '2026-11-09T09:00:10')),
        isFalse);
    expect(
        sameBurst(msg('u1', '2026-11-09T23:59:30'),
            msg('u1', '2026-11-10T00:00:10')),
        isFalse);
    expect(sameBurst(msg('u1', 'not-a-date'), msg('u1', 'not-a-date')),
        isFalse);
    expect(sameBurst(null, msg('u1', '2026-11-09T09:00:00')), isFalse);
  });

  test('group lead/tail mark burst edges', () {
    Map<String, Object?> msg(String sender, String at) =>
        {'sender_id': sender, 'created_at': at};
    final a = msg('u1', '2026-11-09T09:00:00');
    final b = msg('u1', '2026-11-09T09:00:30');
    final c = msg('u1', '2026-11-09T09:05:00');
    expect(isGroupLead(null, a), isTrue);
    expect(isGroupLead(a, b), isFalse);
    expect(isGroupLead(b, c), isTrue);
    expect(isGroupTail(a, b), isFalse);
    expect(isGroupTail(b, c), isTrue);
    expect(isGroupTail(c, null), isTrue);
  });
}
