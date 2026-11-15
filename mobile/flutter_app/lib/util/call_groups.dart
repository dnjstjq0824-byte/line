// LINE-style call ledger helpers: group consecutive same-peer calls into
// one "name (n)" row and render the day-aware row date. Pure functions over
// the GET /api/v1/calls entries (title / conversation_id / outgoing /
// result / kind / started_at). Unparseable input renders as '' so the
// caller omits the date rather than showing a misleading value.
// F20: locale-aware via stringsFor (ko default keeps every existing test).
import 'app_l10n.dart';

DateTime? _parse(dynamic iso) {
  final raw = iso?.toString() ?? '';
  if (raw.isEmpty || raw == 'null') return null;
  return DateTime.tryParse(raw)?.toLocal();
}

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// True for ledger entries the user never connected (red row).
bool isMissedCall(Map<String, dynamic> call) {
  final result = call['result']?.toString() ?? '';
  return result == 'missed' || result == 'declined';
}

String _weekdayName(AppLocalizations s, int weekday) {
  switch (weekday) {
    case 1:
      return s.weekMon;
    case 2:
      return s.weekTue;
    case 3:
      return s.weekWed;
    case 4:
      return s.weekThu;
    case 5:
      return s.weekFri;
    case 6:
      return s.weekSat;
    default:
      return s.weekSun;
  }
}

/// Call-row date: clock time today, weekday name for the past 6 days,
/// "M. D." for older same-year dates, "Y. M. D." beyond that.
String callRowDate(dynamic iso, {DateTime? now, String locale = 'ko'}) {
  final at = _parse(iso);
  if (at == null) return '';
  final s = stringsFor(locale);
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final day = DateTime(at.year, at.month, at.day);
  if (_sameDay(day, today)) {
    final period = at.hour < 12 ? s.ampmAm : s.ampmPm;
    var h12 = at.hour % 12;
    if (h12 == 0) h12 = 12;
    return s.timeHm(period, h12, at.minute.toString().padLeft(2, '0'));
  }
  final back = today.difference(day).inDays;
  if (back >= 1 && back <= 6) return _weekdayName(s, at.weekday);
  if (at.year == n.year) return '${at.month}. ${at.day}.';
  return '${at.year}. ${at.month}. ${at.day}.';
}

/// One ledger row: consecutive entries with the same peer, kind, direction
/// and missed state. [latest] is the head entry (server order is newest
/// first); [count] is the group size.
class CallGroup {
  final Map<String, dynamic> latest;
  final int count;
  final bool missed;
  const CallGroup(
      {required this.latest, required this.count, required this.missed});
}

String _groupKey(Map<String, dynamic> call) {
  final missed = isMissedCall(call);
  return "${call['conversation_id']}|${call['title']}|${call['kind']}|"
      "${call['outgoing'] == true}|$missed";
}

/// Detail-view day header: "Y. M. D." like the reference ledger.
String callDetailDay(dynamic iso) {
  final at = _parse(iso);
  if (at == null) return '';
  return '${at.year}. ${at.month}. ${at.day}.';
}

/// Right-hand label for history entries without a connected duration.
String callOutcome(String result, [String locale = 'ko']) {
  final s = stringsFor(locale);
  switch (result) {
    case 'missed':
      return s.mvMissedCall;
    case 'declined':
      return s.callDeclined;
    case 'canceled':
    case 'cancelled':
      return s.mvCancel;
    default:
      return '';
  }
}

/// One day section in the peer detail view.
class CallDay {
  final String label;
  final List<Map<String, dynamic>> items;
  const CallDay({required this.label, required this.items});
}

/// Groups [entries] (already filtered to one peer) under day headers in
/// input order. Entries without a parseable date are omitted: they cannot
/// honestly sit under any day header.
List<CallDay> groupCallDays(List<Map<String, dynamic>> entries) {
  final days = <CallDay>[];
  for (final entry in entries) {
    final label = callDetailDay(entry['started_at']);
    if (label.isEmpty) continue;
    if (days.isEmpty || days.last.label != label) {
      days.add(CallDay(label: label, items: [entry]));
    } else {
      days.last.items.add(entry);
    }
  }
  return days;
}

/// In-room call bubble title: the server-minted body, or the call type
/// when the body is empty.
String callBubbleTitle(Map<String, dynamic> msg, [String locale = 'ko']) {
  final body = msg['body']?.toString() ?? '';
  if (body.isNotEmpty) return body;
  final meta = msg['metadata'];
  final type = meta is Map ? meta['call_type']?.toString() : null;
  final s = stringsFor(locale);
  return type == 'video' ? s.callVideo : s.callVoice;
}

/// In-room call bubble duration ("m:ss"). Accepts numeric seconds and the
/// "MM:SS" strings the server mints; anything else renders as ''.
String callBubbleDuration(Map<String, dynamic> msg) {
  final meta = msg['metadata'];
  final raw = meta is Map ? meta['duration'] : null;
  if (raw is num) {
    final m = raw.toInt() ~/ 60;
    final s = (raw.toInt() % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
  if (raw is String) {
    final m = RegExp(r'^(\d+):(\d{2})$').firstMatch(raw.trim());
    if (m != null) return '${int.parse(m.group(1)!)}:${m.group(2)}';
  }
  return '';
}

List<CallGroup> groupCalls(List<dynamic> calls) {
  final groups = <CallGroup>[];
  String? key;
  Map<String, dynamic>? head;
  var count = 0;
  var missed = false;
  void flush() {
    if (head != null) {
      groups.add(CallGroup(latest: head!, count: count, missed: missed));
    }
    key = null;
    head = null;
    count = 0;
  }

  for (final entry in calls) {
    if (entry is! Map<String, dynamic>) continue;
    final k = _groupKey(entry);
    if (k != key) {
      flush();
      key = k;
      head = entry;
      missed = isMissedCall(entry);
    }
    count++;
  }
  flush();
  return groups;
}
