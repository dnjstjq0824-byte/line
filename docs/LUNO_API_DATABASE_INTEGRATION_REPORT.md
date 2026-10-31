# LUNO API & Database Integration Report

## 1. Dual-Runtime API Contract Parity
- **Cloudflare Edge Worker + Durable Object (`scripts/cf_worker.js`)** and **Go PostgreSQL/SQLite Server (`backend/internal/server/`)** implement identical REST & WebSocket contracts under `/api/v1/*`.
- **Supported Message Kinds**: `text`, `image`, `video`, `audio`, `voice`, `file`, `sticker`, `location`, `contact`, `system`, `poll`, `pay`, `call`, `call_status`, `security_notice`.
- **Data Preservation**: All user accounts, friendships, conversations, messages, saved items, wallet transactions, and audit logs persist across sessions without destructive resets.
