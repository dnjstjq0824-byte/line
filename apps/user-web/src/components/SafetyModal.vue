<script setup lang="ts">
// P2 split: E2EE safety-number modal, extracted verbatim from views/MessengerView.vue.
// Rows/loading/my-code are read-only; verification emits upward.
// Visibility stays outside.
import { t } from '../store/session'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

export type SafetyRow = {
  device: string
  edPub: string
  number: string
  lines: string[]
  verified: boolean
  changed: boolean
}

defineProps<{
  rows: SafetyRow[]
  loading: boolean
  myCode: string
}>()

const emit = defineEmits<{
  close: []
  verify: [device: string, edPub: string]
}>()
</script>

<template>
  <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box" role="dialog" :aria-label="t('e2eeSfTitle')">
      <div class="modal-header">
        <h3>{{ t('e2eeSfTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')"><LunoIcon name="close" :size="18" /></button>
      </div>
      <div class="modal-body-form">
        <p class="muted" style="font-size: 12px; margin: 0">{{ t('e2eeSfHow') }}</p>
        <div v-if="loading" class="ln-dialog-loading" role="status" :aria-label="t('mvLoadingChat')"></div>
        <div v-else-if="!rows.length" class="muted" style="font-size: 12px">{{ t('e2eeSfNone') }}</div>
        <div v-for="row in rows" :key="row.device" style="border: 1px solid var(--ln-line); border-radius: 14px; padding: 12px 14px">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px">
            <code style="font-size: 12px">{{ row.device }}</code>
            <span v-if="row.verified" class="badge-status-on" style="font-size: 11px">{{ t('e2eeSfVerified') }}</span>
            <button v-else class="btn-secondary" style="font-size: 11px; padding: 3px 8px" @click="emit('verify', row.device, row.edPub)">
              {{ t('e2eeSfVerify') }}
            </button>
          </div>
          <pre style="font-size: 13px; line-height: 1.7; margin: 6px 0 0; white-space: pre-wrap; font-family: ui-monospace, monospace;">{{ row.lines.join('\n') }}</pre>
          <div v-if="row.changed" class="ln-dialog-error" role="alert" style="margin-top: 8px">⚠️ {{ t('e2eeSfChanged') }}</div>
        </div>
        <p v-if="myCode" class="muted" style="font-size: 11px; margin: 0; word-break: break-all">{{ t('e2eeSfMyCode') }}: <code>{{ myCode }}</code></p>
      </div>
    </div>
  </div>
</template>
