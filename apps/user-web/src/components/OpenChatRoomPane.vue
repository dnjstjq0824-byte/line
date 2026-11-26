<script setup lang="ts">
// P2 split: openchat room pane, extracted verbatim from views/MessengerView.vue.
// The room/posts are read-only, the draft is a two-way model; close and
// submit emit upward.
import { t } from '../store/session'
import { formatTime } from '../messenger-format'
import type { OpenChatPost } from '../composables/useMessengerSocial'
import LunoIcon from './LunoIcon.vue'

const draft = defineModel<string>('draft', { default: '' })

defineProps<{
  room: { id: string; name: string; description: string } | null
  posts: OpenChatPost[]
}>()

const emit = defineEmits<{
  close: []
  submit: []
}>()
</script>

<template>
  <section v-if="room" class="lx-room">
    <header class="lx-room-head">
      <button type="button" class="lx-icon-btn lx-back" :title="t('mvGoBack')" :aria-label="t('mvGoBack')" @click="emit('close')">
        <LunoIcon name="back" :size="20" />
      </button>
      <span class="lx-avatar s36" style="background: var(--ln-info);"><LunoIcon name="openchat" :size="18" /></span>
      <div class="lx-room-title">
        <div class="lx-room-name">
          <span class="lx-room-name-text">{{ room.name }}</span>
          <span class="badge-verified">{{ t('mvPublicCommunity') }}</span>
        </div>
        <small class="lx-room-state">{{ room.description }}</small>
      </div>
    </header>
    <div class="pc-chat-messages-canvas">
      <p v-if="!posts.length" class="empty-muted" style="margin:auto;">{{ t('mvFirstPost') }}</p>
      <div v-for="post in posts" :key="post.id" class="openchat-post-card">
        <div class="openchat-post-meta">
          <strong>{{ t('mvAnonMember').replace('{id}', post.author_id.slice(0, 6)) }}</strong>
          <small>{{ formatTime(post.created_at) }}</small>
        </div>
        <p class="openchat-post-body">{{ post.body }}</p>
      </div>
    </div>
    <footer class="lx-composer-dock">
      <form class="lx-composer" @submit.prevent="emit('submit')">
        <span class="lx-composer-tools lx-composer-count">{{ draft.length }}/500</span>
        <textarea
          v-model="draft"
          class="lx-composer-input"
          :placeholder="t('mvOpenChatPh')"
          :aria-label="t('mvOpenChatPh')"
          rows="1"
          maxlength="500"
          @keydown.enter.exact.prevent="emit('submit')"
        ></textarea>
        <button class="lx-send btn-green-send" :title="t('mvSubmit')" :aria-label="t('mvSubmit')" :disabled="!draft.trim()">
          <LunoIcon name="send" :size="18" />
          <span class="lx-send-label">{{ t('mvSubmit') }}</span>
        </button>
      </form>
    </footer>
  </section>
</template>
