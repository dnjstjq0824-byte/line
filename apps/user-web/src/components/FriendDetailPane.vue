<script setup lang="ts">
// P2 split: friend detail preview pane, extracted verbatim from views/MessengerView.vue.
// The profile is read-only; chat/call/send/favorite emit upward.
import { paymentsEnabled, t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import { taglineOf } from '../messenger-format'
import type { User } from '../../../shared/api'
import LunoIcon from './LunoIcon.vue'

defineProps<{
  profile: User | null
}>()

const emit = defineEmits<{
  close: []
  startChat: [friend: User]
  voiceCall: [friend: User]
  videoCall: [friend: User]
  sendMoney: [friend: User]
  toggleFavorite: [friend: User]
}>()
</script>

<template>
  <section v-if="profile" class="lx-detail">
    <button type="button" class="lx-icon-btn lx-back lx-detail-back" :title="t('mvGoBack')" :aria-label="t('mvGoBack')" @click="emit('close')">
      <LunoIcon name="back" :size="20" />
    </button>
    <div class="pc-profile-preview-card">
      <div class="profile-preview-avatar" :style="{ background: profile.avatar_color || 'var(--ln-accent)' }">
        {{ initialOf(profile.display_name) }}
      </div>
      <h2 class="profile-preview-name">{{ profile.display_name }} <span v-if="(profile as any).kind === 'bot'" class="badge-bot">BOT</span></h2>
      <p v-if="taglineOf(profile)" class="profile-preview-bio">
        {{ taglineOf(profile) }}
      </p>
      <div class="profile-preview-actions">
        <!-- Large Prominent Start Chat Button (Matching Screenshot 5) -->
        <button class="btn-start-chat-large" @click="emit('startChat', profile)">
          {{ t('startChatBtn') }}
        </button>
        <div class="profile-preview-subactions">
          <button type="button" class="btn-subaction-pill" :title="t('mvVoiceCall')" @click="emit('voiceCall', profile)">
            <LunoIcon name="call-voice" :size="16" />
            <span>{{ t('mvVoiceCall') }}</span>
          </button>
          <button type="button" class="btn-subaction-pill" :title="t('mvVideoCallLabel')" @click="emit('videoCall', profile)">
            <LunoIcon name="call-video" :size="16" />
            <span>{{ t('mvVideoCallLabel') }}</span>
          </button>
          <button v-if="paymentsEnabled" type="button" class="btn-subaction-pill" :title="t('mvSendMoney')" @click="emit('sendMoney', profile)">
            <LunoIcon name="money" :size="16" />
            <span>{{ t('mvSendMoney') }}</span>
          </button>
          <button type="button" class="btn-subaction-pill" :title="t('mvFavTitle')" @click="emit('toggleFavorite', profile)">
            <span>{{ (profile as any).is_favorite ? t('mvFaved') : t('mvFav') }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
