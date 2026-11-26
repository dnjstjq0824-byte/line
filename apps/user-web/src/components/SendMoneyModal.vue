<script setup lang="ts">
// P2 split: send-money modal, extracted verbatim from views/MessengerView.vue.
// Amount/memo are two-way models; the target is read-only.
// Visibility stays outside.
import { paymentsEnabled, t } from '../store/session'
import type { User } from '../../../shared/api'

const sendAmount = defineModel<number>('sendAmount', { default: 10000 })
const sendMemo = defineModel<string>('sendMemo', { default: '' })

defineProps<{
  targetFriend: User | null
}>()

const emit = defineEmits<{
  close: []
  submit: []
}>()
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box">
      <div class="modal-header">
        <h3>{{ t('mvSendMoneyTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="modal-body-form">
        <p class="muted" style="margin: 0; font-size: 11.5px; color: #64748b;">{{ t('mvSandboxNotice') }}</p>
        <p v-if="!paymentsEnabled" class="muted" style="margin: 0; font-size: 12px; color: #b45309;">{{ t('mvPaymentsPreparing') }}</p>
        <div v-if="targetFriend" class="send-target-info">
          {{ t('mvSendTo') }} <strong>{{ targetFriend.display_name }}</strong>
        </div>
        <label>{{ t('mvSendAmount') }}</label>
        <input v-model.number="sendAmount" type="number" min="1000" step="1000" />
        <div class="quick-amounts">
          <button @click="sendAmount = 10000">{{ t('mvPlus10k') }}</button>
          <button @click="sendAmount = 30000">{{ t('mvPlus30k') }}</button>
          <button @click="sendAmount = 50000">{{ t('mvPlus50k') }}</button>
          <button @click="sendAmount = 100000">{{ t('mvPlus100k') }}</button>
        </div>
        <label>{{ t('mvSendMemo') }}</label>
        <input v-model="sendMemo" :placeholder="t('mvMemoPh')" />
        <div class="modal-actions-right">
          <button class="btn-secondary" @click="emit('close')">{{ t('mvCancel') }}</button>
          <button class="btn-primary" :disabled="!paymentsEnabled" @click="emit('submit')">{{ t('mvMockSend') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
