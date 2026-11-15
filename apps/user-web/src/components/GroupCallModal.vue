<script setup lang="ts">
// F15: group call tile screen. One tile per participant (self + up to 7
// remotes, server-capped at 8 seats): live video when a remote stream is
// flowing, avatar + name otherwise. Grid follows the 11장 spec breakpoints
// (2 columns on phones, 3 on tablet, 4 on desktop). Same control bar shape
// as the 1:1 CallModal (mic, camera, camera-switch, hangup) minus ringing,
// recording and captions — a group room has no ring state to record from.
import { defineComponent, h, onMounted, ref, watch, type PropType } from 'vue'

import { initialOf } from '../../../shared/avatar_initial'
import { t } from '../store/session'
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

// Local tile subcomponent: binds its stream imperatively (no template
// binding exists for srcObject) on mount and on every stream swap.
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
      if (tileVideo.value) tileVideo.value.srcObject = tileProps.stream
    }
    onMounted(bind)
    watch(() => tileProps.stream, bind)
    return () =>
      h('div', { class: 'group-tile', role: 'listitem' }, [
        tileProps.stream
          ? h('video', {
              ref: tileVideo,
              autoplay: true,
              playsinline: true,
              muted: tileProps.self,
              class: 'group-tile-video',
              onVnodeMounted: bind,
              onVnodeUpdated: bind,
            })
          : h('div', { class: 'group-tile-avatar' }, [
              h('div', { class: 'avatar-circle lg', style: { background: tileProps.color } },
                initialOf(tileProps.name, '?')),
            ]),
        h('div', { class: 'group-tile-name' }, [
          tileProps.muted ? h('span', { class: 'group-tile-mute' }, '🔇 ') : null,
          tileProps.name,
          tileProps.self ? ` (${t('mvMe')})` : '',
        ]),
      ])
  },
})
</script>

<template>
  <div class="call-overlay-modal">
    <div class="call-dialog-box group-call-stage">
      <div class="group-call-header">
        <h3>{{ groupCall.title }}</h3>
        <p class="call-type-status">
          {{ groupCall.kind === 'video' ? '📹 ' + t('callVideo') : '📞 ' + t('callVoice') }} ·
          <span class="timer-active">{{ formatDuration(groupCallDuration) }}</span> ·
          <span>{{ t('mvGroupCallSeats').replace('{n}', String(peers.length + 1)) }}</span>
        </p>
        <p v-if="groupCall.mediaFailed" class="caption-notice">⚠️ {{ t('callMediaFailed') }}</p>
      </div>

      <div class="group-tile-grid" role="list" :aria-label="t('mvGroupCall')">
        <!-- Self tile first, then one tile per remote peer. -->
        <GroupTile
          :name="selfName"
          color="#315BCD"
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

      <div class="call-controls-row call-bottom-bar group-call-bar">
        <button class="btn-call-circle" :class="{ off: isGroupMuted }" :title="t('mvMicMute')" @click="$emit('mute')">
          {{ isGroupMuted ? '🔇' : '🎤' }}
        </button>
        <button v-if="groupCall.kind === 'video'" class="btn-call-circle" :class="{ off: isGroupVideoOff }" :title="t('mvCameraToggle')" @click="$emit('video')">
          {{ isGroupVideoOff ? '🚫' : '📹' }}
        </button>
        <button v-if="groupCall.kind === 'video'" class="btn-call-circle" :title="t('mvCameraSwitch')" @click="$emit('camera-switch')">
          🔄
        </button>
        <button class="btn-call-hangup" @click="$emit('hangup')">{{ t('mvEndCall') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-call-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: min(78vh, 640px);
  max-height: 92vh;
  background: #0f172a;
}
.group-call-header {
  text-align: center;
  padding: 12px 12px 4px;
}
.group-call-header h3,
.group-call-header .call-type-status {
  color: #fff;
}
.group-tile-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  gap: 8px;
  padding: 8px 12px;
  grid-template-columns: repeat(2, 1fr);
  align-content: start;
}
@media (min-width: 700px) {
  .group-tile-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (min-width: 1100px) {
  .group-tile-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
.group-tile {
  position: relative;
  aspect-ratio: 3 / 4;
  max-height: 220px;
  background: #1e293b;
  border-radius: 12px;
  overflow: hidden;
}
.group-tile-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.group-tile-avatar {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.group-tile-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 4px 6px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.group-call-waiting {
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  padding: 0 12px 4px;
}
.group-call-bar {
  position: static;
  padding: 8px 0 12px;
}
</style>
