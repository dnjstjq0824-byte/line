// Item 6: group sender-name resolution. The server ships sender_name on
// every message; the members list is the fallback for backends without it.
String senderNameOf(dynamic message, List<dynamic> members) {
  if (message is Map) {
    final direct = message['sender_name'];
    if (direct is String && direct.isNotEmpty) return direct;
    final id = message['sender_id'];
    if (id is String && id.isNotEmpty) {
      for (final m in members) {
        if (m is Map && m['id'] == id) {
          final name = m['display_name'];
          if (name is String && name.isNotEmpty) return name;
        }
      }
    }
  }
  return '';
}
