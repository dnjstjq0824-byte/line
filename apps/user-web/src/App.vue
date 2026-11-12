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
  --line-green: var(--om-primary, #2563EB);
  --line-green-hover: var(--om-primary-hover, #1D4ED8);
  --line-slate-bg: var(--om-bg, #F7F9FC);
  --line-rail-bg: var(--om-midnight, #0B1020);
  --line-side-bg: var(--om-surface, #FFFFFF);
  --line-border: var(--om-border, #E2E8F0);
  --line-text-dark: var(--om-text, #111827);
  --line-text-sub: var(--om-text-muted, #64748B);
}

.pc-luno-logo { display: block; margin: 0 auto; max-width: 100%; object-fit: contain; }

.luno-desktop-app {
  display: flex;
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
  background: var(--line-rail-bg);
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif);
  color: var(--line-text-dark);
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
  background: var(--om-surface, #ffffff);
  border-radius: var(--om-radius-md, 10px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pc-window-bar {
  height: 38px;
  background: #f8fafc;
  border-bottom: 1px solid var(--om-border, #e2e8f0);
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
  background: var(--om-border, #e2e8f0);
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
  color: var(--om-text, #111827);
  box-sizing: border-box;
  outline: none;
  transition: all 0.15s ease;
}

.pc-login-input:focus {
  border-color: var(--om-primary, #2563EB);
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
  background: var(--om-primary, #2563EB);
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
  background: var(--om-primary-hover, #1D4ED8);
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
  accent-color: var(--om-primary, #2563EB);
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
  color: var(--om-primary, #2563EB);
  text-decoration: underline;
}
.btn-subtle-link.accent {
  color: var(--om-primary, #2563EB);
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
  color: var(--om-primary, #2563EB);
}

.pc-demo-chips-compact {
  margin-top: 12px;
  background: #f8fafc;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.demo-caption {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  white-space: nowrap;
}

.demo-pill-group {
  display: flex;
  gap: 6px;
  flex: 1;
}

.btn-demo-pill {
  flex: 1;
  padding: 4px 6px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-demo-pill:hover {
  background: #eff6ff;
  border-color: var(--om-primary, #2563EB);
  color: var(--om-primary, #2563EB);
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
  color: var(--om-text, #111827);
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
  color: #64748b;
  word-break: break-all;
}

.pc-qr-manual code {
  font-size: 10px;
}

.qr-svg-matrix {
  display: block;
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
  color: var(--om-primary, #2563EB);
}

.btn-qr-reload {
  background: none;
  border: none;
  color: var(--om-primary, #2563EB);
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
.pc-workspace {
  display: flex;
  flex: 1;
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
}

/* (Column 1) Leftmost Rail Dock (62px) */
.pc-rail {
  width: var(--om-rail-width, 62px);
  background: var(--om-midnight, #0B1020);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0 12px;
  flex-shrink: 0;
  z-index: 100;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}
.pc-rail-top, .pc-rail-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}
/* Item 11: 20 rail buttons overflow short viewports — the nav section scrolls
   internally while the bottom actions stay pinned. */
.pc-rail-top {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.pc-rail-bottom {
  flex-shrink: 0;
}
.pc-user-avatar-trigger {
  position: relative;
  cursor: pointer;
  margin-bottom: 8px;
}
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
.circle-38 { width: 38px; height: 38px; font-size: 14px; }
/* FX-10: avatar photos layer over the initial; a load failure hides the
   photo and the initial underneath shows instead of a broken glyph. */
.pc-avatar, .avatar-circle, .mobile-profile-avatar { position: relative; overflow: hidden; }
.ln-profile-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.circle-44 { width: 44px; height: 44px; font-size: 16px; }
.circle-46 { width: 46px; height: 46px; font-size: 17px; }

.pc-dot-online {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  background: var(--om-success, #22C55E);
  border: 2px solid var(--om-midnight, #0B1020);
  border-radius: 50%;
}

.pc-rail-btn {
  width: 48px;
  height: 44px;
  background: none;
  border: none;
  color: #94A3B8;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: 8px;
}
.pc-rail-btn.small {
  width: 38px;
  height: 38px;
}
.pc-rail-btn:hover {
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.08);
}
.pc-rail-btn.active {
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.12);
}
.pc-rail-indicator {
  display: none;
}
.pc-rail-btn.active .pc-rail-indicator {
  display: block;
  position: absolute;
  left: 0;
  width: 3px;
  height: 24px;
  background: var(--om-cyan, #22C7E8);
  border-radius: 0 4px 4px 0;
}
.pc-unread-pill {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 10px;
  border: 2px solid var(--om-midnight, #0B1020);
}

/* Dropdown menus from rail */
.pc-dropdown-menu {
  position: absolute;
  left: 64px;
  background: var(--om-surface, #ffffff);
  border: 1px solid var(--om-border, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  padding: 6px 0;
  min-width: 200px;
  z-index: 1000;
  animation: fadeIn 0.15s ease-out;
}
.user-menu { top: 16px; }
.consoles-menu { bottom: 48px; }
.dropdown-header {
  padding: 8px 14px;
}
.dropdown-header strong { display: block; font-size: 13px; color: var(--om-text, #111827); }
.dropdown-header small { color: #64748b; font-size: 11px; }
.dropdown-heading {
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
}
.dropdown-sep {
  height: 1px;
  background: var(--om-border-light, #f1f5f9);
  margin: 4px 0;
}
.dropdown-item {
  width: 100%;
  padding: 8px 14px;
  background: none;
  border: none;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: #334155;
  cursor: pointer;
  display: block;
  text-decoration: none;
}
.dropdown-item:hover {
  background: #f1f5f9;
  color: var(--om-primary, #2563EB);
}
.dropdown-item.logout {
  color: #ef4444;
}

/* (Column 2) Second Sidebar List Pane (~305px) */
.pc-side-pane {
  width: var(--om-panel-width, 305px);
  background: var(--om-surface, #ffffff);
  border-right: 1px solid var(--om-border, #e9edf1);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100vh;
  height: 100dvh;
  position: relative;
  transition: width 0.2s ease;
}

.pc-side-pane.is-collapsed {
  width: 52px;
  overflow: hidden;
}

.pc-pane-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

/* Subtabs in Chats View (Screenshot 1) */
.pc-chat-subtabs-row {
  display: flex;
  height: 42px;
  border-bottom: 1px solid var(--om-border, #e2e8f0);
  background: var(--om-surface, #ffffff);
  align-items: center;
  overflow-x: auto;
}

.btn-subtab {
  flex: 1 0 auto;
  height: 100%;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 0 12px;
  transition: color 0.15s ease;
}

.btn-subtab:hover {
  color: var(--om-text, #111827);
}

.btn-subtab.active {
  color: var(--om-text, #111827);
  font-weight: 700;
}

.btn-subtab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 20%;
  right: 20%;
  height: 2.5px;
  background: var(--om-primary, #2563EB);
  border-radius: 2px 2px 0 0;
}

.btn-subtab.filter-btn {
  flex: 0 0 38px;
  font-size: 15px;
}

/* Search Bar Header */
.pc-search-bar-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--om-border, #e2e8f0);
  background: var(--om-surface, #ffffff);
}

.pc-search-box-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 0 8px;
  box-sizing: border-box;
}

.pc-pane-search-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 12px;
  color: var(--om-text, #111827);
}

.btn-clear-search {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
  padding: 0 2px;
}

.btn-pane-sort, .btn-pane-collapse {
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #64748b;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-pane-sort:hover, .btn-pane-collapse:hover {
  background: #f1f5f9;
  color: var(--om-text, #111827);
}

/* Expand handle shown only while the side pane is collapsed (the in-flow
   collapse buttons are clipped by overflow, so collapsing must stay reversible). */
.btn-pane-expand {
  position: absolute;
  left: 12px;
  top: 12px;
  z-index: 5;
  width: 28px;
  height: 28px;
  background: var(--om-surface, #ffffff);
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #64748b;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.btn-pane-expand:hover {
  background: #f1f5f9;
  color: var(--om-text, #111827);
}

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

.btn-pane-sort.active {
  background: #eff6ff;
  border-color: var(--om-primary, #2563EB);
  color: var(--om-primary, #2563EB);
}

.pc-pane-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-bottom: 72px;
}

/* My Profile Card (Screenshots 4 & 5) */
.pc-my-profile-card {
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--om-border, #e2e8f0);
}

.my-profile-top-row {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.my-profile-meta {
  flex: 1;
  min-width: 0;
}

.my-name-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--om-text, #111827);
}

.my-status-text {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.my-profile-action-chips {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.btn-profile-chip {
  flex: 1;
  height: 28px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-profile-chip:hover {
  background: #e2e8f0;
  color: var(--om-primary, #2563EB);
}

/* Accordions (Screenshots 4 & 5) */
.pc-accordion-section {
  padding-bottom: 4px;
}

.pc-accordion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px 6px;
  cursor: pointer;
  user-select: none;
}

.accordion-title {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.accordion-caret {
  font-size: 13px;
  color: #94a3b8;
}

.pc-friend-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin: 1px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.pc-friend-item-row:hover {
  background: #f1f5f9;
}

.pc-friend-item-row.selected {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.friend-item-meta {
  flex: 1;
  min-width: 0;
}

.friend-item-name {
  font-size: var(--text-list-name-size, 0.9375rem);
  font-weight: var(--text-list-name-weight, 600);
  line-height: var(--text-list-name-leading, 1.4);
  color: var(--om-text, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-count {
  font-size: 11px;
  color: #64748b;
  font-weight: 400;
  margin-left: 4px;
}

.friend-item-sub {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

/* Chats List Rows (Screenshot 1) */
.pc-chat-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #f8fafc;
  cursor: pointer;
  transition: background 0.12s ease;
}

.pc-chat-item-row:hover {
  background: #f1f5f9;
}

.pc-chat-item-row.selected {
  background: #eff6ff;
}

.pc-chat-item-meta {
  flex: 1;
  min-width: 0;
}

.chat-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-row-title {
  font-size: var(--text-list-name-size, 0.9375rem);
  font-weight: var(--text-list-name-weight, 600);
  line-height: var(--text-list-name-leading, 1.4);
  color: var(--om-text, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
}

.member-count-badge {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 400;
}

.chat-row-time {
  font-size: var(--text-stamp-size, 0.6875rem);
  font-weight: var(--text-stamp-weight, 500);
  line-height: var(--text-stamp-leading, 1.2);
  font-variant-numeric: tabular-nums;
  color: #94a3b8;
  flex-shrink: 0;
}

.chat-row-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 3px;
}

.chat-row-preview {
  font-size: var(--text-sub-size, 0.8125rem);
  font-weight: var(--text-sub-weight, 400);
  color: var(--text-secondary, #64748b);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 180px;
}

.chat-unread-pill {
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  border-radius: 9px;
  padding: 0 5px;
  box-sizing: border-box;
}

/* Floating Action Button (FAB) (Screenshot 1) */
.pc-floating-add-btn {
  position: absolute;
  bottom: 20px;
  right: 18px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  border: none;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
  z-index: 50;
}

.pc-floating-add-btn:hover {
  background: var(--om-primary-hover, #1D4ED8);
  transform: scale(1.06);
}

.fab-plus-mark {
  position: absolute;
  font-size: 12px;
  font-weight: 900;
  bottom: 7px;
  right: 7px;
  background: var(--om-cyan, #22C7E8);
  color: #0B1020;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* Friend Profile View (Screenshot 5) */
.pc-friend-profile-viewport {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--om-surface, #ffffff);
  height: 100vh;
}

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
  color: var(--om-text, #111827);
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
  background: var(--om-primary, #2563EB);
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
  background: var(--om-primary-hover, #1D4ED8);
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
  color: var(--om-primary, #2563EB);
}

/* Ecosystem Hub Modal */
.ecosystem-modal {
  width: 740px !important;
  max-width: 95vw;
}
.ecosystem-modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ecosystem-modal-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--om-text, #111827);
}
.ecosystem-intro {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 12px 0;
}
.ecosystem-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  max-height: 480px;
  overflow-y: auto;
  padding: 4px 2px;
}
.ecosystem-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  transition: all 0.15s ease;
}
.ecosystem-card:hover {
  border-color: var(--om-primary, #2563EB);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.ecosystem-card.active { border-left: 3px solid var(--om-primary, #2563EB); }
.ecosystem-card.beta { border-left: 3px solid var(--om-cyan, #22C7E8); }
.ecosystem-card.preview { border-left: 3px solid #94a3b8; opacity: 0.85; }

.ecosystem-card-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.svc-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  display: grid;
  place-items: center;
  color: var(--om-primary, #2563EB);
  flex-shrink: 0;
}
.svc-names {
  flex: 1;
  min-width: 0;
}
.svc-names strong {
  display: block;
  font-size: 13px;
  color: var(--om-text, #111827);
}
.svc-ko {
  font-size: 10px;
  color: #64748b;
  display: block;
}
.svc-status-pill {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.svc-status-pill.active { background: #dcfce7; color: #15803d; }
.svc-status-pill.beta { background: #e0f2fe; color: #0369a1; }
.svc-status-pill.preview { background: #f1f5f9; color: #64748b; }
.svc-desc {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
  margin: 0;
}
.btn-svc-action {
  width: 100%;
  height: 30px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-sizing: border-box;
}
.btn-svc-action:hover {
  background: #eff6ff;
  border-color: var(--om-primary, #2563EB);
  color: var(--om-primary, #2563EB);
}
.btn-svc-action.link {
  color: var(--om-primary, #2563EB);
}

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
  border-color: var(--om-primary, #2563EB);
}
.type-icon { font-size: 24px; }
.type-text strong { display: block; font-size: 13px; color: var(--om-text, #111827); }
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
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

/* (Column 3) Right Main Chat View */
.pc-chat-viewport {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--line-slate-bg);
  height: 100vh;
  height: 100dvh;
  position: relative;
}
.pc-chat-topbar {
  height: 52px;
  background: #ffffff;
  border-bottom: 1px solid #e9edf1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.chat-topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.chat-header-title {
  font-size: var(--text-title-size, 1rem);
  font-weight: var(--text-title-weight, 600);
  line-height: var(--text-title-leading, 1.35);
  color: #111827;
}
.member-tag { font-size: 11px; color: #64748b; margin-left: 6px; }
.e2ee-tag { font-size: 10px; color: #16a34a; font-weight: 600; display: block; }
.chat-topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-chat-action {
  width: 34px;
  height: 34px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 4px;
  font-size: 15px;
  display: grid;
  place-items: center;
  color: #475569;
}
.btn-chat-action:hover { background: #f1f5f9; }

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
.date-capsule {
  align-self: center;
  background: rgba(0,0,0,0.22);
  color: #ffffff;
  font-size: 11px;
  padding: 3px 12px;
  border-radius: 12px;
  margin: 6px 0 10px;
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
@media (min-width: 701px) {
  .pc-msg-row .pc-speech-bubble { max-width: var(--bubble-max-desktop, 520px); }
}
.pc-msg-row.other .pc-speech-bubble {
  background: #ffffff;
  color: #191919;
  border-radius: var(--radius-bubble-tail, 4px) var(--radius-bubble, 18px) var(--radius-bubble, 18px) var(--radius-bubble, 18px);
}
.pc-msg-row.mine .pc-speech-bubble {
  background: var(--om-primary, #2563EB);
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
.pc-chat-input-dock {
  min-height: 135px;
  flex-shrink: 0;
  background: #ffffff;
  border-top: 1px solid #e9edf1;
  display: flex;
  flex-direction: column;
  position: relative;
}
.keyboard-open .pc-chat-input-dock {
  position: sticky;
  bottom: 0;
  z-index: 5;
}
.pc-input-toolbar {
  height: 36px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #f8fafc;
}
.btn-tool-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #64748b;
  padding: 4px;
  border-radius: 4px;
}
.btn-tool-icon:hover { background: #f1f5f9; color: #111827; }

.pc-textarea-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px 14px 10px;
}
.pc-textarea-form textarea {
  flex: 1;
  border: none;
  resize: none;
  outline: none;
  font-size: var(--text-input-size, 1rem);
  line-height: 1.4;
  font-family: inherit;
}
.pc-textarea-bottom {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}
.char-count { font-size: 11px; color: #94a3b8; }
.btn-green-send {
  height: 28px;
  padding: 0 14px;
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.btn-green-send:hover:not(:disabled) {
  background: var(--om-primary-hover, #1d4ed8);
}
.btn-green-send:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

/* Empty Canvas (Authentic LUNO PC Watermark) */
.pc-empty-canvas {
  flex: 1;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
}
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
.btn-primary { background: var(--om-primary, #2563EB); color: white; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background-color 0.15s; }
.btn-primary:hover { background: var(--om-primary-hover, #1d4ed8); }
.btn-secondary { background: #f1f5f9; color: #475569; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }

/* Keep modal, Call modal, etc */
.keep-modal { width: 440px; }
.keep-filter-bar { display: flex; gap: 6px; padding: 10px 18px; border-bottom: 1px solid #f1f5f9; }
.keep-filter-bar button { padding: 4px 10px; font-size: 11px; border: none; border-radius: 12px; background: #f1f5f9; cursor: pointer; }
.keep-filter-bar button.active { background: var(--om-primary, #2563EB); color: white; }
.keep-search-input { width: calc(100% - 36px); margin: 8px 18px; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; }
.keep-scroll-content { max-height: 280px; overflow-y: auto; padding: 0 18px 18px; }
.keep-card { padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
.btn-delete-keep { background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; }

/* Call overlay */
.call-overlay-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; }
.call-dialog-box { width: 340px; background: #1e293b; color: white; border-radius: 16px; padding: 24px; text-align: center; }
.call-avatar-pulse { margin-bottom: 12px; }
.call-controls-row { display: flex; justify-content: center; gap: 12px; margin-top: 18px; }
.btn-call-circle { width: 44px; height: 44px; border-radius: 50%; background: #334155; border: none; color: white; cursor: pointer; font-size: 18px; display: grid; place-items: center; }
.btn-call-circle.off { background: #ef4444; }
.btn-call-answer { background: var(--om-success, #22c55e); color: white; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 700; cursor: pointer; }
.btn-call-hangup { background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 700; cursor: pointer; }

/* Profile modal */
.profile-modal-box { width: 340px; background: white; border-radius: 16px; overflow: hidden; text-align: center; padding-bottom: 18px; }
.profile-cover-header { height: 110px; position: relative; display: flex; justify-content: flex-end; padding: 10px; }
.profile-main-meta { margin-top: -40px; display: flex; flex-direction: column; align-items: center; }
.profile-actions-footer { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
.btn-profile-action { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }

/* Pinned Banner */
.pinned-banner { background: #fffbeb; border-bottom: 1px solid #fef3c7; padding: 6px 16px; cursor: pointer; }
.pinned-summary { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #92400e; font-weight: 600; }
.pin-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* VOOM & Stories */
.stories-row { display: flex; gap: 10px; padding: 12px 16px; overflow-x: auto; border-bottom: 1px solid #f1f5f9; }
.story-item { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; font-size: 11px; }
.story-ring { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--om-primary, #2563EB); display: grid; place-items: center; color: white; font-weight: 800; font-size: 14px; }
.story-ring.plus { border-color: #cbd5e1; color: var(--om-primary, #2563EB); font-size: 18px; }
.voom-list { padding: 12px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.voom-card { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: white; }
.voom-banner { height: 90px; display: grid; place-items: center; font-size: 32px; }
.voom-meta { padding: 10px; }
.voom-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.btn-like { background: none; border: 1px solid #e2e8f0; border-radius: 12px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
.btn-like.liked { background: #fee2e2; border-color: #fca5a5; }

/* OpenChat */
.openchat-list { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.openchat-card { display: flex; gap: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; }
.openchat-card:hover { background: #f8fafc; border-color: var(--om-primary, #2563EB); }
.card-icon { font-size: 20px; }
.card-info strong { font-size: 13px; }
.card-info p { font-size: 11px; color: #64748b; margin: 2px 0 0; }

/* Wallet Card */
.luno-pay-card { margin: 12px; background: linear-gradient(135deg, var(--om-primary, #2563EB), var(--om-cyan, #22C7E8)); color: white; padding: 16px; border-radius: 12px; }
.pay-top { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; }
.pay-balance { font-size: 22px; font-weight: 900; margin: 10px 0; }
.pay-actions { display: flex; gap: 8px; }
.btn-pay-action { flex: 1; padding: 6px; background: white; color: var(--om-primary, #2563EB); font-weight: 700; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
.btn-pay-action.secondary { background: rgba(255,255,255,0.2); color: white; }
.services-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 12px 12px; }
.service-box { background: #f8fafc; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; font-size: 11px; font-weight: 700; }
.service-box:hover { background: rgba(37, 99, 235, 0.08); }
.service-box .icon { font-size: 20px; }

/* Sticker Popover */
.sticker-popover { position: absolute; bottom: 140px; left: 16px; width: 280px; height: 180px; background: white; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); display: flex; flex-direction: column; overflow: hidden; z-index: 100; }
.sticker-tabs { display: flex; background: #f8fafc; border-bottom: 1px solid #f1f5f9; padding: 4px; }
.sticker-tabs button { flex: 1; padding: 4px; font-size: 11px; border: none; background: none; cursor: pointer; }
.sticker-tabs button.active { font-weight: 700; color: var(--om-primary, #2563EB); border-bottom: 2px solid var(--om-primary, #2563EB); }
.btn-close-sticker { background: none; border: none; cursor: pointer; font-size: 12px; color: #94a3b8; }
.sticker-palette-grid { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px; overflow-y: auto; }
.sticker-choice-btn { font-size: 22px; background: none; border: none; cursor: pointer; border-radius: 6px; }
.sticker-choice-btn:hover { background: #f1f5f9; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Sticker Tray Popover */
.pc-sticker-tray-popover {
  position: absolute;
  bottom: 100%;
  left: 12px;
  width: 380px;
  height: 310px;
  background-color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  overflow: hidden;
  animation: traySlideUp 0.15s ease-out;
}

@keyframes traySlideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sticker-tray-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.sticker-tabs {
  display: flex;
  gap: 4px;
}

.sticker-tabs button {
  padding: 4px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}

.sticker-tabs button.active {
  background-color: var(--om-primary, #2563EB);
  color: #ffffff;
  font-weight: 600;
}

.btn-tray-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #94a3b8;
  padding: 4px;
  border-radius: 4px;
}

.btn-tray-close:hover {
  background-color: #e2e8f0;
  color: #1e293b;
}

.sticker-grid-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.sticker-item-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.1s;
}

.sticker-item-cell:hover {
  background-color: #f1f5f9;
  transform: scale(1.05);
}

.sticker-thumbnail {
  width: 60px;
  height: 60px;
}

.sticker-label {
  margin-top: 4px;
  font-size: 11px;
  color: #64748b;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70px;
}

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

.btn-tool-icon.active {
  background-color: rgba(37, 99, 235, 0.1);
  color: var(--om-primary, #2563EB);
}

.btn-tool-icon.recording {
  background-color: #fee2e2;
  color: #ef4444;
  animation: pulseRecording 1s infinite alternate;
}

@keyframes pulseRecording {
  from { opacity: 0.7; }
  to { opacity: 1; }
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
.pc-brand-slogan {
  font-size: 12px;
  font-weight: 600;
  color: #5B6475;
  text-align: center;
  margin: 6px 0 16px;
  letter-spacing: 0.3px;
}

/* Mobile Back Button */
.btn-mobile-back {
  display: none;
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: inherit;
  border-radius: 4px;
}
.btn-mobile-back:hover {
  background: #e2e8f0;
}

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
.live-captions-control {
  margin: 10px 0;
}
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
@media (max-width: 700px) {
  .pc-workspace {
    flex-direction: column-reverse;
  }
  .pc-rail {
    width: 100vw;
    height: 56px;
    flex-direction: row;
    justify-content: space-around;
    padding: 0 4px;
  }
  .pc-rail-top {
    flex-direction: row;
    justify-content: flex-start;
    width: 100%;
    gap: 0;
    overflow-x: auto;
    overflow-y: visible;
    scrollbar-width: none;
  }
  .pc-rail-bottom {
    display: none;
  }
  .pc-rail-top .pc-rail-btn {
    flex-shrink: 0;
  }
  .pc-side-pane {
    width: 100vw;
    height: calc(100vh - 56px);
    height: calc(100dvh - 56px);
  }
  .btn-mobile-back {
    display: grid;
    place-items: center;
  }
  .pc-chat-viewport {
    position: fixed;
    inset: 0;
    z-index: 200;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
  }
  .pc-login-card {
    width: calc(100vw - 32px);
    max-width: 360px;
  }
}

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

.security-title-luno {
  color: #315BCD;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.4px;
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

.btn-security-logout-luno {
  background: #315BCD;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
  width: 100%;
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
.pc-news-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
  overflow: hidden;
}

.news-scroll {
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.news-hero-card {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 3px 12px rgba(0,0,0,0.08);
  cursor: pointer;
  background: #000000;
  position: relative;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}
.news-hero-card:hover {
  transform: translateY(-2px);
}

.hero-image-wrap {
  position: relative;
  width: 100%;
  height: 240px;
  background: linear-gradient(110deg, #0f172a 30%, #1e293b 50%, #0f172a 70%);
}

.hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hero-gradient-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.85) 100%);
}

.hero-meta-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  color: #ffffff;
}

.hero-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  margin: 0 0 4px 0;
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}

.hero-press {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.news-hero-card .hero-image-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
}
.btn-hero-nav {
  position: absolute;
  top: 45%;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #ffffff;
  border: none;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: background 0.15s ease;
}
.btn-hero-nav:hover {
  background: rgba(0, 0, 0, 0.8);
}
.btn-hero-nav.prev { left: 8px; }
.btn-hero-nav.next { right: 8px; }
.hero-slide-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.65);
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  z-index: 10;
}
.hero-carousel-dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.hero-dot, .dot {
  width: 22px;
  height: 4px;
  border-radius: 2px;
  background: rgba(148, 163, 184, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
}
.hero-dot.active, .dot.active {
  background: #2563eb;
  width: 32px;
}

.news-ad-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  text-decoration: none;
  color: inherit;
}
.ad-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ad-tag-pill {
  font-size: 9px;
  font-weight: 700;
  color: #64748b;
  border: 1px solid #cbd5e1;
  padding: 1px 4px;
  border-radius: 3px;
  width: fit-content;
}
.ad-main-text {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.ad-link-text {
  font-size: 11px;
  color: #2563eb;
}
.ad-banner-img {
  width: 60px;
  height: 42px;
  object-fit: cover;
  border-radius: 6px;
}

.news-section-header {
  margin-top: 4px;
}
.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.news-ranked-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.15s ease;
}
.news-ranked-item:hover {
  background: #f8fafc;
}
.news-thumb-col {
  position: relative;
  width: 80px;
  height: 60px;
  flex-shrink: 0;
}
.ranked-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}
.ranked-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0,0,0,0.65);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
}
.news-text-col {
  flex: 1;
  min-width: 0;
}
.ranked-title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  color: #0f172a;
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ranked-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
}

/* ==========================================================================
   CALLS PANE STYLES (Screenshot 3)
   ========================================================================== */
.pc-calls-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
  overflow: hidden;
}

.calls-scroll {
  overflow-y: auto;
  padding: 4px 0;
}

.calls-list-wrap {
  display: flex;
  flex-direction: column;
}

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
.call-peer-name.text-missed-red {
  color: #ef4444 !important;
}
.call-repeat-count {
  font-size: 13px;
  font-weight: 600;
}
.call-repeat-count.text-missed-red {
  color: #ef4444 !important;
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
.btn-call-history-action {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.btn-call-history-action:hover {
  background: #e2e8f0;
  color: #315BCD;
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
.luno-mobile-floating-nav {
  display: none; /* hidden on PC desktop layout */
}

@media (max-width: 700px) {
  .luno-mobile-floating-nav {
    display: flex;
    position: fixed;
    bottom: 12px;
    bottom: max(12px, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 36px;
    padding: 6px 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.6);
    gap: 8px;
    align-items: center;
    width: auto;
    max-width: 94vw;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .luno-mobile-floating-nav::-webkit-scrollbar {
    display: none;
  }

  .mobile-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    padding: 6px 12px;
    border-radius: 28px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    color: #475569;
    flex-shrink: 0;
  }

  .mobile-nav-item.active {
    background: #e2e8f0;
    color: #0f172a;
  }

  .nav-icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
  }

  .nav-label {
    font-size: 11px;
    font-weight: 600;
    margin-top: 2px;
  }

  .mobile-nav-badge {
    position: absolute;
    top: -4px;
    right: -8px;
    background: #ef4444;
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 10px;
    min-width: 16px;
    text-align: center;
  }

  .mobile-nav-dot {
    position: absolute;
    top: 0;
    right: -2px;
    width: 6px;
    height: 6px;
    background: #ef4444;
    border-radius: 50%;
  }

  .pc-rail {
    display: none; /* mobile floating nav takes over bottom nav */
  }
  .pc-side-pane {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    padding-bottom: 74px; /* clearance for floating capsule */
  }
  .pc-floating-add-btn {
    bottom: 96px; /* FX-08: rides above the nav capsule */
  }
}

/* ==========================================================================
   COMPREHENSIVE UI/UX REMEDIATION STYLES (100% COVERAGE)
   ========================================================================== */
.phone-mode { gap: 12px; }
.btn-switch-method { background: none; border: none; color: #2563eb; font-size: 13px; font-weight: 600; cursor: pointer; }
.rail-more-wrapper { position: relative; display: flex; justify-content: center; }
.btn-scan-qr-search { background: none; border: none; padding: 2px 4px; color: #64748b; cursor: pointer; display: inline-flex; align-items: center; border-radius: 4px; }
.btn-scan-qr-search:hover { background: #e2e8f0; color: #0f172a; }

/* Home Recent Searches & Quick Service Bar */
.home-recent-searches { padding: 8px 14px; border-bottom: 1px solid #f1f5f9; background: #fafbfc; }
.recent-searches-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: #64748b; font-size: 11px; }
.btn-clear-all-searches { background: none; border: none; font-size: 11px; color: #94a3b8; cursor: pointer; }
.btn-clear-all-searches:hover { color: #ef4444; }
.recent-search-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.recent-keyword-chip { display: inline-flex; align-items: center; gap: 4px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2px 8px; font-size: 11.5px; color: #334155; }
.kw-text { cursor: pointer; }
.btn-del-kw { background: none; border: none; font-size: 10px; color: #94a3b8; cursor: pointer; padding: 0 2px; }
.home-services-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; background: #ffffff; }
.home-service-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 4px; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
.home-service-item:hover { background: #f1f5f9; }
.srv-icon { font-size: 18px; line-height: 1; }
.srv-label { font-size: 11px; font-weight: 600; color: #475569; }
.pc-accordion-content { display: flex; flex-direction: column; }
.group-avatar { font-weight: 700; }

/* Chats Main Header & Game Ad Banner */
.pc-chat-main-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 6px; background: #ffffff; }
.chat-header-title-dropdown { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.chat-main-heading { font-size: 18px; font-weight: 800; color: #0f172a; }
.dropdown-caret { font-size: 12px; color: #64748b; }
.chat-header-action-group { display: flex; align-items: center; gap: 4px; }
.btn-chat-head-tool { position: relative; background: none; border: none; width: 30px; height: 30px; border-radius: 6px; color: #475569; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.btn-chat-head-tool:hover { background: #f1f5f9; color: #0f172a; }
.tiny-plus { position: absolute; top: 3px; right: 3px; font-size: 9px; font-weight: 800; color: #2563eb; }
.chat-ad-banner-card { display: flex; align-items: center; justify-content: space-between; margin: 6px 12px; padding: 10px 12px; background: linear-gradient(90deg, #f8fafc, #eff6ff); border: 1px solid #e2e8f0; border-radius: 10px; cursor: pointer; }
.ad-banner-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ad-tag-title { font-size: 12px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ad-tag-link { font-size: 11px; font-weight: 600; color: #2563eb; }
.ad-banner-graphic { position: relative; width: 52px; height: 38px; flex-shrink: 0; border-radius: 6px; overflow: hidden; }
.ad-badge-i { position: absolute; top: 2px; right: 2px; font-size: 9px; background: rgba(0,0,0,0.5); color: #fff; padding: 0 3px; border-radius: 3px; }
.ad-logo-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.chat-row-badges { display: flex; align-items: center; gap: 4px; margin-left: 6px; flex-shrink: 0; }
.badge-luno-n { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #4F7CFF; color: #ffffff; font-size: 10px; font-weight: 800; }

/* Generic Pane Header & News / Calls Specifics */
.pc-pane-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; border-bottom: 1px solid #f1f5f9; background: #ffffff; }
.pc-pane-title { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
.news-header-tools, .calls-header-tools { display: flex; align-items: center; gap: 6px; }
.btn-pc-header-tool { background: none; border: none; width: 30px; height: 30px; border-radius: 6px; color: #475569; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.btn-pc-header-tool:hover { background: #f1f5f9; color: #0f172a; }
/* FX-17: labeled new-call button + contact picker rows. */
.btn-pc-header-tool.btn-new-call-labeled { width: auto; padding: 0 10px; gap: 6px; font-size: 13px; font-weight: 600; }
.new-call-modal { width: 420px; max-width: 94vw; }
.new-call-body { max-height: 60vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.new-call-row { display: flex; align-items: center; gap: 8px; }
.new-call-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
.hero-press-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: rgba(255,255,255,0.85); }
.hero-time { opacity: 0.8; }
.dot { width: 16px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.35); display: inline-block; }
.dot.active { background: #ffffff; }
.ad-text-block { display: flex; flex-direction: column; gap: 3px; }
.ad-headline { font-size: 13px; font-weight: 700; color: #0f172a; }
.ad-sub { font-size: 11px; color: #64748b; }
.ad-thumb { width: 64px; height: 44px; border-radius: 6px; overflow: hidden; flex-shrink: 0; }
.ad-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.news-section-wrap { display: flex; flex-direction: column; gap: 8px; }
.news-ranked-list { display: flex; flex-direction: column; }
.news-info-col { flex: 1; min-width: 0; }
.ranked-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #94a3b8; }
.ranked-press { font-weight: 600; color: #64748b; }
.ranked-time { color: #94a3b8; }

/* Calls Row Alignment & Missed Red Highlight (Screenshot 3) */
.circle-40 { width: 40px; height: 40px; font-size: 14px; flex-shrink: 0; }
.call-history-row { gap: 12px; }
.call-history-row.selected { background: #eff6ff; }
.call-history-row.is-missed .call-row-name { color: #ef4444; }
.call-history-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.call-row-name { font-size: 14px; font-weight: 600; color: #0f172a; display: flex; align-items: center; gap: 4px; }
.text-red { color: #ef4444 !important; }
.call-count-tag { font-size: 12.5px; font-weight: 700; }
.call-row-sub { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #64748b; }
.call-kind-icon { display: inline-flex; align-items: center; color: #94a3b8; }
.direction-arrow { font-weight: 700; color: #94a3b8; }
.timestamp-text, .duration-text { color: #94a3b8; }

/* Viewports: Calls, OpenChat, Drawer, Polls, Stickers, Reply */
.pc-calls-viewport, .pc-openchat-viewport { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8fafc; height: 100%; overflow: hidden; }
.pc-openchat-viewport { align-items: stretch; justify-content: space-between; }
.pc-call-detail-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px 28px; width: 360px; max-width: 90%; text-align: center; box-shadow: 0 8px 24px rgba(15,23,42,0.06); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.openchat-post-card { background: #ffffff; border-radius: 12px; padding: 12px 16px; border: 1px solid #e2e8f0; margin-bottom: 8px; }
.openchat-post-meta { display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-bottom: 4px; }
.openchat-post-body { margin: 0; font-size: 13.5px; color: #0f172a; }
.title { font-weight: 600; }
.chat-topbar-info { display: flex; flex-direction: column; min-width: 0; }
.title-row { display: flex; align-items: center; gap: 6px; }
.badge-verified { background: #dcfce7; color: #15803d; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 8px; }
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
.flex-row { display: flex; align-items: center; gap: 8px; }
.select-friends-scroll { max-height: 160px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.friend-check-item { display: flex; align-items: center; gap: 8px; padding: 4px 6px; font-size: 13px; cursor: pointer; }
.modal-subtext { font-size: 12.5px; color: #64748b; margin: 0 0 8px; }
.add-friend-quick-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.quick-opt-item { display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; font-size: 12px; }
.ecosystem-body { max-height: 70vh; overflow-y: auto; }
.svc-card-footer { margin-top: 8px; display: flex; justify-content: flex-end; }

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
.bubble-attachment-box { display: flex; align-items: center; gap: 8px; }
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
.wallet-tx-section { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
.wallet-tx-heading { margin: 0 0 4px; font-size: 13px; color: #475569; }
.wallet-tx-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12.5px; }
.wallet-tx-info { display: flex; flex-direction: column; }
.wallet-tx-amount { font-weight: 700; color: #0f172a; }
.wallet-tx-amount.plus { color: #16a34a; }

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
.chat-pin-mark {
  font-size: 11px;
  margin-right: 3px;
}
.chat-mute-mark {
  font-size: 11px;
  margin-left: 3px;
  opacity: 0.7;
}
</style>

<style>
.profile-photo-controls{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:16px 20px 0}.profile-photo-controls small,.profile-photo-controls p{flex-basis:100%;text-align:center}.pc-user-avatar-trigger{border:0;background:transparent;padding:0;color:inherit}.ln-profile-photo{width:100%;height:100%;object-fit:cover;border-radius:inherit}
</style>

<style>
.mobile-profile-avatar{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#315bcd;color:white;font-size:12px}.profile-modal-card{max-height:calc(100dvh - 32px);overflow-y:auto;max-width:calc(100vw - 32px)}
</style>
