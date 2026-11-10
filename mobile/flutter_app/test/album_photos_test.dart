import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/album_photos.dart';

void main() {
  test('album photo ids collect room image attachments', () {
    final ids = roomImageAttachmentIds([
      {
        'kind': 'image',
        'metadata': {'attachment_id': 'a1'}
      },
      {'kind': 'text', 'body': 'hi'},
      {
        'kind': 'image',
        'metadata': {'attachment_id': 'a2'}
      },
      {
        'kind': 'image',
        'metadata': {'attachment_id': 'a1'}
      },
      {
        'kind': 'image',
      },
    ]);
    expect(ids, equals(['a1', 'a2']));
    expect(roomImageAttachmentIds('nope'), isEmpty);
    expect(roomImageAttachmentIds(null), isEmpty);
  });
}
