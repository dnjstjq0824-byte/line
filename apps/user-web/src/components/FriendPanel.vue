<script setup lang="ts">
// I-4: friends/home pane (VIEW 1), extracted verbatim from MessengerView.vue.
// Accordion state and recent-keyword history are panel-local; roster data is
// props, friend search is a two-way model, actions emit upward.
import { ref } from 'vue'

import type { Chat, User } from '../../../shared/api'
import { currentUser, t } from '../store/session'
import LunoIcon from './LunoIcon.vue'
import type { DrawerTab } from './ChatList.vue'

export interface OfficialAccount {
  id: string
  name: string
  handle: string
  description: string
  color: string
  followed: boolean
}

defineProps<{
  favoriteFriends: User[]
  selectedFriendProfile: User | null
  groupChats: Chat[]
  selectedChatId: string
  officialAccounts: OfficialAccount[]
  filteredFriends: User[]
}>()

const emit = defineEmits<{
  qr: []
  sticker: []
  settings: []
  official: []
  services: []
  profile: []
  'keep-memo': []
  drawer: [tab: DrawerTab]
  'select-friend': [friend: User]
  'direct-chat': [friend: User]
  'friend-menu': [event: MouseEvent, friend: User]
  'select-chat': [chatId: string]
  'follow-oa': [oa: OfficialAccount]
}>()

const friendSearchQuery = defineModel<string>('friendSearchQuery', { required: true })
const isPanelCollapsed = defineModel<boolean>('isPanelCollapsed', { required: true })

const friendsSectionOpen = ref(true)
const groupsSectionOpen = ref(true)
const favoritesSectionOpen = ref(true)
const officialSectionOpen = ref(true)

// --- Recent Search History (Section 3.2 & 4) ---
const recentSearchKeywords = ref<string[]>(['K 🙏', t('mvSeedPress'), t('navOpenChat'), 'CapCom', t('mvSeedMinutes')])

function addSearchKeyword(kw: string) {
  if (!kw.trim()) return
  const t = kw.trim()
  recentSearchKeywords.value = [t, ...recentSearchKeywords.value.filter(k => k !== t)].slice(0, 10)
}

function removeSearchKeyword(kw: string) {
  recentSearchKeywords.value = recentSearchKeywords.value.filter(k => k !== kw)
}

function clearAllSearchKeywords() {
  recentSearchKeywords.value = []
}
</script>

<template>
  <div class="pc-pane-body">
    <!-- Top Search Header with Collapse Toggle -->
    <div class="pc-search-bar-header">
      <div class="pc-search-box-wrap">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="friendSearchQuery" :placeholder="t('searchFriends')" class="pc-pane-search-input" @keydown.enter="addSearchKeyword(friendSearchQuery)" />
        <button v-if="friendSearchQuery" class="btn-clear-search" @click="friendSearchQuery = ''">✕</button>
        <button class="btn-scan-qr-search" :title="t('mvQrScan')" @click="emit('qr')">
          <LunoIcon name="scan" :size="15" />
        </button>
      </div>
      <button class="btn-pane-collapse" :title="t('mvCollapse')" @click="isPanelCollapsed = !isPanelCollapsed">&lt;</button>
    </div>

    <!-- Recent Search Keywords (Section 3.2) -->
    <div v-if="recentSearchKeywords.length > 0" class="home-recent-searches">
      <div class="recent-searches-header">
        <small>{{ t('mvRecentSearch') }}</small>
        <button class="btn-clear-all-searches" @click="clearAllSearchKeywords">{{ t('mvClearAll') }}</button>
      </div>
      <div class="recent-search-chips">
        <span v-for="kw in recentSearchKeywords" :key="kw" class="recent-keyword-chip">
          <span class="kw-text" @click="friendSearchQuery = kw">{{ kw }}</span>
          <button class="btn-del-kw" @click="removeSearchKeyword(kw)">✕</button>
        </span>
      </div>
    </div>

    <!-- Quick Service Shortcuts (Section 3.3) -->
    <div class="home-services-bar">
      <div class="home-service-item" @click="emit('sticker')">
        <span class="srv-icon">🐻</span>
        <span class="srv-label">{{ t('mvSticker') }}</span>
      </div>
      <div class="home-service-item" @click="emit('settings')">
        <span class="srv-icon">🎨</span>
        <span class="srv-label">{{ t('mvTheme') }}</span>
      </div>
      <div class="home-service-item" @click="emit('official')">
        <span class="srv-icon">🛡️</span>
        <span class="srv-label">{{ t('mvOfficialAccount') }}</span>
      </div>
      <div class="home-service-item" @click="emit('services')">
        <span class="srv-icon">📱</span>
        <span class="srv-label">{{ t('mvLunoServices') }}</span>
      </div>
    </div>

    <!-- Friends List Scroll Area -->
    <div class="pc-pane-scroll">
      <!-- My Profile Card with Keep & Album Buttons (Screenshot 4 & 5) -->
      <div class="pc-my-profile-card">
        <div class="my-profile-top-row" @click="emit('profile')">
          <div class="pc-avatar circle-46" :style="{ background: currentUser?.avatar_color || 'var(--om-primary, #4F7CFF)' }"><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" /><span v-else>{{ currentUser?.display_name?.slice(0, 1) }}</span>
          </div>
          <div class="my-profile-meta">
            <div class="my-name-text">{{ currentUser?.display_name }}</div>
            <div class="my-status-text">{{ currentUser?.status_message || t('myProfileStatus') }}</div>
          </div>
        </div>
        <!-- Action Chips: Keep 메모 & 앨범 모아보기 (Matching Screenshot 4) -->
        <div class="my-profile-action-chips">
          <button type="button" class="btn-profile-chip" @click="emit('keep-memo')">
            <LunoIcon name="keep" :size="13" />
            <span>{{ t('keepMemo') }}</span>
          </button>
          <button type="button" class="btn-profile-chip" @click="emit('drawer', 'albums')">
            <LunoIcon name="camera" :size="13" />
            <span>{{ t('albumView') }}</span>
          </button>
        </div>
      </div>

      <!-- Accordion 0: Favorites (즐겨찾기 - 항상 노출) -->
      <div class="pc-accordion-section">
        <div class="pc-accordion-header" @click="favoritesSectionOpen = !favoritesSectionOpen">
          <span class="accordion-title">{{ t('mvFavorites').replace('{n}', String(favoriteFriends.length)) }}</span>
          <span class="accordion-caret">{{ favoritesSectionOpen ? '⌵' : '›' }}</span>
        </div>
        <div v-show="favoritesSectionOpen" class="pc-accordion-content">
          <div v-if="favoriteFriends.length === 0" class="accordion-empty-hint" style="padding: 10px 14px; font-size: 12px; color: #94a3b8;">{{ t('mvNoFavorites') }}</div>
          <div
            v-else
            v-for="fav in favoriteFriends"
            :key="'fav-' + fav.id"
            class="pc-friend-item-row"
            :class="{ selected: selectedFriendProfile?.id === fav.id }"
            @click="emit('select-friend', fav)"
            @dblclick="emit('direct-chat', fav)"
            @contextmenu.prevent="emit('friend-menu', $event, fav)"
          >
            <div class="pc-avatar circle-38" :style="{ background: fav.avatar_color || 'var(--om-primary, #4F7CFF)' }">
              {{ fav.display_name.slice(0, 1) }}
            </div>
            <div class="friend-item-meta">
              <div class="friend-item-name">★ {{ fav.display_name }}</div>
              <div class="friend-item-sub">{{ fav.status_message || fav.bio || t('mvFavFallback') }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Accordion 1: Groups (그룹 - Screenshots 4 & 5) -->
      <div class="pc-accordion-section">
        <div class="pc-accordion-header" @click="groupsSectionOpen = !groupsSectionOpen">
          <span class="accordion-title">{{ t('groupSection') }} {{ groupChats.length }}</span>
          <span class="accordion-caret">{{ groupsSectionOpen ? '⌵' : '›' }}</span>
        </div>
        <div v-show="groupsSectionOpen" class="pc-accordion-content">
          <div
            v-for="grp in groupChats"
            :key="grp.id"
            class="pc-friend-item-row"
            :class="{ selected: selectedChatId === grp.id }"
            @click="emit('select-chat', grp.id)"
          >
            <div class="pc-avatar circle-38 group-avatar" style="background: var(--om-cyan, #8EC5FF);">
              {{ grp.title ? grp.title.slice(0, 1) : 'G' }}
            </div>
            <div class="friend-item-meta">
              <div class="friend-item-name">
                {{ grp.title }}
                <span class="group-count">({{ grp.member_count || 2 }})</span>
              </div>
              <div class="friend-item-sub">{{ grp.last_message?.body || t('mvGroupFallback') }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Accordion 1.5: Official Accounts (공식 계정) -->
      <div v-if="officialAccounts.length > 0" class="pc-accordion-section">
        <div class="pc-accordion-header" @click="officialSectionOpen = !officialSectionOpen">
          <span class="accordion-title">{{ t('mvOfficialAccounts').replace('{n}', String(officialAccounts.length)) }}</span>
          <span class="accordion-caret">{{ officialSectionOpen ? '⌵' : '›' }}</span>
        </div>
        <div v-show="officialSectionOpen" class="pc-accordion-content">
          <div
            v-for="oa in officialAccounts"
            :key="oa.id"
            class="pc-friend-item-row"
            @click="emit('follow-oa', oa)"
          >
            <div class="pc-avatar circle-38" :style="{ background: oa.color || '#4F7CFF' }">
              🛡️
            </div>
            <div class="friend-item-meta">
              <div class="friend-item-name">{{ oa.name }} <span class="badge-verified">{{ t('mvOfficial') }}</span></div>
              <div class="friend-item-sub">{{ oa.description }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Accordion 2: Friends (친구 - Screenshots 4 & 5) -->
      <div class="pc-accordion-section">
        <div class="pc-accordion-header" @click="friendsSectionOpen = !friendsSectionOpen">
          <span class="accordion-title">{{ t('friendSection') }} {{ filteredFriends.length }}</span>
          <span class="accordion-caret">{{ friendsSectionOpen ? '⌵' : '›' }}</span>
        </div>
        <div v-show="friendsSectionOpen" class="pc-accordion-content">
          <div
            v-for="f in filteredFriends"
            :key="f.id"
            class="pc-friend-item-row"
            :class="{ selected: selectedFriendProfile?.id === f.id }"
            @click="emit('select-friend', f)"
            @dblclick="emit('direct-chat', f)"
            @contextmenu.prevent="emit('friend-menu', $event, f)"
          >
            <div class="pc-avatar circle-38" :style="{ background: f.avatar_color || 'var(--om-primary, #4F7CFF)' }">
              {{ f.display_name.slice(0, 1) }}
            </div>
            <div class="friend-item-meta">
              <div class="friend-item-name">
                <span v-if="(f as any).is_favorite" class="fav-star-inline">★</span>
                {{ f.display_name }}
                <span v-if="(f as any).birthday_today" class="bday-badge" :title="t('mvBirthdayToday')">🎂</span>
              </div>
              <div class="friend-item-sub">{{ f.status_message || f.bio || t('mvFriendFallback') }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
