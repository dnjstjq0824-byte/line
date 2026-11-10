// VOOM feed shapes: GET /api/v1/voom returns {videos: [voomView...]} where
// voomView = {id,title,emoji,bg,author{...},created_at,like_count,liked,
// comments}. Cards render normalized maps; anything misshapen is skipped so
// the feed degrades to empty instead of crashing.
List<Map<String, dynamic>> feedPostsOf(dynamic json) {
  final list = json is Map ? (json['videos'] ?? json['posts']) : null;
  if (list is! List) return [];
  return [for (final v in list) if (v is Map) feedPostCardOf(v)];
}

Map<String, dynamic> feedPostCardOf(Map<dynamic, dynamic> v) {
  final author = v['author'];
  final name =
      author is Map ? '${author['display_name'] ?? 'LUNO'}' : 'LUNO';
  final handle = author is Map && '${author['handle'] ?? ''}'.isNotEmpty
      ? '@${author['handle']}'
      : '';
  final title = '${v['title'] ?? ''}';
  return {
    'id': '${v['id'] ?? ''}',
    'title': title,
    'emoji': '${v['emoji'] ?? ''}',
    // Worker posts carry no body: the title is the readable text.
    'body': title,
    'author': name,
    'handle': handle,
    'created_at': '${v['created_at'] ?? ''}',
    'likes': (v['like_count'] as num?)?.toInt() ?? 0,
    'liked': v['liked'] == true,
    'comments': v['comments'] is List ? v['comments'] : [],
  };
}

/// POST /api/v1/voom requires a title (<=100 chars). The composer only
/// collects free text, so the title is its first non-empty line.
String feedPostTitleOf(String body) {
  final first = body
      .split('\n')
      .map((l) => l.trim())
      .firstWhere((l) => l.isNotEmpty, orElse: () => '');
  return first.length > 100 ? first.substring(0, 100) : first;
}
