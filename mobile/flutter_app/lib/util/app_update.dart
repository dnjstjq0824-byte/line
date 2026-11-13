// C3: app-update version comparison (pure logic, no I/O).
//
// Rule: a newer MAJOR forces the update; any other newer component
// (minor, patch, or build number) suggests it as optional; equal or older
// (rollback) versions, and anything unparseable, stay silent.
enum UpdateKind { none, optional, force }

/// Parses "2.0.0+8" / "2.0.0" / "2.0.0-dev+3" into [major, minor, patch, build].
/// Pre-release tags are ignored for ordering; unparseable input yields null.
List<int>? parseAppVersion(String raw) {
  final cleaned = raw.trim();
  if (cleaned.isEmpty) return null;
  final plus = cleaned.indexOf('+');
  final core = (plus < 0 ? cleaned : cleaned.substring(0, plus)).split('-').first;
  final parts = core.split('.');
  if (parts.length != 3) return null;
  final nums = <int>[];
  for (final p in parts) {
    final n = int.tryParse(p);
    if (n == null || n < 0) return null;
    nums.add(n);
  }
  var build = 0;
  if (plus >= 0) {
    build = int.tryParse(cleaned.substring(plus + 1)) ?? -1;
    if (build < 0) return null;
  }
  return [...nums, build];
}

/// Compares installed [current] against server-advertised [latest].
UpdateKind compareAppVersions(String current, String latest) {
  final c = parseAppVersion(current);
  final l = parseAppVersion(latest);
  if (c == null || l == null) return UpdateKind.none;
  if (l[0] != c[0]) return l[0] > c[0] ? UpdateKind.force : UpdateKind.none;
  if (l[1] != c[1] || l[2] != c[2] || l[3] != c[3]) {
    for (var i = 1; i < 4; i++) {
      if (l[i] != c[i]) return l[i] > c[i] ? UpdateKind.optional : UpdateKind.none;
    }
  }
  return UpdateKind.none;
}
