import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/poll_options.dart';

void main() {
  test('poll options split lines and clip to ten', () {
    expect(pollOptionsOf('a\nb'), equals(['a', 'b']));
    expect(pollOptionsOf('  a  \n\nb\n  '), equals(['a', 'b']));
    expect(pollOptionsOf(''), isEmpty);
    expect(pollOptionsOf(List.filled(12, 'x').join('\n')), hasLength(10));
  });

  test('poll form validity needs a question and two to ten options', () {
    expect(pollFormValid('q?', ['a', 'b']), isTrue);
    expect(pollFormValid('', ['a', 'b']), isFalse);
    expect(pollFormValid('q?', ['a']), isFalse);
    expect(pollFormValid('q?', List.filled(11, 'x')), isFalse);
  });
}
