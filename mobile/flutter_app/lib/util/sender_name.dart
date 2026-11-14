// Item 6: group sender-name resolution. The server ships sender_name on
// every message; the members list is the fallback for backends without it.
// L-01: bot senders (server sender_kind, or a kind-carrying member entry)
// get a [BOT] suffix.
String senderNameOf(dynamic message, List<dynamic> members) {
  String resolve() {
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

  final name = resolve();
  if (name.isEmpty) return '';
  var bot = false;
  if (message is Map && message['sender_kind'] == 'bot') bot = true;
  if (!bot && message is Map) {
    final id = message['sender_id'];
    if (id is String && id.isNotEmpty) {
      for (final m in members) {
        if (m is Map && m['id'] == id && m['kind'] == 'bot') bot = true;
      }
    }
  }
  return bot ? '$name [BOT]' : name;
}
