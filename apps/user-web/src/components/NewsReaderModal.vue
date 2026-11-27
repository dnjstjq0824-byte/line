<script setup lang="ts">
// P2 split: news article reader, extracted verbatim from views/MessengerView.vue.
// The article/comments/bookmark flag are read-only; the draft is a two-way
// model and all actions emit upward. Visibility stays outside.
import { t } from '../store/session'
import type { NewsArticle } from '../../../shared/api'
import type { NewsComment } from '../composables/useMessengerNews'
import { vDialog } from '../directives/dialog'
import LunoIcon from './LunoIcon.vue'

const newComment = defineModel<string>('newComment', { default: '' })

defineProps<{
  article: NewsArticle | null
  bookmarked: boolean
  comments: NewsComment[]
}>()

const emit = defineEmits<{
  close: []
  toggleBookmark: [id: string]
  share: [article: NewsArticle]
  submitComment: [articleId: string]
}>()
</script>

<template>
  <div v-if="article" class="modal-backdrop pc-modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="standard-modal-box pc-modal-card news-reader-modal">
      <div class="news-reader-header">
        <span class="news-reader-press">{{ article.press }}</span>
        <div class="news-reader-actions">
          <button class="btn-news-action" :title="bookmarked ? t('mvBookmarkRemove') : t('mvBookmarkSave')" :aria-label="bookmarked ? t('mvBookmarkRemove') : t('mvBookmarkSave')" @click="emit('toggleBookmark', article.id)">
            {{ bookmarked ? '🔖' : '📑' }}
          </button>
          <button class="btn-news-action" :title="t('mvClose')" :aria-label="t('mvClose')" @click="emit('close')"><LunoIcon name="close" :size="18" /></button>
        </div>
      </div>
      <div class="news-reader-body">
        <img :src="article.image_url" :alt="article.title" class="news-reader-img" />
        <h2 class="news-reader-title">{{ article.title }}</h2>
        <div class="news-reader-meta">
          <span>{{ article.published_at }}</span> · <span>{{ t('mvViewsLabel') }} {{ article.views || t('mvViewsDefault') }}</span>
        </div>
        <div class="news-reader-content">
          <p>{{ article.summary || article.content }}</p>
          <p style="margin-top: 12px; color: var(--ln-muted); font-size: 13px; line-height: 1.6;">{{ t('mvNewsSeedNote') }}</p>
        </div>

        <!-- News Comments Section -->
        <div class="news-comments-box" style="margin-top: 16px; border-top: 1px solid var(--ln-line); padding-top: 12px;">
          <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">{{ t('mvReaderComments').replace('{n}', String(comments.length)) }}</h4>
          <div v-if="comments.length" style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px;">
            <div v-for="c in comments" :key="c.id" style="font-size: 13px; background: var(--ln-subtle); padding: 8px 12px; border-radius: 12px;">
              <b>{{ c.author }}</b> <span style="color: var(--ln-muted); font-size: 11px;">{{ c.time }}</span>
              <p style="margin-top:2px;">{{ c.text }}</p>
            </div>
          </div>
          <div v-else style="font-size: 13px; color: var(--ln-muted); margin-bottom: 8px;">{{ t('mvFirstComment') }}</div>
          <form @submit.prevent="emit('submitComment', article.id)" style="display:flex; gap:6px;">
            <input v-model="newComment" :placeholder="t('mvCommentPh')" :aria-label="t('mvCommentPh')" style="flex: 1; min-width: 0;" />
            <button type="submit" class="btn-primary" :disabled="!newComment.trim()">{{ t('mvSubmit') }}</button>
          </form>
        </div>
      </div>
      <div class="news-reader-footer">
        <button class="btn-share-to-chat" @click="emit('share', article)">{{ t('mvShareToChat') }}</button>
      </div>
    </div>
  </div>
</template>
