// F24: legal helpers for the app. ageOnDate mirrors the worker gate, the Go
// gate, and apps/shared/legal.ts exactly; all four are pinned by the same
// boundary cases (Flutter legal_test.dart, node f24 suite, Go TestAgeOnDate).

/// Full years between a YYYY-MM-DD birthdate and a YYYY-MM-DD day, or null
/// for anything malformed (including impossible dates and future birthdates).
int? ageOnDate(String birthdate, String onDay) {
  int? part(String s, int i) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(s.trim());
    if (m == null) return null;
    return int.tryParse(m.group(i + 1)!);
  }

  final by = part(birthdate, 0);
  final bm = part(birthdate, 1);
  final bd = part(birthdate, 2);
  final oy = part(onDay, 0);
  final om = part(onDay, 1);
  final od = part(onDay, 2);
  if (by == null || bm == null || bd == null) return null;
  if (oy == null || om == null || od == null) return null;
  if (bm < 1 || bm > 12 || om < 1 || om > 12) return null;
  int dim(int y, int mo) => DateTime.utc(y, mo + 1, 0).day;
  if (bd < 1 || bd > dim(by, bm)) return null;
  if (od < 1 || od > dim(oy, om)) return null;
  var age = oy - by;
  if (om < bm || (om == bm && od < bd)) age--;
  return age < 0 ? null : age;
}

/// Today in UTC, YYYY-MM-DD — the same day the server gates on.
String todayUtc() {
  final now = DateTime.now().toUtc();
  final mm = now.month.toString().padLeft(2, '0');
  final dd = now.day.toString().padLeft(2, '0');
  return '${now.year}-$mm-$dd';
}

/// Accepts the shapes people actually type on a phone keyboard —
/// 19900505, 1990.5.5, 1990/05/05, 1990 05 05, 1990-5-5 — and returns
/// YYYY-MM-DD, or the trimmed input unchanged when it is not a date at all
/// (ageOnDate then rejects it). Build 13 only took the exact hyphen form, so
/// most real sign-ups stopped on the client with "enter your birthdate".
String normalizeBirthdate(String input) {
  final s = input.trim();
  final compact = RegExp(r'^(\d{4})(\d{2})(\d{2})$').firstMatch(s);
  if (compact != null) {
    return '${compact.group(1)}-${compact.group(2)}-${compact.group(3)}';
  }
  final parts = RegExp(r'^(\d{4})\s*[-./\s]\s*(\d{1,2})\s*[-./\s]\s*(\d{1,2})\.?$')
      .firstMatch(s);
  if (parts != null) {
    String two(String v) => v.padLeft(2, '0');
    return '${parts.group(1)}-${two(parts.group(2)!)}-${two(parts.group(3)!)}';
  }
  return s;
}
