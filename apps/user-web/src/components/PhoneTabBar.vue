<script setup lang="ts">
// P2 split: phone bottom tab bar, extracted verbatim from views/MessengerView.vue.
// Nav config/counts are read-only, the More panel flag is a two-way model;
// tab switches emit upward (the parent also closes the More panel).
import { t } from '../store/session'
import type { NavItem } from '../router'
import LunoIcon from './LunoIcon.vue'

const showMore = defineModel<boolean>('showMore', { default: false })

defineProps<{
  primaryNav: { nav: NavItem; icon: string; label: string }[]
  activeNav: NavItem
  moreNavs: NavItem[]
  totalUnread: number
}>()

const emit = defineEmits<{
  switchNav: [nav: NavItem]
}>()
</script>

<template>
  <nav class="lx-tabbar" :aria-label="t('mvBottomNav')">
    <button
      v-for="item in primaryNav"
      :key="item.nav"
      type="button"
      class="lx-tab"
      :class="{ active: activeNav === item.nav && !showMore }"
      :aria-current="activeNav === item.nav && !showMore ? 'page' : undefined"
      @click="emit('switchNav', item.nav)"
    >
      <span class="lx-tab-icon">
        <LunoIcon :name="item.icon" :size="24" />
        <span v-if="item.nav === 'chats' && totalUnread > 0" class="lx-badge">{{ totalUnread > 99 ? '99+' : totalUnread }}</span>
      </span>
      <span class="lx-tab-label">{{ t(item.label) }}</span>
    </button>
    <button
      type="button"
      class="lx-tab"
      data-shot="more"
      :class="{ active: showMore || moreNavs.includes(activeNav) }"
      :aria-expanded="showMore"
      @click="showMore = !showMore"
    >
      <span class="lx-tab-icon"><LunoIcon name="open-apps" :size="24" /></span>
      <span class="lx-tab-label">{{ t('lxMore') }}</span>
    </button>
  </nav>
</template>
