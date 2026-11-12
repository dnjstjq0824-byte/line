// QR scan payloads. Login codes mirror apps/shared/login_qr.ts
// (LUNO-LOGIN:<challenge_id>:<qr_token>); friend codes mirror
// POST /api/v1/friends qr_code (LUNO-FRIEND:<handle>, legacy LINE-FRIEND:).
enum QrPayloadKind { login, friend, unknown }

class QrPayload {
  final QrPayloadKind kind;
  final String challengeId;
  final String qrToken;
  final String handle;
  const QrPayload._(this.kind,
      {this.challengeId = '', this.qrToken = '', this.handle = ''});
  const QrPayload.login(String cid, String token)
      : this._(QrPayloadKind.login, challengeId: cid, qrToken: token);
  const QrPayload.friend(String handle)
      : this._(QrPayloadKind.friend, handle: handle);
  const QrPayload.unknown() : this._(QrPayloadKind.unknown);
}

final _loginPattern =
    RegExp(r'^LUNO-LOGIN:([^:]+):([^:]+)$', caseSensitive: false);
final _friendPattern =
    RegExp(r'^(?:LUNO-FRIEND|LINE-FRIEND):(.+)$', caseSensitive: false);

QrPayload parseQrPayload(String raw) {
  final text = raw.trim();
  final login = _loginPattern.firstMatch(text);
  if (login != null) {
    final cid = login.group(1)!.trim();
    final token = login.group(2)!.trim();
    if (cid.isNotEmpty && token.isNotEmpty) {
      return QrPayload.login(cid, token);
    }
    return const QrPayload.unknown();
  }
  final friend = _friendPattern.firstMatch(text);
  if (friend != null) {
    final handle =
        friend.group(1)!.trim().replaceFirst(RegExp(r'^@'), '');
    if (handle.isNotEmpty) return QrPayload.friend(handle);
  }
  return const QrPayload.unknown();
}
