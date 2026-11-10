// Official accounts: GET /api/v1/official-accounts returns
// {accounts: [{id,name,handle,description,color,followed}]}. Cards render
// normalized display_name/status_message/badge maps.
List<Map<String, dynamic>> officialAccountsOf(dynamic json) {
  final list =
      json is Map ? (json['accounts'] ?? json['official_accounts']) : null;
  if (list is! List) return [];
  return [for (final o in list) if (o is Map) officialAccountCardOf(o)];
}

Map<String, dynamic> officialAccountCardOf(Map<dynamic, dynamic> o) {
  final name = '${o['display_name'] ?? o['name'] ?? ''}';
  return {
    'id': '${o['id'] ?? ''}',
    'display_name': name,
    'status_message': '${o['status_message'] ?? o['description'] ?? ''}',
    'badge': name.isEmpty ? 'L' : String.fromCharCode(name.runes.first),
    'handle': '${o['handle'] ?? ''}',
    'color': '${o['color'] ?? ''}',
    'followed': o['followed'] == true,
  };
}
