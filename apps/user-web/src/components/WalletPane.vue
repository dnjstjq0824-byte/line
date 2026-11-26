<script setup lang="ts">
// P2 split: wallet tab pane, extracted verbatim from views/MessengerView.vue.
// Balance/points/ledger are read-only; navigation and modal opens emit upward.
import { paymentsEnabled, t } from '../store/session'
import { formatKRW, formatTime } from '../messenger-format'
import type { WalletTx } from '../composables/useMessengerWallet'
import LunoIcon from './LunoIcon.vue'

defineProps<{
  points: number
  balance: number
  txs: WalletTx[]
}>()

const emit = defineEmits<{
  charge: []
  send: []
  goShop: []
  goVoom: []
  openSettings: []
}>()
</script>

<template>
  <div class="lx-pane lx-page">
    <div class="lx-pane-head">
      <h2 class="lx-pane-title">{{ t('mvWallet') }}</h2>
    </div>
    <!-- Audit P0-7: direct /wallet links land on an honest preparing
         panel while payments are off (the entry itself is hidden). -->
    <div v-if="!paymentsEnabled" class="lx-scroll">
      <div class="lx-page-body">
        <div class="lx-list-empty lx-empty-illustrated">
          <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="wallet" :size="28" /></span>
          <p>{{ t('mvPaymentsPreparing') }}</p>
        </div>
      </div>
    </div>
    <div v-else class="lx-scroll">
      <div class="lx-page-body lx-wallet">
        <section class="lx-pay-card">
          <div class="lx-pay-top">
            <span>LUNO Pay</span>
            <span>{{ points.toLocaleString() }} P</span>
          </div>
          <div class="lx-pay-balance">₩ {{ balance.toLocaleString() }}</div>
          <div class="lx-pay-actions">
            <button type="button" class="lx-pay-btn" @click="emit('charge')"><LunoIcon name="plus" :size="16" /><span>{{ t('mvCharge') }}</span></button>
            <button type="button" class="lx-pay-btn" @click="emit('send')"><LunoIcon name="send" :size="16" /><span>{{ t('mvSend') }}</span></button>
          </div>
        </section>
        <section class="lx-card">
          <h3 class="lx-page-subtitle">{{ t('lxShortcuts') }}</h3>
          <div class="lx-shortcuts">
            <button type="button" class="lx-more-item" @click="emit('goShop')"><span class="lx-more-icon"><LunoIcon name="shop" :size="22" /></span><span>{{ t('lxStickerShop') }}</span></button>
            <button type="button" class="lx-more-item" @click="emit('goVoom')"><span class="lx-more-icon"><LunoIcon name="voom" :size="22" /></span><span>{{ t('lxVoom') }}</span></button>
            <button type="button" class="lx-more-item" @click="emit('openSettings')"><span class="lx-more-icon"><LunoIcon name="settings" :size="22" /></span><span>{{ t('mvThemeSettings') }}</span></button>
          </div>
        </section>
        <section class="lx-card">
          <h3 class="lx-page-subtitle">{{ t('mvRecentTx') }}</h3>
          <div v-if="!txs.length" class="lx-list-empty lx-empty-illustrated">
            <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="wallet" :size="28" /></span>
            <p>{{ t('lxNoTx') }}</p>
          </div>
          <div v-for="tx in txs.slice(0, 20)" :key="tx.id" class="lx-tx-row">
            <span class="lx-tx-main">
              <strong>{{ tx.title || tx.note || tx.kind || t('mvTxFallback') }}</strong>
              <small>{{ formatTime(tx.created_at) }}</small>
            </span>
            <span class="lx-tx-amount" :class="{ plus: tx.amount > 0 }">{{ (tx.amount > 0 ? '+' : '') + formatKRW(tx.amount) }}</span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
