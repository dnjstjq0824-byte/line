// Wallet send needs a recipient user id, but the chat header only knows
// the conversation. For 1:1 rooms the peer is the member that is not us;
// groups/official rooms resolve to null so the caller can say so honestly.
String? sendPeerIdOf({required dynamic conversation, required String selfId}) {
  if (conversation is! Map) return null;
  if (conversation['kind'] != 'direct') return null;
  final members = conversation['members'];
  if (members is! List) return null;
  for (final m in members) {
    final id = m is Map ? '${m['id'] ?? ''}' : '$m';
    if (id.isNotEmpty && id != selfId && id != 'null') return id;
  }
  return null;
}
