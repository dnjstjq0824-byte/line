<script setup lang="ts">
// F15: group call tile screen. One tile per participant (self + up to 7
// remotes, server-capped at 8 seats): live video when a remote stream is
// flowing, avatar + name otherwise. Grid follows the 11장 spec breakpoints
// (2 columns on phones, 3 on tablet, 4 on desktop).
import { defineComponent, h, onMounted, ref, watch, type PropType } from 'vue'

import { initialOf } from '../../../shared/avatar_initial'
import { t } from '../store/session'
import LunoIcon from './LunoIcon.vue'
import type { GroupCallState, GroupPeer } from '../composables/useGroupCall'

defineProps<{
  groupCall: GroupCallState
  peers: GroupPeer[]
  selfName: string
  selfStream: MediaStream | null
  groupCallDuration: number
  formatDuration: (sec: number) => string
  isGroupMuted: boolean
  isGroupVideoOff: boolean
}>()

defineEmits<{
  mute: []
  video: []
  'camera-switch': []
  hangup: []
}>()

const GroupTile = defineComponent({
  name: 'GroupTile',
  props: {
    name: { type: String, required: true },
    color: { type: String, required: true },
    stream: { type: Object as PropType<MediaStream | null>, default: null },
    muted: { type: Boolean, default: false },
    self: { type: Boolean, default: false },
  },
  setup(tileProps) {
    const tileVideo = ref<HTMLVideoElement | null>(null)
    const bind = () => {
      if (tileVideo.value) {
        tileVideo.value.srcObject = tileProps.stream
        if (tileProps.stream) void tileVideo.value.play?.()?.catch(() => {})
      }
    }
    onMounted(bind)
    watch(() => tileProps.stream, bind)
    return () => {
      const hasVideo = Boolean(tileProps.stream && tileProps.stream.getVideoTracks().some(tr => tr.readyState === 'live' && tr.enabled))
      return h('div', { class: ['group-tile', tileProps.self ? 'is-self' : ''], role: 'listitem' }, [
        tileProps.stream
          ? h('video', {
              ref: tileVideo,
              autoplay: true,
              playsinline: true,
              muted: tileProps.self,
              class: hasVideo ? 'group-tile-video' : 'group-tile-video group-tile-audio-only',
              onVnodeMounted: bind,
              onVnodeUpdated: bind,
            })
          : null,
        !hasVideo
          ? h('div', { class: 'group-tile-avatar' }, [
              h('div', { class: 'group-avatar-badge', style: { background: tileProps.color } },
                initialOf(tileProps.name, '?')),
            ])
          : null,
        h('div', { class: 'group-tile-name' }, [
          tileProps.muted ? h('span', { class: 'group-tile-mute', 'aria-label': 'muted' }, 'MIC OFF') : null,
          h('span', { class: 'group-tile-label' }, `${tileProps.name}${tileProps.self ? ` (${t('mvMe')})` : ''}`),
        ]),
      ])
    }
  },
})
</script>

<template>
  <div class="call-overlay-modal">
    <div class="call-dialog-box group-call-stage" role="dialog" aria-modal="true" :aria-label="groupCall.title">
      <div class="group-call-header">
        <h3>{{ groupCall.title }}</h3>
        <div class="group-status-pill">
          <LunoIcon :name="groupCall.kind === 'video' ? 'call-video' : 'call-voice'" :size="14" />
          <span>{{ groupCall.kind === 'video' ? t('callVideo') : t('callVoice') }}</span>
          <span class="group-dot">·</span>
          <span class="timer-active">{{ formatDuration(groupCallDuration) }}</span>
          <span class="group-dot">·</span>
          <span>{{ t('mvGroupCallSeats').replace('{n}', String(peers.length + 1)) }}</span>
        </div>
        <p v-if="groupCall.mediaFailed" class="group-media-alert">{{ t('callMediaFailed') }}</p>
      </div>

      <div class="group-tile-grid" role="list" :aria-label="t('mvGroupCall')">
        <GroupTile
          :name="selfName"
          color="#06C755"
          :stream="groupCall.kind === 'video' && !isGroupVideoOff ? selfStream : null"
          :muted="isGroupMuted"
          :self="true"
        />
        <GroupTile
          v-for="peer in peers"
          :key="peer.id"
          :name="peer.name"
          :color="peer.avatar_color"
          :stream="peer.stream"
          :muted="false"
          :self="false"
        />
      </div>
      <p v-if="peers.length === 0" class="group-call-waiting">{{ t('mvGroupCallWaiting') }}</p>

      <div class="group-call-bar-wrap">
        <div class="call-controls-row call-bottom-bar group-call-bar">
          <div class="call-btn-unit">
            <button
              class="btn-call-circle"
              :class="{ 'is-toggled': isGroupMuted }"
              :title="t('mvMicMute')"
              :aria-label="t('mvMicMute')"
              @click="$emit('mute')"
            >
              <LunoIcon :name="isGroupMuted ? 'mic-off' : 'mic'" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvMicMute') }}</span>
          </div>
          <div v-if="groupCall.kind === 'video'" class="call-btn-unit">
            <button
              class="btn-call-circle"
              :class="{ 'is-toggled': isGroupVideoOff }"
              :title="t('mvCameraToggle')"
              :aria-label="t('mvCameraToggle')"
              @click="$emit('video')"
            >
              <LunoIcon :name="isGroupVideoOff ? 'video-off' : 'call-video'" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvCameraToggle') }}</span>
          </div>
          <div v-if="groupCall.kind === 'video'" class="call-btn-unit">
            <button
              class="btn-call-circle"
              :title="t('mvCameraSwitch')"
              :aria-label="t('mvCameraSwitch')"
              @click="$emit('camera-switch')"
            >
              <LunoIcon name="camera-switch" :size="22" />
            </button>
            <span class="call-btn-label">{{ t('mvCameraSwitch') }}</span>
          </div>
          <div class="call-btn-unit">
            <button
              class="btn-call-hangup"
              :title="t('mvEndCall')"
              :aria-label="t('mvEndCall')"
              @click="$emit('hangup')"
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
.group-call-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1040px, 94vw);
  height: min(720px, 88vh);
  padding: 0;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(165deg, #162820 0%, #0e161a 55%, #090e11 100%);
  box-shadow: 0 28px 64px rgba(0, 0, 0, 0.58);
  overflow: hidden;
}
@media (max-width: 699px) {
  .group-call-stage {
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100dvh;
    border-radius: 0;
    border: 0;
  }
}
.group-call-header {
  text-align: center;
  padding: 18px 20px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.group-call-header h3 {
  margin: 0 0 8px;
  font-size: 19px;
  font-weight: 700;
  color: #ffffff;
}
.group-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 13px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 500;
}
.group-dot { opacity: 0.5; }
.timer-active { font-variant-numeric: tabular-nums; font-weight: 600; color: #6ef5a4; }
.group-media-alert {
  margin: 8px auto 0;
  max-width: 340px;
  padding: 5px 12px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fde68a;
  font-size: 12px;
}
.group-tile-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  gap: 12px;
  padding: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
}
@media (min-width: 700px) {
  .group-tile-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1100px) {
  .group-tile-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.group-tile {
  position: relative;
  aspect-ratio: 3 / 4;
  max-height: 280px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
}
.group-tile.is-self {
  border-color: rgba(6, 199, 85, 0.55);
}
.group-tile-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.group-tile-audio-only {
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.group-tile-avatar {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.group-avatar-badge {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 26px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}
.group-tile-name {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(8px);
}
.group-tile-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-tile-mute {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.9);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.3px;
}
.group-call-waiting {
  text-align: center;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  padding: 0 16px 8px;
  margin: 0;
}
.group-call-bar-wrap {
  padding: 10px 16px max(18px, env(safe-area-inset-bottom));
  display: flex;
  justify-content: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.group-call-bar {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 14px;
  margin-top: 0;
  padding: 12px 18px 10px;
  border-radius: 26px;
  background: rgba(17, 24, 28, 0.72);
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
}
.btn-call-circle:hover { background: rgba(255, 255, 255, 0.26); }
.btn-call-circle.is-toggled {
  background: #ffffff;
  color: #111827;
}
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
}
</style>
