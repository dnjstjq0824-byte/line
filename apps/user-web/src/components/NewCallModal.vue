<script setup lang="ts">
// P2 split: new-call contact picker, extracted verbatim from views/MessengerView.vue.
// The roster is read-only; dialing emits upward (never dials blind).
// Visibility stays outside.
import { t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import type { User } from '../../../shared/api'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

defineProps<{
  friends: User[]
}>()

const emit = defineEmits<{
  close: []
  voiceCall: [friend: User]
  videoCall: [friend: User]
}>()
</script>

<template>
  <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box new-call-modal" role="dialog" :aria-label="t('mvNewCall')">
      <div class="modal-header">
        <h3>{{ t('mvNewCall') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')"><LunoIcon name="close" :size="18" /></button>
      </div>
      <div class="modal-body-form new-call-body">
        <p v-if="!friends.length" class="muted">{{ t('contact_empty') }}</p>
        <div v-for="f in friends" :key="f.id" class="new-call-row">
          <div class="pc-avatar circle-36" :style="{ background: (f as any).avatar_color || 'var(--ln-accent)' }">{{ initialOf(f.display_name, 'U') }}</div>
          <span class="new-call-name">{{ f.display_name }}</span>
          <button class="btn-subaction-pill" :title="t('mvVoiceCall')" @click="emit('voiceCall', f)"><LunoIcon name="call-voice" :size="15" /> {{ t('mvVoiceCall') }}</button>
          <button class="btn-subaction-pill" :title="t('mvVideoCallLabel')" @click="emit('videoCall', f)"><LunoIcon name="call-video" :size="15" /> {{ t('mvVideoCallLabel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
