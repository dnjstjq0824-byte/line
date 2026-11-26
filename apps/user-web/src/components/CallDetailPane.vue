<script setup lang="ts">
// P2 split: call-record detail pane, extracted verbatim from views/MessengerView.vue.
// The selected record is a two-way model; dial/chat/delete emit upward.
import { t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import type { CallRecord } from '../composables/useWebRTC'
import LunoIcon from './LunoIcon.vue'

const record = defineModel<CallRecord | null>('record', { default: null })

const emit = defineEmits<{
  voiceCall: [record: CallRecord]
  videoCall: [record: CallRecord]
  openChat: [record: CallRecord]
  deleteHistory: [id: string]
}>()
</script>

<template>
  <section class="lx-detail">
    <button v-if="record" type="button" class="lx-icon-btn lx-back lx-detail-back" :title="t('mvGoBack')" :aria-label="t('mvGoBack')" @click="record = null">
      <LunoIcon name="back" :size="20" />
    </button>
    <div v-if="record" class="pc-call-detail-card">
      <div class="profile-preview-avatar" :style="{ background: record.peer_avatar_color || '#315BCD' }">
        {{ initialOf(record.peer_name) }}
      </div>
      <h2 class="profile-preview-name">{{ record.peer_name }}</h2>
      <p class="profile-preview-bio">
        <span :class="{ 'text-red': record.direction === 'missed' }">
          {{ record.direction === 'missed' ? t('mvMissedCall') : record.direction === 'incoming' ? t('mvIncomingCall') : t('mvOutgoingCall') }}
        </span>
        · {{ record.timestamp_text }}
        <span v-if="record.duration_text">({{ record.duration_text }})</span>
      </p>
      <div class="profile-preview-actions">
        <button class="btn-start-chat-large" @click="emit('voiceCall', record)">{{ t('mvFreeCallVoice') }}</button>
        <div class="profile-preview-subactions">
          <button type="button" class="btn-subaction-pill" @click="emit('videoCall', record)">
            <LunoIcon name="call-video" :size="16" />
            <span>{{ t('mvVideoCallLabel') }}</span>
          </button>
          <button type="button" class="btn-subaction-pill" @click="emit('openChat', record)">
            <LunoIcon name="chats" :size="16" />
            <span>{{ t('mvGotoDirect') }}</span>
          </button>
          <button type="button" class="btn-subaction-pill" @click="emit('deleteHistory', record.id)">
            <span>{{ t('mvDeleteHistory') }}</span>
          </button>
        </div>
      </div>
    </div>
    <div v-else class="pc-empty-dialog">
      <div class="pc-watermark-wrap">
        <LunoIcon name="calls" :size="68" />
      </div>
      <h3 class="pc-empty-title">{{ t('mvFreeCallsTitle') }}</h3>
      <p class="pc-empty-desc">{{ t('mvFreeCallsDesc') }}</p>
    </div>
  </section>
</template>
