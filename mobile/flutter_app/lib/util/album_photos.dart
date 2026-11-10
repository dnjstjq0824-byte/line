// Album composer: image messages carry metadata.attachment_id, which is
// what POST .../albums accepts as attachment_ids (server keeps the first
// 100 room images). Collects them deduplicated from loaded messages.
List<String> roomImageAttachmentIds(dynamic messages) {
  if (messages is! List) return [];
  final seen = <String>{};
  final ids = <String>[];
  for (final m in messages) {
    if (m is! Map || m['kind'] != 'image') continue;
    final meta = m['metadata'];
    final id = meta is Map ? '${meta['attachment_id'] ?? ''}' : '';
    if (id.isEmpty || id == 'null' || !seen.add(id)) continue;
    ids.add(id);
    if (ids.length >= 100) break;
  }
  return ids;
}
