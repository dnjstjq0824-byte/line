<script setup lang="ts">
// P2 split: report dialog, extracted verbatim from views/MessengerView.vue.
// Category/details/consent are two-way models (SettingsModal precedent);
// the quoted message is read-only; visibility stays outside.
import { t } from '../store/session'
import type { Message } from '../../../shared/api'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

const reportCategory = defineModel<string>('reportCategory', { default: 'spam' })
const reportDetails = defineModel<string>('reportDetails', { default: '' })
const reportE2eeConsent = defineModel<boolean>('reportE2eeConsent', { default: false })

defineProps<{
  reportMessage: Message | null
}>()

const emit = defineEmits<{
  close: []
  submit: []
}>()
</script>

<template>
  <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box" role="dialog" :aria-label="t('reportTitle')">
      <div class="modal-header">
        <h3>{{ t('reportTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')"><LunoIcon name="close" :size="18" /></button>
      </div>
      <div class="modal-body-form">
        <label class="pc-input-row">
          <span>{{ t('reportCategory') }}</span>
          <select v-model="reportCategory" class="pc-login-input">
            <option value="spam">{{ t('reportCatSpam') }}</option>
            <option value="abuse">{{ t('reportCatAbuse') }}</option>
            <option value="harassment">{{ t('reportCatHarassment') }}</option>
            <option value="illegal_filming">{{ t('reportCatIllegalFilming') }}</option>
            <option value="child_exploitation">{{ t('reportCatChildExploitation') }}</option>
            <option value="violence">{{ t('reportCatViolence') }}</option>
            <option value="other">{{ t('reportCatOther') }}</option>
          </select>
        </label>
        <label class="pc-input-row">
          <span>{{ t('reportDetails') }}</span>
          <textarea v-model="reportDetails" class="pc-login-input" rows="3" maxlength="2000" />
        </label>
        <label v-if="reportMessage && reportMessage._e2ee" class="pc-input-row" style="flex-direction: row; align-items: center; gap: 8px;">
          <input v-model="reportE2eeConsent" type="checkbox" />
          <span>{{ t('reportE2eeConsent') }}</span>
        </label>
        <p v-if="reportMessage" style="margin: 0; padding: 10px 12px; border-left: 3px solid var(--ln-line); border-radius: 0 12px 12px 0; background: var(--ln-subtle); color: var(--ln-text); font-size: 13px; white-space: pre-wrap; word-break: break-word;">{{ reportMessage.body }}</p>
        <button class="btn-pc-submit-full" type="button" @click="emit('submit')">
          {{ t('reportSubmit') }}
        </button>
      </div>
    </div>
  </div>
</template>
