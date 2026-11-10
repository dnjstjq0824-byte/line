// LINE parity time helpers for chat list rows, message bubbles and
// date dividers. Pure functions over the server ISO-8601 timestamps
// (created_at / updated_at). Unparseable input renders as '' so the
// caller can omit the time rather than show a misleading value.
DateTime? _parse(dynamic iso) {
  final raw = iso?.toString() ?? '';
  if (raw.isEmpty || raw == 'null') return null;
  return DateTime.tryParse(raw)?.toLocal();
}

/// Local calendar-day key used to group messages under one divider.
String dayKey(dynamic iso) {
  final at = _parse(iso);
  if (at == null) return '';
  return '${at.year}-${at.month}-${at.day}';
}

String _ampm(DateTime at) {
  final period = at.hour < 12 ? '오전' : '오후';
  var h12 = at.hour % 12;
  if (h12 == 0) h12 = 12;
  return '$period $h12:${at.minute.toString().padLeft(2, '0')}';
}

/// Time shown beside a message bubble (matches the web ko-KR shape).
String bubbleTime(dynamic iso) {
  final at = _parse(iso);
  return at == null ? '' : _ampm(at);
}

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// Date divider label for the message list.
String dividerLabel(dynamic iso, {DateTime? now}) {
  final at = _parse(iso);
  if (at == null) return '';
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final day = DateTime(at.year, at.month, at.day);
  if (_sameDay(day, today)) return '오늘';
  if (_sameDay(day, today.subtract(const Duration(days: 1)))) return '어제';
  return '${at.year}년 ${at.month}월 ${at.day}일';
}

/// Conversation-row time: clock time today, relative date afterwards.
String listTime(dynamic iso, {DateTime? now}) {
  final at = _parse(iso);
  if (at == null) return '';
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final day = DateTime(at.year, at.month, at.day);
  if (_sameDay(day, today)) return _ampm(at);
  if (_sameDay(day, today.subtract(const Duration(days: 1)))) return '어제';
  if (at.year == n.year) return '${at.month}월 ${at.day}일';
  return '${at.year}년 ${at.month}월 ${at.day}일';
}

/// True when [iso] starts a new divider group after [prevIso].
bool showDateDivider(dynamic prevIso, dynamic iso) {
  final key = dayKey(iso);
  if (key.isEmpty) return false;
  return dayKey(prevIso) != key;
}

/// §7-3 burst rule: two adjacent messages share one visual group when they
/// come from the same sender on the same day less than 60s apart.
bool sameBurst(dynamic a, dynamic b) {
  if (a is! Map || b is! Map) return false;
  if ('${a['sender_id']}' != '${b['sender_id']}') return false;
  final ta = _parse(a['created_at']);
  final tb = _parse(b['created_at']);
  if (ta == null || tb == null) return false;
  if (!_sameDay(ta, tb)) return false;
  return ta.difference(tb).abs() < const Duration(seconds: 60);
}

/// True when [msg] leads its burst (avatar + name shown for theirs).
bool isGroupLead(dynamic prev, dynamic msg) => !sameBurst(prev, msg);

/// True when [msg] ends its burst (timestamp + read count shown).
bool isGroupTail(dynamic msg, dynamic next) => !sameBurst(msg, next);
