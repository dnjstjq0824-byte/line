<script setup lang="ts">
// P2 split: VOOM tab pane, extracted verbatim from views/MessengerView.vue.
// Stories/videos are read-only; creation and likes emit upward.
import { t } from '../store/session'
import { initialOf } from '../../../shared/avatar_initial'
import { hideBrokenAvatar } from '../messenger-format'
import type { StoryItem, VoomItem } from '../composables/useMessengerSocial'
import LunoIcon from './LunoIcon.vue'

defineProps<{
  stories: StoryItem[]
  videos: VoomItem[]
}>()

const emit = defineEmits<{
  newStory: []
  like: [id: string]
}>()
</script>

<template>
  <div class="lx-pane lx-page">
    <div class="lx-pane-head">
      <h2 class="lx-pane-title">VOOM</h2>
      <button type="button" class="lx-text-btn" @click="emit('newStory')">
        <LunoIcon name="plus" :size="16" />
        <span>{{ t('mvAddStory') }}</span>
      </button>
    </div>
    <div class="lx-scroll">
      <div class="lx-page-body">
        <div class="lx-stories">
          <button type="button" class="lx-story" @click="emit('newStory')">
            <span class="lx-story-ring add"><LunoIcon name="plus" :size="22" /></span>
            <small>{{ t('mvAddStory') }}</small>
          </button>
          <div v-for="s in stories" :key="s.id" class="lx-story">
            <span class="lx-story-ring" :class="{ viewed: s.viewed }"><span class="lx-avatar s56" :style="{ background: s.bg || 'var(--ln-accent)' }"><span>{{ initialOf(s.author_name, 'L') }}</span><img v-if="s.author?.avatar_url" :src="s.author.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span></span>
            <small>{{ s.author_name || t('navFriends') }}</small>
          </div>
        </div>
        <div v-if="!videos.length" class="lx-page-empty">
          <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="voom" :size="28" /></span>
          <strong>{{ t('lxNoVoom') }}</strong>
          <p>{{ t('lxNoVoomDesc') }}</p>
        </div>
        <div class="lx-voom-grid">
          <article v-for="v in videos" :key="v.id" class="lx-card lx-voom-card">
            <div class="lx-voom-media" :style="{ background: v.media_bg || v.bg || 'var(--ln-subtle)' }">
              <span>{{ v.media_emoji || v.emoji || '🎬' }}</span>
            </div>
            <div class="lx-voom-body">
              <div class="lx-voom-author">
                <span class="lx-avatar s36" style="background: var(--ln-accent)"><span>{{ initialOf(v.author_name || v.author?.display_name, 'L') }}</span><img v-if="v.author?.avatar_url" :src="v.author.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span>
                <strong>{{ v.author_name || v.author?.display_name || 'LUNO' }}</strong>
              </div>
              <p>{{ v.title || v.body }}</p>
              <div class="lx-voom-actions">
                <button type="button" class="lx-pill-btn" :class="{ liked: v.liked }" :aria-pressed="!!v.liked" @click="emit('like', v.id)">
                  <LunoIcon name="heart" :size="15" />
                  <span>{{ v.likes || v.like_count || 0 }}</span>
                </button>
                <small>{{ t('mvCommentCount').replace('{n}', String(v.comments?.length || 0)) }}</small>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>
