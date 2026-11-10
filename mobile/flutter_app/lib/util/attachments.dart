// Attachment helpers shared by the chat composer and message bubbles.
//
// Contract mirrors the web client and both backends: POST
// /api/v1/attachments (with conversation_id), then a message carrying the
// attachment id in metadata, then GET .../attachments/{id}/content for bytes.
const maxAttachmentBytes = 512 * 1024;
const maxFileBytes = 1400 * 1024; // base64 + JSON headroom under the ~2MB worker cap

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

/// Voice-note metadata: same attachment link plus playback length in seconds.
/// The server clamps absurd durations (see cf_voice / voice backend tests);
/// the client pre-clamps to the documented 0..300 window.
Map<String, dynamic> voiceMessageMetadata({
  required String id,
  required String mime,
  required int size,
  required int durationSec,
}) =>
    {
      'attachment_id': id,
      'mime_type': mime,
      'size_bytes': size,
      'duration': durationSec.clamp(0, 300),
    };

/// Reads the playback length back out of a voice message, tolerating the
/// int/double/string shapes JSON round-trips can produce.
int? voiceDurationOf(dynamic msg) {
  final meta = msg is Map ? msg['metadata'] : null;
  final raw = meta is Map ? meta['duration'] : null;
  if (raw is int) return raw;
  if (raw is double) return raw.round();
  if (raw is String) return int.tryParse(raw);
  return null;
}

/// M:SS label for the voice bubble, e.g. 0:07 or 2:05.
String voiceDurationLabel(int seconds) {
  final s = seconds.clamp(0, 35999);
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

String attachmentContentUrl(String baseUrl, String id) =>
    '$baseUrl/api/v1/attachments/$id/content';

String? attachmentIdOf(dynamic msg) {
  final meta = msg is Map ? msg['metadata'] : null;
  final id = meta is Map ? meta['attachment_id'] : null;
  return id is String && id.isNotEmpty ? id : null;
}
