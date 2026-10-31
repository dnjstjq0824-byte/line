# LUNO Realtime Messaging & Offline Queue Synchronization Report

## 1. WebSocket Ticket & Hibernation Architecture
- **Authentication**: Clients request a single-use 60-second ticket via `POST /api/v1/ws-ticket` and connect to `/ws?ticket=...`.
- **Event Fan-out**: `message.created`, `message.updated`, `message.unsent`, `message.reaction`, `conversation.read`, `call.ringing`, `call.signal`, `call.state`, `poll.updated`.

## 2. Offline Queue & Delta Catch-up Sync
- **IndexedDB Queue (`apps/user-web/src/messenger-utils.ts`)**: When `POST /api/v1/conversations/:id/messages` fails due to network disconnection, messages are persisted in IndexedDB (`line_offline_queue`) with idempotent `client_id`.
- **Automatic Recovery**: Bound `window.addEventListener('online', handleNetworkOnline)` in `App.vue` to invoke `processOfflineQueue()`, flushing queued messages and syncing conversation state via `GET /api/v1/conversations/:id/sync?after_sequence=...`.
