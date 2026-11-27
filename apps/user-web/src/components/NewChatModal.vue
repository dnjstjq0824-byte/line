<script setup lang="ts">
// P2 split: new-chat sheet, extracted verbatim from views/MessengerView.vue.
// The roster is read-only; every choice emits upward. Visibility stays outside.
import { t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import { hideBrokenAvatar, taglineOf } from '../messenger-format'
import type { User } from '../../../shared/api'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

defineProps<{
  friends: User[]
}>()

const emit = defineEmits<{
  close: []
  makeGroup: []
  joinOpenChat: []
  directChat: [friend: User]
}>()
</script>

<template>
  <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box new-chat-modal">
      <div class="modal-header">
        <h3>{{ t('mvNewConvo') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')"><LunoIcon name="close" :size="18" /></button>
      </div>
      <div class="modal-body-form">
        <div class="new-chat-options-grid">
          <button class="btn-new-chat-type" @click="emit('makeGroup')">
            <span class="type-icon" aria-hidden="true"><LunoIcon name="friends" :size="20" /></span>
            <div class="type-text">
              <strong>{{ t('mvMakeGroup') }}</strong>
              <small>{{ t('mvMakeGroupDesc') }}</small>
            </div>
          </button>
          <button class="btn-new-chat-type" @click="emit('joinOpenChat')">
            <span class="type-icon" aria-hidden="true"><LunoIcon name="openchat" :size="20" /></span>
            <div class="type-text">
              <strong>{{ t('mvJoinOpenChat') }}</strong>
              <small>{{ t('mvJoinOpenChatDesc') }}</small>
            </div>
          </button>
        </div>

        <label>{{ t('mvStartDirectDesc') }}</label>
        <div class="select-friends-scroll">
          <div
            v-for="f in friends"
            :key="'new-chat-' + f.id"
            class="quick-pick-friend-row"
            @click="emit('directChat', f)"
          >
            <span class="lx-avatar s36" :style="{ background: f.avatar_color || 'var(--ln-accent)' }">
              <span>{{ initialOf(f.display_name) }}</span><img v-if="(f as any).avatar_url" :src="(f as any).avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" />
            </span>
            <div class="friend-pick-meta">
              <strong>{{ f.display_name }}</strong>
              <small>{{ taglineOf(f) }}</small>
            </div>
            <button class="btn-mini-chat">{{ t('mvChats') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
