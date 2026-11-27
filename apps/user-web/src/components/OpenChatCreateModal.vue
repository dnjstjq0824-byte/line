<script setup lang="ts">
// P2 split: openchat-create modal, extracted verbatim from views/MessengerView.vue.
// Inputs are two-way models; creation emits upward. Visibility stays outside.
import { t } from '../store/session'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

const roomName = defineModel<string>('roomName', { default: '' })
const roomDesc = defineModel<string>('roomDesc', { default: '' })

const emit = defineEmits<{
  close: []
  submit: []
}>()
</script>

<template>
  <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box">
      <div class="modal-header">
        <h3>{{ t('mvOpenChatTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')"><LunoIcon name="close" :size="18" /></button>
      </div>
      <div class="modal-body-form">
        <label>{{ t('mvOpenChatName') }}</label>
        <input v-model="roomName" :placeholder="t('mvOpenChatNamePh')" />
        <label>{{ t('mvDesc') }}</label>
        <input v-model="roomDesc" :placeholder="t('mvDescPh')" />
        <div class="modal-actions-right">
          <button class="btn-secondary" @click="emit('close')">{{ t('mvCancel') }}</button>
          <button class="btn-primary" @click="emit('submit')">{{ t('mvCreateRoom') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
