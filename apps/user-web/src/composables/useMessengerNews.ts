// News tab state (P2 MessengerView split). Owns headlines, hero carousel,
// bookmarks and comments; share-to-chat stays in the view (it drives the
// chat composer). Extracted verbatim from views/MessengerView.vue.
import { computed, onBeforeUnmount, ref } from 'vue'
import { api, currentUser, note, t } from '../store/session'
import type { NewsArticle } from '../../../shared/api'
import { newsCatKoLabel, relTime } from '../messenger-format'

export type NewsComment = { id: string; author: string; text: string; time: string }

export function useMessengerNews() {
  const activeHeroSlideIndex = ref(0)
  const selectedNewsCategory = ref('all')
  const activeNewsArticle = ref<NewsArticle | null>(null)
  const newsBookmarks = ref<Set<string>>(new Set())

  const heroNewsSlides = ref<NewsArticle[]>([])
  const newsIsSample = ref(false)

  // News comes from GET /api/v1/news (editor-published rows, or an honest empty feed).
  async function loadNews() {
    try {
      const res = await api<{ hero: NewsArticle[]; popular: NewsArticle[]; sample?: boolean }>('/api/v1/news')
      const fmt = (a: NewsArticle) => ({ ...a, published_at: relTime(a.published_at) })
      heroNewsSlides.value = (res.hero || []).map(fmt)
      popularNewsList.value = (res.popular || []).map(fmt)
      newsIsSample.value = res.sample !== false
      activeHeroSlideIndex.value = 0
    } catch {
      heroNewsSlides.value = []
      popularNewsList.value = []
    }
  }
  const heroNews = computed(() => heroNewsSlides.value[activeHeroSlideIndex.value] || heroNewsSlides.value[0])

  const popularNewsList = ref<NewsArticle[]>([])

  const filteredPopularNews = computed(() => {
    if (selectedNewsCategory.value === 'bookmark') {
      const all = [...heroNewsSlides.value, ...popularNewsList.value]
      return all.filter(a => newsBookmarks.value.has(a.id))
    }
    if (selectedNewsCategory.value === 'all' || selectedNewsCategory.value === 'popular') {
      return popularNewsList.value
    }
    const filtered = popularNewsList.value.filter(a => a.category === newsCatKoLabel(selectedNewsCategory.value))
    return filtered.length > 0 ? filtered : popularNewsList.value
  })

  function openNewsArticle(article: NewsArticle) {
    activeNewsArticle.value = article
  }

  function toggleNewsBookmark(id: string) {
    if (newsBookmarks.value.has(id)) {
      newsBookmarks.value.delete(id)
    } else {
      newsBookmarks.value.add(id)
    }
  }

  const isHeroHovered = ref(false)
  let heroCarouselTimer: ReturnType<typeof setInterval> | null = null

  function nextHeroSlide() {
    activeHeroSlideIndex.value = (activeHeroSlideIndex.value + 1) % heroNewsSlides.value.length
  }
  function prevHeroSlide() {
    activeHeroSlideIndex.value = (activeHeroSlideIndex.value - 1 + heroNewsSlides.value.length) % heroNewsSlides.value.length
  }
  function startHeroCarousel() {
    if (heroCarouselTimer) clearInterval(heroCarouselTimer)
    heroCarouselTimer = setInterval(() => {
      if (!isHeroHovered.value) {
        nextHeroSlide()
      }
    }, 5000)
  }

  const newsArticleComments = ref<Record<string, Array<NewsComment>>>({})
  const newCommentInput = ref('')

  function addNewsComment(articleId: string) {
    const text = newCommentInput.value.trim()
    if (!text) return
    if (!newsArticleComments.value[articleId]) newsArticleComments.value[articleId] = []
    newsArticleComments.value[articleId].push({
      id: 'c-' + Date.now(),
      author: currentUser.value?.display_name || t('mvMe'),
      text,
      time: t('mvJustNow')
    })
    newCommentInput.value = ''
    note.value = t('mvCommentPosted')
  }

  onBeforeUnmount(() => {
    if (heroCarouselTimer) clearInterval(heroCarouselTimer)
  })

  return {
    activeHeroSlideIndex,
    selectedNewsCategory,
    activeNewsArticle,
    newsBookmarks,
    heroNewsSlides,
    newsIsSample,
    popularNewsList,
    heroNews,
    filteredPopularNews,
    loadNews,
    openNewsArticle,
    toggleNewsBookmark,
    isHeroHovered,
    nextHeroSlide,
    prevHeroSlide,
    startHeroCarousel,
    newsArticleComments,
    newCommentInput,
    addNewsComment,
  }
}
