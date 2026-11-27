<script setup lang="ts">
// P2 split: forward picker modal, extracted verbatim from views/MessengerView.vue.
// The room list is read-only; picking emits upward (forwarding re-encrypts
// in the view). Visibility stays outside.
import { t } from '../store/session'
import type { Chat } from '../../../shared/api'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

defineProps<{
  chats: Chat[]
}>()

const emit = defineEmits<{
  close: []
  forward: [chatId: string]
}>()
</script>

<template>
  <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box">
      <div class="modal-header">
        <h3>{{ t('mvForwardTo') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')"><LunoIcon name="close" :size="18" /></button>
      </div>
      <div class="modal-body-form">
        <div class="select-friends-scroll">
          <button v-for="c in chats.filter((c) => !c.official)" :key="c.id" class="friend-check-item" @click="emit('forward', c.id)">
            <span>{{ c.title || t('mvChatFallback') }}</span>
          </button>
        </div>
        <div class="modal-actions-right">
          <button class="btn-secondary" @click="emit('close')">{{ t('mvCancel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
