<script setup lang="ts">
// I-4: friends/home pane (VIEW 1), extracted verbatim from MessengerView.vue.
// Accordion state and recent-keyword history are panel-local; roster data is
// props, friend search is a two-way model, actions emit upward.
import { ref } from 'vue'

import type { Chat, User } from '../../../shared/api'
import { initialOf } from '../../../shared/avatar_initial'
import { currentUser, t } from '../store/session'
import { hideBrokenAvatar, taglineOf } from '../messenger-format'
import LunoIcon from './LunoIcon.vue'

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
  'add-friend': []
  profile: []
  'keep-memo': []
  'select-friend': [friend: User]
  'direct-chat': [friend: User]
  'friend-menu': [event: MouseEvent, friend: User]
  'select-chat': [chatId: string]
  'follow-oa': [oa: OfficialAccount]
}>()

const friendSearchQuery = defineModel<string>('friendSearchQuery', { required: true })

const friendsSectionOpen = ref(true)
const groupsSectionOpen = ref(true)
const favoritesSectionOpen = ref(true)
const officialSectionOpen = ref(true)

// --- Recent Search History (Section 3.2 & 4) ---
// U2: starts empty; only real searches are recorded (see addSearchKeyword).
const recentSearchKeywords = ref<string[]>([])

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
  <div class="lx-pane">
    <header class="lx-pane-head">
      <h2 class="lx-pane-title">{{ t('navFriends') }}</h2>
      <div class="lx-pane-actions">
        <button type="button" class="lx-icon-btn" data-shot="add-friend" :title="t('mvAddFriend')" :aria-label="t('mvAddFriend')" @click="emit('add-friend')">
          <LunoIcon name="add-friends" :size="20" />
        </button>
        <button type="button" class="lx-icon-btn" :title="t('mvQrScan')" :aria-label="t('mvQrScan')" @click="emit('qr')">
          <LunoIcon name="scan" :size="20" />
        </button>
      </div>
    </header>

    <label class="lx-search">
      <LunoIcon name="search" :size="16" />
      <input v-model="friendSearchQuery" :placeholder="t('searchFriends')" :aria-label="t('searchFriends')" @keydown.enter="addSearchKeyword(friendSearchQuery)" />
      <button v-if="friendSearchQuery" type="button" class="lx-search-clear" :title="t('mvClose')" :aria-label="t('mvClose')" @click="friendSearchQuery = ''"><LunoIcon name="close" :size="14" /></button>
    </label>

    <!-- Recent search keywords: only real searches are recorded -->
    <div v-if="recentSearchKeywords.length > 0" class="home-recent-searches">
      <div class="recent-searches-header">
        <small>{{ t('mvRecentSearch') }}</small>
        <button class="btn-clear-all-searches" @click="clearAllSearchKeywords">{{ t('mvClearAll') }}</button>
      </div>
      <div class="recent-search-chips">
        <span v-for="kw in recentSearchKeywords" :key="kw" class="recent-keyword-chip">
          <span class="kw-text" @click="friendSearchQuery = kw">{{ kw }}</span>
          <button class="btn-del-kw" @click="removeSearchKeyword(kw)" :aria-label="t('mvClose')">✕</button>
        </span>
      </div>
    </div>

    <div class="lx-scroll">
      <!-- Me -->
      <div class="lx-row lx-row-me" role="button" tabindex="0" @click="emit('profile')" @keydown.enter="emit('profile')" @keydown.space.prevent="emit('profile')">
        <span class="lx-avatar s56" :style="{ background: currentUser?.avatar_color || 'var(--ln-accent)' }"><span>{{ initialOf(currentUser?.display_name) }}</span><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span>
        <span class="lx-row-main">
          <span class="lx-row-name lx-me-name">{{ currentUser?.display_name }}</span>
          <span class="lx-row-preview">{{ currentUser?.status_message || t('myProfileStatus') }}</span>
        </span>
        <button type="button" class="lx-pill-btn" @click.stop="emit('keep-memo')">
          <LunoIcon name="keep" :size="14" />
          <span>{{ t('keepMemo') }}</span>
        </button>
      </div>

      <!-- Favorites -->
      <section v-if="favoriteFriends.length" class="lx-section">
        <button type="button" class="lx-section-head" :aria-expanded="favoritesSectionOpen" @click="favoritesSectionOpen = !favoritesSectionOpen">
          <span>{{ t('mvFavorites').replace('{n}', String(favoriteFriends.length)) }}</span>
          <LunoIcon :name="favoritesSectionOpen ? 'chevron-down' : 'chevron-right'" :size="16" />
        </button>
        <div v-show="favoritesSectionOpen">
          <div
            v-for="fav in favoriteFriends"
            :key="'fav-' + fav.id"
            class="lx-row"
            :class="{ selected: selectedFriendProfile?.id === fav.id }"
            role="button"
            tabindex="0"
            @click="emit('select-friend', fav)"
            @keydown.enter="emit('select-friend', fav)"
            @keydown.space.prevent="emit('select-friend', fav)"
            @dblclick="emit('direct-chat', fav)"
            @contextmenu.prevent="emit('friend-menu', $event, fav)"
          >
            <span class="lx-avatar s44" :style="{ background: fav.avatar_color || 'var(--ln-accent)' }"><span>{{ initialOf(fav.display_name) }}</span><img v-if="fav.avatar_url" :src="fav.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span>
            <span class="lx-row-main">
              <span class="lx-row-title">
                <span class="lx-row-name">{{ fav.display_name }}</span>
                <span v-if="(fav as any).kind === 'bot'" class="badge-bot">BOT</span>
              </span>
              <span v-if="taglineOf(fav)" class="lx-row-preview">{{ taglineOf(fav) }}</span>
            </span>
          </div>
        </div>
      </section>

      <!-- Groups -->
      <section v-if="groupChats.length" class="lx-section">
        <button type="button" class="lx-section-head" :aria-expanded="groupsSectionOpen" @click="groupsSectionOpen = !groupsSectionOpen">
          <span>{{ t('groupSection') }} {{ groupChats.length }}</span>
          <LunoIcon :name="groupsSectionOpen ? 'chevron-down' : 'chevron-right'" :size="16" />
        </button>
        <div v-show="groupsSectionOpen">
          <div
            v-for="grp in groupChats"
            :key="grp.id"
            class="lx-row"
            :class="{ selected: selectedChatId === grp.id }"
            role="button"
            tabindex="0"
            @click="emit('select-chat', grp.id)"
            @keydown.enter="emit('select-chat', grp.id)"
            @keydown.space.prevent="emit('select-chat', grp.id)"
          >
            <span class="lx-avatar s44 group" style="background: var(--ln-info);">{{ initialOf(grp.title, 'G') }}<img v-if="grp.avatar_url" :src="grp.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span>
            <span class="lx-row-main">
              <span class="lx-row-title">
                <span class="lx-row-name">{{ grp.title }}</span>
                <span class="lx-row-count">{{ grp.member_count || 2 }}</span>
              </span>
            </span>
          </div>
        </div>
      </section>

      <!-- Official accounts -->
      <section v-if="officialAccounts.length > 0" class="lx-section">
        <button type="button" class="lx-section-head" :aria-expanded="officialSectionOpen" @click="officialSectionOpen = !officialSectionOpen">
          <span>{{ t('mvOfficialAccounts').replace('{n}', String(officialAccounts.length)) }}</span>
          <LunoIcon :name="officialSectionOpen ? 'chevron-down' : 'chevron-right'" :size="16" />
        </button>
        <div v-show="officialSectionOpen">
          <div
            v-for="oa in officialAccounts"
            :key="oa.id"
            class="lx-row"
            role="button"
            tabindex="0"
            @click="emit('follow-oa', oa)"
            @keydown.enter="emit('follow-oa', oa)"
            @keydown.space.prevent="emit('follow-oa', oa)"
          >
            <span class="lx-avatar s44" :style="{ background: oa.color || '#4F7CFF' }"><LunoIcon name="shield" :size="20" /></span>
            <span class="lx-row-main">
              <span class="lx-row-title">
                <span class="lx-row-name">{{ oa.name }}</span>
                <span class="badge-verified">{{ t('mvOfficial') }}</span>
              </span>
              <span class="lx-row-preview">{{ oa.description }}</span>
            </span>
          </div>
        </div>
      </section>

      <!-- Friends -->
      <section class="lx-section">
        <button type="button" class="lx-section-head" :aria-expanded="friendsSectionOpen" @click="friendsSectionOpen = !friendsSectionOpen">
          <span>{{ t('friendSection') }} {{ filteredFriends.length }}</span>
          <LunoIcon :name="friendsSectionOpen ? 'chevron-down' : 'chevron-right'" :size="16" />
        </button>
        <div v-show="friendsSectionOpen">
          <div v-if="!filteredFriends.length" class="lx-list-empty lx-empty-illustrated">
            <span class="lx-empty-icon" aria-hidden="true"><LunoIcon :name="friendSearchQuery ? 'search' : 'friends'" :size="28" /></span>
            <p>{{ friendSearchQuery ? t('lxNoSearchResult') : t('lxNoFriends') }}</p>
            <button v-if="!friendSearchQuery" type="button" class="lx-text-btn" @click="emit('add-friend')">{{ t('mvAddFriend') }}</button>
          </div>
          <div
            v-for="f in filteredFriends"
            :key="f.id"
            class="lx-row"
            :class="{ selected: selectedFriendProfile?.id === f.id }"
            role="button"
            tabindex="0"
            @click="emit('select-friend', f)"
            @keydown.enter="emit('select-friend', f)"
            @keydown.space.prevent="emit('select-friend', f)"
            @dblclick="emit('direct-chat', f)"
            @contextmenu.prevent="emit('friend-menu', $event, f)"
          >
            <span class="lx-avatar s44" :style="{ background: f.avatar_color || 'var(--ln-accent)' }"><span>{{ initialOf(f.display_name) }}</span><img v-if="f.avatar_url" :src="f.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span>
            <span class="lx-row-main">
              <span class="lx-row-title">
                <span class="lx-row-name">{{ f.display_name }}</span>
                <LunoIcon v-if="(f as any).is_favorite" name="star" :size="12" class="lx-row-star" />
                <span v-if="(f as any).kind === 'bot'" class="badge-bot">BOT</span>
                <span v-if="(f as any).birthday_today" class="bday-badge" :title="t('mvBirthdayToday')">🎂</span>
              </span>
              <span v-if="taglineOf(f)" class="lx-row-preview">{{ taglineOf(f) }}</span>
            </span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
