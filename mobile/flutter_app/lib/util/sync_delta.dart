// Offline sync: GET /api/v1/conversations/:id/sync returns
// {conversation_id,since_sequence,latest_sequence,delta_messages,has_more}.
// Anything misshapen parses to an empty list so sync reports zero instead
// of throwing on a null cast.
List<dynamic> syncDeltaOf(dynamic json) {
  final list =
      json is Map ? (json['delta_messages'] ?? json['messages']) : null;
  return list is List ? list : [];
}
