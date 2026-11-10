import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/official_accounts.dart';

void main() {
  test('official accounts parse the worker accounts shape', () {
    final list = officialAccountsOf({
      'accounts': [
        {
          'id': 'oa1',
          'name': 'LUNO 공지',
          'handle': 'luno_notice',
          'description': '소식 전달',
          'color': '#4F7CFF',
          'followed': true,
        }
      ]
    });
    expect(list, hasLength(1));
    final o = list.first;
    expect(o['id'], equals('oa1'));
    expect(o['display_name'], equals('LUNO 공지'));
    expect(o['status_message'], equals('소식 전달'));
    expect(o['badge'], equals('L'));
    expect(o['handle'], equals('luno_notice'));
  });

  test('official accounts tolerate legacy keys and misshapen input', () {
    expect(officialAccountsOf({'official_accounts': []}), isEmpty);
    expect(officialAccountsOf({}), isEmpty);
    expect(officialAccountsOf(null), isEmpty);
    expect(officialAccountsOf('nope'), isEmpty);
    expect(officialAccountsOf({'accounts': 'nope'}), isEmpty);
    final legacy = officialAccountsOf({
      'accounts': [
        {'display_name': '구형', 'status_message': '설명'}
      ]
    });
    expect(legacy.first['display_name'], equals('구형'));
    expect(legacy.first['status_message'], equals('설명'));
  });
}
