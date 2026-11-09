import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/attachments.dart';

void main() {
  test('attachment size cap matches the server 512KiB limit', () {
    expect(maxAttachmentBytes, equals(512 * 1024));
  });

  test('mime maps to the web message kind', () {
    expect(attachmentKindForMime('image/jpeg'), equals('image'));
    expect(attachmentKindForMime('image/png'), equals('image'));
    expect(attachmentKindForMime('audio/mpeg'), equals('audio'));
    expect(attachmentKindForMime('video/mp4'), equals('video'));
    expect(attachmentKindForMime('application/pdf'), equals('file'));
    expect(attachmentKindForMime(''), equals('file'));
  });

  test('message metadata carries the attachment reference', () {
    expect(
      attachmentMessageMetadata(id: 'a1', mime: 'image/jpeg', size: 42),
      equals({'attachment_id': 'a1', 'mime_type': 'image/jpeg', 'size_bytes': 42}),
    );
  });

  test('content url points at the shared bytes endpoint', () {
    expect(
      attachmentContentUrl('https://h.test', 'a1'),
      equals('https://h.test/api/v1/attachments/a1/content'),
    );
  });

  test('attachment id resolves only when metadata carries one', () {
    expect(attachmentIdOf({'metadata': {'attachment_id': 'a1'}}), equals('a1'));
    expect(attachmentIdOf({'metadata': {}}), isNull);
    expect(attachmentIdOf({'body': 'hi'}), isNull);
    expect(attachmentIdOf(null), isNull);
  });
}
