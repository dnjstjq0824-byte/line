// Story cards: GET /api/v1/stories returns
// {stories: [{id,author{...},body,bg,created_at,...}]}. Cards render
// normalized author_name/text maps.
import './app_l10n.dart';

List<Map<String, dynamic>> storyCardsOf(dynamic json, [String locale = 'ko']) {
  final list = json is Map ? json['stories'] : null;
  if (list is! List) return [];
  return [for (final s in list) if (s is Map) storyCardOf(s, locale)];
}

Map<String, dynamic> storyCardOf(Map<dynamic, dynamic> s, [String locale = 'ko']) {
  final strings = stringsFor(locale);
  final author = s['author'];
  final name = author is Map
      ? '${author['display_name'] ?? strings.navFriends}'
      : '${s['author_name'] ?? strings.navFriends}';
  return {
    'id': '${s['id'] ?? ''}',
    'emoji': '${s['emoji'] ?? ''}',
    'author_name': name,
    'text': '${s['text'] ?? s['body'] ?? ''}',
    'created_at': '${s['created_at'] ?? ''}',
  };
}
