<script setup lang="ts">
// P2 split: QR modal, extracted verbatim from views/MessengerView.vue.
// Presentational: visibility stays with the parent (v-if outside); the
// search-by-ID handoff emits upward (the parent owns that modal too).
import { t } from '../store/session'

defineProps<{
  qrSvg: string
  handle: string
}>()

const emit = defineEmits<{
  close: []
  searchById: []
}>()
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box">
      <div class="modal-header">
        <h3>{{ t('mvMyQr') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="modal-body-form" style="align-items:center;text-align:center;">
        <p class="modal-subtext">{{ t('mvQrDesc') }}</p>
        <div class="pc-qr-matrix-card" style="margin:12px auto;" v-html="qrSvg"></div>
        <p class="muted">@{{ handle || 'luno_user' }}</p>
        <div class="modal-actions-right" style="width:100%;justify-content:center;">
          <button class="btn-primary" @click="emit('searchById')">{{ t('mvSearchById') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
