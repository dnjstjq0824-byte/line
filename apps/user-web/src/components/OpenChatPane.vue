<script setup lang="ts">
// P2 split: openchat tab pane, extracted verbatim from views/MessengerView.vue.
// The room list and selection id are read-only; creation and selection emit
// upward (the room itself opens in the main pane).
import { t } from '../store/session'
import type { OpenChatRoom } from '../composables/useMessengerSocial'
import LunoIcon from './LunoIcon.vue'

defineProps<{
  rooms: OpenChatRoom[]
  selectedId: string
}>()

const emit = defineEmits<{
  create: []
  select: [room: OpenChatRoom]
}>()
</script>

<template>
  <div class="lx-pane">
    <div class="lx-pane-head">
      <h2 class="lx-pane-title">{{ t('navOpenChat') }}</h2>
      <button type="button" class="lx-icon-btn" :title="t('mvCreateOpenChat')" :aria-label="t('mvCreateOpenChat')" @click="emit('create')"><LunoIcon name="plus" :size="20" /></button>
    </div>
    <div class="lx-scroll">
      <div v-if="!rooms.length" class="lx-list-empty lx-empty-illustrated">
        <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="openchat" :size="28" /></span>
        <p>{{ t('lxNoOpenChat') }}</p>
        <button type="button" class="lx-text-btn" @click="emit('create')">{{ t('mvCreateOpenChat') }}</button>
      </div>
      <div
        v-for="room in rooms"
        :key="room.id"
        class="lx-row"
        :class="{ selected: selectedId === room.id }"
        role="button"
        tabindex="0"
        @click="emit('select', room)"
        @keydown.enter="emit('select', room)"
      >
        <span class="lx-avatar s48" style="background: var(--ln-info)"><LunoIcon name="openchat" :size="22" /></span>
        <span class="lx-row-main">
          <span class="lx-row-name">{{ room.name }}</span>
          <span class="lx-row-preview">{{ room.description }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
