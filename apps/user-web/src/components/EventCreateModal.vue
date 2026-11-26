<script setup lang="ts">
// P2 split: event-create modal, extracted verbatim from views/MessengerView.vue.
// Inputs are two-way models; creation emits upward (it needs the selected
// chat). Visibility stays outside.
import { t } from '../store/session'

const eventTitle = defineModel<string>('eventTitle', { default: '' })
const eventDate = defineModel<string>('eventDate', { default: '' })
const eventLocation = defineModel<string>('eventLocation', { default: '' })

const emit = defineEmits<{
  close: []
  submit: []
}>()
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box">
      <div class="modal-header">
        <h3>{{ t('mvEventTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="modal-body-form">
        <label>{{ t('mvEventName') }}</label>
        <input v-model="eventTitle" :placeholder="t('mvEventNamePh')" />
        <label>{{ t('mvEventWhen') }}</label>
        <input v-model="eventDate" type="datetime-local" />
        <label>{{ t('mvEventWhere') }}</label>
        <input v-model="eventLocation" :placeholder="t('mvEventWherePh')" />
        <div class="modal-actions-right">
          <button class="btn-secondary" @click="emit('close')">{{ t('mvCancel') }}</button>
          <button class="btn-primary" @click="emit('submit')">{{ t('mvAddEvent') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
