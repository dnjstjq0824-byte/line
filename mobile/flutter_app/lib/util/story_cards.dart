// Story cards: GET /api/v1/stories returns
// {stories: [{id,author{...},body,bg,created_at,...}]}. Cards render
// normalized author_name/text maps.
List<Map<String, dynamic>> storyCardsOf(dynamic json) {
  final list = json is Map ? json['stories'] : null;
  if (list is! List) return [];
  return [for (final s in list) if (s is Map) storyCardOf(s)];
}

Map<String, dynamic> storyCardOf(Map<dynamic, dynamic> s) {
  final author = s['author'];
  final name = author is Map
      ? '${author['display_name'] ?? '친구'}'
      : '${s['author_name'] ?? '친구'}';
  return {
    'id': '${s['id'] ?? ''}',
    'emoji': '${s['emoji'] ?? ''}',
    'author_name': name,
    'text': '${s['text'] ?? s['body'] ?? ''}',
    'created_at': '${s['created_at'] ?? ''}',
  };
}
