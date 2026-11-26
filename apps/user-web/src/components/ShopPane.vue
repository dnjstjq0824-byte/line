<script setup lang="ts">
// P2 split: sticker-shop tab pane, extracted verbatim from views/MessengerView.vue.
// Pure display over the store catalog; no emits.
import { t } from '../store/session'
import type { parseStorePacks } from '../../../shared/shop'
import LunoIcon from './LunoIcon.vue'

defineProps<{
  loading: boolean
  packs: ReturnType<typeof parseStorePacks>
}>()
</script>

<template>
  <div class="lx-pane lx-page">
    <div class="lx-pane-head">
      <h2 class="lx-pane-title">{{ t('shopTitle') }}</h2>
    </div>
    <div class="lx-scroll">
      <div class="lx-page-body">
        <p class="lx-notice">{{ t('shopPayNote') }}</p>
        <p v-if="loading" class="lx-list-empty">{{ t('attachment_loading') }}</p>
        <div v-else-if="!packs.length" class="lx-list-empty lx-empty-illustrated">
          <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="shop" :size="28" /></span>
          <p>{{ t('shopEmpty') }}</p>
        </div>
        <div class="lx-shop-grid">
          <article v-for="pk in packs" :key="pk.id" class="lx-card lx-shop-card">
            <div class="lx-shop-strip">
              <span v-for="(s, i) in pk.stickers.slice(0, 8)" :key="i">{{ s }}</span>
            </div>
            <div class="lx-shop-meta">
              <span class="lx-shop-text">
                <strong>{{ pk.title }}</strong>
                <small v-if="pk.description">{{ pk.description }}</small>
              </span>
              <span v-if="pk.owned" class="lx-shop-tag owned">{{ t('shopOwned') }}</span>
              <span v-else class="lx-shop-tag">{{ pk.priceMinor <= 0 ? t('shopFree') : pk.priceMinor.toLocaleString() + ' ' + pk.currency }}</span>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>
