# LUNO (Open Messenger) Full Codebase Audit Report

- **Directive ID**: `LUNO_MESSENGER_GLOBAL_P0_P3_FULL_EXECUTION_20261031`
- **Audit Date**: 2026-10-31
- **Scope**: Monorepo Frontend (`apps/user-web`, `apps/admin-console`, `apps/partner-console`, `apps/developer-console`, `apps/creator-console`, `apps/ads-console`), Edge Gateway (`scripts/cf_worker.js`), Go Backend (`backend/internal/...`), Database Schema (`database/001_all_phases.sql`), Mobile (`mobile/user-mobile`), Desktop (`desktop/user-desktop`).

## 1. Architecture Overview
- **Frontend Monorepo**: 6 Vue 3 + TypeScript + Vite SPA workspaces sharing `apps/shared/api.ts`.
- **Edge & Stateful Gateway**: `scripts/cf_worker.js` (Cloudflare Worker + Durable Object `MessengerBackend` + WebSocket Hibernation API).
- **Core Go Backend**: `backend/internal/server/` (PostgreSQL 16 / SQLite compatibility driver `pgsqlite`, AES-GCM at-rest encryption, JWT + Refresh Token rotation, Outbox Relay, FCM/APNs Push Delivery).
- **Database Schema**: 14 isolated PostgreSQL schemas (`identity`, `social`, `chat`, `realtime`, `calling`, `crypto`, `community`, `business`, `developer`, `creator`, `commerce`, `ads`, `safety`, `ops`).

## 2. Critical P0 Defects Identified & Remediated
1. **P0-1 (Conversation Selection Empty Message Canvas)**:
   - *Root Cause*: `loadChats()` in `apps/user-web/src/App.vue` injected client-only mock conversation IDs (`chat-k-01`, `chat-dodo-01`, etc.) when the server only seeded one conversation (`00000000-0000-0000-0000-000000000010`). Selecting those IDs triggered `404 conversation not found`.
   - *Remediation*: Added `ensureDefaultConversationsForUser(userId)` and `resolveConversationId(cid, userId)` in `scripts/cf_worker.js` and removed client-only fake IDs from `loadChats()`.
2. **P0-2 (Official Security Channel `404 conversation not found`)**:
   - *Root Cause*: `oa-notice` / `chat-sec-01` was not provisioned as a conversation record in `conversations` map.
   - *Remediation*: Auto-provisioned `conv-oa-notice-${userId}` with `kind: 'security_notice'` card payload and alias resolution.
3. **P0-3 (Global Error Banner Persistence & Readonly Computed Mutation on Tab Switch)**:
   - *Root Cause*: Mobile bottom nav attempted `selectedChat = null` (writing to a readonly `computed`), and PC rail tab clicks did not clear `error.value` or isolate Column 3 viewports for `calls` and `openchat`.
   - *Remediation*: Implemented `switchNav(nav)`, isolated `conversationError` inside `selectChat()`, and created dedicated Column 3 viewports (`pc-calls-viewport`, `pc-openchat-viewport`).
4. **P0-4 (UI/UX CSS Class Coverage & Interactive Drawer/Popover Wiring)**:
   - *Root Cause*: Static template audit found 111 template classes lacking CSS rules in `<style scoped>` and disconnected drawer/sticker/reply/poll UI blocks.
   - *Remediation*: Achieved 100% static CSS class coverage (462/462 classes styled) and wired all interactive drawers, polls, stickers, reply bar, and QR modals.
