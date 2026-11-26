<script setup lang="ts">
// P2 split: calls tab pane, extracted verbatim from views/MessengerView.vue.
// Filter/selection are two-way models; the ledgers are read-only and dialing
// emits upward (kind normalization stays with the caller).
import { t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import type { CallRecord } from '../composables/useWebRTC'
import LunoIcon from './LunoIcon.vue'

const filter = defineModel<'all' | 'missed'>('filter', { default: 'all' })
const selected = defineModel<CallRecord | null>('selected', { default: null })

defineProps<{
  history: CallRecord[]
  filtered: CallRecord[]
}>()

const emit = defineEmits<{
  newCall: []
  redial: [log: CallRecord]
}>()
</script>

<template>
  <div class="lx-pane">
    <div class="lx-pane-head">
      <h2 class="lx-pane-title">{{ t('mvCall') }}</h2>
      <button type="button" class="lx-text-btn" @click="emit('newCall')">
        <LunoIcon name="call-voice" :size="16" />
        <span>{{ t('mvNewCall') }}</span>
      </button>
    </div>
    <div class="lx-chips">
      <button type="button" class="lx-chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">{{ t('tabAll') }} {{ history.length }}</button>
      <button type="button" class="lx-chip" :class="{ active: filter === 'missed' }" @click="filter = 'missed'">{{ t('mvMissed') }}</button>
    </div>
    <div class="lx-scroll">
      <div v-if="!filtered.length" class="lx-list-empty lx-empty-illustrated">
        <!-- One "new call" action lives in the header; the empty state
             shows a quiet icon instead of a second copy of it. -->
        <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="calls" :size="28" /></span>
        <p>{{ t('lxNoCalls') }}</p>
      </div>
      <div
        v-for="log in filtered"
        :key="log.id"
        class="lx-row"
        :class="{ selected: selected?.id === log.id }"
        role="button"
        tabindex="0"
        @click="selected = log"
        @keydown.enter="selected = log"
      >
        <span class="lx-avatar s44" :style="{ background: log.peer_avatar_color || 'var(--ln-accent)' }">{{ initialOf(log.peer_name) }}</span>
        <span class="lx-row-main">
          <span class="lx-row-title">
            <span class="lx-row-name" :class="{ 'lx-danger': log.direction === 'missed' }">{{ log.peer_name }}</span>
            <span v-if="log.count && log.count > 1" class="lx-row-count">({{ log.count }})</span>
          </span>
          <span class="lx-row-preview lx-call-sub">
            <span class="call-kind-icon" :title="log.call_type === 'video' ? t('mvVideoCallLabel') : t('mvVoiceCall')"><LunoIcon :name="log.call_type === 'video' ? 'call-video' : 'call-voice'" :size="13" /></span>
            <span>{{ log.direction === 'missed' ? t('mvMissedCall') : log.direction === 'incoming' ? t('mvIncomingCall') : t('mvOutgoingCall') }}</span>
            <span>· {{ log.timestamp_text }}</span>
            <span v-if="log.duration_text">· {{ log.duration_text }}</span>
          </span>
        </span>
        <button
          type="button"
          class="lx-icon-btn lx-call-again"
          :title="t('mvCallBack').replace('{name}', log.peer_name)"
          :aria-label="t('mvCallBack').replace('{name}', log.peer_name)"
          @click.stop="emit('redial', log)"
        >
          <LunoIcon :name="log.call_type === 'video' ? 'call-video' : 'call-voice'" :size="19" />
        </button>
      </div>
    </div>
  </div>
</template>
