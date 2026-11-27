<script setup lang="ts">
// P2 split: charge-money modal, extracted verbatim from views/MessengerView.vue.
// The picked amount emits upward; visibility stays outside.
import { paymentsEnabled, t } from '../store/session'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

const emit = defineEmits<{
  close: []
  charge: [amount: number]
}>()
</script>

<template>
  <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box">
      <div class="modal-header">
        <h3>{{ t('mvChargeTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')"><LunoIcon name="close" :size="18" /></button>
      </div>
      <div class="modal-body-form">
        <p>{{ t('mvChargePick') }}</p>
        <p class="ln-charge-notice" role="note">{{ t('mvChargeNotice') }}</p>
        <p v-if="!paymentsEnabled" class="ln-charge-preparing" role="note">{{ t('mvPreparing') }}</p>
        <div class="charge-options-grid">
          <button class="btn-charge-option" :disabled="!paymentsEnabled" :title="t('mvChargeDisabledTitle')" @click="emit('charge', 10000)">{{ t('mvCharge10k') }}</button>
          <button class="btn-charge-option" :disabled="!paymentsEnabled" :title="t('mvChargeDisabledTitle')" @click="emit('charge', 30000)">{{ t('mvCharge30k') }}</button>
          <button class="btn-charge-option" :disabled="!paymentsEnabled" :title="t('mvChargeDisabledTitle')" @click="emit('charge', 50000)">{{ t('mvCharge50k') }}</button>
          <button class="btn-charge-option" :disabled="!paymentsEnabled" :title="t('mvChargeDisabledTitle')" @click="emit('charge', 100000)">{{ t('mvCharge100k') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
