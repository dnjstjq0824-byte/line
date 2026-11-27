<script setup lang="ts">
// P2 split: Keep vault modal, extracted verbatim from views/MessengerView.vue.
// Filter/search are two-way models (SettingsModal precedent); the item lists
// are read-only and deletion emits upward. Visibility stays outside.
import { currentLocale, t } from '../store/session'
import { RTF_LOCALE } from '../messenger-format'
import type { KeepItem } from '../composables/useMessengerKeep'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

const keepFilter = defineModel<'all' | 'text' | 'image' | 'link'>('keepFilter', { default: 'all' })
const keepSearch = defineModel<string>('keepSearch', { default: '' })

defineProps<{
  keepItems: KeepItem[]
  filteredItems: KeepItem[]
}>()

const emit = defineEmits<{
  close: []
  deleteItem: [item: KeepItem]
}>()
</script>

<template>
  <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box keep-modal">
      <div class="modal-header">
        <h3>{{ t('mvKeepTitle').replace('{n}', String(keepItems.length)) }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')"><LunoIcon name="close" :size="18" /></button>
      </div>
      <div class="keep-filter-bar">
        <button :class="{ active: keepFilter === 'all' }" @click="keepFilter = 'all'">{{ t('tabAll') }}</button>
        <button :class="{ active: keepFilter === 'text' }" @click="keepFilter = 'text'">{{ t('mvKeepText') }}</button>
        <button :class="{ active: keepFilter === 'image' }" @click="keepFilter = 'image'">{{ t('mvKeepMedia') }}</button>
        <button :class="{ active: keepFilter === 'link' }" @click="keepFilter = 'link'">{{ t('mvKeepLink') }}</button>
      </div>
      <input v-model="keepSearch" :placeholder="t('mvKeepSearchPh')" class="keep-search-input" />
      <div class="keep-scroll-content">
        <p v-if="!filteredItems.length" class="empty-muted">{{ t('mvKeepEmpty') }}</p>
        <div v-for="k in filteredItems" :key="k.id || k.message_id" class="keep-item-card">
          <div class="keep-item-header">
            <span class="badge-keep-type">{{ k.kind }}</span>
            <button class="btn-delete-keep" @click="emit('deleteItem', k)">{{ t('mvDeleteItem') }}</button>
          </div>
          <div class="keep-body-text">{{ k.body }}</div>
          <small class="muted">{{ new Date(k.created_at).toLocaleString(RTF_LOCALE[currentLocale] || 'ko-KR') }}</small>
        </div>
      </div>
    </div>
  </div>
</template>
