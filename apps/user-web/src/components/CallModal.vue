<script setup lang="ts">
// N2-L: rebuilt 1:1 call screen. Remote video fills the viewport
// (object-fit: cover), self is a 25%-width PiP; the bottom bar holds only
// mic, camera, camera-switch, more (⋯) and hangup, with filters, captions,
// speaker, recording and screen-share behind the more panel.
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
    <div
      class="call-dialog-box call-stage"
      :class="activeCall.kind === 'video' ? 'is-video' : 'is-voice'"
      role="dialog"
      aria-modal="true"
      :aria-label="activeCall.title"
    >
      <!-- Remote video fills the viewport; voice calls keep this element mounted
           (visually hidden, not display:none so iOS Safari still plays audio). -->
      <video
        :class="{ 'call-remote-audio-only': activeCall.kind !== 'video' }"
        :ref="remoteVideoRef"
        autoplay
        playsinline
        class="call-remote-video"
      ></video>

      <!-- Voice call stage -->
      <div v-if="activeCall.kind !== 'video'" class="call-avatar-stage">
        <div class="call-ambient-glow"></div>
        <div class="call-avatar-pulse" :class="{ 'is-ringing': activeCall.state === 'ringing' }">
          <span class="call-pulse-ring ring-1"></span>
          <span class="call-pulse-ring ring-2"></span>
          <div class="call-avatar-circle">{{ initialOf(activeCall.title) }}</div>
        </div>
        <h3 class="call-voice-name">{{ activeCall.title }}</h3>
        <div class="call-status-pill">
          <LunoIcon name="call-voice" :size="14" />
          <span>{{ t('callVoice') }}</span>
          <span class="call-dot">·</span>
          <span v-if="activeCall.state === 'ringing'">{{ activeCall.direction === 'outgoing' ? t('mvCalling') : t('mvConnecting') }}</span>
          <span v-else class="timer-active">{{ formatDuration(callDuration) }}</span>
          <span v-if="callRecording" class="rec-indicator">● {{ t('callRecording') }}</span>
        </div>
        <p v-if="callMediaIssue" class="call-media-alert">{{ t('callMediaFailed') }}</p>
      </div>

      <!-- Video self PiP -->
      <video
        v-if="activeCall.kind === 'video'"
        :ref="localVideoRef"
        autoplay
        muted
        playsinline
        class="call-pip-video"
        :style="{ filter: CALL_VIDEO_FILTERS[callVideoFilter] }"
      ></video>

      <!-- Top gradient scrim & title/status overlay for video calls -->
      <div v-if="activeCall.kind === 'video'" class="call-status-overlay">
        <h3>{{ activeCall.title }}</h3>
        <div class="call-status-pill">
          <LunoIcon name="call-video" :size="14" />
          <span>{{ t('callVideo') }}</span>
          <span class="call-dot">·</span>
          <span v-if="activeCall.state === 'ringing'">{{ activeCall.direction === 'outgoing' ? t('mvCalling') : t('mvConnecting') }}</span>
          <span v-else class="timer-active">{{ formatDuration(callDuration) }}</span>
          <span v-if="callRecording" class="rec-indicator">● {{ t('callRecording') }}</span>
        </div>
        <p v-if="callMediaIssue" class="call-media-alert">{{ t('callMediaFailed') }}</p>
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
          <LunoIcon name="translate" :size="16" />
          <span>{{ liveCaptionsEnabled ? t('callLiveTranslate') + ' (ON)' : t('callLiveTranslate') + ' (OFF)' }}</span>
        </button>

        <div v-if="liveCaptionsEnabled" class="live-captions-box">
          <div class="caption-notice">{{ t('callConsentNotice') }}</div>
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
          <div class="call-btn-unit">
            <button
              class="btn-call-circle"
              :class="{ 'is-toggled': !isCallSpeakerOn }"
              :title="t('mvSpeaker')"
              :aria-label="t('mvSpeaker')"
              @click="isCallSpeakerOn = !isCallSpeakerOn"
            >
              <LunoIcon :name="isCallSpeakerOn ? 'volume-on' : 'volume-off'" :size="20" />
            </button>
            <span class="call-btn-label">{{ t('mvSpeaker') }}</span>
          </div>
          <div class="call-btn-unit">
            <button
              class="btn-call-circle"
              :class="{ recording: callRecording }"
              :title="callRecording ? t('callRecording') : t('callRecord')"
              :aria-label="callRecording ? t('callRecording') : t('callRecord')"
              @click="emit('record')"
            >
              <LunoIcon :name="callRecording ? 'stop' : 'record'" :size="20" />
            </button>
            <span class="call-btn-label">{{ callRecording ? t('callRecording') : t('callRecord') }}</span>
          </div>
          <div v-if="activeCall.kind === 'video'" class="call-btn-unit">
            <button
              class="btn-call-circle"
              :class="{ 'is-active': isScreenSharing }"
              :title="t('mvScreenShare')"
              :aria-label="t('mvScreenShare')"
              @click="emit('screenshare')"
            >
              <LunoIcon name="screen-share" :size="20" />
            </button>
            <span class="call-btn-label">{{ t('mvScreenShare') }}</span>
          </div>
        </div>
      </div>

      <!-- Bottom control dock -->
      <div class="call-bottom-scrim">
        <div class="call-controls-row call-bottom-bar">
          <div class="call-btn-unit">
            <button
              class="btn-call-circle"
              :class="{ 'is-toggled': isCallMuted }"
              :title="t('mvMicMute')"
              :aria-label="t('mvMicMute')"
              @click="emit('mute')"
            >
              <LunoIcon :name="isCallMuted ? 'mic-off' : 'mic'" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvMicMute') }}</span>
          </div>

          <div v-if="activeCall.kind === 'video'" class="call-btn-unit">
            <button
              class="btn-call-circle"
              :class="{ 'is-toggled': isCallVideoOff }"
              :title="t('mvCameraToggle')"
              :aria-label="t('mvCameraToggle')"
              @click="emit('video')"
            >
              <LunoIcon :name="isCallVideoOff ? 'video-off' : 'call-video'" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvCameraToggle') }}</span>
          </div>

          <div v-if="activeCall.kind === 'video'" class="call-btn-unit">
            <button
              class="btn-call-circle"
              :title="t('mvCameraSwitch')"
              :aria-label="t('mvCameraSwitch')"
              @click="emit('camera-switch')"
            >
              <LunoIcon name="camera-switch" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvCameraSwitch') }}</span>
          </div>

          <div class="call-btn-unit">
            <button
              class="btn-call-circle"
              :class="{ 'is-active': showMorePanel }"
              :title="t('mvCallMore')"
              :aria-label="t('mvCallMore')"
              @click="showMorePanel = !showMorePanel"
            >
              <LunoIcon name="more" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvCallMore') }}</span>
          </div>

          <div v-if="activeCall.state === 'ringing' && activeCall.direction === 'incoming'" class="call-btn-unit">
            <button
              v-if="activeCall.state === 'ringing' && activeCall.direction === 'incoming'"
              class="btn-call-answer"
              :title="t('mvAnswerCall')"
              :aria-label="t('mvAnswerCall')"
              @click="emit('answer')"
            >
              <LunoIcon :name="activeCall.kind === 'video' ? 'call-video' : 'call-voice'" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvAnswerCall') }}</span>
          </div>

          <div v-if="activeCall.state === 'ringing' && activeCall.direction === 'incoming'" class="call-btn-unit">
            <button
              class="btn-call-hangup"
              :title="t('mvDeclineCall')"
              :aria-label="t('mvDeclineCall')"
              @click="emit('decline')"
            >
              <LunoIcon name="phone-off" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvDeclineCall') }}</span>
          </div>

          <div v-else class="call-btn-unit">
            <button
              class="btn-call-hangup"
              :title="t('mvEndCall')"
              :aria-label="t('mvEndCall')"
              @click="emit('hangup')"
            >
              <LunoIcon name="phone-off" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvEndCall') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.call-stage {
  position: relative;
  overflow: hidden;
  padding: 0;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(165deg, #162820 0%, #0e161a 55%, #090e11 100%);
  box-shadow: 0 28px 64px rgba(0, 0, 0, 0.58);
  display: flex;
  flex-direction: column;
}
.call-stage.is-voice {
  width: min(440px, 92vw);
  height: min(620px, 84vh);
}
.call-stage.is-video {
  width: min(860px, 94vw);
  height: min(680px, 86vh);
}

@media (max-width: 699px) {
  .call-stage.is-voice,
  .call-stage.is-video {
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100dvh;
    border-radius: 0;
    border: 0;
  }
}

.call-remote-audio-only {
  inset: auto;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.call-remote-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #0d1418;
  object-fit: cover;
}

/* Voice call centerpiece */
.call-avatar-stage {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px 140px;
  text-align: center;
}
.call-ambient-glow {
  position: absolute;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(6, 199, 85, 0.22) 0%, rgba(6, 199, 85, 0) 70%);
  pointer-events: none;
}
.call-avatar-pulse {
  position: relative;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 22px;
}
.call-avatar-circle {
  position: relative;
  z-index: 2;
  width: 104px;
  height: 104px;
  border-radius: 50%;
  background: linear-gradient(145deg, #08dc61 0%, #059b42 100%);
  color: #ffffff;
  font-size: 38px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 32px rgba(6, 199, 85, 0.34), inset 0 1px 1px rgba(255, 255, 255, 0.32);
}
.call-pulse-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(6, 199, 85, 0.45);
  opacity: 0;
  pointer-events: none;
}
.call-avatar-pulse.is-ringing .ring-1 {
  animation: lunoCallPulse 2.1s cubic-bezier(0.2, 0.6, 0.35, 1) infinite;
}
.call-avatar-pulse.is-ringing .ring-2 {
  animation: lunoCallPulse 2.1s cubic-bezier(0.2, 0.6, 0.35, 1) 0.9s infinite;
}
@keyframes lunoCallPulse {
  0% { transform: scale(0.95); opacity: 0.7; }
  100% { transform: scale(1.65); opacity: 0; }
}
.call-voice-name {
  margin: 0 0 10px;
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.3px;
}

/* Video call top scrim */
.call-status-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 20px 20px 36px;
  text-align: center;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0) 100%);
  pointer-events: none;
  z-index: 3;
}
.call-status-overlay h3 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
}
.call-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 13px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 500;
}
.call-dot { opacity: 0.55; }
.timer-active { font-variant-numeric: tabular-nums; font-weight: 600; color: #6ef5a4; }
.rec-indicator { color: #ff6b6b; font-weight: 700; font-size: 12px; margin-left: 4px; }
.call-media-alert {
  margin: 10px auto 0;
  max-width: 320px;
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.22);
  border: 1px solid rgba(245, 158, 11, 0.45);
  color: #fde68a;
  font-size: 12px;
}

/* Self PiP */
.call-pip-video {
  position: absolute;
  right: 16px;
  bottom: 118px;
  width: 25%;
  max-width: 168px;
  min-width: 96px;
  aspect-ratio: 3 / 4;
  background: #1e293b;
  border-radius: 16px;
  border: 2px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
  object-fit: cover;
  z-index: 4;
}

/* Bottom control bar */
.call-bottom-scrim {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 28px 16px max(20px, env(safe-area-inset-bottom));
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0) 100%);
  display: flex;
  justify-content: center;
  z-index: 5;
}
.call-bottom-bar {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 14px;
  margin-top: 0;
  padding: 12px 18px 10px;
  border-radius: 26px;
  background: rgba(17, 24, 28, 0.72);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.call-btn-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 54px;
}
.call-btn-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
  max-width: 68px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-call-circle {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #ffffff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease, background-color 0.15s ease, color 0.15s ease;
}
.btn-call-circle:hover { background: rgba(255, 255, 255, 0.26); }
.btn-call-circle:active { transform: scale(0.94); }
.btn-call-circle.is-toggled {
  background: #ffffff;
  color: #111827;
}
.btn-call-circle.is-active {
  background: #06C755;
  color: #ffffff;
  border-color: transparent;
}
.btn-call-circle.recording {
  background: #ef4444;
  color: #ffffff;
}
.btn-call-answer {
  width: 50px;
  height: 50px;
  padding: 0;
  border-radius: 50%;
  background: #06C755;
  color: #ffffff;
  border: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(6, 199, 85, 0.4);
  transition: transform 0.12s ease, background-color 0.15s ease;
}
.btn-call-answer:hover { background: #05b34c; }
.btn-call-hangup {
  width: 50px;
  height: 50px;
  padding: 0;
  border-radius: 50%;
  background: #ef4444;
  color: #ffffff;
  border: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(239, 68, 68, 0.4);
  transition: transform 0.12s ease, background-color 0.15s ease;
}
.btn-call-hangup:hover { background: #dc2626; }

/* Frosted More panel */
.call-more-panel {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: min(360px, calc(100% - 28px));
  bottom: 118px;
  background: rgba(15, 23, 28, 0.92);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 18px;
  padding: 14px;
  z-index: 6;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}
.call-filter-row {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-bottom: 10px;
}
.call-filter-row button {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.88);
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.call-filter-row button.active {
  background: #06C755;
  border-color: transparent;
  color: #ffffff;
}
.btn-caption-toggle {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.btn-caption-toggle.active {
  background: rgba(6, 199, 85, 0.22);
  border-color: #06C755;
  color: #86efac;
}
.live-captions-box {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  text-align: left;
}
.caption-notice {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 6px;
}
.caption-lang-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #ffffff;
}
.lang-tag {
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.14);
  font-weight: 700;
}
.badge-engine-mini {
  margin-left: auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: #06C755;
  color: #ffffff;
  font-weight: 700;
}
.caption-live-text {
  margin: 6px 0 0;
  font-size: 13px;
  color: #ffffff;
  line-height: 1.45;
}
.call-more-row {
  display: flex;
  justify-content: center;
  gap: 18px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
