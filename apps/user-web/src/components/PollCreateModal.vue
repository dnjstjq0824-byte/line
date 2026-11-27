<script setup lang="ts">
// P2 split: poll-create modal, extracted verbatim from views/MessengerView.vue.
// Inputs are two-way models; creation emits upward (it needs the selected
// chat). Visibility stays outside.
import { t } from '../store/session'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

const question = defineModel<string>('question', { default: '' })
const option1 = defineModel<string>('option1', { default: '' })
const option2 = defineModel<string>('option2', { default: '' })
const option3 = defineModel<string>('option3', { default: '' })

const emit = defineEmits<{
  close: []
  submit: []
}>()
</script>

<template>
  <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box">
      <div class="modal-header">
        <h3>{{ t('mvPollTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')"><LunoIcon name="close" :size="18" /></button>
      </div>
      <div class="modal-body-form">
        <label>{{ t('mvPollQ') }}</label>
        <input v-model="question" :placeholder="t('mvPollQPh')" />
        <label>{{ t('mvOpt1') }}</label>
        <input v-model="option1" :placeholder="t('mvOpt1')" />
        <label>{{ t('mvOpt2') }}</label>
        <input v-model="option2" :placeholder="t('mvOpt2')" />
        <label>{{ t('mvOpt3') }}</label>
        <input v-model="option3" :placeholder="t('mvOpt3Ph')" />
        <div class="modal-actions-right">
          <button class="btn-secondary" @click="emit('close')">{{ t('mvCancel') }}</button>
          <button class="btn-primary" @click="emit('submit')">{{ t('mvPollSubmit') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
