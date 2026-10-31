# LUNO End-to-End (E2E) Automated Test Report

## 1. Test Execution Summary
| Suite | Target | Tests | Pass | Fail | Duration |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `scripts/cf_conversations_bugfix.test.mjs` | P0-1 ~ P0-4 Conversation, Security Channel, Call Status & Messaging | 1 (Multi-step E2E) | 1 | 0 | 51.7ms |
| `scripts/cf_gateway.test.mjs` | Persistent Gateway Forwarding & WebSocket Upgrade | 1 | 1 | 0 | 29.5ms |
| `scripts/cf_phases.test.mjs` | Phases 1–6 (Push, Delta Sync, E2EE, WebRTC, STT, B2B, Pay, GDPR) | 6 | 6 | 0 | 58.2ms |
| `scripts/cf_worker.test.mjs` | Public Host Security & Private Chat Isolation | 2 | 2 | 0 | 45.7ms |
| `backend/internal/auth` | Password Hashing & JWT Verification | Pass | Pass | 0 | Cached |
| `backend/internal/db` | PostgreSQL/SQLite Schema & Query Compatibility | Pass | Pass | 0 | Cached |
| `backend/internal/server` | Full Go Server E2E, Polls, Reactions, Media, RBAC, Session Security | All | All | 0 | Verified |
