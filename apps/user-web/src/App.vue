<script setup lang="ts">
import { RouterView } from 'vue-router'
import { activeTheme, darkMode, error, note } from './store/session'
</script>

<template>
  <div class="luno-desktop-app" :class="[`theme-${activeTheme}`, { 'dark-mode': darkMode }]">
    <!-- Global Floating Alerts (Toast style) -->
    <div v-if="error" class="floating-alert error" role="alert">
      <span>⚠️ {{ error }}</span>
      <button class="btn-dismiss" @click="error = ''">✕</button>
    </div>
    <div v-if="note" class="floating-alert note" role="status">
      <span>💡 {{ note }}</span>
      <button class="btn-dismiss" @click="note = ''">✕</button>
    </div>
    <RouterView />
  </div>
</template>


<style>
/* ==========================================================================
   AUTHENTIC LUNO PC DESKTOP DESIGN SYSTEM
   ========================================================================== */

.luno-desktop-app {
  display: flex;
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
  background: var(--ln-surface);
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif);
  color: var(--ln-text);
  user-select: none;
}

/* Floating Alerts (Toast) */
.floating-alert {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(92vw, 480px);
  z-index: 9999;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.floating-alert.error { background: #fee2e2; color: #b91c1c; border: 1px solid #f87171; }
.floating-alert.note { background: #eff6ff; color: #1d4ed8; border: 1px solid #93c5fd; }
.btn-dismiss { background: none; border: none; cursor: pointer; font-size: 12px; color: inherit; }

/* FX-07: text-entry minimums (Safari zooms sub-16px entries on focus). */
.luno-desktop-app input:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='hidden']):not([type='range']),
.luno-desktop-app textarea,
.luno-desktop-app select {
  font-size: 16px !important;
}

/* ==========================================================================
   AUTH SCREEN: AUTHENTIC OPEN MESSENGER PC 2-COLUMN LOGIN WINDOW (Screenshots 2 & 3)
   ========================================================================== */
.pc-auth-viewport {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 30%, #1e293b, #0b1020);
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  padding: 20px;
  box-sizing: border-box;
}

.pc-auth-window-2col {
  width: 760px;
  max-width: 96vw;
  min-height: 480px;
  background: var(--ln-surface);
  border-radius: var(--ln-control-radius);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pc-window-bar {
  height: 38px;
  background: #f8fafc;
  border-bottom: 1px solid var(--ln-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  position: relative;
  user-select: none;
}

[data-theme='dark'] .pc-window-bar {
  background: #0f172a;
  border-bottom-color: #1e293b;
}

.pc-win-left-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-win-menu, .btn-win-help {
  background: none;
  border: none;
  padding: 4px 6px;
  color: #64748b;
  cursor: pointer;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-win-menu:hover, .btn-win-help:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.pc-win-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.3px;
}

.pc-win-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pc-win-sys-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  padding-left: 6px;
  border-left: 1px solid #cbd5e1;
}

.btn-sys-tool {
  background: none;
  border: none;
  width: 24px;
  height: 24px;
  font-size: 13px;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
}
.btn-sys-tool:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.btn-sys-tool.close:hover {
  background: #ef4444;
  color: #ffffff;
}

/* 2-Column Body */
.pc-auth-body-2col {
  display: flex;
  flex: 1;
  min-height: 440px;
}

.pc-auth-col {
  flex: 1;
  padding: 36px 38px 28px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.pc-auth-col.form-col {
  justify-content: space-between;
}

.pc-auth-col-divider {
  width: 1px;
  background: var(--ln-line);
}

[data-theme='dark'] .pc-auth-col-divider {
  background: #1e293b;
}

.pc-brand-header-left {
  margin-bottom: 24px;
}

.pc-om-logo {
  display: block;
  max-width: 210px;
  object-fit: contain;
}

.pc-login-form-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pc-input-row {
  position: relative;
  width: 100%;
}

.pc-login-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  color: var(--ln-text);
  box-sizing: border-box;
  outline: none;
  transition: all 0.15s ease;
}

.pc-login-input:focus {
  border-color: var(--ln-accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.password-wrap .pc-login-input {
  padding-right: 36px;
}

.btn-eye-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
}

.btn-pc-submit-full {
  width: 100%;
  height: 44px;
  background: var(--ln-accent);
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-top: 4px;
}

.btn-pc-submit-full:hover:not(:disabled) {
  background: var(--ln-accent-hover);
}

.btn-pc-submit-full:disabled {
  background: #cbd5e1;
  color: #94a3b8;
  cursor: not-allowed;
}

.pc-login-options-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.pc-custom-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.pc-custom-check input[type="checkbox"] {
  accent-color: var(--ln-accent);
  cursor: pointer;
}

.btn-subtle-link {
  background: none;
  border: none;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
}
.btn-subtle-link:hover {
  color: var(--ln-accent);
  text-decoration: underline;
}
.btn-subtle-link.accent {
  color: var(--ln-accent);
  font-weight: 600;
}

.pc-login-bottom-switch {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}

.btn-switch-auth-link {
  background: none;
  border: none;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.btn-switch-auth-link:hover {
  color: var(--ln-accent);
}

/* Phone Composite Input */
.phone-composite {
  display: flex;
  gap: 6px;
}

.pc-country-select {
  height: 42px;
  padding: 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  outline: none;
}

.phone-composite .phone-input {
  flex: 1;
}

.btn-send-code {
  white-space: nowrap;
  padding: 0 12px;
  height: 42px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.btn-send-code:hover {
  background: #e2e8f0;
}

.code-wrap {
  position: relative;
}

.phone-timer-pill {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #ef4444;
}

/* RIGHT COLUMN: QR Login */
.pc-auth-col.qr-col {
  align-items: center;
  justify-content: center;
  text-align: center;
  background: #fafbfc;
}

[data-theme='dark'] .pc-auth-col.qr-col {
  background: #0d1526;
}

.pc-qr-box-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 270px;
}

.pc-qr-heading {
  font-size: 16px;
  font-weight: 800;
  color: var(--ln-text);
  margin: 0 0 16px 0;
  letter-spacing: -0.3px;
}

.pc-qr-matrix-card {
  padding: 10px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.ln-qr-matrix svg {
  display: block;
  width: 168px;
  height: 168px;
}

.pc-qr-manual {
  font-size: 11px;
  /* F25: AA contrast on the tinted QR card (was #64748b). */
  color: #3f4c63;
  word-break: break-all;
}

.pc-qr-manual code {
  font-size: 10px;
}

.pc-qr-instruction {
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
  margin: 0 0 14px 0;
}

.pc-qr-timer-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #475569;
  background: #ffffff;
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
}

.pc-qr-timer-pill strong {
  color: var(--ln-accent);
}

.btn-qr-reload {
  background: none;
  border: none;
  color: var(--ln-accent);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 4px;
}
.btn-qr-reload:hover {
  text-decoration: underline;
}

.pc-qr-session-id {
  margin-top: 8px;
  color: #94a3b8;
  font-size: 10px;
}

/* ==========================================================================
   AUTHENTIC LUNO PC DESKTOP WORKSPACE (3 PANES)
   ========================================================================== */

/* (Column 1) Leftmost Rail Dock (62px) */
/* Item 11: 20 rail buttons overflow short viewports — the nav section scrolls
   internally while the bottom actions stay pinned. */
.pc-avatar {
  border-radius: 50%;
  color: #ffffff;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.circle-34 { width: 34px; height: 34px; font-size: 13px; }
.circle-36 { width: 36px; height: 36px; font-size: 14px; }
/* FX-10: avatar photos layer over the initial; a load failure hides the
   photo and the initial underneath shows instead of a broken glyph. */
.pc-avatar,
.avatar-circle { position: relative; overflow: hidden; }
.ln-profile-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.circle-46 { width: 46px; height: 46px; font-size: 17px; }

/* Dropdown menus from rail */

/* (Column 2) Second Sidebar List Pane (~305px) */

/* Subtabs in Chats View (Screenshot 1) */

/* Search Bar Header */

.btn-clear-search {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
  padding: 0 2px;
}

/* Expand handle shown only while the side pane is collapsed (the in-flow
   collapse buttons are clipped by overflow, so collapsing must stay reversible). */

/* File inputs stay rendered (1px, transparent) so programmatic .click() opens
   the picker on Safari and mobile webviews, which ignore hidden inputs. */
.file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}

/* My Profile Card (Screenshots 4 & 5) */

/* Accordions (Screenshots 4 & 5) */

/* Chats List Rows (Screenshot 1) */

/* Floating Action Button (FAB) (Screenshot 1) */

/* Friend Profile View (Screenshot 5) */

.pc-profile-preview-card {
  text-align: center;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.profile-preview-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 34px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
}

.profile-preview-name {
  font-size: 22px;
  font-weight: 800;
  color: var(--ln-text);
  margin: 0 0 6px 0;
}

.profile-preview-bio {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 24px 0;
}

.btn-start-chat-large {
  width: 160px;
  height: 44px;
  background: var(--ln-accent);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
  transition: all 0.15s ease;
}

.btn-start-chat-large:hover {
  background: var(--ln-accent-hover);
  transform: translateY(-1px);
}

.profile-preview-subactions {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  justify-content: flex-start;
  gap: 8px;
  margin-top: 16px;
  padding-bottom: 4px;
  /* UX5: cap the row at the card so scrolled-out pills stay reachable by
     swipe (FX-14 keeps nowrap+scroll); without this the row itself pushes
     past narrow viewports. */
  max-width: 100%;
}

.btn-subaction-pill {
  padding: 6px 12px;
  white-space: nowrap;
  flex-shrink: 0;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-subaction-pill:hover {
  background: #e2e8f0;
  color: var(--ln-accent);
}

/* Ecosystem Hub Modal */

/* New Chat Options */
.new-chat-options-grid {
  display: flex;
  gap: 10px;
}
.btn-new-chat-type {
  flex: 1;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}
.btn-new-chat-type:hover {
  background: #eff6ff;
  border-color: var(--ln-accent);
}
.type-icon { font-size: 24px; }
.type-text strong { display: block; font-size: 13px; color: var(--ln-text); }
.type-text small { font-size: 11px; color: #64748b; }

.quick-pick-friend-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.quick-pick-friend-row:hover { background: #f1f5f9; }
.friend-pick-meta { flex: 1; min-width: 0; }
.friend-pick-meta strong { display: block; font-size: 12px; color: #111827; }
.friend-pick-meta small { font-size: 10px; color: #64748b; }
.btn-mini-chat {
  padding: 4px 10px;
  background: var(--ln-accent);
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

/* (Column 3) Right Main Chat View */

/* Canvas for Chat Messages */
.pc-chat-messages-canvas {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pc-msg-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  position: relative;
  max-width: 75%;
}
.pc-msg-row.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.pc-msg-row.other {
  align-self: flex-start;
}
.pc-msg-bubble-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pc-msg-row.mine .pc-msg-bubble-group {
  align-items: flex-end;
}
.pc-sender-header {
  font-size: 11px;
  color: #334155;
  margin-bottom: 2px;
  margin-left: 2px;
}
.pc-speech-bubble {
  padding: 8px 12px;
  font-size: var(--text-bubble-size, 0.9375rem);
  font-weight: var(--text-bubble-weight, 400);
  line-height: var(--text-bubble-leading, 1.48);
  word-break: break-word;
  position: relative;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  max-width: var(--bubble-max-mobile, 76%);
}
@media (min-width: 700px) {
  .pc-msg-row .pc-speech-bubble { max-width: var(--bubble-max-desktop, 520px); }
}
.pc-msg-row.other .pc-speech-bubble {
  background: #ffffff;
  color: #191919;
  border-radius: var(--radius-bubble-tail, 4px) var(--radius-bubble, 18px) var(--radius-bubble, 18px) var(--radius-bubble, 18px);
}
.pc-msg-row.mine .pc-speech-bubble {
  background: var(--ln-accent);
  color: #ffffff;
  border-radius: var(--radius-bubble, 18px) var(--radius-bubble, 18px) var(--radius-bubble-tail, 4px) var(--radius-bubble, 18px);
}
/* Burst grouping (§7-3): 3px inside a burst, 12px when the sender changes. */
.pc-chat-messages-canvas { gap: var(--bubble-gap-break, 12px); }
.pc-msg-row.group-inner { margin-top: calc(var(--bubble-gap-inner, 3px) - var(--bubble-gap-break, 12px)); }
.pc-continued-indent {
  flex-shrink: 0;
  width: var(--bubble-continued-indent, 44px);
}
.other-avatar.is-group-lead {
  width: var(--bubble-avatar-size, 36px);
  height: var(--bubble-avatar-size, 36px);
}
.pc-speech-bubble.sticker {
  background: none !important;
  box-shadow: none !important;
  font-size: 28px;
  padding: 4px;
}
.bubble-reply-preview {
  font-size: 10px;
  opacity: 0.75;
  margin-bottom: 4px;
  border-left: 2px solid currentColor;
  padding-left: 4px;
}
.bubble-forwarded-tag {
  font-size: 10px;
  opacity: 0.75;
  margin-bottom: 4px;
}
.pc-msg-meta {
  display: flex;
  gap: 4px;
  align-items: flex-end;
  font-size: 10px;
  color: rgba(255,255,255,0.75);
  margin-top: 2px;
}
.pc-read-receipt {
  font-size: var(--text-stamp-size, 0.6875rem);
  font-weight: var(--text-stamp-weight, 500);
  line-height: var(--text-stamp-leading, 1.2);
  font-variant-numeric: tabular-nums;
  color: #ffffff;
}

.pc-bubble-toolbar {
  display: none;
  position: absolute;
  top: -24px;
  background: #ffffff;
  border-radius: 16px;
  padding: 2px 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  gap: 4px;
  z-index: 10;
}
.pc-msg-row:hover .pc-bubble-toolbar {
  display: flex;
}
.pc-msg-row.mine .pc-bubble-toolbar { right: 0; }
.pc-msg-row.other .pc-bubble-toolbar { left: 40px; }
.pc-bubble-toolbar button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
}
.pc-bubble-toolbar button:hover { background: #f1f5f9; }

/* Chat Input Dock */
.btn-green-send {
  height: 28px;
  padding: 0 14px;
  background: var(--ln-accent);
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.btn-green-send:hover:not(:disabled) {
  background: var(--ln-accent-hover);
}
.btn-green-send:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

/* Empty Canvas (Authentic LUNO PC Watermark) */
.pc-empty-dialog {
  text-align: center;
}
.pc-watermark-wrap {
  margin-bottom: 14px;
  opacity: 0.85;
}
.pc-empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #334155;
  margin: 0 0 6px;
}
.pc-empty-desc {
  font-size: 13px;
  color: #828fa0;
  line-height: 1.5;
  margin: 0;
}

/* Modal styles preserved */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.standard-modal-box {
  width: 380px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.25);
  overflow: hidden;
}
.modal-header {
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
}
.modal-header h3 { margin: 0; font-size: 15px; font-weight: 700; }
.btn-modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: #94a3b8; }
.modal-body-form { padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.modal-body-form label { font-size: 12px; font-weight: 600; color: #475569; }
.modal-body-form input {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
}
.modal-actions-right {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.btn-primary { background: var(--ln-accent); color: white; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background-color 0.15s; }
.btn-primary:hover { background: var(--ln-accent-hover); }
.btn-secondary { background: #f1f5f9; color: #475569; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }

/* Keep modal, Call modal, etc */
.keep-modal { width: 440px; }
.keep-filter-bar { display: flex; gap: 6px; padding: 10px 18px; border-bottom: 1px solid #f1f5f9; }
.keep-filter-bar button { padding: 4px 10px; font-size: 11px; border: none; border-radius: 12px; background: #f1f5f9; cursor: pointer; }
.keep-filter-bar button.active { background: var(--ln-accent); color: white; }
.keep-search-input { width: calc(100% - 36px); margin: 8px 18px; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; }
.keep-scroll-content { max-height: 280px; overflow-y: auto; padding: 0 18px 18px; }
.btn-delete-keep { background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; }

/* Call overlay */
.call-overlay-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; }
.call-dialog-box { width: 340px; background: #1e293b; color: white; border-radius: 16px; padding: 24px; text-align: center; }
.call-avatar-pulse { margin-bottom: 12px; }
.call-controls-row { display: flex; justify-content: center; gap: 12px; margin-top: 18px; }
.btn-call-circle { width: 44px; height: 44px; border-radius: 50%; background: #334155; border: none; color: white; cursor: pointer; font-size: 18px; display: grid; place-items: center; }
.btn-call-circle.off { background: #ef4444; }
.btn-call-answer { background: var(--ln-success); color: white; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 700; cursor: pointer; }
.btn-call-hangup { background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 700; cursor: pointer; }

/* Profile modal */
.profile-cover-header { height: 110px; position: relative; display: flex; justify-content: flex-end; padding: 10px; }
.profile-actions-footer { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
.btn-profile-action { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }

/* Pinned Banner */
.pinned-banner { background: #fffbeb; border-bottom: 1px solid #fef3c7; padding: 6px 16px; cursor: pointer; }
.pinned-summary { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #92400e; font-weight: 600; }
.pin-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* VOOM & Stories */

/* OpenChat */

/* Wallet Card */

/* Sticker Popover */

/* Sticker Tray Popover */

/* Sticker Display in Chat Bubbles */
.pc-speech-bubble.is-sticker {
  background: transparent !important;
  box-shadow: none !important;
  padding: 4px !important;
}

.pc-speech-bubble.is-sticker::after {
  display: none !important;
}

.bubble-sticker-svg {
  width: 120px;
  height: 120px;
  display: block;
  animation: stickerPop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes stickerPop {
  0% { transform: scale(0.6); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

/* ==========================================================================
   LUNO UI/UX ENHANCEMENTS — I18N, TRANSLATION, LIVE CAPTIONS & RESPONSIVENESS
   ========================================================================== */
.pc-win-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  z-index: 2;
}
.pc-locale-pills {
  display: flex;
  gap: 4px;
}
.btn-auth-locale {
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-auth-locale.active {
  background: #315BCD;
  color: #ffffff;
  border-color: #315BCD;
}
.btn-win-dark {
  padding: 4px 6px;
  background: none;
  border: none;
  cursor: pointer;
  color: #64748b;
  display: grid;
  place-items: center;
}
.btn-win-dark:hover {
  color: #1e293b;
}

/* Mobile Back Button */

/* AI Translation Controls in Chat Header */
.ai-translate-tool-pill {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  background: #f1f5f9;
  border-radius: 20px;
  padding: 2px 4px 2px 8px;
  gap: 6px;
  border: 1px solid #e2e8f0;
}
.ai-translate-tool-pill span {
  white-space: nowrap;
}
.btn-translate-switch {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 12px;
}
.btn-translate-switch.active {
  background: #315BCD;
  color: #ffffff;
}
.translate-lang-select {
  font-size: 11px;
  font-weight: 700;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 2px 6px;
  color: #1e293b;
  outline: none;
  cursor: pointer;
}

/* LUNO AI Message Translation Box */
.luno-ai-translation-box {
  margin-top: 6px;
  padding: 6px 10px;
  background: rgba(79, 124, 255, 0.08);
  border-radius: 8px;
  border-left: 3px solid #315BCD;
  font-size: 12px;
}
.pc-msg-row.mine .luno-ai-translation-box {
  background: rgba(255, 255, 255, 0.18);
  border-left-color: #ffffff;
  color: #ffffff;
}
.translation-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}
.badge-engine {
  font-size: 9px;
  font-weight: 700;
  color: #315BCD;
}
.pc-msg-row.mine .badge-engine {
  color: #ffffff;
  opacity: 0.9;
}
.btn-retry-translate {
  background: none;
  border: none;
  font-size: 11px;
  cursor: pointer;
  color: inherit;
  padding: 0 4px;
}
.translation-result {
  line-height: 1.4;
  font-weight: 500;
}
.translation-loading {
  font-size: 11px;
  opacity: 0.8;
}
.translation-error {
  font-size: 11px;
  color: #ef4444;
}

/* Call Live Translation Captions UX (Article 10.2) */
.btn-caption-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #475569;
  background: #334155;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-caption-toggle.active {
  background: #315BCD;
  border-color: #4F7CFF;
}
.live-captions-box {
  margin-top: 10px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  text-align: left;
}
.caption-notice {
  font-size: 10px;
  color: #fbbf24;
  margin-bottom: 6px;
}
.caption-lang-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  margin-bottom: 6px;
}
.lang-tag {
  background: #1e293b;
  padding: 2px 6px;
  border-radius: 4px;
}
.lang-arrow {
  color: #5EE6C2;
}
.badge-engine-mini {
  margin-left: auto;
  background: #315BCD;
  color: #ffffff;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 9px;
}
.caption-live-text {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: #F7FAFF;
  line-height: 1.4;
}

/* Settings Modal Elements */
.locale-choice-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 6px;
}
.btn-locale-pill {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.btn-locale-pill.active {
  background: #315BCD;
  color: #ffffff;
  border-color: #315BCD;
}
.font-scale-buttons {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.btn-scale-chip {
  flex: 1;
  padding: 6px 0;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
}
.btn-scale-chip.active {
  background: #315BCD;
  color: #ffffff;
  border-color: #315BCD;
}
.badge-status-on {
  background: #dcfce7;
  color: #15803d;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
}

/* ==========================================================================
   RESPONSIVE DESIGN BREAKPOINTS (Article 12)
   ========================================================================== */

/* ==========================================================================
   DATE DIVIDER (Screenshot 2: '10. 23. (금)')
   ========================================================================== */
.pc-date-divider-pill {
  align-self: center;
  margin: 16px auto 12px;
  background: rgba(0, 0, 0, 0.22);
  color: #ffffff;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 12px;
  backdrop-filter: blur(4px);
  text-align: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  letter-spacing: -0.2px;
}

/* ==========================================================================
   OFFICIAL SECURITY NOTICE CARD (Screenshot 1)
   ========================================================================== */
.security-notice-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 12px 0;
  max-width: 440px;
}

.pc-security-card-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pc-security-notice-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 20px 22px 18px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: #1e293b;
}

.security-card-header {
  margin-bottom: 12px;
}

.security-card-divider {
  height: 1px;
  background: #f1f5f9;
  margin-bottom: 14px;
}

.security-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.security-desc-bold {
  font-size: 13.5px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.45;
  margin: 0;
}

.security-desc-sub {
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.5;
  margin: 0;
}

.security-specs-table {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.spec-row {
  display: flex;
  gap: 8px;
}

.spec-label {
  color: #64748b;
  min-width: 50px;
}

.spec-val {
  color: #0f172a;
  font-weight: 500;
  word-break: break-all;
}

.security-card-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}
.btn-security-logout-green:hover {
  background: #009900;
}

.btn-security-pwchange-link {
  background: transparent;
  color: #1e293b;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 0;
  text-align: center;
}
.btn-security-pwchange-link:hover {
  text-decoration: underline;
}

/* ==========================================================================
   CALL STATUS BUBBLE (Screenshot 2)
   ========================================================================== */
.pc-call-status-bubble {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 18px;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.15s ease;
  user-select: none;
}
.pc-call-status-bubble:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.pc-call-status-bubble.outgoing {
  background: #60E660;
  color: #0f172a;
}
.pc-call-status-bubble.incoming {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.pc-call-status-bubble.missed {
  border-left: 3px solid #ef4444;
}

.call-bubble-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
}

.call-bubble-content {
  display: flex;
  flex-direction: column;
}
.call-bubble-title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.25;
}
.call-bubble-sub {
  font-size: 11.5px;
  opacity: 0.85;
}

/* ==========================================================================
   NEWS PANE STYLES (Screenshot 5)
   ========================================================================== */

/* ==========================================================================
   CALLS PANE STYLES (Screenshot 3)
   ========================================================================== */

.call-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid #f8fafc;
  cursor: pointer;
  transition: background 0.15s ease;
}
.call-history-row:hover {
  background: #f1f5f9;
}

.call-row-avatar-col {
  margin-right: 12px;
}
.call-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 15px;
}

.call-row-info-col {
  flex: 1;
  min-width: 0;
}

.call-row-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14.5px;
  font-weight: 600;
  color: #0f172a;
}
.call-repeat-count {
  font-size: 13px;
  font-weight: 600;
}

.call-meta-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}
.call-direction-arrow {
  font-weight: 700;
  font-size: 13px;
}
.call-direction-arrow.missed {
  color: #ef4444;
}

.call-row-action-col {
  margin-left: 8px;
}

/* ==========================================================================
   ARTICLE READER MODAL
   ========================================================================== */
.news-reader-modal {
  max-width: 580px;
  width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.news-reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #e2e8f0;
}
.news-reader-press {
  font-size: 14px;
  font-weight: 700;
  color: #2563eb;
}
.news-reader-actions {
  display: flex;
  gap: 8px;
}
.btn-news-action {
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
}
.news-reader-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.news-reader-img {
  width: 100%;
  height: 220px;
  object-fit: cover;
  border-radius: 10px;
  margin-bottom: 14px;
}
.news-reader-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  margin-bottom: 8px;
}
.news-reader-meta {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 14px;
}
.news-reader-content {
  font-size: 14px;
  line-height: 1.7;
  color: #334155;
}
.news-reader-footer {
  padding: 12px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
.btn-share-to-chat {
  width: 100%;
  padding: 11px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

/* ==========================================================================
   MOBILE FLOATING NAVIGATION CAPSULE (Screenshots 3, 4, 5)
   ========================================================================== */

/* ==========================================================================
   COMPREHENSIVE UI/UX REMEDIATION STYLES (100% COVERAGE)
   ========================================================================== */
.phone-mode { gap: 12px; }
.btn-switch-method { background: none; border: none; color: #2563eb; font-size: 13px; font-weight: 600; cursor: pointer; }

/* Home Recent Searches & Quick Service Bar */
.home-recent-searches { padding: 8px 14px; border-bottom: 1px solid #f1f5f9; background: #fafbfc; }
.recent-searches-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: #64748b; font-size: 11px; }
.btn-clear-all-searches { background: none; border: none; font-size: 11px; color: #94a3b8; cursor: pointer; }
.btn-clear-all-searches:hover { color: #ef4444; }
.recent-search-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.recent-keyword-chip { display: inline-flex; align-items: center; gap: 4px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2px 8px; font-size: 11.5px; color: #334155; }
.kw-text { cursor: pointer; }
.btn-del-kw { background: none; border: none; font-size: 10px; color: #94a3b8; cursor: pointer; padding: 0 2px; }
.group-avatar { font-weight: 700; }

/* Chats Main Header & Game Ad Banner */

/* Generic Pane Header & News / Calls Specifics */
/* FX-17: labeled new-call button + contact picker rows. */
.new-call-modal { width: 420px; max-width: 94vw; }
.new-call-body { max-height: 60vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.new-call-row { display: flex; align-items: center; gap: 8px; }
.new-call-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }

/* Calls Row Alignment & Missed Red Highlight (Screenshot 3) */
.call-history-row { gap: 12px; }
.call-history-row.selected { background: #eff6ff; }
.call-history-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.call-row-name { font-size: 14px; font-weight: 600; color: #0f172a; display: flex; align-items: center; gap: 4px; }
.text-red { color: #ef4444 !important; }
.call-count-tag { font-size: 12.5px; font-weight: 700; }
.call-row-sub { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #64748b; }
.call-kind-icon { display: inline-flex; align-items: center; color: #94a3b8; }

/* Viewports: Calls, OpenChat, Drawer, Polls, Stickers, Reply */
.pc-call-detail-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px 28px; width: 360px; max-width: 90%; text-align: center; box-shadow: 0 8px 24px rgba(15,23,42,0.06); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.openchat-post-card { background: #ffffff; border-radius: 12px; padding: 12px 16px; border: 1px solid #e2e8f0; margin-bottom: 8px; }
.openchat-post-meta { display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-bottom: 4px; }
.openchat-post-body { margin: 0; font-size: 13.5px; color: #0f172a; }
.title { font-weight: 600; }
.badge-verified { background: #dcfce7; color: #15803d; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 8px; }
/* L-01: bot identity pill (blue, distinct from the green official badge). */
.badge-bot { background: #dbeafe; color: #1d4ed8; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 8px; }
/* L-03: proposal/decision/report kind tag inside the standard bubble. */
.badge-kind { background: #f1f5f9; color: #475569; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 8px; margin-right: 6px; white-space: nowrap; }
/* L-05: proposal approve/reject row (44px touch targets) and decided mark. */
.bubble-decide-row { display: flex; gap: 8px; margin-top: 8px; }
.btn-decide-approve, .btn-decide-reject { flex: 1; min-height: 44px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; border: 1px solid var(--ln-line); }
.btn-decide-approve { background: var(--ln-accent); color: #fff; border-color: var(--ln-accent); }
.btn-decide-reject { background: var(--ln-surface); color: var(--ln-text); }
.bubble-decided-mark { margin-top: 6px; font-size: 12px; font-weight: 700; color: var(--ln-muted); }
/* L-05: approval box list rows. */
.approval-row { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--ln-line); border-radius: 14px; margin: 0 0 10px; background: var(--ln-surface); }
.approval-row-head { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ln-muted); }
.approval-row-body { font-size: 15px; color: var(--ln-text); }
.approval-row-actions { display: flex; gap: 8px; }
.approval-row-actions .btn-decide-approve, .approval-row-actions .btn-decide-reject { flex: 1; }
.pin-icon, .pin-toggle { font-size: 12px; }
.btn-unpin-inline { background: none; border: none; color: #94a3b8; cursor: pointer; margin-left: auto; font-size: 11px; }
.other-avatar, .luno-official-avatar { flex-shrink: 0; }
.security-meta, .pc-timestamp {
  font-size: var(--text-stamp-size, 0.6875rem);
  font-weight: var(--text-stamp-weight, 500);
  line-height: var(--text-stamp-leading, 1.2);
  font-variant-numeric: tabular-nums;
  color: #64748b;
}
.bubble-text-content { word-break: break-word; line-height: 1.45; }
.bubble-unsent { color: #94a3b8; font-style: italic; font-size: 12px; line-height: 1.45; }
.profile-preview-actions { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; margin-top: 8px; }
.pc-modal-backdrop { position: fixed; inset: 0; z-index: 3000; background: rgba(15,23,42,0.55); display: flex; align-items: center; justify-content: center; }
.pc-modal-card { background: #ffffff; border-radius: 14px; }
.avatar-circle { border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 700; flex-shrink: 0; }
.lg { width: 72px; height: 72px; font-size: 26px; }
.xl { width: 84px; height: 84px; font-size: 30px; background: #315BCD; border: 3px solid #ffffff; }
.call-type-status { font-size: 13px; color: #cbd5e1; margin: 4px 0 10px; }
.timer-active { color: #4ade80; font-weight: 700; font-variant-numeric: tabular-nums; }
.caption-stream { margin-top: 4px; }
.profile-modal-card { width: 340px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.25); }
.profile-avatar-center { display: flex; justify-content: center; margin-top: -42px; }
.profile-body-center { text-align: center; padding: 12px 20px; }
.user-handle { font-size: 12px; color: #64748b; margin-top: 2px; }
.user-status-text { font-size: 13px; color: #334155; margin-top: 8px; }
.empty-muted, .muted { color: #94a3b8; font-size: 12px; }
.keep-item-card { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 8px; background: #f8fafc; }
.keep-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.badge-keep-type { font-size: 10px; font-weight: 700; background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
.keep-body-text { font-size: 13px; color: #0f172a; margin-bottom: 4px; }
.send-target-info { padding: 8px 12px; background: #eff6ff; border-radius: 8px; font-size: 13px; color: #1e3a8a; }
.quick-amounts, .charge-options-grid, .theme-choice-buttons { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 6px 0; }
.btn-charge-option, .btn-theme-swatch { padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; font-weight: 600; cursor: pointer; }
.btn-charge-option:disabled { opacity: .55; cursor: not-allowed; }
.ln-charge-notice { font-size: 12px; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 10px; }
.btn-theme-swatch.active, .default.active, .dark.active { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
.add-friend-modal, .new-chat-modal, .password-modal { max-width: 480px; width: 92vw; }
.settings-modal {
  max-width: 520px;
  width: 92vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.settings-modal .modal-header {
  flex-shrink: 0;
}
.settings-modal .modal-body-form {
  overflow-y: auto;
  max-height: calc(85vh - 120px);
  -webkit-overflow-scrolling: touch;
}
.settings-modal .modal-actions-right {
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  background: #ffffff;
  padding: 10px 0 0;
  border-top: 1px solid #f1f5f9;
  z-index: 5;
}
.setting-group { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
.setting-toggle-row { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; padding: 4px 0; }
/* UX5: checkbox rows toggle by tapping anywhere on a 44px row. */
.setting-check-row { min-height: 44px; cursor: pointer; }
.flex-row { display: flex; align-items: center; gap: 8px; }
.select-friends-scroll { max-height: 160px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.friend-check-item { display: flex; align-items: center; gap: 8px; padding: 4px 6px; font-size: 13px; cursor: pointer; }
.modal-subtext { font-size: 12.5px; color: #64748b; margin: 0 0 8px; }
.add-friend-quick-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.quick-opt-item { display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; font-size: 12px; }

/* Polls, Drawer, Stickers, Reply Composer, Wallet Tx, Chat Canvas States */
.polls-banner-wrap { padding: 6px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 6px; }
.poll-inline-card { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 12px; }
.poll-inline-head { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 6px; }
.poll-options-row { display: flex; flex-wrap: wrap; gap: 6px; }
.btn-poll-opt { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 14px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 11.5px; cursor: pointer; }
.btn-poll-opt.voted { background: #eff6ff; border-color: #2563eb; color: #1d4ed8; font-weight: 700; }
.pc-drawer-panel { background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 10px 16px; max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.drawer-tabs-bar { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
.drawer-tabs-bar button { background: #f1f5f9; border: none; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.drawer-tabs-bar button.active { background: #2563eb; color: #ffffff; }
.btn-drawer-close { margin-left: auto; }
.drawer-search-bar { display: flex; gap: 6px; }
.drawer-search-bar input { flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; }
.drawer-search-results, .drawer-body { display: flex; flex-direction: column; gap: 6px; }
.drawer-item-card { padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; }
.chat-canvas-state { margin: auto; text-align: center; padding: 32px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
/* FX-19/21: search hits are clickable; the jumped message flashes. */
.drawer-item-card.drawer-hit { cursor: pointer; }
.drawer-item-card.drawer-hit:hover { background: #eff6ff; border-color: #93c5fd; }
.searched-flash { outline: 2px solid #2563eb; outline-offset: 2px; border-radius: 10px; }
.error-state { background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; }
.error-state-text { color: #dc2626; font-size: 13px; font-weight: 600; }
.inline-edit-box { display: flex; flex-direction: column; gap: 4px; }
.inline-edit-input { padding: 4px 8px; border: 1px solid #93c5fd; border-radius: 6px; font-size: 13px; }
.bubble-reactions-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.reaction-chip { font-size: 11px; background: rgba(255,255,255,0.85); color: #0f172a; padding: 1px 6px; border-radius: 10px; border: 1px solid #cbd5e1; cursor: pointer; }
.reply-composer-bar { display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; background: #eff6ff; border-bottom: 1px solid #bfdbfe; font-size: 12px; color: #1e3a8a; }
.sticker-picker-popover { background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; max-height: 260px; overflow-y: auto; position: absolute; bottom: 100%; left: 0; right: 0; z-index: 60; box-shadow: 0 -8px 24px rgba(0,0,0,0.12); }
.sticker-cat-tabs { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.sticker-cat-tabs button { background: #f1f5f9; border: none; padding: 4px 10px; border-radius: 12px; font-size: 11.5px; font-weight: 600; cursor: pointer; }
.sticker-cat-tabs button.active { background: #2563eb; color: #ffffff; }
.sticker-grid-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)); gap: 8px; }
.btn-sticker-cell { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; }
.btn-sticker-cell:hover { background: #eff6ff; border-color: #93c5fd; }
.sticker-svg-mini { width: 42px; height: 42px; }

/* Classic LUNO Sky-Blue Wallpaper & Rich Message Cards (Screenshots 6 & 7) */
.wallpaper-skyblue {
  background: #8CABD9 !important;
}
.wallpaper-slate {
  background: #F1F5F9 !important;
}
.wallpaper-mint {
  background: #DCFCE7 !important;
}
.wallpaper-dark {
  background: #0F172A !important;
}
.wallpaper-skyblue .pc-msg-row.mine .pc-speech-bubble {
  background: #85E249;
  color: #0F172A;
}
.wallpaper-skyblue .pc-msg-row.mine .luno-ai-translation-box {
  background: rgba(15, 23, 42, 0.08);
  border-left-color: #0F172A;
  color: #0F172A;
}
.wallpaper-skyblue .pc-msg-row.mine .badge-engine {
  color: #0F172A;
}
.wallpaper-skyblue .pc-msg-meta,
.wallpaper-skyblue .pc-timestamp,
.wallpaper-skyblue .pc-read-receipt {
  color: rgba(15, 23, 42, 0.78);
}
.btn-scroll-bottom {
  position: absolute;
  right: 20px;
  bottom: 152px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.12);
  color: #1e293b;
  font-size: 16px;
  font-weight: 800;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  transition: transform 0.15s ease, background 0.15s ease;
}
.btn-scroll-bottom:hover {
  background: #ffffff;
  transform: translateY(-2px);
}
.bubble-location-card,
.bubble-contact-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 180px;
}
.loc-card-top,
.contact-card-top {
  font-size: 10.5px;
  font-weight: 700;
  opacity: 0.8;
}
.loc-card-label,
.contact-card-name {
  font-size: 13px;
  font-weight: 700;
}
.loc-card-coords,
.contact-card-handle {
  font-size: 11px;
  opacity: 0.75;
}
.fav-star-inline {
  color: #f59e0b;
  margin-right: 4px;
}
</style>

<style>
.profile-photo-controls{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:16px 20px 0}.profile-photo-controls small,.profile-photo-controls p{flex-basis:100%;text-align:center}.ln-profile-photo{width:100%;height:100%;object-fit:cover;border-radius:inherit}
</style>

<style>
.profile-modal-card{max-height:calc(100dvh - 32px);overflow-y:auto;max-width:calc(100vw - 32px)}
</style>
