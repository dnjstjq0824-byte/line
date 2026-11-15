<script setup lang="ts">
// I-4: chats list pane (VIEW 2), extracted verbatim from MessengerView.vue.
// Filter/sort/search/collapse stay two-way models (the view owns filtering);
// actions emit upward. The channel-slot dismiss flag is list-local.
import { ref } from 'vue'
import type { Chat } from '../../../shared/api'
import { initialOf } from '../../../shared/avatar_initial'
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
  select: [chatId: string]
  'chat-menu': [event: MouseEvent, chat: Chat]
}>()

const chatFilter = defineModel<ChatFilter>('chatFilter', { required: true })
const searchKeyword = defineModel<string>('searchKeyword', { required: true })
const chatSortAsc = defineModel<boolean>('chatSortAsc', { required: true })

const channelSlotDismissed = ref(false)
const showListMenu = ref(false)
</script>

<template>
  <div class="lx-pane">
    <header class="lx-pane-head">
      <h2 class="lx-pane-title">{{ t('mvChats') }}</h2>
      <div class="lx-pane-actions">
        <button type="button" class="lx-icon-btn" :title="t('mvNewChat')" :aria-label="t('mvNewChat')" @click="emit('new-chat')">
          <LunoIcon name="edit" :size="20" />
        </button>
        <div class="lx-menu-wrap">
          <button type="button" class="lx-icon-btn" :title="t('mvMoreActions')" :aria-label="t('mvMoreActions')" :aria-expanded="showListMenu" @click="showListMenu = !showListMenu">
            <LunoIcon name="more" :size="20" />
          </button>
          <div v-if="showListMenu" class="lx-menu-layer" @click="showListMenu = false"></div>
          <div v-if="showListMenu" class="lx-menu" role="menu" @click="showListMenu = false">
            <button type="button" class="lx-menu-item" role="menuitem" @click="emit('mark-all-read')"><LunoIcon name="check-all" :size="18" /><span>{{ t('mvMarkAllRead') }}</span></button>
            <button type="button" class="lx-menu-item" role="menuitem" @click="chatSortAsc = !chatSortAsc"><LunoIcon name="sort" :size="18" /><span>{{ chatSortAsc ? t('lxSortByRecent') : t('lxSortByName') }}</span></button>
            <button type="button" class="lx-menu-item" role="menuitem" @click="emit('drawer', 'media')"><LunoIcon name="photo" :size="18" /><span>{{ t('mvMediaView') }}</span></button>
            <button type="button" class="lx-menu-item" role="menuitem" @click="emit('drawer', 'events')"><LunoIcon name="calendar" :size="18" /><span>{{ t('mvCalendar') }}</span></button>
            <button type="button" class="lx-menu-item" role="menuitem" @click="emit('qr')"><LunoIcon name="scan" :size="18" /><span>{{ t('mvQrScan') }}</span></button>
          </div>
        </div>
      </div>
    </header>

    <label class="lx-search">
      <LunoIcon name="search" :size="16" />
      <input v-model="searchKeyword" :placeholder="t('lxSearchChats')" :aria-label="t('lxSearchChats')" class="pc-pane-search-input" />
      <button v-if="searchKeyword" type="button" class="lx-search-clear" :title="t('mvClose')" :aria-label="t('mvClose')" @click="searchKeyword = ''"><LunoIcon name="close" :size="14" /></button>
    </label>

    <div class="lx-chips" role="tablist">
      <button type="button" class="lx-chip" role="tab" :aria-selected="chatFilter === 'all'" :class="{ active: chatFilter === 'all' }" @click="chatFilter = 'all'">{{ t('tabAll') }}</button>
      <button type="button" class="lx-chip" role="tab" :aria-selected="chatFilter === 'direct'" :class="{ active: chatFilter === 'direct' }" @click="chatFilter = 'direct'">{{ t('tabDirect') }}</button>
      <button type="button" class="lx-chip" role="tab" :aria-selected="chatFilter === 'group'" :class="{ active: chatFilter === 'group' }" @click="chatFilter = 'group'">{{ t('tabGroup') }}</button>
      <button type="button" class="lx-chip" role="tab" :aria-selected="chatFilter === 'unread'" :class="{ active: chatFilter === 'unread' }" @click="chatFilter = 'unread'">{{ t('lxUnread') }}</button>
    </div>

    <!-- Smart-channel slot: server-driven notice card -->
    <div v-if="channelSlot && !channelSlotDismissed" class="channel-slot-card">
      <div class="channel-slot-text">
        <strong>{{ channelSlot.title }}</strong>
        <span>{{ channelSlot.body }}</span>
      </div>
      <button class="channel-slot-close" :title="t('mvClose')" @click="channelSlotDismissed = true">✕</button>
    </div>

    <div class="lx-scroll">
      <p v-if="!filteredChats.length" class="lx-list-empty">{{ searchKeyword ? t('lxNoSearchResult') : t('lxNoChats') }}</p>
      <div
        v-for="c in filteredChats"
        :key="c.id"
        class="lx-row pc-chat-item-row"
        :class="{ selected: selectedChatId === c.id }"
        role="button"
        tabindex="0"
        @click="emit('select', c.id)"
        @keydown.enter="emit('select', c.id)"
        @contextmenu.prevent="emit('chat-menu', $event, c)"
      >
        <span class="lx-avatar s48" :class="{ group: c.kind === 'group' }" :style="{ background: c.kind === 'group' ? 'var(--ln-info)' : c.official ? '#4F7CFF' : 'var(--ln-accent)' }">
          <LunoIcon v-if="c.official" name="shield" :size="22" />
          <span v-else>{{ initialOf(c.title, 'L') }}</span>
          <img v-if="c.kind === 'group' && c.avatar_url" :src="c.avatar_url" alt="" class="ln-profile-photo" />
        </span>
        <span class="lx-row-main">
          <span class="lx-row-line">
            <span class="lx-row-title">
              <span class="lx-row-name">{{ c.title || t('mvChatFallback') }}</span>
              <span v-if="c.kind === 'group'" class="lx-row-count">{{ c.member_count || 2 }}</span>
              <LunoIcon v-if="(c as any).pinned" name="pin" :size="13" class="lx-row-mark" :title="t('mvPinnedBadge')" />
              <LunoIcon v-if="(c as any).muted" name="bell-off" :size="13" class="lx-row-mark" :title="t('mvMutedBadge')" />
            </span>
            <span class="lx-row-time">{{ formatTime(c.updated_at || '') }}</span>
          </span>
          <span class="lx-row-line">
            <span class="lx-row-preview">{{ c.last_message?.unsent ? t('mvMsgUnsent') : (c.last_message?.body || t('mvNoMessages')) }}</span>
            <span v-if="c.badge_n" class="lx-badge inline">N</span>
            <span v-else-if="c.unread_count && c.unread_count > 0" class="lx-badge inline">{{ c.unread_count > 999 ? '999+' : c.unread_count }}</span>
          </span>
        </span>
      </div>
    </div>
  </div>
</template>
