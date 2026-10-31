# LUNO Chat & Conversation Bug Remediation Report

## 1. Incident Summary
- **Symptoms Observed**:
  1. Selecting `K 🙏` or other users in the chat list updated the header name but left the message canvas blank and displayed `conversation not found`.
  2. Clicking `LUNO 보안 알림` (`✓ 공식채널`) triggered `conversation not found`.
  3. Switching to the `통화 (Calls)` tab kept the previous `conversation not found` error banner visible on screen.

## 2. Root Cause Analysis (RCA)
- **Frontend/Backend ID Mismatch**: `App.vue` fell back to client-side IDs (`chat-k-01`, `chat-sec-01`, `chat-dodo-01`) that did not exist in the backend `conversations` store.
- **Strict Boundary Check Before Alias Resolution**: `scripts/cf_worker.js` checked `conversations.get(conversationPath[1])` before resolving conversation aliases (`oa-notice`, `chat-sec-01`, `chat-k-01`).
- **Unscoped Error State**: `selectChat()` used global `wrap()`, setting `error.value` across the entire app instead of scoping conversation load errors to the chat viewport.

## 3. Technical Fix Implemented
- **Backend (`scripts/cf_worker.js` & `backend/internal/server/chat.go`)**:
  - Added `call_status` and `security_notice` to `MESSAGE_KINDS` / `allowedMessageKinds`.
  - Implemented `ensureDefaultConversationsForUser(userId)` and `resolveConversationId(cid, userId)` prior to the membership boundary check, preserving strict 404 isolation for unauthorized third-party conversations while resolving user-scoped conversations.
- **Frontend (`apps/user-web/src/App.vue`)**:
  - Removed hardcoded client-only fallback chat arrays in `loadChats()`.
  - Scoped errors in `selectChat()` to `conversationError` with an inline retry button.
  - Added `switchNav(nav)` to clear transient alerts and isolate tab viewports.
