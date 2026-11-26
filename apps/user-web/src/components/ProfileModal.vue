<script setup lang="ts">
// P2 split: full user profile modal, extracted verbatim from views/MessengerView.vue.
// The profile and session user are read-only; file inputs are owned here and
// every action emits upward. Visibility stays outside.
import { ref } from 'vue'
import { t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import { hideBrokenAvatar, taglineOf } from '../messenger-format'
import type { User } from '../../../shared/api'

defineProps<{
  user: User | null
  currentUser: User | null
  photoSaving: boolean
  photoError: string
}>()

const emit = defineEmits<{
  close: []
  openSettings: []
  openPassword: []
  directChat: [user: User]
  voiceCall: [user: User]
  videoCall: [user: User]
  sendMoney: [user: User]
  photoChange: [event: Event]
  photoRemove: []
  coverChange: [event: Event]
  coverRemove: []
}>()

const photoInput = ref<HTMLInputElement | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)
</script>

<template>
  <div v-if="user" class="modal-backdrop" @click.self="emit('close')">
    <div class="profile-modal-card" role="dialog" aria-modal="true" :aria-label="t('profileTitle')">
      <div class="profile-cover-header" data-testid="profile-cover" :style="(user as any).cover_url ? { backgroundImage: `url(${(user as any).cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: user.avatar_color || 'var(--ln-accent)' }">
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="profile-avatar-center">
        <div class="avatar-circle xl"><span>{{ initialOf(user.display_name) }}</span><img v-if="user.avatar_url" :src="user.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></div>
      </div>
      <div v-if="user.id === currentUser?.id" class="profile-photo-controls" :aria-busy="photoSaving">
        <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="file-input-hidden" tabindex="-1" aria-hidden="true" @change="emit('photoChange', $event)" />
        <button class="btn-secondary" :disabled="photoSaving" @click="photoInput?.click()">{{ photoSaving ? t('profile_saving') : t('profile_photo_change') }}</button>
        <button v-if="currentUser?.avatar_url" class="btn-secondary" :disabled="photoSaving" @click="emit('photoRemove')">{{ t('profile_photo_remove') }}</button>
        <input ref="coverInput" type="file" accept="image/jpeg,image/png,image/webp" class="file-input-hidden" tabindex="-1" aria-hidden="true" @change="emit('coverChange', $event)" />
        <button class="btn-secondary" :disabled="photoSaving" @click="coverInput?.click()">{{ photoSaving ? t('profile_saving') : t('profile_cover_change') }}</button>
        <button v-if="(currentUser as any)?.cover_url" class="btn-secondary" :disabled="photoSaving" @click="emit('coverRemove')">{{ t('profile_cover_remove') }}</button>
        <small>{{ t('profile_photo_hint') }}</small>
        <p v-if="photoError" role="alert" class="ln-profile-error">{{ photoError }}</p>
      </div>
      <div class="profile-body-center">
        <h2>{{ user.display_name }} <span v-if="(user as any).kind === 'bot'" class="badge-bot">BOT</span></h2>
        <div v-if="user.handle" class="user-handle">@{{ user.handle }}</div>
        <p class="user-status-text">{{ taglineOf(user) || t('profile_empty') }}</p>
        <p v-if="user.id === currentUser?.id && currentUser?.email" class="user-handle">{{ currentUser?.email }}</p>
      </div>
      <div v-if="user.id === currentUser?.id" class="profile-actions-footer">
        <button class="btn-profile-action" @click="emit('openSettings')">{{ t('profileEdit') }}</button>
        <button class="btn-profile-action" @click="emit('openPassword')">{{ t('profile_account') }}</button>
      </div>
      <div v-else class="profile-actions-footer">
        <button class="btn-profile-action" @click="emit('directChat', user)">
          {{ t('profileChat') }}
        </button>
        <button class="btn-profile-action" @click="emit('voiceCall', user)">
          {{ t('profileVoice') }}
        </button>
        <button class="btn-profile-action" @click="emit('videoCall', user)">
          {{ t('profileVideo') }}
        </button>
        <button class="btn-profile-action" @click="emit('sendMoney', user)">{{ t('mvSendShort') }}</button>
      </div>
    </div>
  </div>
</template>
