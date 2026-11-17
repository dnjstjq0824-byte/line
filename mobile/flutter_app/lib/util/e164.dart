// F26: best-effort E.164 for contact numbers. International forms pass
// through validated; a domestic trunk (leading 0) needs an explicit
// country code (from the device region); anything else is skipped and
// never uploaded.
final _e164 = RegExp(r'^\+[1-9][0-9]{7,14}$');

String? toE164(String raw, {String? countryCode}) {
  final t = raw.trim();
  if (t.startsWith('+')) {
    final d = '+${t.substring(1).replaceAll(RegExp(r'\D'), '')}';
    return _e164.hasMatch(d) ? d : null;
  }
  final digits = t.replaceAll(RegExp(r'\D'), '');
  if (t.startsWith('00') && digits.length > 2) {
    final d = '+${digits.substring(2)}';
    return _e164.hasMatch(d) ? d : null;
  }
  if (countryCode != null && digits.startsWith('0') && digits.length > 1) {
    final d = '+$countryCode${digits.substring(1)}';
    return _e164.hasMatch(d) ? d : null;
  }
  return null;
}

/// Device-region calling codes for the trunk fallback above. Small on
/// purpose: unknown regions skip trunk numbers instead of guessing.
const regionCallingCodes = {
  'KR': '82',
  'JP': '81',
  'TH': '66',
  'US': '1',
  'CA': '1',
};

String? regionCallingCode(String localeName) {
  final parts = localeName.split(RegExp(r'[_-]'));
  if (parts.length < 2) return null;
  return regionCallingCodes[parts.last.toUpperCase()];
}
