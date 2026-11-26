<script setup lang="ts">
// P2 split: app rail + More panel, extracted verbatim from views/MessengerView.vue.
// User/nav/counts/lists are read-only, panel visibility is a two-way model;
// every navigation and action emits upward.
import { t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import { hideBrokenAvatar } from '../messenger-format'
import type { User } from '../../../shared/api'
import type { NavItem } from '../router'
import LunoIcon from './LunoIcon.vue'

const showMore = defineModel<boolean>('showMore', { default: false })

defineProps<{
  currentUser: User | null
  realtimeState: string
  primaryNav: { nav: NavItem; icon: string; label: string }[]
  activeNav: NavItem
  totalUnread: number
  moreNavs: NavItem[]
  moreItems: { id: string; icon: string; label: string; nav?: NavItem }[]
  consoleLinks: { href: string; label: string }[]
  notificationsOn: boolean
}>()

const emit = defineEmits<{
  switchNav: [nav: NavItem]
  openProfile: []
  openKeep: []
  toggleNotifications: []
  openSettings: []
  runItem: [id: string]
  logout: []
}>()
</script>

<template>
  <nav class="lx-rail" :aria-label="t('lxMainNav')">
    <button type="button" class="lx-rail-me" :title="t('profileTitle')" :aria-label="t('profileTitle')" @click="emit('openProfile')">
      <span class="lx-avatar s40" :style="{ background: currentUser?.avatar_color || 'var(--ln-accent)' }"><span>{{ initialOf(currentUser?.display_name) }}</span><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span>
      <span v-if="realtimeState === 'connected'" class="lx-online-dot" :title="t('connection_connected')"></span>
    </button>

    <div class="lx-rail-nav">
      <button
        v-for="item in primaryNav"
        :key="item.nav"
        type="button"
        class="lx-rail-btn"
        :class="{ active: activeNav === item.nav }"
        :aria-current="activeNav === item.nav ? 'page' : undefined"
        @click="emit('switchNav', item.nav)"
      >
        <span class="lx-rail-icon">
          <LunoIcon :name="item.icon" :size="22" />
          <span v-if="item.nav === 'chats' && totalUnread > 0" class="lx-badge">{{ totalUnread > 99 ? '99+' : totalUnread }}</span>
        </span>
        <span class="lx-rail-label">{{ t(item.label) }}</span>
      </button>
      <button
        type="button"
        class="lx-rail-btn"
        data-shot="more"
        :class="{ active: showMore || moreNavs.includes(activeNav) }"
        :aria-expanded="showMore"
        @click="showMore = !showMore"
      >
        <span class="lx-rail-icon"><LunoIcon name="open-apps" :size="22" /></span>
        <span class="lx-rail-label">{{ t('lxMore') }}</span>
      </button>
    </div>

    <div class="lx-rail-foot">
      <button type="button" class="lx-rail-tool" :title="t('navKeep')" :aria-label="t('navKeep')" @click="emit('openKeep')">
        <LunoIcon name="keep" :size="20" />
      </button>
      <button
        type="button"
        class="lx-rail-tool"
        :title="notificationsOn ? t('mvNotifOnTitle') : t('mvDndTitle')"
        :aria-label="notificationsOn ? t('mvNotifOnTitle') : t('mvDndTitle')"
        :aria-pressed="!notificationsOn"
        @click="emit('toggleNotifications')"
      >
        <LunoIcon :name="notificationsOn ? 'bell' : 'bell-off'" :size="20" />
      </button>
      <button type="button" class="lx-rail-tool" data-shot="settings" :title="t('navSettings')" :aria-label="t('navSettings')" @click="emit('openSettings')">
        <LunoIcon name="settings" :size="20" />
      </button>
    </div>
  </nav>

  <!-- More: every secondary destination, each with a name -->
  <div v-if="showMore" class="lx-more-layer" @click.self="showMore = false">
    <section class="lx-more" role="dialog" :aria-label="t('lxMore')">
      <header class="lx-more-head">
        <h2>{{ t('lxMore') }}</h2>
        <button type="button" class="lx-icon-btn" :title="t('mvClose')" :aria-label="t('mvClose')" @click="showMore = false"><LunoIcon name="close" :size="18" /></button>
      </header>
      <button type="button" class="lx-more-me" @click="emit('openProfile'); showMore = false">
        <span class="lx-avatar s44" :style="{ background: currentUser?.avatar_color || 'var(--ln-accent)' }"><span>{{ initialOf(currentUser?.display_name) }}</span><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span>
        <span class="lx-more-me-text">
          <strong>{{ currentUser?.display_name }}</strong>
          <small>{{ currentUser?.handle ? '@' + currentUser.handle : currentUser?.email }}</small>
        </span>
        <span class="lx-more-me-go" aria-hidden="true">›</span>
      </button>
      <div class="lx-more-grid">
        <button
          v-for="item in moreItems"
          :key="item.id"
          type="button"
          class="lx-more-item"
          :class="{ active: item.nav && activeNav === item.nav }"
          @click="emit('runItem', item.id)"
        >
          <span class="lx-more-icon"><LunoIcon :name="item.icon" :size="22" /></span>
          <span>{{ t(item.label) }}</span>
        </button>
      </div>
      <div v-if="consoleLinks.length" class="lx-more-links">
        <h3>{{ t('lxConsoles') }}</h3>
        <a v-for="link in consoleLinks" :key="link.href" :href="link.href" target="_blank" rel="noopener" class="lx-more-link" @click="showMore = false">{{ t(link.label) }}</a>
      </div>
      <button type="button" class="lx-more-logout" @click="showMore = false; emit('logout')">{{ t('mvLogout') }}</button>
    </section>
  </div>
</template>
