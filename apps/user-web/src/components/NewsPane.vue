<script setup lang="ts">
// P2 split: news tab pane, extracted verbatim from views/MessengerView.vue.
// Category/slide/hover are two-way models; lists are read-only and article
// actions emit upward.
import { t } from '../store/session'
import { NEWS_CATEGORY_IDS, newsCatLabel } from '../messenger-format'
import type { NewsArticle } from '../../../shared/api'
import LunoIcon from './LunoIcon.vue'

const category = defineModel<string>('category', { default: 'all' })
const slideIndex = defineModel<number>('slideIndex', { default: 0 })
const hovered = defineModel<boolean>('hovered', { default: false })

defineProps<{
  hero: NewsArticle | undefined
  slides: NewsArticle[]
  popular: NewsArticle[]
  filtered: NewsArticle[]
  isSample: boolean
}>()

const emit = defineEmits<{
  openArticle: [article: NewsArticle]
  prevSlide: []
  nextSlide: []
}>()
</script>

<template>
  <div class="lx-pane lx-page">
    <div class="lx-pane-head">
      <h2 class="lx-pane-title">{{ t('mvNews') }}</h2>
    </div>
    <div class="lx-chips">
      <button
        v-for="cat in NEWS_CATEGORY_IDS"
        :key="cat"
        type="button"
        class="lx-chip"
        :class="{ active: category === cat }"
        @click="category = cat"
      >
        {{ newsCatLabel(cat) }}
      </button>
    </div>
    <div class="lx-scroll">
      <div class="lx-page-body">
        <p v-if="isSample" class="lx-notice">{{ t('mvNewsSampleBanner') }}</p>
        <div class="lx-news-layout">
          <article
            v-if="hero"
            class="lx-news-hero"
            role="button"
            tabindex="0"
            @click="emit('openArticle', hero)"
            @keydown.enter="emit('openArticle', hero)"
            @keydown.space.prevent="emit('openArticle', hero)"
            @mouseenter="hovered = true"
            @mouseleave="hovered = false"
          >
            <div class="lx-news-hero-media">
              <img :src="hero.image_url" alt="" />
              <span class="lx-news-hero-count">{{ slideIndex + 1 }} / {{ slides.length }}</span>
              <button type="button" class="lx-news-hero-nav prev" :title="t('mvPrevArticle')" :aria-label="t('mvPrevArticle')" @click.stop="emit('prevSlide')"><LunoIcon name="back" :size="18" /></button>
              <button type="button" class="lx-news-hero-nav next" :title="t('mvNextArticle')" :aria-label="t('mvNextArticle')" @click.stop="emit('nextSlide')"><LunoIcon name="chevron-right" :size="18" /></button>
            </div>
            <div class="lx-news-hero-text">
              <h3>{{ hero.title }}</h3>
              <small>{{ hero.press }} · {{ hero.published_at }}</small>
            </div>
            <div class="lx-news-dots" @click.stop>
              <button
                v-for="(slide, idx) in slides"
                :key="slide.id"
                type="button"
                class="lx-news-dot"
                :class="{ active: slideIndex === idx }"
                :aria-label="t('mvSlide').replace('{n}', String(idx + 1))"
                @click.stop="slideIndex = idx"
              ></button>
            </div>
          </article>

          <section class="lx-news-list">
            <h3 class="lx-page-subtitle">{{ t('mvTodayPopular') }}</h3>
            <div v-if="!filtered.length" class="lx-list-empty lx-empty-illustrated">
              <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="news" :size="28" /></span>
              <p>{{ slides.length || popular.length ? t('lxNoNews') : t('lxNoNewsYet') }}</p>
            </div>
            <button
              v-for="article in filtered"
              :key="article.id"
              type="button"
              class="lx-news-item"
              @click="emit('openArticle', article)"
            >
              <span class="lx-news-rank">{{ article.rank }}</span>
              <span class="lx-news-item-text">
                <strong>{{ article.title }}</strong>
                <small>{{ article.press }} · {{ article.published_at }}</small>
              </span>
              <img :src="article.image_url" alt="" class="lx-news-thumb" />
            </button>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
