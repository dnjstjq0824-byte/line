<script setup lang="ts">
// N2-L: rebuilt 1:1 call screen. Remote video fills the viewport
// (object-fit: cover), self is a 25%-width PiP; the bottom bar holds only
// mic, camera, camera-switch and the red hangup, with filters, captions,
// speaker, recording and screen-share behind the more (⋯) panel.
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
  'camera-switch': []
  screenshare: []
  record: []
  answer: []
  decline: []
  hangup: []
}>()

const isCallSpeakerOn = defineModel<boolean>('isCallSpeakerOn', { required: true })
const callVideoFilter = defineModel<'none' | 'warm' | 'cool' | 'mono'>('callVideoFilter', { required: true })

const showMorePanel = ref(false)
const liveCaptionsEnabled = ref(false)
const callSubtitles = ref(t('mvLiveCaptionsOn'))
</script>

<template>
  <div class="call-overlay-modal">
    <div class="call-dialog-box call-stage">
      <!-- Remote fills the viewport; self is a 25% PiP docked bottom-right. -->
      <video
        v-if="activeCall.kind === 'video'"
        :ref="remoteVideoRef"
        autoplay
        playsinline
        class="call-remote-video"
      ></video>
      <div v-else class="call-avatar-pulse call-avatar-stage">
        <div class="avatar-circle lg" style="background:#315BCD">{{ initialOf(activeCall.title) }}</div>
      </div>
      <video
        v-if="activeCall.kind === 'video'"
        :ref="localVideoRef"
        autoplay
        muted
        playsinline
        class="call-pip-video"
        :style="{ filter: CALL_VIDEO_FILTERS[callVideoFilter] }"
      ></video>

      <!-- Title / status overlay -->
      <div class="call-status-overlay">
        <h3>{{ activeCall.title }}</h3>
        <p class="call-type-status">
          {{ activeCall.kind === 'video' ? '📹 ' + t('callVideo') : '📞 ' + t('callVoice') }} ·
          <span v-if="activeCall.state === 'ringing'">{{ activeCall.direction === 'outgoing' ? t('mvCalling') : t('mvConnecting') }}</span>
          <span v-else-if="activeCall.state === 'connected'" class="timer-active">{{ formatDuration(callDuration) }}</span>
          <span v-if="callRecording" class="rec-indicator">🔴 {{ t('callRecording') }}</span>
        </p>
        <p v-if="callMediaIssue" class="caption-notice">⚠️ {{ t('callMediaFailed') }}</p>
      </div>

      <!-- More panel: filters, captions, speaker, record, screen-share -->
      <div v-if="showMorePanel" class="call-more-panel" role="menu">
        <div v-if="activeCall.kind === 'video'" class="call-filter-row" :title="t('callFilterTitle')">
          <button :class="{ active: callVideoFilter === 'none' }" @click="callVideoFilter = 'none'">{{ t('callFilterNone') }}</button>
          <button :class="{ active: callVideoFilter === 'warm' }" @click="callVideoFilter = 'warm'">{{ t('callFilterWarm') }}</button>
          <button :class="{ active: callVideoFilter === 'cool' }" @click="callVideoFilter = 'cool'">{{ t('callFilterCool') }}</button>
          <button :class="{ active: callVideoFilter === 'mono' }" @click="callVideoFilter = 'mono'">{{ t('callFilterMono') }}</button>
        </div>
        <button
          class="btn-caption-toggle"
          :class="{ active: liveCaptionsEnabled }"
          @click="liveCaptionsEnabled = !liveCaptionsEnabled"
        >
          <LunoIcon name="translate" :size="15" />
          <span>{{ liveCaptionsEnabled ? t('callLiveTranslate') + ' (ON)' : t('callLiveTranslate') + ' (OFF)' }}</span>
        </button>
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
        <div class="call-more-row">
          <button class="btn-call-circle" :class="{ off: !isCallSpeakerOn }" :title="t('mvSpeaker')" @click="isCallSpeakerOn = !isCallSpeakerOn">
            🔊
          </button>
          <button class="btn-call-circle" :class="{ recording: callRecording }" :title="callRecording ? t('callRecording') : t('callRecord')" @click="emit('record')">
            {{ callRecording ? '⏹️' : '⏺️' }}
          </button>
          <button v-if="activeCall.kind === 'video'" class="btn-call-circle" :class="{ off: isScreenSharing }" :title="t('mvScreenShare')" @click="emit('screenshare')">
            🖥️
          </button>
        </div>
      </div>

      <!-- Bottom bar: mic, camera, camera-switch, more, hangup. Mute works
           while ringing; incoming ringing offers answer + decline. -->
      <div class="call-controls-row call-bottom-bar">
        <button class="btn-call-circle" :class="{ off: isCallMuted }" :title="t('mvMicMute')" @click="emit('mute')">
          {{ isCallMuted ? '🔇' : '🎤' }}
        </button>
        <button v-if="activeCall.kind === 'video'" class="btn-call-circle" :class="{ off: isCallVideoOff }" :title="t('mvCameraToggle')" @click="emit('video')">
          {{ isCallVideoOff ? '🚫' : '📹' }}
        </button>
        <button v-if="activeCall.kind === 'video'" class="btn-call-circle" :title="t('mvCameraSwitch')" @click="emit('camera-switch')">
          🔄
        </button>
        <button class="btn-call-circle" :title="t('mvCallMore')" :class="{ off: showMorePanel }" @click="showMorePanel = !showMorePanel">
          ⋯
        </button>
        <button v-if="activeCall.state === 'ringing' && activeCall.direction === 'incoming'" class="btn-call-answer" @click="emit('answer')">{{ t('mvAnswerCall') }}</button>
        <button v-if="activeCall.state === 'ringing' && activeCall.direction === 'incoming'" class="btn-call-hangup" @click="emit('decline')">{{ t('mvDeclineCall') }}</button>
        <button v-else class="btn-call-hangup" @click="emit('hangup')">{{ t('mvEndCall') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.call-stage {
  position: relative;
  overflow: hidden;
  min-height: min(78vh, 640px);
}
.call-remote-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #0f172a;
  object-fit: cover;
}
.call-avatar-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
}
.call-pip-video {
  position: absolute;
  right: 12px;
  bottom: 84px;
  width: 25%;
  aspect-ratio: 3 / 4;
  background: #334155;
  border-radius: 12px;
  object-fit: cover;
}
.call-status-overlay {
  position: absolute;
  top: 12px;
  left: 0;
  right: 0;
  text-align: center;
  pointer-events: none;
}
.call-status-overlay h3,
.call-status-overlay .call-type-status {
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}
.call-bottom-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  display: flex;
  justify-content: center;
  gap: 10px;
}
.call-more-panel {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 76px;
  background: rgba(15, 23, 42, 0.92);
  border-radius: 14px;
  padding: 10px;
}
.call-more-row {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}
</style>
