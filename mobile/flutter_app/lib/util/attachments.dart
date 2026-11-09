// Attachment helpers shared by the chat composer and message bubbles.
//
// Contract mirrors the web client and both backends: POST
// /api/v1/attachments (with conversation_id), then a message carrying the
// attachment id in metadata, then GET .../attachments/{id}/content for bytes.
const maxAttachmentBytes = 512 * 1024;

String attachmentKindForMime(String mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

Map<String, dynamic> attachmentMessageMetadata({
  required String id,
  required String mime,
  required int size,
}) =>
    {'attachment_id': id, 'mime_type': mime, 'size_bytes': size};

String attachmentContentUrl(String baseUrl, String id) =>
    '$baseUrl/api/v1/attachments/$id/content';

String? attachmentIdOf(dynamic msg) {
  final meta = msg is Map ? msg['metadata'] : null;
  final id = meta is Map ? meta['attachment_id'] : null;
  return id is String && id.isNotEmpty ? id : null;
}
