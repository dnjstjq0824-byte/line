# LUNO Media, Attachments & Cloud Storage Report

## 1. Attachment Upload & Integrity Verification
- **SHA-256 Checksum & MIME Validation**: Client computes SHA-256 digest in WebCrypto before uploading via `POST /api/v1/attachments` or chunked resumable upload sessions (`POST /api/v1/uploads/sessions`).
- **Supported Media Types**: `image`, `video`, `audio`, `voice` (WebM `MediaRecorder`), `file`, and SVG `sticker`.
- **Keep Vault & Shared Albums**: Users can save any message/media to `LUNO Keep` (`/api/v1/saved-messages`) or organize conversation media into shared albums (`/api/v1/conversations/:id/albums`).
