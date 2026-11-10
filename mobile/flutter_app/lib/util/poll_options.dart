// Poll composer: POST /api/v1/conversations/:id/polls needs a question
// (<=200 chars) and 2..10 options (each <=100). The dialog collects
// options as one-per-line text; these keep client and server in agreement.
List<String> pollOptionsOf(String text) {
  final opts = text
      .split('\n')
      .map((l) => l.trim())
      .where((l) => l.isNotEmpty)
      .map((l) => l.length > 100 ? l.substring(0, 100) : l)
      .toList();
  return opts.length > 10 ? opts.sublist(0, 10) : opts;
}

bool pollFormValid(String question, List<String> options) {
  if (question.trim().isEmpty || question.trim().length > 200) return false;
  return options.length >= 2 && options.length <= 10;
}
