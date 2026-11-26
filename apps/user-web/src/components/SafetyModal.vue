<script setup lang="ts">
// P2 split: E2EE safety-number modal, extracted verbatim from views/MessengerView.vue.
// Rows/loading/my-code are read-only; verification emits upward.
// Visibility stays outside.
import { t } from '../store/session'

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
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box" role="dialog" :aria-label="t('e2eeSfTitle')">
      <div class="modal-header">
        <h3>{{ t('e2eeSfTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="modal-body-form">
        <p class="muted" style="font-size: 12px; margin: 0">{{ t('e2eeSfHow') }}</p>
        <div v-if="loading" class="muted" style="font-size: 12px">…</div>
        <div v-else-if="!rows.length" class="muted" style="font-size: 12px">{{ t('e2eeSfNone') }}</div>
        <div v-for="row in rows" :key="row.device" style="border: 1px solid rgb(0 0 0 / 10%); border-radius: 8px; padding: 8px 10px">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px">
            <code style="font-size: 12px">{{ row.device }}</code>
            <span v-if="row.verified" class="badge-status-on" style="font-size: 11px">{{ t('e2eeSfVerified') }}</span>
            <button v-else class="btn-secondary" style="font-size: 11px; padding: 3px 8px" @click="emit('verify', row.device, row.edPub)">
              {{ t('e2eeSfVerify') }}
            </button>
          </div>
          <pre style="font-size: 13px; line-height: 1.7; margin: 6px 0 0; white-space: pre-wrap; font-family: ui-monospace, monospace;">{{ row.lines.join('\n') }}</pre>
          <div v-if="row.changed" style="font-size: 11px; color: #b3261e; margin-top: 4px">⚠️ {{ t('e2eeSfChanged') }}</div>
        </div>
        <p v-if="myCode" class="muted" style="font-size: 11px; margin: 0; word-break: break-all">{{ t('e2eeSfMyCode') }}: <code>{{ myCode }}</code></p>
      </div>
    </div>
  </div>
</template>
