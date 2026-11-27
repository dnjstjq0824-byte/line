<script setup lang="ts">
// P2 split: full user profile modal, extracted from views/MessengerView.vue.
// The profile and session user are read-only; file inputs are owned here and
// every action emits upward. Visibility stays outside.
import { nextTick, ref } from 'vue'
import { t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import { hideBrokenAvatar, taglineOf } from '../messenger-format'
import { useProfileEditor } from '../composables/useProfileEditor'
import LunoIcon from './LunoIcon.vue'
import type { User } from '../../../shared/api'

defineProps<{
  user: User | null
  currentUser: User | null
  photoSaving: boolean
  photoError: string
}>()

const emit = defineEmits<{
  close: []
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
const showEditor = ref(false)

const {
  editProfileName,
  editProfileBio,
  editProfileHandle,
  profileSaving,
  profileSaveError,
  profileSaved,
  profileDirty,
  saveProfileSettings,
} = useProfileEditor()

const editorForm = ref<HTMLFormElement | null>(null)
const editorNameInput = ref<HTMLInputElement | null>(null)
async function toggleProfileEditor() {
  showEditor.value = !showEditor.value
  if (showEditor.value) {
    await nextTick()
    editorForm.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    editorNameInput.value?.focus({ preventScroll: true })
  }
}
</script>

<template>
  <div v-if="user" class="modal-backdrop" @click.self="emit('close')">
    <div class="profile-modal-card ln-profile-sheet" role="dialog" aria-modal="true" :aria-label="t('profileTitle')">
      <div
        class="profile-cover-header ln-profile-cover"
        data-testid="profile-cover"
        :style="(user as any).cover_url
          ? { backgroundImage: `url(${(user as any).cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: `linear-gradient(135deg, ${user.avatar_color || '#06C755'} 0%, #047E37 100%)` }"
      >
        <button class="ln-cover-close" @click="emit('close')" :aria-label="t('mvClose')">
          <LunoIcon name="close" :size="18" />
        </button>
      </div>

      <div class="ln-profile-scroll">
        <div class="profile-avatar-center ln-profile-avatar-wrap">
          <div class="avatar-circle xl ln-profile-avatar" :style="{ background: user.avatar_color || 'var(--ln-accent)' }">
            <span>{{ initialOf(user.display_name) }}</span>
            <img v-if="user.avatar_url" :src="user.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" />
          </div>
        </div>

        <div class="profile-body-center ln-profile-identity">
          <h2>
            {{ user.display_name }}
            <span v-if="(user as any).kind === 'bot'" class="badge-bot">BOT</span>
          </h2>
          <div v-if="user.handle" class="user-handle">@{{ user.handle }}</div>
          <p class="user-status-text">{{ taglineOf(user) || t('profile_empty') }}</p>
          <p v-if="user.id === currentUser?.id && currentUser?.email" class="ln-profile-email">{{ currentUser?.email }}</p>
        </div>

        <!-- Primary action bar (LINE style) -->
        <div v-if="user.id === currentUser?.id" class="profile-actions-footer ln-profile-actions">
          <button type="button" class="ln-profile-action-btn" :class="{ active: showEditor }" @click="toggleProfileEditor">
            <span class="ln-action-circle"><LunoIcon name="edit" :size="18" /></span>
            <span>{{ t('profileEdit') }}</span>
          </button>
          <button type="button" class="ln-profile-action-btn" @click="emit('openPassword')">
            <span class="ln-action-circle"><LunoIcon name="key" :size="18" /></span>
            <span>{{ t('profile_account') }}</span>
          </button>
        </div>

        <div v-else class="profile-actions-footer ln-profile-actions">
          <button type="button" class="ln-profile-action-btn" @click="emit('directChat', user)">
            <span class="ln-action-circle is-primary"><LunoIcon name="chats" :size="18" /></span>
            <span>{{ t('profileChat') }}</span>
          </button>
          <button type="button" class="ln-profile-action-btn" @click="emit('voiceCall', user)">
            <span class="ln-action-circle"><LunoIcon name="call-voice" :size="18" /></span>
            <span>{{ t('profileVoice') }}</span>
          </button>
          <button type="button" class="ln-profile-action-btn" @click="emit('videoCall', user)">
            <span class="ln-action-circle"><LunoIcon name="call-video" :size="18" /></span>
            <span>{{ t('profileVideo') }}</span>
          </button>
          <button type="button" class="ln-profile-action-btn" @click="emit('sendMoney', user)">
            <span class="ln-action-circle"><LunoIcon name="money" :size="18" /></span>
            <span>{{ t('mvSendShort') }}</span>
          </button>
        </div>

        <!-- Collapsible self profile editor + photo/cover manager -->
        <template v-if="user.id === currentUser?.id && showEditor">
          <div class="profile-photo-controls ln-photo-bar" :aria-busy="photoSaving">
            <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="file-input-hidden" tabindex="-1" aria-hidden="true" @change="emit('photoChange', $event)" />
            <input ref="coverInput" type="file" accept="image/jpeg,image/png,image/webp" class="file-input-hidden" tabindex="-1" aria-hidden="true" @change="emit('coverChange', $event)" />
            <div class="ln-photo-btn-grid">
              <button type="button" class="btn-secondary" :disabled="photoSaving" @click="photoInput?.click()">
                {{ photoSaving ? t('profile_saving') : t('profile_photo_change') }}
              </button>
              <button type="button" class="btn-secondary" :disabled="photoSaving" @click="coverInput?.click()">
                {{ photoSaving ? t('profile_saving') : t('profile_cover_change') }}
              </button>
              <button v-if="currentUser?.avatar_url" type="button" class="btn-secondary" :disabled="photoSaving" @click="emit('photoRemove')">
                {{ t('profile_photo_remove') }}
              </button>
              <button v-if="(currentUser as any)?.cover_url" type="button" class="btn-secondary" :disabled="photoSaving" @click="emit('coverRemove')">
                {{ t('profile_cover_remove') }}
              </button>
            </div>
            <small class="ln-photo-hint">{{ t('profile_photo_hint') }}</small>
            <p v-if="photoError" role="alert" class="ln-profile-error">{{ photoError }}</p>
          </div>

          <form
            ref="editorForm"
            class="setting-group ln-profile-editor"
            :aria-busy="profileSaving"
            @submit.prevent="saveProfileSettings"
            @input="profileSaved = false; profileSaveError = ''"
          >
            <div class="ln-section-heading">
              <strong>{{ t('profileEdit') }}</strong>
              <span>{{ t('profile_details') }}</span>
            </div>
            <div class="ln-profile-fields">
              <label for="profile-name">
                {{ t('profile_name_label') }}
                <input id="profile-name" ref="editorNameInput" v-model="editProfileName" autocomplete="name" required :disabled="profileSaving" />
              </label>
              <label for="profile-handle">
                LUNO ID
                <input id="profile-handle" v-model="editProfileHandle" autocomplete="off" autocapitalize="none" spellcheck="false" :disabled="profileSaving" />
              </label>
              <label for="profile-bio" class="ln-profile-bio">
                {{ t('profile_bio_label') }}
                <textarea id="profile-bio" v-model="editProfileBio" rows="3" :disabled="profileSaving" />
              </label>
            </div>
            <p v-if="profileSaveError" class="ln-profile-error" role="alert">{{ profileSaveError }}</p>
            <div class="ln-profile-save">
              <span role="status">{{ profileSaved ? t('profile_saved') : '' }}</span>
              <button type="submit" class="btn-primary" :disabled="profileSaving || !profileDirty || !editProfileName.trim()">
                {{ profileSaving ? t('profile_saving') : t('profile_save') }}
              </button>
            </div>
          </form>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ln-profile-sheet {
  width: min(440px, 94vw);
  max-height: 88vh;
  background: var(--ln-surface);
  color: var(--ln-text);
  border-radius: 22px;
  border: 1px solid var(--ln-line);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ln-profile-cover {
  height: 132px;
  position: relative;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 12px;
  flex-shrink: 0;
}
.ln-cover-close {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 0;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(8px);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.14s ease;
}
.ln-cover-close:hover { background: rgba(0, 0, 0, 0.62); }
.ln-profile-scroll {
  overflow-y: auto;
  padding: 0 20px 22px;
}
.ln-profile-avatar-wrap {
  display: flex;
  justify-content: center;
  margin-top: -46px;
  position: relative;
  z-index: 2;
}
.ln-profile-avatar {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  border: 4px solid var(--ln-surface);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 800;
  color: #ffffff;
}
.ln-profile-identity {
  text-align: center;
  margin-top: 10px;
}
.ln-profile-identity h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--ln-text);
}
.ln-profile-identity .user-handle {
  margin-top: 4px;
  font-size: 13px;
  color: var(--ln-accent);
  font-weight: 600;
}
.ln-profile-identity .user-status-text {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--ln-text);
  line-height: 1.45;
}
.ln-profile-email {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ln-muted);
}
.ln-profile-actions {
  display: flex;
  justify-content: center;
  gap: 18px;
  margin: 18px 0 4px;
  padding: 14px 0 4px;
  border-top: 1px solid var(--ln-line);
}
.ln-profile-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 64px;
  padding: 4px 6px;
  border: 0;
  background: none;
  color: var(--ln-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.ln-action-circle {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--ln-bg);
  border: 1px solid var(--ln-line);
  color: var(--ln-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}
.ln-profile-action-btn:hover .ln-action-circle {
  background: var(--ln-accent-soft);
  color: var(--ln-accent);
  border-color: color-mix(in srgb, var(--ln-accent) 30%, transparent);
}
.ln-profile-action-btn.active .ln-action-circle,
.ln-action-circle.is-primary {
  background: var(--ln-accent);
  color: var(--ln-on-accent, #ffffff);
  border-color: transparent;
}
.ln-photo-bar {
  margin-top: 14px;
  padding: 12px;
  border-radius: 14px;
  background: var(--ln-bg);
  border: 1px solid var(--ln-line);
}
.ln-photo-btn-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ln-photo-btn-grid button {
  flex: 1 1 130px;
  font-size: 12.5px;
  padding: 7px 10px;
  border-radius: 10px;
}
.ln-photo-hint {
  display: block;
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--ln-muted);
}
.ln-profile-editor {
  margin-top: 12px;
}
</style>
