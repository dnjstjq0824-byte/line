<script setup lang="ts">
// I-4: chats list pane (VIEW 2), extracted verbatim from MessengerView.vue.
// Filter/sort/search/collapse stay two-way models (the view owns filtering);
// actions emit upward. The channel-slot dismiss flag is list-local.
import { ref } from 'vue'

import lunoMark from '../../../shared/brand/luno-logo-appicon.svg'
import type { Chat } from '../../../shared/api'
import { t } from '../store/session'
import LunoIcon from './LunoIcon.vue'

export type ChatFilter = 'all' | 'direct' | 'group' | 'unread'
export type DrawerTab = 'notes' | 'albums' | 'events' | 'media'

defineProps<{
  filteredChats: Chat[]
  selectedChatId: string
  channelSlot: { id: string; title: string; body: string } | null
  formatTime: (iso: string) => string
}>()

const emit = defineEmits<{
  'mark-all-read': []
  drawer: [tab: DrawerTab]
  'new-chat': []
  qr: []
  ecosystem: [serviceId: string]
  select: [chatId: string]
  'chat-menu': [event: MouseEvent, chat: Chat]
}>()

const chatFilter = defineModel<ChatFilter>('chatFilter', { required: true })
const searchKeyword = defineModel<string>('searchKeyword', { required: true })
const chatSortAsc = defineModel<boolean>('chatSortAsc', { required: true })
const isPanelCollapsed = defineModel<boolean>('isPanelCollapsed', { required: true })

const channelSlotDismissed = ref(false)
</script>

<template>
  <div class="pc-pane-body">
    <!-- Top Chat Header Bar with Category Dropdown & Action Icons (Screenshot 4) -->
    <div class="pc-chat-main-header">
      <div class="chat-header-title-dropdown">
        <span class="chat-main-heading">{{ t('mvChats') }}</span>
        <span class="dropdown-caret">▾</span>
      </div>
      <div class="chat-header-action-group">
        <button class="btn-chat-head-tool" :title="t('mvMarkAllRead')" @click="emit('mark-all-read')">
          ✓✓
        </button>
        <button class="btn-chat-head-tool" :title="chatSortAsc ? t('mvSortName') : t('mvSortRecent')" @click="chatSortAsc = !chatSortAsc">
          ⇅
        </button>
        <button class="btn-chat-head-tool" :title="t('mvMediaView')" @click="emit('drawer', 'media')">
          <LunoIcon name="photo" :size="16" />
        </button>
        <button class="btn-chat-head-tool" :title="t('mvCalendar')" @click="emit('drawer', 'events')">
          <LunoIcon name="calendar" :size="16" />
        </button>
        <button class="btn-chat-head-tool" :title="t('mvNewChat')" @click="emit('new-chat')">
          <LunoIcon name="chats" :size="16" />
          <span class="tiny-plus">+</span>
        </button>
      </div>
    </div>

    <!-- Top Sub-Tabs: 전체 | 친구 | 그룹 | ⇄ (Screenshot 1) -->
    <div class="pc-chat-subtabs-row">
      <button class="btn-subtab" :class="{ active: chatFilter === 'all' }" @click="chatFilter = 'all'">{{ t('tabAll') }}</button>
      <button class="btn-subtab" :class="{ active: chatFilter === 'direct' }" @click="chatFilter = 'direct'">{{ t('tabDirect') }}</button>
      <button class="btn-subtab" :class="{ active: chatFilter === 'group' }" @click="chatFilter = 'group'">{{ t('tabGroup') }}</button>
      <button class="btn-subtab filter-btn" :class="{ active: chatFilter === 'unread' }" @click="chatFilter = chatFilter === 'unread' ? 'all' : 'unread'" :title="t('mvSortFilter')">⇄</button>
    </div>

    <!-- Search Bar with Scan QR icon and Collapse (<) (Screenshot 4) -->
    <div class="pc-search-bar-header">
      <div class="pc-search-box-wrap">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchKeyword" :placeholder="t('mvSearch')" class="pc-pane-search-input" />
        <button v-if="searchKeyword" class="btn-clear-search" @click="searchKeyword = ''">✕</button>
        <button class="btn-scan-qr-search" :title="t('mvQrScan')" @click="emit('qr')">
          <LunoIcon name="scan" :size="15" />
        </button>
      </div>
      <button class="btn-pane-collapse" :title="t('mvCollapse')" @click="isPanelCollapsed = !isPanelCollapsed">&lt;</button>
    </div>

    <!-- CapCom / Open Scanner Game Banner Ad (Screenshot 4) -->
    <div class="chat-ad-banner-card" @click="emit('ecosystem', 'open-apps')">
      <div class="ad-banner-info">
        <span class="ad-tag-title">LUNO</span>
        <span class="ad-tag-link">{{ t('soon_tag') }}</span>
      </div>
      <div class="ad-banner-graphic">
        <span class="ad-badge-i">ⓘ</span>
        <img :src="lunoMark" alt="LUNO" class="ad-logo-img" />
      </div>
    </div>

    <!-- Smart-channel slot: server-driven notice card (LINE parity) -->
    <div v-if="channelSlot && !channelSlotDismissed" class="channel-slot-card">
      <div class="channel-slot-text">
        <strong>{{ channelSlot.title }}</strong>
        <span>{{ channelSlot.body }}</span>
      </div>
      <button class="channel-slot-close" :title="t('mvClose')" @click="channelSlotDismissed = true">✕</button>
    </div>

    <!-- Chats Scroll List (Screenshots 1 & 4) -->
    <div class="pc-pane-scroll">
      <div
        v-for="c in filteredChats"
        :key="c.id"
        class="pc-chat-item-row"
        :class="{ selected: selectedChatId === c.id }"
        @click="emit('select', c.id)"
        @contextmenu.prevent="emit('chat-menu', $event, c)"
      >
        <div class="pc-avatar circle-44" :class="{ 'group-avatar': c.kind === 'group' }" :style="{ background: c.kind === 'group' ? 'var(--om-cyan, #8EC5FF)' : c.official ? '#4F7CFF' : 'var(--om-primary, #4F7CFF)' }">
          <span v-if="c.official">🛡️</span>
          <span v-else>{{ c.title ? c.title.slice(0, 1) : 'L' }}</span>
        </div>
        <div class="pc-chat-item-meta">
          <div class="chat-row-top">
            <div class="chat-row-title">
              <span v-if="(c as any).pinned" class="chat-pin-mark" :title="t('mvPinnedBadge')">📌</span>
              {{ c.title || t('mvChatFallback') }}
              <span v-if="c.kind === 'group'" class="member-count-badge">({{ c.member_count || 2 }})</span>
              <span v-if="(c as any).muted" class="chat-mute-mark" :title="t('mvMutedBadge')">🔕</span>
            </div>
            <span class="chat-row-time">{{ formatTime(c.updated_at || '') }}</span>
          </div>
          <div class="chat-row-bottom">
            <span class="chat-row-preview">{{ c.last_message?.body || t('mvNoMessages') }}</span>
            <div class="chat-row-badges">
              <span v-if="c.badge_n" class="badge-luno-n">N</span>
              <span v-else-if="c.unread_count && c.unread_count > 0" class="chat-unread-pill">{{ c.unread_count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Action Button (FAB) New Chat (Screenshot 1) -->
    <button class="pc-floating-add-btn" :title="t('mvStartNewChat')" @click="emit('new-chat')">
      <LunoIcon name="chats" :size="20" />
      <span class="fab-plus-mark">+</span>
    </button>
  </div>
</template>
