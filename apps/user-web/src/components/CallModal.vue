<script setup lang="ts">
// I-4: active-call overlay, extracted verbatim from MessengerView.vue.
// Stream refs stay owned by useWebRTC (passed through as props); the speaker,
// video-filter and caption toggles are two-way models.
import { ref, type Ref } from 'vue'

import { CALL_VIDEO_FILTERS } from '../../../shared/call-fx'
import { initialOf } from '../../../shared/avatar_initial'
import { currentLocale, t } from '../store/session'
import LunoIcon from './LunoIcon.vue'
import type { ActiveCallState } from '../composables/useWebRTC'

defineProps<{
  activeCall: ActiveCallState
  callMediaIssue: boolean
  callDuration: number
  formatDuration: (sec: number) => string
  callRecording: boolean
  isCallMuted: boolean
  isCallVideoOff: boolean
  isScreenSharing: boolean
  localVideoRef: Ref<HTMLVideoElement | null>
  remoteVideoRef: Ref<HTMLVideoElement | null>
  targetTranslateLang: string
}>()

const emit = defineEmits<{
  mute: []
  video: []
  screenshare: []
  record: []
  answer: []
  hangup: []
}>()

const isCallSpeakerOn = defineModel<boolean>('isCallSpeakerOn', { required: true })
const callVideoFilter = defineModel<'none' | 'warm' | 'cool' | 'mono'>('callVideoFilter', { required: true })

// Call-scoped live-caption state (previously view-level; only used here).
const liveCaptionsEnabled = ref(false)
const callSubtitles = ref(t('mvLiveCaptionsOn'))
</script>

<template>
  <div class="call-overlay-modal">
    <div class="call-dialog-box">
      <template v-if="activeCall.kind === 'video'">
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">
        <video :ref="remoteVideoRef" autoplay playsinline style="width:180px;height:130px;background:#0f172a;border-radius:12px;object-fit:cover"></video>
        <video :ref="localVideoRef" autoplay muted playsinline style="width:100px;height:130px;background:#334155;border-radius:12px;object-fit:cover" :style="{ filter: CALL_VIDEO_FILTERS[callVideoFilter] }"></video>
      </div>
      <div v-if="activeCall.kind === 'video'" class="call-filter-row" :title="t('callFilterTitle')">
        <button :class="{ active: callVideoFilter === 'none' }" @click="callVideoFilter = 'none'">{{ t('callFilterNone') }}</button>
        <button :class="{ active: callVideoFilter === 'warm' }" @click="callVideoFilter = 'warm'">{{ t('callFilterWarm') }}</button>
        <button :class="{ active: callVideoFilter === 'cool' }" @click="callVideoFilter = 'cool'">{{ t('callFilterCool') }}</button>
        <button :class="{ active: callVideoFilter === 'mono' }" @click="callVideoFilter = 'mono'">{{ t('callFilterMono') }}</button>
      </div>
      </template>
      <div v-else class="call-avatar-pulse">
        <div class="avatar-circle lg" style="background:#315BCD">{{ initialOf(activeCall.title) }}</div>
      </div>
      <h3>{{ activeCall.title }}</h3>
      <p class="call-type-status">
        {{ activeCall.kind === 'video' ? '📹 ' + t('callVideo') : '📞 ' + t('callVoice') }} ·
        <span v-if="activeCall.state === 'ringing'">{{ activeCall.direction === 'outgoing' ? t('mvCalling') : t('mvConnecting') }}</span>
        <span v-else-if="activeCall.state === 'connected'" class="timer-active">{{ formatDuration(callDuration) }}</span>
        <span v-if="callRecording" class="rec-indicator">🔴 {{ t('callRecording') }}</span>
      </p>
      <p v-if="callMediaIssue" class="caption-notice">⚠️ {{ t('callMediaFailed') }}</p>

      <!-- AI Live Translation Captions UX (Article 10.2) -->
      <div class="live-captions-control">
        <button
          class="btn-caption-toggle"
          :class="{ active: liveCaptionsEnabled }"
          @click="liveCaptionsEnabled = !liveCaptionsEnabled"
        >
          <LunoIcon name="translate" :size="15" />
          <span>{{ liveCaptionsEnabled ? t('callLiveTranslate') + ' (ON)' : t('callLiveTranslate') + ' (OFF)' }}</span>
        </button>
      </div>

      <div v-if="liveCaptionsEnabled" class="live-captions-box">
        <div class="caption-notice">ℹ️ {{ t('callConsentNotice') }}</div>
        <div class="caption-lang-badge">
          <span class="lang-tag">{{ currentLocale.toUpperCase() }}</span>
          <span class="lang-arrow">⇄</span>
          <span class="lang-tag">{{ targetTranslateLang.toUpperCase() }}</span>
          <span class="badge-engine-mini">AI Live</span>
        </div>
        <div class="caption-stream">
          <p class="caption-live-text">"{{ callSubtitles }}"</p>
        </div>
      </div>

      <!-- Call Action Buttons -->
      <div class="call-controls-row">
        <template v-if="activeCall.state === 'connected'">
          <button class="btn-call-circle" :class="{ off: isCallMuted }" :title="t('mvMicMute')" @click="emit('mute')">
            {{ isCallMuted ? '🔇' : '🎤' }}
          </button>
          <button v-if="activeCall.kind === 'video'" class="btn-call-circle" :class="{ off: isCallVideoOff }" :title="t('mvCameraToggle')" @click="emit('video')">
            {{ isCallVideoOff ? '🚫' : '📹' }}
          </button>
          <button v-if="activeCall.kind === 'video'" class="btn-call-circle" :class="{ off: isScreenSharing }" :title="t('mvScreenShare')" @click="emit('screenshare')">
            🖥️
          </button>
          <button class="btn-call-circle" :class="{ off: !isCallSpeakerOn }" :title="t('mvSpeaker')" @click="isCallSpeakerOn = !isCallSpeakerOn">
            🔊
          </button>
          <button class="btn-call-circle" :class="{ recording: callRecording }" :title="callRecording ? t('callRecording') : t('callRecord')" @click="emit('record')">
            {{ callRecording ? '⏹️' : '⏺️' }}
          </button>
        </template>
        <button v-if="activeCall.state === 'ringing' && activeCall.direction === 'incoming'" class="btn-call-answer" @click="emit('answer')">{{ t('mvAnswerCall') }}</button>
        <button class="btn-call-hangup" @click="emit('hangup')">{{ t('mvEndCall') }}</button>
      </div>
    </div>
  </div>
</template>
