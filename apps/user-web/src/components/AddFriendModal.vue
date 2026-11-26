<script setup lang="ts">
// P2 split: add-friend modal, extracted verbatim from views/MessengerView.vue.
// The handle draft is a two-way model; search results are read-only and all
// actions emit upward. Visibility stays outside.
import { t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import { hideBrokenAvatar } from '../messenger-format'
import type { User } from '../../../shared/api'

const handleInput = defineModel<string>('handleInput', { default: '' })

defineProps<{
  results: User[]
  searched: boolean
}>()

const emit = defineEmits<{
  close: []
  search: []
  addByHandle: []
  addById: [id: string]
}>()
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box add-friend-modal">
      <div class="modal-header">
        <h3>➕ {{ t('mvAddFriend') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="modal-body-form">
        <p class="modal-subtext">{{ t('mvAddFriendDesc') }}</p>
        <label>{{ t('mvIdSearchLabel') }}</label>
        <div class="flex-row">
          <input v-model="handleInput" :placeholder="t('mvIdSearchPh')" @keydown.enter.prevent="emit('search')" />
          <button class="btn-secondary" @click="emit('search')">{{ t('mvSearch') }}</button>
          <button class="btn-primary" @click="emit('addByHandle')">{{ t('mvAdd') }}</button>
        </div>
        <div v-if="searched && results.length > 0" class="select-friends-scroll" style="max-height: 180px; margin-top: 10px;">
          <div
            v-for="u in results"
            :key="'add-' + u.id"
            class="quick-pick-friend-row"
            @click="emit('addById', u.id)"
          >
            <span class="lx-avatar s36" :style="{ background: u.avatar_color || 'var(--ln-accent)' }">
              <span>{{ initialOf(u.display_name, '?') }}</span><img v-if="(u as any).avatar_url" :src="(u as any).avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" />
            </span>
            <div class="friend-pick-meta">
              <strong>{{ u.display_name }}</strong>
              <small>{{ u.handle ? '@' + u.handle : '' }}</small>
            </div>
            <button class="btn-mini-chat">{{ t('mvAdd') }}</button>
          </div>
        </div>
        <div class="add-friend-quick-options">
          <div class="quick-opt-item">
            <span class="icon">📱</span>
            <div>
              <strong>{{ t('mvAddByQr') }}</strong>
              <small>{{ t('mvAddByQrDesc') }}</small>
            </div>
          </div>
          <div class="quick-opt-item">
            <span class="icon">🔗</span>
            <div>
              <strong>{{ t('mvInviteLink') }}</strong>
              <small>{{ t('mvInviteLinkDesc') }}</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
