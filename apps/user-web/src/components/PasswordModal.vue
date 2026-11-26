<script setup lang="ts">
// P2 split: password change modal, extracted verbatim from views/MessengerView.vue.
// Inputs are two-way models (SettingsModal precedent); visibility stays outside.
import { t } from '../store/session'

const currentPassword = defineModel<string>('currentPassword', { default: '' })
const newPassword = defineModel<string>('newPassword', { default: '' })
const confirmPassword = defineModel<string>('confirmPassword', { default: '' })

defineProps<{
  error: string
}>()

const emit = defineEmits<{
  close: []
  submit: []
}>()
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box password-modal" style="max-width: 420px; width: 92vw;">
      <div class="modal-header">
        <h3>{{ t('mvPwChangeTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <form class="modal-body-form" @submit.prevent="emit('submit')">
        <p v-if="error" class="error-text" style="color: #ef4444; font-size: 12px; margin: 0;">{{ error }}</p>
        <label>{{ t('mvPwCurrent') }}</label>
        <input v-model="currentPassword" type="password" :placeholder="t('mvPwCurrentPh')" required />
        <label>{{ t('mvPwNew') }}</label>
        <input v-model="newPassword" type="password" :placeholder="t('mvPwNewPh')" required minlength="12" />
        <label>{{ t('mvPwConfirm') }}</label>
        <input v-model="confirmPassword" type="password" :placeholder="t('mvPwConfirmPh')" required minlength="12" />
        <div class="modal-actions-right" style="margin-top: 14px;">
          <button type="button" class="btn-secondary" @click="emit('close')">{{ t('mvCancel') }}</button>
          <button type="submit" class="btn-primary">{{ t('mvPwChange') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
