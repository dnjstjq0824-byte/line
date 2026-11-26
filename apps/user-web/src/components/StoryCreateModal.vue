<script setup lang="ts">
// P2 split: story-create modal, extracted verbatim from views/MessengerView.vue.
// The draft is a two-way model; publishing emits upward. Visibility stays outside.
import { t } from '../store/session'

const storyText = defineModel<string>('storyText', { default: '' })

const emit = defineEmits<{
  close: []
  submit: []
}>()
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box">
      <div class="modal-header">
        <h3>{{ t('mvStoryTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="modal-body-form">
        <label>{{ t('mvStoryText') }}</label>
        <input v-model="storyText" :placeholder="t('mvStoryPh')" @keydown.enter.prevent="emit('submit')" />
        <div class="modal-actions-right">
          <button class="btn-secondary" @click="emit('close')">{{ t('mvCancel') }}</button>
          <button class="btn-primary" @click="emit('submit')">{{ t('mvPublish') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
