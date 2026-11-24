<script setup lang="ts">
import lunoMark from '../../../shared/brand/luno-logo-appicon.svg'
import LunoIcon from '../components/LunoIcon.vue'
import MessageAttachment from '../components/MessageAttachment.vue'
import LunoContextMenu, { type ContextMenuItem } from '../components/LunoContextMenu.vue'
import CallModal from '../components/CallModal.vue'
import GroupCallModal from '../components/GroupCallModal.vue'
import ChatList from '../components/ChatList.vue'
import FriendPanel from '../components/FriendPanel.vue'
import MessagePane from '../components/MessagePane.vue'
import SettingsModal from '../components/SettingsModal.vue'
import ApprovalBox from '../components/ApprovalBox.vue'
import GroupSettingsModal from '../components/GroupSettingsModal.vue'
import { LUNO_STICKERS, type LunoSticker } from '../luno-stickers'
import { imageStickerChar } from '../../../shared/sticker_catalog'
import { parseStorePacks } from '../../../shared/shop'
import { findDirectChatId } from '../../../shared/direct_chat'
import { makeFriendQrSvg } from '../../../shared/friend_qr'
import { listRowTime } from '../../../shared/list_time'
import { initialOf } from '../../../shared/avatar_initial'
import { playSendSound } from '../sound-effects'
import { syncWebPushSubscription } from '../web_notify'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  activeTheme,
  api,
  appVersion,
  currentLocale,
  currentUser,
  darkMode,
  error,
  fetchAppVersion,
  isDarkMode,
  note,
  paymentsEnabled,
  ensureSession,
  readStoredDeviceId,
  setLocale,
  t,
  toggleDarkMode,
  token,
  wrap,
} from '../store/session'
import { NAV_PATHS } from '../router'
import {
  SUPPORTED_LOCALES,
  UI_DICTIONARY,
  formatLocalizedTime,
  type LunoLocale
} from '../luno-i18n'
import {
  API_URL,
  request,
  ApiError,
  newClientID,
  type Chat,
  type Message,
  type User,
} from '../../../shared/api'
import {
  queueOfflineMessage
} from '../messenger-utils'
import { useChatSocket } from '../composables/useChatSocket'
import { getE2ee, resetE2ee } from '../e2ee/client'
import { useAuth } from '../composables/useAuth'
import { useWebRTC, type CallRecord, type WebRTCDeps } from '../composables/useWebRTC'
import { useGroupCall } from '../composables/useGroupCall'

// --- LUNO Multilingual & Accessibility & Theme State ---


// --- AI Translation State ---
const autoTranslateEnabled = ref(false)
const targetTranslateLang = ref<LunoLocale>('en')
const messageTranslations = ref<Record<string, {
  translated: string;
  sourceLang: string;
  engine: string;
  loading?: boolean;
  error?: string;
}>>({})
// T1: translation engine state from GET /api/v1/translate/languages.
const translateConfigured = ref(false)
// F8: link preview toggle from GET /api/v1/me/settings (default on).
const linkPreviewsEnabled = ref(true)
async function ensureLinkPreviewPref() {
  try {
    const prefs = await api<Record<string, unknown>>('/api/v1/me/settings', 'GET')
    linkPreviewsEnabled.value = prefs.link_previews !== false
  } catch {
    linkPreviewsEnabled.value = true
  }
}
const translateLanguages = ref<string[]>([])
let translateLangsLoaded = false
async function ensureTranslateLanguages() {
  if (translateLangsLoaded) return
  translateLangsLoaded = true
  try {
    const res = await api<{ configured: boolean; languages: string[] }>('/api/v1/translate/languages', 'GET')
    if (res.configured && Array.isArray(res.languages) && res.languages.length > 0) {
      translateLanguages.value = res.languages
      translateConfigured.value = true
      if (!res.languages.includes(targetTranslateLang.value)) {
        targetTranslateLang.value = res.languages[0] as LunoLocale
      }
    }
  } catch {
    translateConfigured.value = false
  }
}

async function handleTranslateMessage(msg: Message) {
  if (messageTranslations.value[msg.id]?.translated && !messageTranslations.value[msg.id]?.error) {
    delete messageTranslations.value[msg.id]
    return
  }
  // E8: sealed text leaves the device only on an explicit per-tap notice.
  if (msg._e2ee && !window.confirm(t('mvE2eeAiNotice'))) return
  await ensureTranslateLanguages()
  if (!translateConfigured.value) {
    messageTranslations.value[msg.id] = {
      translated: '',
      sourceLang: 'auto',
      engine: 'luno-ai',
      loading: false,
      error: t('mvTranslatePending')
    }
    return
  }
  messageTranslations.value[msg.id] = {
    translated: '',
    sourceLang: 'auto',
    engine: 'luno-ai',
    loading: true
  }
  try {
    const res = await api<{ translated: string; source_lang: string; target_lang: string; engine: string }>(
      '/api/v1/translate', 'POST', { text: msg.body, target_lang: targetTranslateLang.value })
    messageTranslations.value[msg.id] = {
      translated: res.translated,
      sourceLang: res.source_lang,
      engine: res.engine,
      loading: false
    }
  } catch (e) {
    messageTranslations.value[msg.id] = {
      translated: '',
      sourceLang: 'auto',
      engine: 'luno-ai',
      loading: false,
      error: e instanceof ApiError && e.status === 503 ? t('mvTranslatePending') : t('mvTranslateFailed')
    }
  }
}


// --- Auth & Session State ---
const basePath = import.meta.env.BASE_URL

// --- Navigation Tabs (Open Messenger 14 Global Nav Rail) ---
export type NavItem =
  | 'home'
  | 'chats'
  | 'news'
  | 'calls'
  | 'voom'
  | 'openchat'
  | 'wallet'
  | 'shop'
  | 'add-friends'
  | 'open-search'
  | 'open-mail'
  | 'open-apps'
  | 'open-video'
  | 'open-stream'
  | 'open-ai'
  | 'open-services'

const activeNav = ref<NavItem>('chats')

// --- LUNO Mobile 4-Tab & PC Workstation State (PO Master Directive) ---
const selectedFriendProfile = ref<User | null>(null)
const friendSearchQuery = ref('')
const chatWallpaper = ref<'skyblue' | 'slate' | 'mint' | 'dark'>('skyblue')
const messagesCanvasRef = ref<HTMLElement | null>(null)
const callFilter = ref<'all' | 'missed'>('all')
const activeHeroSlideIndex = ref(0)
// --- Shell navigation: four primary destinations + a named "More" panel ---
const showMorePanel = ref(false)
const PRIMARY_NAV: { nav: NavItem; icon: string; label: string }[] = [
  { nav: 'home', icon: 'friends', label: 'navFriends' },
  { nav: 'chats', icon: 'chats', label: 'navChats' },
  { nav: 'calls', icon: 'calls', label: 'lxCalls' },
  { nav: 'news', icon: 'news', label: 'lxNews' },
]
const MORE_NAVS: NavItem[] = ['wallet', 'shop', 'voom', 'openchat']
// Content tabs are whole pages: no list/detail split, so they use both columns.
const PAGE_NAVS: NavItem[] = ['news', 'wallet', 'voom', 'shop']
// Status line for a person; accounts made before the server stopped filling
// a placeholder bio still carry "New Messenger User", which is shown as empty.
function taglineOf(u: { status_message?: string; bio?: string } | null | undefined): string {
  if (!u) return ''
  const bio = u.bio && u.bio !== 'New Messenger User' ? u.bio : ''
  return u.status_message || bio
}
// The main pane's empty state names what the list on its left is for.
const emptyMain = computed(() => {
  if (activeNav.value === 'home') return { icon: 'friends', title: t('lxPickFriend'), desc: t('lxPickFriendDesc') }
  if (activeNav.value === 'openchat') return { icon: 'openchat', title: t('lxPickOpenChat'), desc: t('lxPickOpenChatDesc') }
  return null
})
const MORE_ITEMS: { id: string; icon: string; label: string; nav?: NavItem }[] = [
  { id: 'wallet', icon: 'wallet', label: 'mvWallet', nav: 'wallet' },
  { id: 'shop', icon: 'shop', label: 'lxStickerShop', nav: 'shop' },
  { id: 'voom', icon: 'voom', label: 'lxVoom', nav: 'voom' },
  { id: 'openchat', icon: 'openchat', label: 'navOpenChat', nav: 'openchat' },
  { id: 'keep', icon: 'keep', label: 'navKeep' },
  { id: 'add-friend', icon: 'add-friends', label: 'mvAddFriend' },
  { id: 'qr', icon: 'scan', label: 'lxMyQr' },
  { id: 'capture', icon: 'camera', label: 'lxCapture' },
  { id: 'download', icon: 'download', label: 'lxGetApp' },
  { id: 'settings', icon: 'settings', label: 'navSettings' },
]
// Audit P0-7: launch is 100% free — the wallet entry hides until the
// server reports payments_enabled (Stage 3 re-enables it).
const visibleMoreItems = computed(() =>
  paymentsEnabled.value ? MORE_ITEMS : MORE_ITEMS.filter(entry => entry.id !== 'wallet'))
function runMoreItem(id: string) {
  showMorePanel.value = false
  const item = MORE_ITEMS.find(entry => entry.id === id)
  if (item?.nav) return switchNav(item.nav)
  if (id === 'keep') showKeepModal.value = true
  else if (id === 'add-friend') showAddFriendModal.value = true
  else if (id === 'qr') showQrModal.value = true
  else if (id === 'capture') void captureScreenToChat()
  else if (id === 'download') window.open('./download.html', '_blank', 'noopener')
  else if (id === 'settings') showSettingsModal.value = true
}
// Operator consoles are tools for staff, not part of the messenger: only an
// admin account sees the links.
const consoleLinks = computed(() => currentUser.value?.role === 'admin'
  ? [
      { href: './admin/', label: 'mvConsoleAdmin' },
      { href: './partner/', label: 'mvConsolePartner' },
      { href: './developer/', label: 'mvConsoleDev' },
      { href: './creator/', label: 'mvConsoleCreator' },
      { href: './ads/', label: 'mvConsoleAds' },
    ]
  : [])
// Phone widths show one pane at a time: the list, or whatever was opened.
const mobileDetailOpen = computed(() => !!selectedChat.value || !!selectedFriendProfile.value
  || (activeNav.value === 'openchat' && !!selectedOpenChatRoom.value)
  || (activeNav.value === 'calls' && !!selectedCallRecord.value))
const chatSortAsc = ref(false)
const showNewChatModal = ref(false)
const showNewCallModal = ref(false)
const notificationsEnabled = ref(true)

// --- News Tab State (Section 10 & Screenshot 5) ---
export interface NewsArticle {
  id: string
  title: string
  press: string
  category: string
  published_at: string
  image_url: string
  summary: string
  content: string
  rank?: number
  views?: string
}

const showQrModal = ref(false)
const myQrSvg = computed(() => makeFriendQrSvg(currentUser.value?.handle || ''))

// News categories use stable IDs; labels resolve via t().
const NEWS_CATEGORY_IDS = ['all', 'popular', 'economy', 'science', 'global', 'ent', 'bookmark']
const NEWS_CAT_KEY: Record<string, string> = { all: 'mvNewsCatAll', popular: 'mvNewsCatPopular', economy: 'mvNewsCatEconomy', science: 'mvNewsCatScience', global: 'mvNewsCatGlobal', ent: 'mvNewsCatEnt', bookmark: 'mvNewsCatBookmark' }
function newsCatLabel(id: string): string { return t(NEWS_CAT_KEY[id] || 'mvNewsCatAll') }
function newsCatKoLabel(id: string): string { return UI_DICTIONARY.ko[NEWS_CAT_KEY[id] || 'mvNewsCatAll'] || id }
const selectedNewsCategory = ref('all')
const activeNewsArticle = ref<NewsArticle | null>(null)
const newsBookmarks = ref<Set<string>>(new Set())

const heroNewsSlides = ref<NewsArticle[]>([])
const newsIsSample = ref(false)

// BCP-47 tags for locale-aware Intl formatting (follows formatLocalizedTime precedent).
const RTF_LOCALE: Record<LunoLocale, string> = { ko: 'ko-KR', en: 'en-US', th: 'th-TH', ja: 'ja-JP' }
function formatKRW(amount: number): string {
  try {
    return new Intl.NumberFormat(RTF_LOCALE[currentLocale.value] || 'ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount)
  } catch { return amount.toLocaleString() }
}
function relTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  const min = Math.max(1, Math.round(ms / 60000))
  const rtf = new Intl.RelativeTimeFormat(RTF_LOCALE[currentLocale.value] || 'ko-KR', { numeric: 'always' })
  if (min < 60) return rtf.format(-min, 'minute')
  if (min < 60 * 24) return rtf.format(-Math.round(min / 60), 'hour')
  return rtf.format(-Math.round(min / 1440), 'day')
}

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

const filteredCallHistory = computed(() => {
  if (callFilter.value === 'missed') {
    return callHistoryList.value.filter(c => c.direction === 'missed')
  }
  return callHistoryList.value
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

function shareNewsToChat(article: NewsArticle) {
  activeNewsArticle.value = null
  activeNav.value = 'chats'
  const shareText = t('mvNewsShare').replace('{title}', article.title).replace('{press}', article.press).replace('{category}', article.category).replace('{content}', article.content)
  if (selectedChat.value) {
    draftMessage.value = shareText
  } else if (chats.value.length > 0) {
    selectChat(chats.value[0].id)
    draftMessage.value = shareText
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

const newsArticleComments = ref<Record<string, Array<{ id: string; author: string; text: string; time: string }>>>({})
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


// --- Calls Tab State (Section 9 & Screenshot 3) ---

const callHistoryList = ref<CallRecord[]>([])

const selectedCallRecord = ref<CallRecord | null>(null)

function callDateText(iso: string): string {
  const d = new Date(iso)
  const tag = RTF_LOCALE[currentLocale.value] || 'ko-KR'
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diffDays < 1) return d.toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit' })
  if (diffDays < 7) return new Intl.DateTimeFormat(tag, { weekday: 'long' }).format(d)
  return new Intl.DateTimeFormat(tag, { month: 'numeric', day: 'numeric' }).format(d)
}

// The call list is the server-side call ledger (GET /api/v1/calls), consistent with call_status chat bubbles.
async function loadCalls() {
  if (!callHistoryList.value.length) {
    const snap = readSnapshot<CallRecord>(CALLS_SNAPSHOT_KEY)
    if (snap && snap.length) callHistoryList.value = snap
  }
  try {
    const res = await api<{ calls: any[] }>('/api/v1/calls')
    callHistoryList.value = (res.calls || []).map((c: any): CallRecord => ({
      id: c.id,
      peer_id: c.peer_id || '',
      peer_name: c.title || '',
      peer_avatar_color: c.peer_color || '#315BCD',
      call_type: normalizeCallKind(c.kind),
      direction: c.result === 'missed' ? 'missed' : (c.outgoing ? 'outgoing' : 'incoming'),
      timestamp_text: callDateText(c.started_at),
      duration_text: c.duration > 0 ? formatDuration(c.duration) : undefined
    }))
    writeSnapshot(CALLS_SNAPSHOT_KEY, callHistoryList.value)
  } catch {
    if (!callHistoryList.value.length) callHistoryList.value = []
  }
}
const conversationError = ref('')
const isLoadingMessages = ref(false)

function switchNav(nav: NavItem) {
  activeNav.value = nav
  error.value = ''
  note.value = ''
  conversationError.value = ''
  selectedFriendProfile.value = null
  if (nav !== 'chats') {
    selectedChatId.value = ''
  }
  if (nav === 'calls' && !selectedCallRecord.value && callHistoryList.value.length > 0 && window.matchMedia('(min-width: 700px)').matches) {
    selectedCallRecord.value = callHistoryList.value[0]
  }
  if (nav === 'shop') void loadStorePacks()
}

const route = useRoute()
const router = useRouter()
function applyRouteNav() {
  const nav = route.params.nav
  if (typeof nav === 'string' && nav !== activeNav.value && (NAV_PATHS as readonly string[]).includes(nav)) {
    switchNav(nav as NavItem)
  }
}
watch(() => route.params.nav, () => applyRouteNav())
watch(activeNav, (nav) => {
  if ((NAV_PATHS as readonly string[]).includes(nav) && route.path !== '/' + nav) {
    void router.push('/' + nav)
  }
})

async function resolvePeerConversationId(record: CallRecord): Promise<string> {
  const match = chats.value.find(c =>
    c.title === record.peer_name ||
    (record.peer_id === 'peer-k' && (c.id.includes('conv-k') || c.title?.includes('K'))) ||
    (record.peer_id === 'peer-tuk' && (c.id.includes('conv-tuk') || c.title === 'tuk'))
  )
  if (match) return match.id
  if (record.peer_id === 'peer-k') return 'chat-k-01'
  if (record.peer_id === 'peer-tuk') return 'chat-tuk-01'
  return chats.value[0]?.id || 'chat-k-01'
}

async function openChatFromCallRecord(record: CallRecord) {
  const cid = await resolvePeerConversationId(record)
  switchNav('chats')
  await selectChat(cid)
}

// FX-18: history kinds come from server data; anything but an explicit
// 'video' redials as voice so a voice record can never start video.
function normalizeCallKind(kind: unknown): 'voice' | 'video' {
  return kind === 'video' ? 'video' : 'voice'
}

async function startCallFromHistory(record: CallRecord, kind: 'voice' | 'video' = 'voice') {
  selectedCallRecord.value = record
  const cid = await resolvePeerConversationId(record)
  selectedChatId.value = cid
  await startCall(normalizeCallKind(kind), record.peer_name)
}

function removeCallRecord(id: string) {
  callHistoryList.value = callHistoryList.value.filter(c => c.id !== id)
}


// --- Date Dividers & Security Notice Helpers ---
function formatDateDivider(dateStr?: string) {
  if (!dateStr) return t('mvToday')
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return new Intl.DateTimeFormat(RTF_LOCALE[currentLocale.value] || 'ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(d)
}

function shouldShowDateDivider(msg: any, index: number) {
  if (index === 0) return true
  const prev = messages.value[index - 1]
  if (!prev) return true
  const d1 = new Date(msg.created_at).toDateString()
  const d2 = new Date(prev.created_at).toDateString()
  return d1 !== d2
}

// --- Burst Grouping (§7-3): same sender within 60s stays in one visual group.
// Group lead shows avatar + name (theirs); group tail shows timestamp + read.
function isSameBurst(a: any, b: any) {
  if (!a || !b) return false
  if (a.sender_id !== b.sender_id) return false
  const ta = new Date(a.created_at).getTime()
  const tb = new Date(b.created_at).getTime()
  if (isNaN(ta) || isNaN(tb)) return false
  if (new Date(a.created_at).toDateString() !== new Date(b.created_at).toDateString()) return false
  return Math.abs(ta - tb) < 60000
}
function isGroupLead(msg: any, index: number) {
  if (index === 0) return true
  return !isSameBurst(messages.value[index - 1], msg)
}
function isGroupTail(msg: any, index: number) {
  if (index >= messages.value.length - 1) return true
  return !isSameBurst(msg, messages.value[index + 1])
}


const showPasswordModal = ref(false)
const currentPasswordInput = ref('')
const newPasswordInput = ref('')
const confirmPasswordInput = ref('')
const passwordChangeError = ref('')

async function submitPasswordChange() {
  if (!currentPasswordInput.value) {
    passwordChangeError.value = t('mvPwCurrentRequired')
    return
  }
  if (newPasswordInput.value !== confirmPasswordInput.value) {
    passwordChangeError.value = t('mvPwMismatch')
    return
  }
  if (newPasswordInput.value.length < 12) {
    passwordChangeError.value = t('mvPwTooShort')
    return
  }
  try {
    await api('/api/v1/auth/change-password', 'POST', {
      current_password: currentPasswordInput.value,
      new_password: newPasswordInput.value
    })
    note.value = t('mvPwChanged')
    showPasswordModal.value = false
    currentPasswordInput.value = ''
    newPasswordInput.value = ''
    confirmPasswordInput.value = ''
    passwordChangeError.value = ''
  } catch (err: any) {
    passwordChangeError.value = err?.message || t('mvPwChangeFailed')
  }
}

// --- Phone Auth State (Article 3.C) ---

// --- Messenger Domain Data ---
const chats = ref<Chat[]>([])
const selectedChatId = ref('')
const selectedChat = computed(() => chats.value.find(c => c.id === selectedChatId.value) || null)
const messages = ref<Message[]>([])
const hasEarlierMessages = ref(false)
const earlierMessagesLoading = ref(false)
const earlierMessagesError = ref('')
const friends = ref<User[]>([])
const officialAccounts = ref<Array<{ id: string; name: string; handle: string; description: string; color: string; followed: boolean }>>([])
const searchKeyword = ref('')
const foundUsers = ref<User[]>([])
const draftMessage = ref('')
const replyToMessage = ref<Message | null>(null)
// --- Official Account Rich Menu ---
const activeRichMenu = ref<{ id: string; title: string; layout?: 'grid_2x3' | 'grid_1x3'; tiles: Array<{ id: string; label: string; icon: string; action: { type: string; text?: string; uri?: string; data?: string } }> } | null>(null)
const showRichMenu = ref(true)

async function loadConversationRichMenu(cid: string) {
  activeRichMenu.value = null
  if (!cid) return
  try {
    const res = await api<{ rich_menu: any }>(`/api/v1/conversations/${cid}/rich-menu`)
    if (res && res.rich_menu) {
      activeRichMenu.value = res.rich_menu
      showRichMenu.value = true
    }
  } catch {
    activeRichMenu.value = null
  }
}

function onRichMenuTileClick(tile: any) {
  if (!tile || !tile.action) return
  if (tile.action.type === 'message') {
    draftMessage.value = tile.action.text || tile.label
    void sendMessage()
  } else if (tile.action.type === 'uri') {
    if (tile.action.uri) window.open(tile.action.uri, '_blank')
  } else if (tile.action.type === 'postback') {
    draftMessage.value = t('mvPostback').replace('{body}', String(tile.action.data || tile.label))
    void sendMessage()
  }
}
const conversationDrafts = new Map<string, { body: string; reply: Message | null }>()
const sendingConversations = ref(new Set<string>())
const pendingSends = new Map<string, AbortController>()
watch(selectedChatId, (next, previous) => {
  if (previous) conversationDrafts.set(previous, { body: draftMessage.value, reply: replyToMessage.value })
  draftMessage.value = conversationDrafts.get(next)?.body || ''
  replyToMessage.value = conversationDrafts.get(next)?.reply || null
}, { flush: 'sync' })
const attachmentInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const activeDrawer = ref<'none' | 'notes' | 'albums' | 'events' | 'media'>('none')

// --- Pinned Announcements & Polls ---
const pinnedList = ref<{ message_id: string; pinned_by: string; pinned_at: string; body?: string }[]>([])
const activePolls = ref<Array<{ id: string; question: string; options: { id: string; text?: string; label?: string; votes?: number; count?: number; voted?: boolean }[]; closed?: boolean }>>([])
const chatNotes = ref<Array<{ id: string; title?: string; body: string; author?: User; author_name?: string; likes?: number; created_at: string }>>([])
const chatAlbums = ref<Array<{ id: string; title: string; created_by: string; created_at: string }>>([])
const chatEvents = ref<Array<{ id: string; title: string; starts_at: string; location: string; my_rsvp?: string; going?: string[]; declined?: string[]; creator?: User }>>([])
const chatMediaList = ref<Array<{ id: string; kind: string; body: string; created_at: string; metadata?: any }>>([])
const chatSearchQuery = ref('')
const chatSearchResults = ref<Array<{ id: string; body: string; created_at: string }>>([])
const newNoteBody = ref('')
const newAlbumTitle = ref('')
const editingMessageId = ref('')
const editingMessageBody = ref('')
const stickerReplay = ref<Record<string, number>>({})
const openChatRooms = ref<Array<{ id: string; name: string; description: string; visibility: string }>>([])
const selectedOpenChatRoom = ref<{ id: string; name: string; description: string } | null>(null)
const openChatPosts = ref<Array<{ id: string; author_id: string; body: string; created_at: string }>>([])
const newOpenChatRoomName = ref('')
const newOpenChatRoomDesc = ref('')
const newOpenChatPostBody = ref('')
const showCreateOpenChatModal = ref(false)
const showVoomCreateModal = ref(false)
const newVoomBody = ref('')
const newVoomComment = ref<Record<string, string>>({})
const devicesList = ref<Array<{ id: string; name: string; platform: string; trusted: boolean; last_seen_at?: string }>>([])
const photoInput = ref<HTMLInputElement | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)
const photoSaving = ref(false)
const photoError = ref('')
async function changeProfilePhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  photoError.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { photoError.value = t('profile_photo_invalid'); return }
  photoSaving.value = true
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error(t('profile_photo_invalid'))
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      await persistProfilePhoto(canvas.toDataURL('image/jpeg', 0.85))
    } finally { bitmap.close() }
  } catch (error) { photoError.value = error instanceof Error ? error.message : t('profile_save_error') }
  finally { photoSaving.value = false }
}
async function persistProfilePhoto(avatar_url: string) {
  const updated = await api<User>('/api/v1/me', 'PATCH', { avatar_url })
  currentUser.value = updated
  if (activeProfileUser.value?.id === updated.id) activeProfileUser.value = updated
}
async function removeProfilePhoto() {
  photoSaving.value = true; photoError.value = ''
  try { await persistProfilePhoto('') }
  catch (error) { photoError.value = error instanceof Error ? error.message : t('profile_save_error') }
  finally { photoSaving.value = false }
}
// 6-4: web cover change, the same upload path as the profile photo
// (client downscale + PATCH /api/v1/me cover_url).
async function changeCoverPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  photoError.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { photoError.value = t('profile_photo_invalid'); return }
  photoSaving.value = true
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error(t('profile_photo_invalid'))
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      await persistCoverPhoto(canvas.toDataURL('image/jpeg', 0.85))
    } finally { bitmap.close() }
  } catch (error) { photoError.value = error instanceof Error ? error.message : t('profile_save_error') }
  finally { photoSaving.value = false }
}
async function persistCoverPhoto(cover_url: string) {
  const updated = await api<User>('/api/v1/me', 'PATCH', { cover_url })
  currentUser.value = updated
  if (activeProfileUser.value?.id === updated.id) activeProfileUser.value = updated
}
async function removeCoverPhoto() {
  photoSaving.value = true; photoError.value = ''
  try { await persistCoverPhoto('') }
  catch (error) { photoError.value = error instanceof Error ? error.message : t('profile_save_error') }
  finally { photoSaving.value = false }
}
const isRecordingVoice = ref(false)
let mediaRecorderInstance: MediaRecorder | null = null
let recordedChunks: BlobPart[] = []
let voiceRecordStartedAt = 0

// --- Keep Vault ---
const keepItems = ref<Array<{ id: string; body: string; kind: string; created_at: string; message_id?: string }>>([])
const keepFilter = ref<'all' | 'text' | 'image' | 'link'>('all')
const keepSearch = ref('')
const showKeepModal = ref(false)

// --- VOOM / Timeline & Stories ---
const stories = ref<Array<{ id: string; author?: User; author_name?: string; body?: string; text?: string; bg: string; created_at: string; viewed?: boolean }>>([])
const voomVideos = ref<Array<{ id: string; title?: string; body?: string; emoji?: string; media_emoji?: string; bg?: string; media_bg?: string; author?: User; author_name?: string; like_count?: number; likes?: number; liked?: boolean; comments: Array<{ id: string; author?: User; author_name?: string; body?: string; text?: string }> }>>([])
const newStoryText = ref('')
const showNewStoryModal = ref(false)

// --- Wallet & Pay ---
// U2: never seeded — loadWallet() fills real API values (0 when absent).
const walletBalance = ref(0)
const walletPoints = ref(0)
const walletTx = ref<Array<{ id: string; type?: string; kind?: string; title?: string; amount: number; note?: string; counterparty?: string; created_at: string }>>([])
const showSendMoneyModal = ref(false)
const showChargeModal = ref(false)
const sendTargetFriend = ref<User | null>(null)
const sendAmountInput = ref(10000)
const sendMemoInput = ref('')

// --- Context Menu & Stickers State ---
const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}>({
  visible: false,
  x: 0,
  y: 0,
  items: []
})

const activeStickerCategory = ref<'All' | LunoSticker['character']>('All')

const filteredStickers = computed(() => {
  if (activeStickerCategory.value === 'All') return LUNO_STICKERS
  return LUNO_STICKERS.filter(s => s.character === activeStickerCategory.value)
})

function getStickerSvg(id: string): string {
  const found = LUNO_STICKERS.find(s => s.id === id)
  return found ? found.svg : ''
}

function openMessageContextMenu(e: MouseEvent, msg: Message) {
  e.preventDefault()
  const items: ContextMenuItem[] = [
    {
      label: t('mvCtxCopy'),
      shortcut: 'Ctrl+C',
      action: () => {
        navigator.clipboard?.writeText(msg.body).catch(() => {})
        note.value = t('mvCopied')
      }
    },
    {
      label: t('mvReply'),
      action: () => startReply(msg)
    },
    {
      label: t('mvCtxKeep'),
      action: () => saveToKeep(msg)
    },
    {
      label: t('mvCtxPin'),
      action: () => pinMessage(msg.id)
    }
  ]

  if (currentUser.value && msg.sender_id === currentUser.value.id && !msg.unsent) {
    items.push({
      label: t('mvCtxUnsend'),
      danger: true,
      separator: true,
      action: () => unsendMessage(msg.id)
    })
  } else if (currentUser.value && msg.sender_id !== currentUser.value.id && !msg.unsent) {
    // E8: message-level report with quoted content.
    items.push({
      label: t('mvReportUser'),
      danger: true,
      separator: true,
      action: () => openReportForMessage(msg)
    })
  }

  contextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 180),
    y: Math.min(e.clientY, window.innerHeight - 200),
    items
  }
}

async function startCallWithUser(friend: User, kind: 'voice' | 'video') {
  await startDirectChat(friend)
  await startCall(kind)
}

async function toggleFriendFavorite(friend: User) {
  await wrap(async () => {
    const next = !(friend as any).is_favorite
    await api(`/api/v1/friends/${friend.id}`, 'PATCH', { favorite: next })
    ;(friend as any).is_favorite = next
    await loadFriends()
    note.value = next ? t('mvFavAdded').replace('{name}', friend.display_name) : t('mvFavRemoved').replace('{name}', friend.display_name)
  })
}

async function toggleFriendBlock(friend: User) {
  await wrap(async () => {
    const next = !(friend as any).is_blocked
    await api(`/api/v1/friends/${friend.id}`, 'PATCH', { blocked: next })
    ;(friend as any).is_blocked = next
    await loadFriends()
    note.value = next ? t('mvBlocked').replace('{name}', friend.display_name) : t('mvUnblocked').replace('{name}', friend.display_name)
  })
}

async function followOrOpenOfficialAccount(oa: { id: string; name: string; followed: boolean }) {
  await wrap(async () => {
    const res = await api<{ conversation_id?: string }>(`/api/v1/official-accounts/${oa.id}/follow`, 'POST', {})
    await Promise.all([loadOfficialAccounts(), loadChats()])
    if (res.conversation_id) {
      await selectChat(res.conversation_id)
    }
  })
}

async function openKeepMemoChat() {
  await selectChat('keep-memo')
}

async function toggleChatPin(chat: Chat) {
  await wrap(async () => {
    const next = !(chat as any).pinned
    await api(`/api/v1/conversations/${chat.id}/meta`, 'PATCH', { pinned: next })
    ;(chat as any).pinned = next
    await loadChats()
    note.value = next ? t('mvChatPinned') : t('mvChatUnpinned')
  })
}

async function toggleChatMute(chat: Chat) {
  await wrap(async () => {
    const next = !(chat as any).muted
    await api(`/api/v1/conversations/${chat.id}/meta`, 'PATCH', { muted: next })
    ;(chat as any).muted = next
    await loadChats()
    note.value = next ? t('mvChatMuted') : t('mvChatUnmuted')
  })
}

async function markChatAsRead(chat: Chat) {
  await wrap(async () => {
    await api(`/api/v1/conversations/${chat.id}/read`, 'POST', { sequence: chat.last_sequence || 999999 })
    await loadChats()
    note.value = t('mvMarkedRead')
  })
}

async function markAllChatsRead() {
  await wrap(async () => {
    await api('/api/v1/conversations/read-all', 'POST', {})
    await loadChats()
    note.value = t('mvAllMarkedRead')
  })
}

async function leaveOrHideChat(chat: Chat) {
  await wrap(async () => {
    await api(`/api/v1/conversations/${chat.id}`, 'DELETE')
    if (selectedChatId.value === chat.id) selectedChatId.value = ''
    await loadChats()
    note.value = t('mvLeftChat')
  })
}

function openChatContextMenu(e: MouseEvent, chat: Chat) {
  e.preventDefault()
  const isPinned = !!(chat as any).pinned
  const isMuted = !!(chat as any).muted
  const items: ContextMenuItem[] = [
    {
      label: isPinned ? t('mvUnpinChat') : t('mvPinChat'),
      action: () => toggleChatPin(chat)
    },
    {
      label: isMuted ? t('mvNotifOn') : t('mvNotifOff'),
      action: () => toggleChatMute(chat)
    },
    {
      label: t('mvMarkRead'),
      action: () => markChatAsRead(chat)
    },
    {
      label: t('mvLeaveChat'),
      danger: true,
      separator: true,
      action: () => leaveOrHideChat(chat)
    }
  ]
  contextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 180),
    y: Math.min(e.clientY, window.innerHeight - 220),
    items
  }
}

function openFriendContextMenu(e: MouseEvent, friend: User) {
  e.preventDefault()
  const isFav = !!(friend as any).is_favorite
  const isBlk = !!(friend as any).is_blocked
  const items: ContextMenuItem[] = [
    {
      label: t('mvDirectChat'),
      action: () => startDirectChat(friend)
    },
    {
      label: isFav ? t('mvFavRemove') : t('mvFavAdd'),
      action: () => toggleFriendFavorite(friend)
    },
    {
      label: t('mvVoiceCallAction'),
      action: () => startCallWithUser(friend, 'voice')
    },
    {
      label: t('mvVideoCallAction'),
      action: () => startCallWithUser(friend, 'video')
    },
    {
      label: t('mvViewProfile'),
      action: () => { activeProfileUser.value = friend }
    },
    {
      label: t('mvSendMoneyAction'),
      separator: true,
      action: () => openSendMoneyModal(friend)
    },
    {
      label: isBlk ? t('mvUnblock') : t('mvBlock'),
      danger: !isBlk,
      action: () => toggleFriendBlock(friend)
    },
    {
      label: t('mvReportUser'),
      danger: true,
      action: () => openReportModal(friend)
    }
  ]

  contextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 180),
    y: Math.min(e.clientY, window.innerHeight - 260),
    items
  }
}

// --- Store / Stickers & Themes ---
const stickerPacks = ref<Array<{ id: string; title: string; price_minor: number; stickers: string[]; owned?: boolean }>>([])
const showStickerPicker = ref(false)
const activeStickerTab = ref(0)
const stickersList = [
  { id: 'pack-brown', name: t('mvStickerPackBrown'), items: ['🐻', '🐰', '🐥', '🐸', '🐱', '🐶', '🐼', '🐨', '🦁', '🐯', '🦊', '🦄'] },
  { id: 'pack-emotions', name: t('mvStickerPackEmotion'), items: ['😀', '😂', '😍', '🥳', '😎', '😭', '😡', '🤔', '😴', '😱', '🤩', '😇'] },
  { id: 'pack-daily', name: t('mvStickerPackDaily'), items: ['☕', '🍰', '🍕', '🍔', '🍣', '🍜', '🍺', '🍙', '🎉', '🎁', '💖', '👍'] },
  { id: 'pack-work', name: t('mvStickerPackOffice'), items: ['💻', '⌨️', '📱', '🚀', '🔥', '✨', '💯', '☕', '💪', '🙏', '🆗', '✅'] }
]


// --- Modals & Popups ---
const activeProfileUser = ref<User | null>(null)
const showCreateGroupModal = ref(false)
const groupTitleInput = ref('')
const selectedFriendsForGroup = ref<string[]>([])
// F6: paste an invite link or raw token to join.
const joinLinkInput = ref('')
const showAddFriendModal = ref(false)
const addFriendHandleInput = ref('')
const addFriendResults = ref<User[]>([])
const addFriendSearched = ref(false)
const showSettingsModal = ref(false)
// F4: user report dialog + own history.
const showReportModal = ref(false)
const reportTarget = ref<User | null>(null)
const reportCategory = ref('spam')
const reportDetails = ref('')
// E8: message-level report — the quoted message plus the reporter's
// explicit consent to attach its decrypted content.
const reportMessage = ref<Message | null>(null)
const reportE2eeConsent = ref(false)
const myReports = ref<Array<{ id: string; subject_user_id: string; category: string; details: string; state: string; created_at: string }>>([])
// L-05: approval box state (room proposals + per-message decision states).
const showApprovalBox = ref(false)
// F6: group settings modal state.
const showGroupSettings = ref(false)
const approvalProposals = ref<Array<{ message_id: string; body: string; author_id: string; author_name: string; created_at: string; state: string; decided_by: string | null }>>([])
const proposalStates = ref<Record<string, string>>({})
const showContactPicker = ref(false)
const showPollCreateModal = ref(false)
const newPollQuestion = ref('')
const newPollOption1 = ref('')
const newPollOption2 = ref('')
const newPollOption3 = ref('')
const showEventCreateModal = ref(false)
const newEventTitle = ref('')
const newEventDate = ref('')
const newEventLocation = ref('')

// --- QR Login ---


// --- Helper Functions ---

// Format duration mm:ss
function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Format time with localized format
function formatTime(iso: string) {
  if (!iso) return ''
  return formatLocalizedTime(iso, currentLocale.value)
}

// Item 9: day-aware list rows — a 23:20 message from yesterday must not read
// as "today 11:20 PM". Bubbles keep time-only (dividers disambiguate).
function formatListTime(iso: string) {
  if (!iso) return ''
  return listRowTime(iso, { tag: RTF_LOCALE[currentLocale.value] || 'ko-KR', yesterday: t('mvYesterday') })
}

// Compute total unread count (Numeric badge invariant: exclude non-numeric 'N' badges)
const totalUnreadCount = computed(() => chats.value.reduce((sum, c) => sum + (c.badge_n ? 0 : (c.unread_count || 0)), 0))


const groupChats = computed(() => chats.value.filter(c => c.kind === 'group'))
const favoriteFriends = computed(() => filteredFriends.value.filter(f => (f as any).is_favorite))

const filteredFriends = computed(() => {
  if (!friendSearchQuery.value.trim()) return friends.value
  const q = friendSearchQuery.value.toLowerCase().trim()
  return friends.value.filter(f =>
    (f.display_name || '').toLowerCase().includes(q) ||
    (f.status_message || '').toLowerCase().includes(q) ||
    (f.handle || '').toLowerCase().includes(q)
  )
})

// Chat search / filter
const chatFilter = ref<'all' | 'direct' | 'group' | 'unread'>('all')
const filteredChats = computed(() => {
  let list = chats.value.filter(c => {
    if (chatFilter.value === 'direct' && c.kind !== 'direct') return false
    if (chatFilter.value === 'group' && c.kind !== 'group') return false
    if (chatFilter.value === 'unread' && (!c.unread_count || c.unread_count === 0)) return false
    if (searchKeyword.value.trim()) {
      const q = searchKeyword.value.toLowerCase()
      return (c.title || '').toLowerCase().includes(q) || (c.last_message?.body || '').toLowerCase().includes(q)
    }
    return true
  })
  if (chatSortAsc.value) {
    list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  }
  return list
})

// Keep filtered items
const filteredKeepItems = computed(() => {
  return keepItems.value.filter(item => {
    const text = (item.body || '').toLowerCase()
    if (keepSearch.value && !text.includes(keepSearch.value.toLowerCase())) return false
    if (keepFilter.value === 'text') return item.kind === 'text' && !text.startsWith('http')
    if (keepFilter.value === 'image') return item.kind === 'image' || item.kind === 'photo'
    if (keepFilter.value === 'link') return text.startsWith('http') || text.includes('www.')
    return true
  })
})

// --- Auth Actions ---


function selectFriend(f: User) {
  selectedFriendProfile.value = f
  selectedChatId.value = ''
}

function onStartChatFromProfile(f: User) {
  selectedFriendProfile.value = null
  startDirectChat(f)
}

function toggleNotifications() {
  notificationsEnabled.value = !notificationsEnabled.value
  note.value = notificationsEnabled.value ? t('mvNotifEnabled') : t('mvDndEnabled')
}




async function loadInitialData() {
  await Promise.all([
    loadChats(),
    loadFriends(),
    loadOfficialAccounts(),
    loadKeep(),
    loadWallet(),
    loadTimelineStories(),
    loadStoreCatalog(),
    loadOpenChatRooms(),
    loadDevices(),
    loadNews(),
    loadCalls()
  ])
}


// --- Data Fetchers ---
const channelSlot = ref<{ id: string; title: string; body: string } | null>(null)
async function loadChannelSlot() {
  if (!token.value) { channelSlot.value = null; return }
  try {
    const res = await api<{ slot: { id: string; title: string; body: string } | null }>('/api/v1/channel/slot')
    const s = res.slot
    channelSlot.value = s && typeof s.id === 'string' && typeof s.title === 'string' && typeof s.body === 'string'
      ? { id: s.id, title: s.title, body: s.body }
      : null
  } catch { channelSlot.value = null }
}
// FX-15: stale-while-revalidate. List snapshots survive reloads so the
// lists paint instantly; room messages cache in memory per room.
const CHATS_SNAPSHOT_KEY = 'luno-chats-snapshot'
const CALLS_SNAPSHOT_KEY = 'luno-calls-snapshot'
const roomMessageCache = new Map<string, Message[]>()

function readSnapshot<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { items?: unknown }
    if (!parsed || !Array.isArray(parsed.items)) return null
    return parsed.items as T[]
  } catch { return null }
}

function writeSnapshot(key: string, items: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ saved_at: Date.now(), items })) } catch {}
}

async function loadChats() {
  const sessionToken = token.value
  if (!chats.value.length) {
    const snap = readSnapshot<Chat>(CHATS_SNAPSHOT_KEY)
    if (snap && snap.length) chats.value = snap
  }
  try {
    const res = await api<{ conversations: Chat[] }>('/api/v1/conversations')
    if (sessionToken === token.value) {
      chats.value = res.conversations || []
      writeSnapshot(CHATS_SNAPSHOT_KEY, chats.value)
    }
  } catch {}
  void loadChannelSlot()
}

// I-4: calling state machine (names unchanged; template and socket untouched).
// F15: the deps object is hoisted so the group-call busy line can be attached
// after both machines exist (useWebRTC reads it lazily at ring/dial time).
const webRTCDeps: WebRTCDeps = { selectedChatId, chats, selectedChat, callHistoryList, loadChats, formatDuration }
const {
  activeCall,
  callMediaIssue,
  callDuration,
  isCallMuted,
  isCallVideoOff,
  isCallSpeakerOn,
  callRecording,
  callVideoFilter,
  localVideoRef,
  remoteVideoRef,
  isScreenSharing,
  startCall,
  handleIncomingRing,
  cycleCallCamera,
  handleIncomingCallSignal,
  toggleCallMute,
  toggleCallVideo,
  toggleScreenShare,
  updateCallState,
  startCallTimer,
  clearNoAnswerTimer,
  stopCallTimer,
  toggleCallRecording,
  endCallLocally,
} = useWebRTC(webRTCDeps)
// Template expressions unwrap top-level refs, so the modal receives the stream
// ref objects through this plain holder instead of the bare bindings.
const callVideoRefs = { local: localVideoRef, remote: remoteVideoRef }

// F15: group call mesh (one tile per participant, max 8 seats server-side).
const {
  groupCall,
  groupPeers,
  groupCallDuration,
  isGroupMuted,
  isGroupVideoOff,
  localStream: groupLocalStream,
  startGroupCall,
  handleGroupUserJoined,
  handleGroupUserLeft,
  handleGroupSignal,
  toggleGroupMute,
  toggleGroupVideo,
  cycleGroupCamera,
  leaveGroupCall,
} = useGroupCall({ activeCallId: computed(() => activeCall.value?.id ?? null) })
webRTCDeps.isGroupCallActive = () => groupCall.value !== null

async function handleRoomCall(kind: 'voice' | 'video') {
  // F15: group rooms join the mesh call; every other room dials 1:1.
  if (selectedChat.value?.kind === 'group' && selectedChatId.value) {
    await startGroupCall(selectedChatId.value, selectedChat.value.title || t('mvGroupCall'), kind)
  } else {
    await startCall(kind)
  }
}

let profileRefreshTimer: ReturnType<typeof setTimeout> | null = null
async function loadFriends() {
  try {
    const res = await api<{ friends: User[] }>('/api/v1/friends')
    friends.value = res.friends || []
  } catch {}
}

async function loadOfficialAccounts() {
  try {
    const res = await api<{ accounts: any[] }>('/api/v1/official-accounts')
    officialAccounts.value = res.accounts || []
  } catch {}
}
const storePacks = ref<ReturnType<typeof parseStorePacks>>([])
const storeLoading = ref(false)
async function loadStorePacks() {
  if (!token.value) { storePacks.value = []; return }
  storeLoading.value = true
  try {
    const res = await api<{ packs: any }>('/api/v1/store/stickers')
    storePacks.value = parseStorePacks(res.packs)
  } catch { storePacks.value = [] }
  finally { storeLoading.value = false }
}

let keepLoadVersion = 0
async function loadKeep() {
  const version = ++keepLoadVersion
  const sessionToken = token.value
  try {
    const res = await api<{ saved_messages: any[] }>('/api/v1/saved-messages')
    if (version !== keepLoadVersion || sessionToken !== token.value) return
    keepItems.value = res.saved_messages || []
  } catch {}
}

async function loadWallet() {
  try {
    const res = await api<{ balance: number; points?: number; transactions: any[] }>('/api/v1/wallet')
    walletBalance.value = res.balance || 0
    if (typeof res.points === 'number') walletPoints.value = res.points
    walletTx.value = res.transactions || []
  } catch {}
}

async function loadTimelineStories() {
  try {
    const [sRes, vRes] = await Promise.all([
      api<{ stories: any[] }>('/api/v1/stories'),
      api<{ posts?: any[]; videos?: any[] }>('/api/v1/voom')
    ])
    stories.value = sRes.stories || []
    voomVideos.value = vRes.posts || vRes.videos || []
  } catch {}
}

async function loadStoreCatalog() {
  try {
    const res = await api<{ packs: any[] }>('/api/v1/store/stickers')
    stickerPacks.value = res.packs || []
  } catch {}
}

async function loadOpenChatRooms() {
  try {
    const res = await api<{ rooms: any[] }>('/api/v1/community/rooms')
    openChatRooms.value = res.rooms || []
  } catch {}
}

async function loadDevices() {
  try {
    const res = await api<{ devices: any[] }>('/api/v1/devices')
    devicesList.value = res.devices || []
  } catch {}
}

// --- Chat Actions ---
let chatSelectVersion = 0
async function selectChat(convId: string) {
  activeNav.value = 'chats'
  selectedChatId.value = convId
  selectedFriendProfile.value = null
  messages.value = []
  hasEarlierMessages.value = false
  earlierMessagesLoading.value = false
  earlierMessagesError.value = ''
  activeDrawer.value = 'none'
  error.value = ''
  conversationError.value = ''
  const cachedRoom = roomMessageCache.get(convId)
  if (cachedRoom && cachedRoom.length) {
    messages.value = cachedRoom
    isLoadingMessages.value = false
  } else {
    isLoadingMessages.value = true
  }
  const version = ++chatSelectVersion
  try {
    const [msgRes, pinsRes] = await Promise.all([
      api<{ messages: Message[] }>(`/api/v1/conversations/${convId}/messages?limit=50`),
      api<{ pins: any[] }>(`/api/v1/conversations/${convId}/pins`).catch(() => ({ pins: [] }))
    ])
    if (selectedChatId.value !== convId || version !== chatSelectVersion) return
    const fresh = msgRes.messages || []
    const received = new Map(fresh.map(message => [message.id, message]))
    const maxFreshSeq = fresh.reduce((m, message) => Math.max(m, message.sequence || 0), 0)
    for (const message of messages.value) {
      if (message.conversation_id !== convId) continue
      if (received.has(message.id) || (message.sequence || 0) > maxFreshSeq) received.set(message.id, message)
    }
    messages.value = [...received.values()].sort((a, b) => a.sequence - b.sequence)
    // E9: restored backup rows fill history the fresh chains cannot open.
    const restored = restoredHistory.value[convId]
    if (restored && restored.length) {
      const have = new Set(messages.value.map((m) => m.id))
      const extra = restored.filter((m) => !have.has(m.id))
      if (extra.length) {
        messages.value = [...extra, ...messages.value].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      }
    }
    roomMessageCache.set(convId, messages.value.slice(-50))
    if (roomMessageCache.size > 20) roomMessageCache.delete(roomMessageCache.keys().next().value as string)
    hasEarlierMessages.value = fresh.length === 50
    pinnedList.value = pinsRes.pins || []
    if (messages.value.length > 0) {
      const last = messages.value[messages.value.length - 1]
      if (last.sequence) {
        await api(`/api/v1/conversations/${convId}/read`, 'POST', { sequence: last.sequence }).catch(() => {})
      }
    }
    if (autoTranslateEnabled.value && messages.value.length > 0) {
      for (const m of messages.value.slice(-6)) {
        // E8: auto-translate never touches sealed text (explicit taps only).
        if (m.kind === 'text' && !m._e2ee && !messageTranslations.value[m.id]) {
          void handleTranslateMessage(m)
        }
      }
    }
    scrollToBottom()
    await Promise.all([loadChats(), loadPolls(convId)])
    void loadProposalStates(convId)
  } catch (e: any) {
    if (selectedChatId.value === convId && version === chatSelectVersion && !messages.value.length) {
      conversationError.value = e?.message || t('mvLoadMsgsFailed')
      messages.value = []
    }
  } finally {
    if (selectedChatId.value === convId && version === chatSelectVersion) {
      isLoadingMessages.value = false
    }
  }
}

async function loadEarlierMessages() {
  if (!selectedChatId.value || earlierMessagesLoading.value || !hasEarlierMessages.value) return
  const convId = selectedChatId.value, sessionToken = token.value, version = chatSelectVersion
  const cursor = messages.value.reduce((lowest, message) => Math.min(lowest, message.sequence), Infinity)
  if (!Number.isFinite(cursor)) return
  const canvas = messagesCanvasRef.value, oldHeight = canvas?.scrollHeight || 0, oldTop = canvas?.scrollTop || 0
  earlierMessagesLoading.value = true; earlierMessagesError.value = ''
  try {
    const result = await request<{ messages: Message[] }>(`/api/v1/conversations/${convId}/messages?limit=50&before=${cursor}&before_sequence=${cursor}`, sessionToken)
    if (sessionToken !== token.value || convId !== selectedChatId.value || version !== chatSelectVersion) return
    const earlier = (result.messages || []).filter(message => message.sequence < cursor)
    const combined = new Map([...earlier, ...messages.value].map(message => [message.id, message]))
    messages.value = [...combined.values()].sort((a, b) => a.sequence - b.sequence)
    hasEarlierMessages.value = earlier.length === 50
    await nextTick()
    if (canvas && convId === selectedChatId.value && sessionToken === token.value && version === chatSelectVersion) canvas.scrollTop = oldTop + canvas.scrollHeight - oldHeight
  } catch (error) {
    if (sessionToken === token.value && convId === selectedChatId.value && version === chatSelectVersion) earlierMessagesError.value = error instanceof Error ? error.message : t('history_error')
  } finally {
    if (sessionToken === token.value && convId === selectedChatId.value && version === chatSelectVersion) earlierMessagesLoading.value = false
  }
}

let pollLoadVersion = 0
async function loadPolls(convId: string) {
  const version = ++pollLoadVersion
  try {
    const res = await api<{ polls: any[] }>(`/api/v1/conversations/${convId}/polls`)
    if (selectedChatId.value === convId && version === pollLoadVersion) {
      activePolls.value = res.polls || []
    }
  } catch {}
}

let noteLoadVersion = 0
async function loadNotes(convId: string) {
  const version = ++noteLoadVersion
  try {
    const res = await api<{ notes: any[] }>(`/api/v1/conversations/${convId}/notes`)
    if (selectedChatId.value === convId && version === noteLoadVersion) {
      chatNotes.value = res.notes || []
    }
  } catch {}
}

let eventLoadVersion = 0
async function loadEvents(convId: string) {
  const version = ++eventLoadVersion
  try {
    const res = await api<{ events: any[] }>(`/api/v1/conversations/${convId}/events`)
    if (selectedChatId.value === convId && version === eventLoadVersion) {
      chatEvents.value = res.events || []
    }
  } catch {}
}

function toggleDrawer(tab: 'notes' | 'albums' | 'events' | 'media') {
  if (!selectedChatId.value) { note.value = t('mvDrawerNeedChat'); return }
  if (activeDrawer.value === tab) {
    activeDrawer.value = 'none'
  } else {
    activeDrawer.value = tab
    if (tab === 'notes' && selectedChatId.value) loadNotes(selectedChatId.value)
    if (tab === 'albums' && selectedChatId.value) loadAlbums(selectedChatId.value)
    if (tab === 'events' && selectedChatId.value) loadEvents(selectedChatId.value)
    if (tab === 'media' && selectedChatId.value) loadConversationMedia(selectedChatId.value)
  }
}

async function loadAlbums(convId: string) {
  try {
    const res = await api<{ albums: any[] }>(`/api/v1/conversations/${convId}/albums`)
    if (selectedChatId.value === convId) chatAlbums.value = res.albums || []
  } catch {}
}

async function createAlbum() {
  if (!selectedChatId.value || !newAlbumTitle.value.trim()) return
  const cid = selectedChatId.value
  await wrap(async () => {
    await api(`/api/v1/conversations/${cid}/albums`, 'POST', { title: newAlbumTitle.value.trim() })
    newAlbumTitle.value = ''
    await loadAlbums(cid)
    note.value = t('mvAlbumCreated')
  })
}

async function createNote() {
  if (!selectedChatId.value || !newNoteBody.value.trim()) return
  const cid = selectedChatId.value
  await wrap(async () => {
    await api(`/api/v1/conversations/${cid}/notes`, 'POST', { body: newNoteBody.value.trim() })
    newNoteBody.value = ''
    await loadNotes(cid)
    note.value = t('mvNoteCreated')
  })
}

async function deleteNoteItem(noteId: string) {
  if (!selectedChatId.value) return
  const cid = selectedChatId.value
  await wrap(async () => {
    await api(`/api/v1/conversations/${cid}/notes/${noteId}`, 'DELETE')
    await loadNotes(cid)
  })
}

async function rsvpEvent(eventId: string, status: 'going' | 'maybe' | 'declined') {
  await wrap(async () => {
    await api(`/api/v1/events/${eventId}/rsvp`, 'POST', { status })
    if (selectedChatId.value) await loadEvents(selectedChatId.value)
    note.value = t('mvRsvpSaved')
  })
}

async function loadConversationMedia(convId: string) {
  try {
    const res = await api<{ media: any[] }>(`/api/v1/conversations/${convId}/media`)
    if (selectedChatId.value === convId) chatMediaList.value = res.media || []
  } catch {}
}

// FX-10: a broken avatar photo hides itself; the initial layered
// underneath shows instead of the browser's broken-image glyph.
function hideBrokenAvatar(ev: Event) {
  const img = ev.target as HTMLElement | null
  if (img) img.style.display = 'none'
}

async function runConversationSearch() {
  if (!selectedChatId.value) return
  const q = chatSearchQuery.value.trim()
  if (!q) {
    chatSearchResults.value = []
    return
  }
  // E8: sealed rooms search the on-device decrypted cache — the server
  // never sees the query matched against sealed bodies.
  const sealedRoom = chats.value.find((c) => c.id === selectedChatId.value)?.e2ee === true
  if (sealedRoom) {
    const ql = q.toLowerCase()
    chatSearchResults.value = messages.value
      .filter((m) => !m.unsent && !m._e2eeError && m.kind !== 'ciphertext' && typeof m.body === 'string' && m.body.toLowerCase().includes(ql))
      .slice(-50)
      .reverse()
    return
  }
  try {
    const res = await api<{ results?: any[]; messages?: any[] }>(`/api/v1/conversations/${selectedChatId.value}/search?q=${encodeURIComponent(q)}`)
    chatSearchResults.value = res.results || res.messages || []
  } catch {}
}

// --- Messaging ---
// A12: runner chips fill the draft and ride the normal send path.
function sendCommand(text: string) {
  draftMessage.value = text
  void sendMessage()
}
function e2eeClient() {
  const uid = currentUser.value?.id
  const did = readStoredDeviceId()
  if (!uid || !did) return null
  // The store passes paths without the /api/v1 prefix.
  return getE2ee(<T>(p: string, m?: string, b?: unknown) => api<T>(`/api/v1/${p}`, m, b), uid, did)
}
// E5: decrypt newly arrived ciphertext in place (socket, sync, cache, sends).
let e2eeDecrypting = false
watch(messages, async () => {
  if (e2eeDecrypting || !selectedChatId.value) return
  const c = e2eeClient()
  if (!c) return
  e2eeDecrypting = true
  try {
    if (await c.decryptInto(selectedChatId.value, messages.value)) messages.value = [...messages.value]
  } finally {
    e2eeDecrypting = false
  }
})
watch(chats, async () => {
  const c = e2eeClient()
  if (!c) return
  if (await c.decryptPreviews(chats.value)) chats.value = [...chats.value]
})
watch(token, (v, old) => {
  if (!v && old) void resetE2ee()
})
async function sendMessage() {
  if (!selectedChatId.value || !draftMessage.value.trim() || sendingConversations.value.has(selectedChatId.value)) return
  const body = draftMessage.value.trim()
  const reply = replyToMessage.value
  const replyId = reply?.id
  const convId = selectedChatId.value
  const clientId = newClientID()
  const senderId = currentUser.value?.id
  const sessionToken = token.value
  if (!senderId) return
  // E5: E2EE rooms send ciphertext; groups wait for E6 sender keys.
  let kind = 'text'
  let wireBody = body
  const room = chats.value.find((c) => c.id === convId)
  if (room?.e2ee) {
    const c = e2eeClient()
    if (!c) return
    try {
      const out = await c.encryptOutbound(room, 'text', body)
      kind = out.kind
      wireBody = out.body
    } catch (e) {
      error.value = t('message_queue_failed')
      return
    }
  }
  const pendingSet = sendingConversations.value
  const controller = new AbortController()
  pendingSends.set(convId, controller)
  pendingSet.add(convId)
  const timeout = setTimeout(() => controller.abort(), 30000)
  draftMessage.value = ''
  replyToMessage.value = null
  try {
    error.value = ''
    const res = await request<{ message: Message }>(`/api/v1/conversations/${convId}/messages`, sessionToken, 'POST', {
      client_id: clientId,
      kind,
      body: wireBody,
      ...(replyId ? { reply_to: replyId } : {})
    }, controller.signal)
    if (sessionToken !== token.value) return
    if (selectedChatId.value === convId && !messages.value.some(m => m.id === res.message.id)) {
      // E5: our own send echoes ciphertext; stitch the plaintext we just sealed.
      if (kind === 'ciphertext') {
        res.message.kind = 'text'
        res.message.body = body
        res.message._e2ee = true
      }
      messages.value.push(res.message)
    }
    playSendSound()
    scrollToBottom()
    await loadChats()
  } catch (e) {
    if (sessionToken !== token.value) return
    if (!(e instanceof ApiError)) {
      try {
        await queueOfflineMessage({ owner_id: senderId, client_id: clientId, conversation_id: convId, kind: 'text', body, ...(replyId ? { reply_to: replyId } : {}) })
        note.value = t('message_queued')
        if (navigator.onLine) void processOfflineQueue()
        return
      } catch { error.value = t('message_queue_failed') }
    } else { error.value = e.message }
    // A rejected request or failed local save must leave a recoverable draft.
    if (selectedChatId.value === convId && !draftMessage.value) {
      draftMessage.value = body
      if (replyId) replyToMessage.value = messages.value.find(m => m.id === replyId) || null
    } else if (selectedChatId.value !== convId) {
      conversationDrafts.set(convId, { body, reply })
    }
  } finally {
    clearTimeout(timeout)
    pendingSet.delete(convId)
    if (pendingSends.get(convId) === controller) pendingSends.delete(convId)
  }
}

function handleComposerEnter(event: KeyboardEvent) {
  // Enter confirms an IME candidate before it can submit Korean/Japanese text.
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void sendMessage()
}

function startEditMessage(msg: Message) {
  editingMessageId.value = msg.id
  editingMessageBody.value = msg.body
}

async function saveEditMessage() {
  if (!selectedChatId.value || !editingMessageId.value || !editingMessageBody.value.trim()) return
  const mid = editingMessageId.value
  const newBody = editingMessageBody.value.trim()
  await wrap(async () => {
    const target = messages.value.find(m => m.id === mid)
    let wireBody = newBody
    // E5: edits in E2EE rooms replace the envelope.
    if (target?._e2ee) {
      const room = chats.value.find((c) => c.id === selectedChatId.value)
      const c = e2eeClient()
      if (!room || !c) return
      wireBody = (await c.encryptOutbound(room, target.kind, newBody)).body
    }
    await api(`/api/v1/conversations/${selectedChatId.value}/messages/${mid}`, 'PATCH', { body: wireBody })
    if (target) {
      target.body = newBody
      target.edited_at = new Date().toISOString()
    }
    editingMessageId.value = ''
    editingMessageBody.value = ''
    note.value = t('mvMsgEdited')
  })
}

async function toggleVoiceRecording() {
  if (isRecordingVoice.value && mediaRecorderInstance) {
    mediaRecorderInstance.stop()
    isRecordingVoice.value = false
    return
  }
  if (uploading.value || !selectedChatId.value) return
  if (!navigator.mediaDevices?.getUserMedia) {
    note.value = t('mvVoiceRecordFailed')
    chooseAttachment('voice')
    return
  }
  try {
    const conversation = selectedChatId.value
    const sessionToken = token.value
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (sessionToken !== token.value) { stream.getTracks().forEach(track => track.stop()); return }
    recordedChunks = []
    mediaRecorderInstance = new MediaRecorder(stream)
    mediaRecorderInstance.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data)
    }
    mediaRecorderInstance.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      const mime = mediaRecorderInstance?.mimeType || 'audio/webm'
      const blob = new Blob(recordedChunks, { type: mime })
      const durationSec = Math.max(1, Math.min(300, Math.round((Date.now() - voiceRecordStartedAt) / 1000)))
      uploading.value = true
      try { await wrap(() => sendAttachmentFile(new File([blob], `voice-${Date.now()}.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime }), conversation, sessionToken, durationSec)) }
      finally { uploading.value = false; isRecordingVoice.value = false }
    }
    voiceRecordStartedAt = Date.now()
    mediaRecorderInstance.start()
    isRecordingVoice.value = true
    note.value = t('mvRecordingVoice')
  } catch {
    note.value = t('mvVoiceRecordFailed')
    chooseAttachment('voice')
  }
}

function discardVoiceRecording() {
  if (mediaRecorderInstance) {
    mediaRecorderInstance.onstop = null
    if (mediaRecorderInstance.state !== 'inactive') mediaRecorderInstance.stop()
    mediaRecorderInstance.stream.getTracks().forEach(track => track.stop())
  }
  recordedChunks = []
  isRecordingVoice.value = false
}

function scrollToBottom() {
  setTimeout(() => {
    if (messagesCanvasRef.value) {
      messagesCanvasRef.value.scrollTop = messagesCanvasRef.value.scrollHeight
    }
  }, 40)
}

async function sendSticker(stickerId: string) {
  if (!selectedChatId.value) return
  showStickerPicker.value = false
  const found = LUNO_STICKERS.find(s => s.id === stickerId)
  await wrap(async () => {
    // E5: stickers ride inside the ciphertext envelope in E2EE rooms.
    let kind = 'sticker'
    let wireBody = stickerId
    let meta: Record<string, unknown> = {
      sticker_id: stickerId,
      character: found?.character || imageStickerChar(stickerId) || 'Lumi',
      label: found?.name || stickerId
    }
    const room = chats.value.find((c) => c.id === selectedChatId.value)
    if (room?.e2ee) {
      const c = e2eeClient()
      if (!c) return
      try {
        const out = await c.encryptOutbound(room, 'sticker', stickerId, meta)
        kind = out.kind
        wireBody = out.body
        meta = {}
      } catch (e) {
        error.value = t('message_queue_failed')
        return
      }
    }
    const res = await api<{ message: Message }>(`/api/v1/conversations/${selectedChatId.value}/messages`, 'POST', {
      client_id: newClientID(),
      kind,
      body: wireBody,
      metadata: meta
    })
    if (!messages.value.some(m => m.id === res.message.id)) {
      if (kind === 'ciphertext') {
        res.message.kind = 'sticker'
        res.message.body = stickerId
        res.message.metadata = {
          sticker_id: stickerId,
          character: found?.character || imageStickerChar(stickerId) || 'Lumi',
          label: found?.name || stickerId
        }
        res.message._e2ee = true
      }
      messages.value.push(res.message)
    }
    playSendSound()
    scrollToBottom()
    await loadChats()
  })
}

async function sendLocationMessage() {
  if (!selectedChatId.value) return
  const convId = selectedChatId.value
  const sessionToken = token.value
  await wrap(async () => {
    if (!navigator.geolocation) throw new Error(t('location_unavailable'))
    const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }))
    if (sessionToken !== token.value) return
    let kind = 'location'
    let wireBody = t('location_shared')
    let meta: Record<string, unknown> = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy_m: position.coords.accuracy
    }
    const room = chats.value.find((c) => c.id === convId)
    if (room?.e2ee) {
      const c = e2eeClient()
      if (!c) return
      try {
        const out = await c.encryptOutbound(room, 'location', wireBody, meta)
        kind = out.kind
        wireBody = out.body
        meta = {}
      } catch (e) {
        error.value = t('message_queue_failed')
        return
      }
    }
    const res = await request<{ message: Message }>(`/api/v1/conversations/${convId}/messages`, sessionToken, 'POST', {
      client_id: newClientID(),
      kind,
      body: wireBody,
      metadata: meta
    })
    if (sessionToken === token.value && selectedChatId.value === convId && !messages.value.some(m => m.id === res.message.id)) {
      if (kind === 'ciphertext') {
        res.message.kind = 'location'
        res.message.body = t('location_shared')
        res.message.metadata = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy_m: position.coords.accuracy
        }
        res.message._e2ee = true
      }
      messages.value.push(res.message)
    }
    playSendSound()
    scrollToBottom()
    await loadChats()
    note.value = t('mvLocationSent')
  })
}

function sendContactMessage() { showContactPicker.value = true }
async function shareContact(f: User) {
  if (!selectedChatId.value) return
  const convId = selectedChatId.value
  const sessionToken = token.value
  await wrap(async () => {
    let kind = 'contact'
    let wireBody = f.display_name
    let meta: Record<string, unknown> = {
      user_id: f.id,
      ...(f.handle ? { handle: f.handle } : {}),
      display_name: f.display_name
    }
    const room = chats.value.find((c) => c.id === convId)
    if (room?.e2ee) {
      const c = e2eeClient()
      if (!c) return
      try {
        const out = await c.encryptOutbound(room, 'contact', wireBody, meta)
        kind = out.kind
        wireBody = out.body
        meta = {}
      } catch (e) {
        error.value = t('message_queue_failed')
        return
      }
    }
    const res = await request<{ message: Message }>(`/api/v1/conversations/${convId}/messages`, sessionToken, 'POST', {
      client_id: newClientID(),
      kind,
      body: wireBody,
      metadata: meta
    })
    if (sessionToken === token.value && selectedChatId.value === convId && !messages.value.some(m => m.id === res.message.id)) {
      if (kind === 'ciphertext') {
        res.message.kind = 'contact'
        res.message.body = f.display_name
        res.message.metadata = {
          user_id: f.id,
          ...(f.handle ? { handle: f.handle } : {}),
          display_name: f.display_name
        }
        res.message._e2ee = true
      }
      messages.value.push(res.message)
    }
    playSendSound()
    scrollToBottom()
    await loadChats()
    showContactPicker.value = false
    note.value = t('contact_shared')
  })
}

async function captureScreenToChat() {
  if (!selectedChatId.value || uploading.value) return
  const convId = selectedChatId.value
  const sessionToken = token.value
  if (!navigator.mediaDevices?.getDisplayMedia) { error.value = t('capture_unavailable'); return }
  uploading.value = true
  try { await wrap(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    try {
      const video = document.createElement('video'); video.srcObject = stream; video.muted = true
      await video.play()
      const canvas = document.createElement('canvas')
      const ratio = Math.min(1, 1280 / video.videoWidth)
      canvas.width = Math.max(1, Math.round(video.videoWidth * ratio)); canvas.height = Math.max(1, Math.round(video.videoHeight * ratio))
      const context = canvas.getContext('2d')
      if (!context) throw new Error(t('capture_unavailable'))
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(t('capture_unavailable'))), 'image/jpeg', .8))
      stream.getTracks().forEach(track => track.stop())
      await sendAttachmentFile(new File([blob], `LUNO-${Date.now()}.jpg`, { type: 'image/jpeg' }), convId, sessionToken)
    } finally { stream.getTracks().forEach(track => track.stop()) }
  }) } finally { uploading.value = false }
}

function cycleWallpaper() {
  const order: Array<'skyblue' | 'slate' | 'mint' | 'dark'> = ['skyblue', 'slate', 'mint', 'dark']
  const next = order[(order.indexOf(chatWallpaper.value) + 1) % order.length]
  chatWallpaper.value = next
  const names: Record<string, string> = { skyblue: t('mvWallSky'), slate: t('mvWallSlate'), mint: t('mvWallMint'), dark: t('mvWallDark') }
  note.value = t('mvWallpaperChanged').replace('{name}', names[next])
}

function chooseAttachment(kind: 'image' | 'voice' | 'file') {
  if (attachmentInput.value) {
    attachmentInput.value.accept = kind === 'image' ? 'image/*' : kind === 'voice' ? 'audio/*' : '*/*'
    attachmentInput.value.click()
  }
}

const effectFile = ref<File | null>(null)
const effectConversation = ref('')
const effectChoice = ref<'none' | 'gray' | 'sepia'>('none')
const effectPreviewUrl = ref('')
const PHOTO_EFFECT_FILTER: Record<string, string> = { none: 'none', gray: 'grayscale(1)', sepia: 'sepia(1)' }
function closeEffectModal() {
  if (effectPreviewUrl.value) URL.revokeObjectURL(effectPreviewUrl.value)
  effectFile.value = null
  effectConversation.value = ''
  effectChoice.value = 'none'
  effectPreviewUrl.value = ''
}
async function sendEffectPhoto() {
  const file = effectFile.value
  const conversation = effectConversation.value
  if (!file || !conversation || uploading.value) { closeEffectModal(); return }
  const choice = effectChoice.value
  const sessionToken = token.value
  uploading.value = true
  try {
    let out = file
    if (choice !== 'none') {
      const bmp = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width
      canvas.height = bmp.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas unavailable')
      ctx.filter = PHOTO_EFFECT_FILTER[choice]
      ctx.drawImage(bmp, 0, 0)
      bmp.close()
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!blob) throw new Error('encode failed')
      const base = file.name.includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name
      out = new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
    }
    await wrap(() => sendAttachmentFile(out, conversation, sessionToken))
  } finally { uploading.value = false; closeEffectModal() }
}
function openEffectModal(file: File, conversation: string) {
  closeEffectModal()
  effectFile.value = file
  effectConversation.value = conversation
  effectPreviewUrl.value = URL.createObjectURL(file)
}
const showCameraModal = ref(false)
const cameraVideoRef = ref<HTMLVideoElement | null>(null)
// Element-ref holder for MessagePane (see callVideoRefs above).
const paneRefs = { canvas: messagesCanvasRef, file: attachmentInput, camera: cameraVideoRef }
const cameraStream = ref<MediaStream | null>(null)
const cameraError = ref('')
const cameraMode = ref<'photo' | 'video'>('photo')
const videoRecording = ref(false)
const videoElapsed = ref(0)
let videoRecorder: MediaRecorder | null = null
let videoChunks: BlobPart[] = []
let videoTimer: ReturnType<typeof setInterval> | null = null
async function openCamera() {
  if (!selectedChatId.value || uploading.value) return
  showCameraModal.value = true
  cameraError.value = ''
  await nextTick()
  await acquireCamera(cameraMode.value)
}
async function acquireCamera(mode: 'photo' | 'video') {
  cameraStream.value?.getTracks().forEach(tr => tr.stop())
  cameraStream.value = null
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera')
    const stream = await navigator.mediaDevices.getUserMedia(mode === 'video' ? { video: true, audio: true } : { video: true })
    if (!showCameraModal.value) { stream.getTracks().forEach(tr => tr.stop()); return }
    cameraStream.value = stream
    if (cameraVideoRef.value) cameraVideoRef.value.srcObject = stream
  } catch {
    cameraError.value = t('camFailed')
  }
}
async function switchCameraMode(mode: 'photo' | 'video') {
  if (cameraMode.value === mode || videoRecording.value) return
  cameraMode.value = mode
  cameraError.value = ''
  await nextTick()
  await acquireCamera(mode)
}
function closeCamera() {
  if (videoTimer) { clearInterval(videoTimer); videoTimer = null }
  if (videoRecorder && videoRecorder.state !== 'inactive') {
    videoRecorder.onstop = null
    videoRecorder.stop()
  }
  videoRecorder = null
  videoRecording.value = false
  cameraStream.value?.getTracks().forEach(tr => tr.stop())
  cameraStream.value = null
  cameraError.value = ''
  showCameraModal.value = false
}
async function startVideoCapture() {
  const stream = cameraStream.value
  const conversation = selectedChatId.value
  if (!stream || !conversation || videoRecording.value || uploading.value) return
  videoChunks = []
  videoElapsed.value = 0
  try {
    videoRecorder = new MediaRecorder(stream, { videoBitsPerSecond: 400000 })
  } catch {
    videoRecorder = new MediaRecorder(stream)
  }
  const rec = videoRecorder
  const sessionToken = token.value
  rec.ondataavailable = (e) => { if (e.data.size > 0) videoChunks.push(e.data) }
  rec.onstop = async () => {
    if (videoTimer) { clearInterval(videoTimer); videoTimer = null }
    videoRecording.value = false
    videoRecorder = null
    const mime = rec.mimeType || 'video/webm'
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogv' : 'webm'
    const file = new File(videoChunks, `video-${Date.now()}.${ext}`, { type: mime })
    videoChunks = []
    closeCamera()
    if (file.size === 0) return
    uploading.value = true
    try { await wrap(() => sendAttachmentFile(file, conversation, sessionToken)) }
    finally { uploading.value = false }
  }
  rec.start()
  videoRecording.value = true
  videoTimer = setInterval(() => {
    videoElapsed.value++
    if (videoElapsed.value >= 8 && videoRecorder) stopVideoCapture()
  }, 1000)
}
function stopVideoCapture() {
  if (videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop()
}
async function capturePhoto() {
  const video = cameraVideoRef.value
  const stream = cameraStream.value
  const conversation = selectedChatId.value
  if (!video || !stream || !conversation || video.videoWidth === 0) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')?.drawImage(video, 0, 0)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  closeCamera()
  if (!blob) { note.value = t('camFailed'); return }
  openEffectModal(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }), conversation)
}
async function uploadSelectedFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const conversation = selectedChatId.value
  if (!file || !conversation || uploading.value) return
  if (file.type.startsWith('image/')) {
    openEffectModal(file, conversation)
    return
  }
  uploading.value = true
  try { await wrap(() => sendAttachmentFile(file, conversation, token.value)) } finally { uploading.value = false }
}

// F9: photos shrink to 1600px before upload (GIF keeps animation).
async function shrinkPhotoForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
      if (scale >= 1) return file
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) return file
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!blob) return file
      return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg' })
    } finally {
      bitmap.close()
    }
  } catch {
    return file
  }
}
async function sendAttachmentFile(file: File, conversation: string, sessionToken: string, voiceDurationSec?: number) {
    if (voiceDurationSec === undefined) file = await shrinkPhotoForUpload(file)
    if (file.size === 0 || file.size > 512 * 1024) throw new Error(t('attachment_size_limit'))
    const room = chats.value.find((c) => c.id === conversation)
    // E7: seal bytes first in E2EE rooms; R2 only ever sees ciphertext.
    let uploadBytes = new Uint8Array(await file.arrayBuffer())
    let sealed: { key: string; iv: string; hash: string } | null = null
    if (room?.e2ee) {
      const { sealFile } = await import('../../../shared/e2ee/files.ts')
      const s = await sealFile(uploadBytes)
      const { b64uDecode } = await import('../../../shared/e2ee/codec.ts')
      uploadBytes = b64uDecode(s.ct)
      sealed = { key: s.key, iv: s.iv, hash: s.hash }
    }
    const bytes = uploadBytes
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    const checksum = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
    const kind = voiceDurationSec !== undefined ? 'voice' : file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'file'
    if (sessionToken !== token.value) return
    const att = await request<{ id: string; original_name: string }>('/api/v1/attachments', sessionToken, 'POST', {
      conversation_id: conversation,
      original_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      checksum_sha256: checksum,
      content_base64: btoa(binary),
      ...(sealed ? { encrypted: true } : {})
    })
    if (sessionToken !== token.value) return
    let wireKind = kind
    let wireBody = att.original_name
    let meta: Record<string, unknown> = { attachment_id: att.id, mime_type: file.type, size_bytes: file.size, ...(voiceDurationSec !== undefined ? { duration: voiceDurationSec } : {}) }
    if (sealed && room) {
      const c = e2eeClient()
      if (!c) return
      try {
        const out = await c.encryptOutbound(room, kind, att.original_name, {
          attachment_id: att.id, fileKey: sealed.key, fileIv: sealed.iv, fileHash: sealed.hash,
          mime_type: file.type, size_bytes: file.size, ...(voiceDurationSec !== undefined ? { duration: voiceDurationSec } : {}),
        })
        wireKind = out.kind
        wireBody = out.body
        meta = {}
      } catch (e) {
        error.value = t('message_queue_failed')
        return
      }
    }
    const res = await request<{ message: Message }>(`/api/v1/conversations/${conversation}/messages`, sessionToken, 'POST', {
      client_id: newClientID(),
      kind: wireKind,
      body: wireBody,
      metadata: meta
    })
    if (sessionToken === token.value && selectedChatId.value === conversation && !messages.value.some(m => m.id === res.message.id)) {
      if (wireKind === 'ciphertext') {
        res.message.kind = kind
        res.message.body = att.original_name
        res.message.metadata = { attachment_id: att.id, mime_type: file.type, size_bytes: file.size, ...(voiceDurationSec !== undefined ? { duration: voiceDurationSec } : {}), ...(sealed ? { fileKey: sealed.key, fileIv: sealed.iv, fileHash: sealed.hash } : {}) }
        res.message._e2ee = true
      }
      messages.value.push(res.message)
    }
    await loadChats()
}

async function downloadAttachment(message: Message) {
  const id = message.metadata?.attachment_id
  if (typeof id !== 'string') return
  await wrap(async () => {
    const response = await fetch(`${API_URL}/api/v1/attachments/${encodeURIComponent(id)}/content`, { headers: { Authorization: `Bearer ${token.value}` } })
    if (!response.ok) throw new Error(t('mvDownloadFailed'))
    let blob = await response.blob()
    // E7: sealed bytes open with the key that rode inside the message.
    const meta = message.metadata as Record<string, unknown> | undefined
    if (message._e2ee && meta && typeof meta.fileKey === 'string' && typeof meta.fileIv === 'string' && typeof meta.fileHash === 'string') {
      const { openFile } = await import('../../../shared/e2ee/files.ts')
      const { b64uEncode } = await import('../../../shared/e2ee/codec.ts')
      const pt = await openFile({
        key: meta.fileKey as string,
        iv: meta.fileIv as string,
        hash: meta.fileHash as string,
        ct: b64uEncode(new Uint8Array(await blob.arrayBuffer())),
      })
      blob = new Blob([pt.slice().buffer as ArrayBuffer])
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = message.body || 'attachment'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
}

// React to a message
async function reactToMessage(msgId: string, emoji: string) {
  if (!selectedChatId.value) return
  await wrap(async () => {
    const res = await api<{ reactions: Record<string, number> }>(`/api/v1/conversations/${selectedChatId.value}/messages/${msgId}/reactions`, 'POST', { reaction: emoji })
    const target = messages.value.find(m => m.id === msgId)
    if (target) target.reactions = res.reactions
  })
}

// Unsend message within 24h
async function unsendMessage(msgId: string) {
  if (!selectedChatId.value) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${selectedChatId.value}/messages/${msgId}`, 'DELETE')
    const target = messages.value.find(m => m.id === msgId)
    if (target) {
      // Mirror the server: flag set, body and metadata cleared. The renderers
      // show the marker from msg.unsent; stale metadata would re-render art.
      target.unsent = true
      target.body = ''
      target.metadata = undefined
    }
    note.value = t('mvUnsendOk')
  })
}

// Pin message as Announcement
// L-05: approval box data + decide actions.
async function loadProposalStates(convId: string) {
  try {
    const res = await api<{ proposals: Array<{ message_id: string; state: string }> }>(`/api/v1/conversations/${convId}/proposals`)
    const map: Record<string, string> = {}
    for (const p of res.proposals || []) map[p.message_id] = p.state
    proposalStates.value = map
  } catch {
    proposalStates.value = {}
  }
}
// F6: keep the chat list in sync with group settings changes.
function onGroupChanged(updated: Chat) {
  const i = chats.value.findIndex((c) => c.id === updated.id)
  if (i >= 0) chats.value[i] = { ...chats.value[i], ...updated }
}
async function onGroupLeft() {
  showGroupSettings.value = false
  selectedChatId.value = ''
  await loadChats()
}
async function openApprovalBox() {
  if (!selectedChatId.value) return
  await wrap(async () => {
    const res = await api<{ proposals: typeof approvalProposals.value }>(`/api/v1/conversations/${selectedChatId.value}/proposals`)
    approvalProposals.value = res.proposals || []
    showApprovalBox.value = true
  })
}
// E9: passphrase backup + restore. Keys come from the store export;
// history is a fresh decrypt of each sealed room (latest 200 per room,
// 8 MB total). Restored rows merge under live server messages.
const e2eeBackupBusy = ref(false)
const restoredHistory = ref<Record<string, Message[]>>({})
async function backupE2eeNow(passphrase: string) {
  const c = e2eeClient()
  if (!c) return
  e2eeBackupBusy.value = true
  try {
    const state = await c.store.exportState()
    const history: Record<string, Array<Record<string, unknown>>> = {}
    let total = 0
    for (const room of chats.value) {
      if (!room.e2ee) continue
      try {
        const res = await api<{ messages: Message[] }>(`/api/v1/conversations/${room.id}/messages?limit=200`)
        const list = res.messages || []
        await c.decryptInto(room.id, list)
        const rows = list
          .filter((m) => m.kind !== 'ciphertext' && !m._e2eeError && !m.unsent && typeof m.body === 'string')
          .map((m) => ({
            id: m.id,
            sender_id: m.sender_id,
            created_at: m.created_at,
            sequence: m.sequence || 0,
            kind: m.kind,
            body: m.body.slice(0, 4000),
            sealed: true,
            _restored: true,
          }))
        const size = JSON.stringify(rows).length
        if (total + size > 8 * 1024 * 1024) break
        total += size
        history[room.id] = rows
      } catch { /* one room must not block the rest */ }
    }
    const { encryptBackup } = await import('../../../shared/e2ee/backup.ts')
    const blob = await encryptBackup(passphrase, JSON.stringify({ v: 1, state, history }))
    await api('/api/v1/e2ee/backup', 'PUT', { blob })
    note.value = t('e2eeBkDone')
  } catch {
    note.value = t('e2eeBkFail')
  } finally {
    e2eeBackupBusy.value = false
  }
}
async function restoreE2eeNow(passphrase: string) {
  const c = e2eeClient()
  if (!c) return
  e2eeBackupBusy.value = true
  try {
    const res = await api<{ backup: { v: number; salt: string; iv: string; ct: string } | null }>('/api/v1/e2ee/backup')
    if (!res.backup) throw new Error('empty')
    const { decryptBackup } = await import('../../../shared/e2ee/backup.ts')
    const payload = JSON.parse(await decryptBackup(passphrase, res.backup))
    if (!payload || payload.v !== 1 || !payload.state) throw new Error('shape')
    await c.store.importState(payload.state)
    restoredHistory.value = (payload.history || {}) as Record<string, Message[]>
    note.value = t('e2eeBkRestored')
    if (selectedChatId.value) await selectChat(selectedChatId.value)
  } catch {
    // Restore failures never distinguish wrong passphrase from corruption.
    note.value = t('e2eeBkRestoreFail')
  } finally {
    e2eeBackupBusy.value = false
  }
}
// E9: safety-number modal for 1:1 sealed rooms.
const showSafetyModal = ref(false)
const safetyRows = ref<Array<{ device: string; edPub: string; number: string; lines: string[]; verified: boolean; changed: boolean }>>([])
const safetyLoading = ref(false)
const safetyPeerId = ref('')
const safetyMyCode = ref('')
async function openSafetyModal() {
  const room = chats.value.find((c) => c.id === selectedChatId.value)
  const peer = (room?.members || []).map((m: any) => m.id).find((id: string) => id && id !== currentUser.value?.id)
  const c = e2eeClient()
  if (!peer || !c) return
  safetyPeerId.value = peer
  safetyRows.value = []
  safetyMyCode.value = ''
  safetyLoading.value = true
  showSafetyModal.value = true
  try {
    safetyRows.value = await c.store.safetyNumbers(peer)
    safetyMyCode.value = c.store.myIdentity() || ''
  } catch {
    safetyRows.value = []
  } finally {
    safetyLoading.value = false
  }
}
async function verifySafetyDevice(device: string, edPub: string) {
  const c = e2eeClient()
  if (!c || !safetyPeerId.value) return
  await c.store.setVerified(safetyPeerId.value, device, edPub)
  await openSafetyModalRefresh()
}
async function openSafetyModalRefresh() {
  const c = e2eeClient()
  if (!c || !safetyPeerId.value) return
  safetyLoading.value = true
  try {
    safetyRows.value = await c.store.safetyNumbers(safetyPeerId.value)
  } catch { /* keep old rows */ } finally {
    safetyLoading.value = false
  }
}
// E8: "export this device's chats" — decrypted on-device cache to a
// JSON file. Sealed-but-unreadable rows export as a marker, never raw
// envelope bytes.
function exportDeviceChat() {
  if (!selectedChatId.value || !messages.value.length) {
    note.value = t('mvExportDeviceEmpty')
    return
  }
  const room = chats.value.find((c) => c.id === selectedChatId.value)
  const rows = messages.value
    .filter((m) => !m.unsent)
    .map((m) => {
      if (m.kind === 'ciphertext' || m._e2eeError) {
        return { id: m.id, sender_id: m.sender_id, created_at: m.created_at, sealed: true, unreadable: true, body: '' }
      }
      return { id: m.id, sender_id: m.sender_id, created_at: m.created_at, kind: m.kind, sealed: m._e2ee === true, body: typeof m.body === 'string' ? m.body : '' }
    })
  const doc = {
    export_version: 'device-1',
    room: { id: selectedChatId.value, title: room?.title || '', kind: (room as any)?.kind || '' },
    exported_at: new Date().toISOString(),
    exported_by: currentUser.value?.id || '',
    messages: rows
  }
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `luno-chat-${selectedChatId.value}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  note.value = t('mvExportDeviceDone')
}
// F4: report dialog actions + own history.
function openReportModal(friend: User) {
  reportTarget.value = friend
  reportCategory.value = 'spam'
  reportDetails.value = ''
  reportMessage.value = null
  reportE2eeConsent.value = false
  showReportModal.value = true
}
// E8: report from a chat bubble — quotes the message; sealed content
// rides only with the reporter's explicit consent.
function openReportForMessage(msg: Message) {
  reportTarget.value = { id: msg.sender_id } as User
  reportCategory.value = 'spam'
  reportDetails.value = ''
  reportMessage.value = msg._e2eeError ? null : msg
  reportE2eeConsent.value = false
  showReportModal.value = true
}
async function submitReport() {
  if (!reportTarget.value) return
  await wrap(async () => {
    const quoted = reportMessage.value
    const payload: Record<string, unknown> = {
      subject_user_id: reportTarget.value!.id,
      category: reportCategory.value,
      details: reportDetails.value
    }
    if (quoted) {
      payload.message_id = quoted.id
      if (typeof quoted.body === 'string' && quoted.body) {
        if (quoted._e2ee && !reportE2eeConsent.value) {
          delete payload.message_id
        } else {
          payload.e2ee_text = quoted.body.slice(0, 2000)
          if (quoted._e2ee) payload.plaintext_consent = true
        }
      }
    }
    await api('/api/v1/reports', 'POST', payload)
    note.value = t('reportDoneNote')
    showReportModal.value = false
    await loadMyReports()
  })
}
async function loadMyReports() {
  try {
    const res = await api<{ reports: typeof myReports.value }>('/api/v1/reports/mine')
    myReports.value = res.reports || []
  } catch {
    myReports.value = []
  }
}
function reportStateLabel(state: string): string {
  if (state === 'resolved') return t('reportStateResolved')
  if (state === 'dismissed') return t('reportStateDismissed')
  return t('reportStateOpen')
}
watch(showSettingsModal, (open) => { if (open) void loadMyReports(); else void ensureLinkPreviewPref() })
function approvalCanDecide(): boolean {
  const me = currentUser.value
  const chat = selectedChat.value
  if (!me || !chat) return false
  if ((me as User).role === 'admin') return true
  if (chat.kind === 'direct') return true
  if ((chat as Chat).my_role === 'admin') return true
  return (chat as Chat).owner_id === me.id
}
async function decideProposal(msgOrId: { id: string } | string, decision: 'approved' | 'rejected') {
  if (!selectedChatId.value) return
  const messageId = typeof msgOrId === 'string' ? msgOrId : msgOrId.id
  await wrap(async () => {
    await api(`/api/v1/conversations/${selectedChatId.value}/messages/${messageId}/decide`, 'POST', { decision })
    note.value = decision === 'approved' ? t('apprApprovedState') : t('apprRejectedState')
    await selectChat(selectedChatId.value)
    await loadProposalStates(selectedChatId.value)
    if (showApprovalBox.value) {
      const res = await api<{ proposals: typeof approvalProposals.value }>(`/api/v1/conversations/${selectedChatId.value}/proposals`).catch(() => ({ proposals: [] }))
      approvalProposals.value = res.proposals || []
    }
  })
}
async function pinMessage(msgId: string) {
  if (!selectedChatId.value) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${selectedChatId.value}/pins`, 'POST', { message_id: msgId })
    const res = await api<{ pins: any[] }>(`/api/v1/conversations/${selectedChatId.value}/pins`)
    pinnedList.value = res.pins || []
    note.value = t('mvNoticePinned')
  })
}

async function unpinMessage(msgId: string) {
  if (!selectedChatId.value) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${selectedChatId.value}/pins/${msgId}`, 'DELETE')
    pinnedList.value = pinnedList.value.filter(p => p.message_id !== msgId)
    note.value = t('mvNoticeUnpinned')
  })
}

// Save message to Keep
async function saveToKeep(msg: Message) {
  await wrap(async () => {
    await api('/api/v1/saved-messages', 'POST', {
      body: msg.body,
      kind: msg.kind,
      message_id: msg.id
    })
    await loadKeep()
    note.value = t('mvKeepSaved')
  })
}

async function deleteFromKeep(item: any) {
  const sid = item.id || item.message_id
  if (!sid) return
  await wrap(async () => {
    await api(`/api/v1/saved-messages/${sid}`, 'DELETE')
    await loadKeep()
    note.value = t('mvKeepDeleted')
  })
}

// Copy text helper
function copyMessageText(text: string) {
  navigator.clipboard.writeText(text)
  note.value = t('mvCopied')
}

// Reply message helper
function startReply(msg: Message) {
  replyToMessage.value = msg
}

// F7: delete-for-me hides one side; forward copies into another room.
const showForwardModal = ref(false)
const forwardTargetMsg = ref<Message | null>(null)
function openForwardPicker(msg: Message) {
  forwardTargetMsg.value = msg
  showForwardModal.value = true
}
async function hideMessage(msgId: string) {
  if (!selectedChatId.value) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${selectedChatId.value}/messages/${msgId}/hide`, 'POST')
    messages.value = messages.value.filter((m) => m.id !== msgId)
    note.value = t('mvHideDone')
  })
}
async function doForward(chatId: string) {
  const msg = forwardTargetMsg.value
  if (!msg || !selectedChatId.value) return
  await wrap(async () => {
    // E5: forwarding into an E2EE room re-encrypts client-side.
    const targetRoom = chats.value.find((c) => c.id === chatId)
    if (targetRoom?.e2ee) {
      const c = e2eeClient()
      if (!c) return
      const readable = c.readableBody(msg)
      if (!readable) {
        error.value = t('mvE2eeUnreadable')
        return
      }
      try {
        const out = await c.encryptOutbound(targetRoom, readable.kind === 'ciphertext' ? 'text' : readable.kind, readable.body)
        await api(`/api/v1/conversations/${chatId}/messages`, 'POST', { client_id: newClientID(), kind: out.kind, body: out.body })
      } catch (e) {
        error.value = t('mvE2eeUnreadable')
        return
      }
    } else {
      await api(`/api/v1/conversations/${selectedChatId.value}/messages/${msg.id}/forward`, 'POST', { to_conversation_id: chatId })
    }
    showForwardModal.value = false
    forwardTargetMsg.value = null
    note.value = t('mvForwarded')
    if (chatId === selectedChatId.value) await selectChat(chatId)
    else await loadChats()
  })
}

// --- Polls & Events ---
async function createPoll() {
  if (!selectedChatId.value || !newPollQuestion.value.trim() || !newPollOption1.value.trim() || !newPollOption2.value.trim()) return
  const convId = selectedChatId.value
  await wrap(async () => {
    const opts = [newPollOption1.value.trim(), newPollOption2.value.trim()]
    if (newPollOption3.value.trim()) opts.push(newPollOption3.value.trim())
    await api<any>(`/api/v1/conversations/${convId}/polls`, 'POST', {
      question: newPollQuestion.value.trim(),
      options: opts
    })
    if (selectedChatId.value === convId) await loadPolls(convId)
    newPollQuestion.value = ''
    newPollOption1.value = ''
    newPollOption2.value = ''
    newPollOption3.value = ''
    showPollCreateModal.value = false
    note.value = t('mvPollCreated')
  })
}

async function votePoll(pollId: string, optId: string) {
  await wrap(async () => {
    const res = await api<{ poll: any }>(`/api/v1/polls/${pollId}/vote`, 'POST', { option_id: optId })
    const idx = activePolls.value.findIndex(p => p.id === pollId)
    if (idx !== -1 && res.poll) {
      activePolls.value[idx] = res.poll
    }
  })
}

async function createEvent() {
  if (!selectedChatId.value || !newEventTitle.value.trim() || !newEventDate.value) return
  await wrap(async () => {
    const ev = await api<any>(`/api/v1/conversations/${selectedChatId.value}/events`, 'POST', {
      title: newEventTitle.value.trim(),
      starts_at: newEventDate.value,
      location: newEventLocation.value.trim()
    })
    chatEvents.value.unshift(ev)
    newEventTitle.value = ''
    newEventDate.value = ''
    newEventLocation.value = ''
    showEventCreateModal.value = false
    note.value = t('mvEventCreated')
  })
}


// --- Wallet & Pay ---
function openSendMoneyModal(friend: User) {
  sendTargetFriend.value = friend
  sendAmountInput.value = 10000
  sendMemoInput.value = t('mvSendMemoDefault')
  showSendMoneyModal.value = true
}

function openSendMoneyFromChat() {
  const f = friends.value.find(fr => fr.display_name === selectedChat.value?.title) || friends.value[0];
  if (f) openSendMoneyModal(f);
}

async function executeSendMoney() {
  if (!sendTargetFriend.value || sendAmountInput.value <= 0) return
  await wrap(async () => {
    const res = await api<{ balance: number }>('/api/v1/wallet/send', 'POST', {
      to_user_id: sendTargetFriend.value!.id,
      amount: sendAmountInput.value,
      note: sendMemoInput.value
    })
    walletBalance.value = res.balance
    showSendMoneyModal.value = false
    note.value = t('mvSentMoney').replace('{name}', sendTargetFriend.value!.display_name).replace('{amount}', formatKRW(sendAmountInput.value))
    await Promise.all([loadWallet(), loadChats()])
  })
}

async function executeChargeMoney(amount: number) {
  await wrap(async () => {
    const res = await api<{ balance: number }>('/api/v1/wallet/charge', 'POST', { amount })
    walletBalance.value = res.balance
    showChargeModal.value = false
    note.value = t('mvChargedMoney').replace('{amount}', formatKRW(amount))
    await loadWallet()
  })
}

// --- Friends & Direct Chat ---
async function startDirectChat(friend: User) {
  await wrap(async () => {
    const existingId = findDirectChatId(chats.value, currentUser.value?.id || '', friend.id)
    if (existingId) {
      activeNav.value = 'chats'
      await selectChat(existingId)
      return
    }
    const c = await api<{ id: string }>('/api/v1/conversations', 'POST', {
      kind: 'direct',
      member_ids: [friend.id],
      title: friend.display_name
    })
    await loadChats()
    if (!chats.value.some(chat => chat.id === c.id)) {
      error.value = t('mvDirectOpenFailed')
      return
    }
    activeNav.value = 'chats'
    await selectChat(c.id)
  })
}

// F6: join a group from a pasted invite link or raw token.
async function joinByLink() {
  const raw = joinLinkInput.value.trim()
  if (!raw) return
  const token = raw.includes('/invite/') ? raw.slice(raw.lastIndexOf('/invite/') + 8).split(/[?#\s]/)[0] : raw.split(/[?#\s]/)[0]
  if (!token) return
  await wrap(async () => {
    const c = await api<Chat>('/api/v1/conversations/join', 'POST', { token })
    joinLinkInput.value = ''
    showCreateGroupModal.value = false
    await loadChats()
    note.value = t('gsJoined')
    await selectChat(c.id)
  })
}
async function createGroupChat() {
  if (!groupTitleInput.value.trim() || selectedFriendsForGroup.value.length === 0) return
  await wrap(async () => {
    const c = await api<{ id: string }>('/api/v1/conversations', 'POST', {
      kind: 'group',
      title: groupTitleInput.value.trim(),
      member_ids: selectedFriendsForGroup.value
    })
    groupTitleInput.value = ''
    selectedFriendsForGroup.value = []
    showCreateGroupModal.value = false
    await loadChats()
    activeNav.value = 'chats'
    await selectChat(c.id)
    note.value = t('mvGroupCreated')
  })
}

async function addFriendByHandle() {
  if (!addFriendHandleInput.value.trim()) return
  await wrap(async () => {
    await api('/api/v1/friends', 'POST', { handle: addFriendHandleInput.value.trim() })
    addFriendHandleInput.value = ''
    showAddFriendModal.value = false
    await loadFriends()
    note.value = t('mvFriendAdded')
  })
}

async function searchUsersForAdd() {
  const q = addFriendHandleInput.value.trim()
  if (q.length < 2) return
  await wrap(async () => {
    const res = await api<{ users: User[] }>(`/api/v1/users?q=${encodeURIComponent(q)}`)
    addFriendResults.value = res.users || []
    addFriendSearched.value = true
    if (addFriendResults.value.length === 0) error.value = t('mvAddFriendNoMatch')
  })
}

async function addFriendById(id: string) {
  await wrap(async () => {
    await api('/api/v1/friends', 'POST', { friend_id: id })
    addFriendHandleInput.value = ''
    addFriendResults.value = []
    addFriendSearched.value = false
    showAddFriendModal.value = false
    await loadFriends()
    note.value = t('mvFriendAdded')
  })
}

// --- Stories & VOOM ---
async function publishStory() {
  if (!newStoryText.value.trim()) return
  await wrap(async () => {
    const bgs = [
      'linear-gradient(135deg, #2563EB, #22C7E8)',
      'linear-gradient(135deg, #7C3AED, #2563EB)',
      'linear-gradient(135deg, #6366f1, #8b5cf6)'
    ]
    const chosenBg = bgs[Math.floor(Math.random() * bgs.length)]
    const txt = newStoryText.value.trim()
    await api('/api/v1/stories', 'POST', {
      text: txt,
      body: txt,
      bg: chosenBg
    })
    newStoryText.value = ''
    showNewStoryModal.value = false
    note.value = t('mvStoryPosted')
    await loadTimelineStories()
  })
}

async function createVoomPost() {
  if (!newVoomBody.value.trim()) return
  await wrap(async () => {
    await api('/api/v1/voom', 'POST', {
      body: newVoomBody.value.trim(),
      media_emoji: '🎬',
      tags: ['LINE_VOOM', 'Shorts']
    })
    newVoomBody.value = ''
    showVoomCreateModal.value = false
    note.value = t('mvVoomPosted')
    await loadTimelineStories()
  })
}

async function likeVoomPost(id: string) {
  await wrap(async () => {
    const res = await api<any>(`/api/v1/voom/${id}/like`, 'POST', {})
    const item = voomVideos.value.find(v => v.id === id)
    if (item && res) {
      item.like_count = res.likes ?? res.like_count ?? 0
      item.likes = res.likes ?? res.like_count ?? 0
      item.liked = res.liked
    }
  })
}

async function submitVoomComment(postId: string) {
  const txt = (newVoomComment.value[postId] || '').trim()
  if (!txt) return
  await wrap(async () => {
    await api(`/api/v1/voom/${postId}/comments`, 'POST', { text: txt })
    newVoomComment.value[postId] = ''
    await loadTimelineStories()
  })
}

// --- OpenChat Community Actions ---
async function createOpenChatRoom() {
  if (!newOpenChatRoomName.value.trim()) return
  await wrap(async () => {
    await api('/api/v1/community/rooms', 'POST', {
      name: newOpenChatRoomName.value.trim(),
      description: newOpenChatRoomDesc.value.trim(),
      nickname: currentUser.value?.display_name || 'Member'
    })
    newOpenChatRoomName.value = ''
    newOpenChatRoomDesc.value = ''
    showCreateOpenChatModal.value = false
    await loadOpenChatRooms()
    note.value = t('mvOpenChatCreated')
  })
}

async function selectOpenChatRoom(room: { id: string; name: string; description: string }) {
  selectedOpenChatRoom.value = room
  await wrap(async () => {
    await api(`/api/v1/community/rooms/${room.id}/join`, 'POST', {
      nickname: currentUser.value?.display_name || 'Member'
    }).catch(() => {})
    const res = await api<{ posts: any[] }>(`/api/v1/community/rooms/${room.id}/posts`)
    openChatPosts.value = res.posts || []
  })
}

async function submitOpenChatPost() {
  if (!selectedOpenChatRoom.value || !newOpenChatPostBody.value.trim()) return
  const rid = selectedOpenChatRoom.value.id
  await wrap(async () => {
    await api(`/api/v1/community/rooms/${rid}/posts`, 'POST', { body: newOpenChatPostBody.value.trim() })
    newOpenChatPostBody.value = ''
    const res = await api<{ posts: any[] }>(`/api/v1/community/rooms/${rid}/posts`)
    openChatPosts.value = res.posts || []
  })
}

// --- Profile & Device Management ---


// --- Settings & Themes ---
function switchTheme(theme: 'mint' | 'ocean' | 'sunset' | 'sakura' | 'midnight') {
  activeTheme.value = theme
  darkMode.value = theme === 'midnight'
  note.value = t('mvThemeChanged').replace('{name}', theme.toUpperCase())
}


// I-4: realtime transport (names unchanged; template and mount hooks untouched).
const {
  realtimeState,
  connectRealtime,
  stopRealtime,
  processOfflineQueue,
  handleNetworkOnline,
  handleNetworkOffline,
  handleVisibilityChange,
  startMessageSyncLoop,
  stopMessageSyncLoop,
  resetReconnect,
} = useChatSocket({
  onProfileUpdated: (userId: string) => {
    // Debounced: a photo + cover save arrives as two events.
    if (profileRefreshTimer) clearTimeout(profileRefreshTimer)
    profileRefreshTimer = setTimeout(() => {
      void loadChats()
      void loadFriends()
      if (userId && userId === currentUser.value?.id) {
        void api<User>('/api/v1/me').then((me) => { if (me) currentUser.value = { ...currentUser.value, ...me } as User }).catch(() => {})
      }
    }, 300)
  },
  selectedChatId,
  messages,
  messagesCanvasRef,
  scrollToBottom,
  autoTranslateEnabled,
  handleTranslateMessage,
  loadChats,
  loadPolls,
  loadKeep,
  onAuthExpired: () => clearLocalSession(),
  activeCall,
  handleIncomingCallSignal,
  handleIncomingRing,
  endCallLocally,
  startCallTimer,
  clearNoAnswerTimer,
  handleGroupUserJoined,
  handleGroupUserLeft,
  handleGroupSignal,
  chatTitleOf: (convId: string) => chats.value.find((c) => c.id === convId)?.title || 'LUNO',
  encryptQueued: async (convId: string, kind: string, body: string) => {
    const room = chats.value.find((c) => c.id === convId)
    const c = e2eeClient()
    if (!room?.e2ee || !c || kind !== 'text') return { kind, body }
    return c.encryptOutbound(room, kind, body)
  },
})

// I-4: session lifecycle (names unchanged).
const {
  currentDeviceId,
  handleSecurityNoticeLogout,
  revokeDevice,
  logout,
  clearLocalSession,
} = useAuth({
  pendingSends,
  sendingConversations,
  discardVoiceRecording,
  stopRealtime,
  resetReconnect,
  chats,
  selectedChatId,
  conversationDrafts,
  draftMessage,
  replyToMessage,
  messages,
  stopCallTimer,
  invalidateChatSelection: () => { chatSelectVersion++ },
  loadDevices,
  router,
})


onBeforeUnmount(() => {
  endCallLocally()
  discardVoiceRecording()
  for (const controller of pendingSends.values()) controller.abort()
  stopRealtime()
  stopMessageSyncLoop()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleNetworkOnline)
    window.removeEventListener('offline', handleNetworkOffline)
  }
})
// Phase 1 to Phase 6 Extended Actions


async function exportUserDataArchive() {
  await wrap(async () => {
    const data = await api<object>('/api/v1/me/export-data')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `luno_backup_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    note.value = t('mvBackupDone')
  })
}

const deletePasswordInput = ref('')
const deleteReasonInput = ref('')
const deleteConfirmInput = ref('')
async function deleteUserAccount() {
  if (!deletePasswordInput.value) { error.value = t('mvDeletePwRequired'); return }
  if (!deleteConfirmInput.value) { error.value = t('mvDeleteConfirmRequired'); return }
  if (!confirm(t('mvDeleteConfirm'))) return
  await wrap(async () => {
    const res = await api<{ status: string; grace_until?: string }>('/api/v1/me', 'DELETE', {
      password: deletePasswordInput.value,
      reason: deleteReasonInput.value || undefined,
      confirm_text: deleteConfirmInput.value
    })
    deletePasswordInput.value = ''
    deleteReasonInput.value = ''
    deleteConfirmInput.value = ''
    if (res.status === 'deletion_scheduled') note.value = t('mvDeleteScheduledNote')
    logout()
  })
}


function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (showSettingsModal.value) showSettingsModal.value = false
    if (showNewChatModal.value) showNewChatModal.value = false
    if (showAddFriendModal.value) showAddFriendModal.value = false
    if (showPasswordModal.value) showPasswordModal.value = false
    if (activeNewsArticle.value) activeNewsArticle.value = null
    if (selectedFriendProfile.value) selectedFriendProfile.value = null
    if (showQrModal.value) showQrModal.value = false
  }
}

// FX-07: iOS keyboards shrink the visual viewport; while one is open the
// composer sticks to the viewport bottom instead of hiding behind it.
function syncKeyboardOpen() {
  const vv = window.visualViewport
  if (!vv) return
  const open = vv.height < window.innerHeight - 120
  document.documentElement.classList.toggle('keyboard-open', open)
  // The phone room pane follows the visible area so the composer stays above the keyboard.
  document.documentElement.style.setProperty('--lx-vv-h', `${Math.round(vv.height)}px`)
}

onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // Reconcile durable messages when an edge isolate cannot fan out to another one.
  startMessageSyncLoop()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleNetworkOnline)
    window.addEventListener('offline', handleNetworkOffline)
    window.addEventListener('keydown', handleGlobalKeydown)
    if (window.visualViewport) window.visualViewport.addEventListener('resize', syncKeyboardOpen)
  }
  await fetchAppVersion()
  void ensureLinkPreviewPref()
  applyRouteNav()
  const resumed = await ensureSession()
  if (resumed) {
    currentDeviceId.value = readStoredDeviceId()
    try {
      if (!currentUser.value) currentUser.value = await api<User>('/api/v1/me')
      await loadInitialData()
      // After the token is restored: firing earlier sends this request
      // without auth and logs a 401 on every screen load.
      void ensureTranslateLanguages()
      // P1-4: re-assert the closed-browser push subscription on every
      // authenticated mount (idempotent; silent without VAPID keys).
      void syncWebPushSubscription()
      await connectRealtime()
    } catch {
      clearLocalSession()
      void router.push('/login')
    }
  }
  startHeroCarousel()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleNetworkOnline)
    window.removeEventListener('offline', handleNetworkOffline)
    window.removeEventListener('keydown', handleGlobalKeydown)
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', syncKeyboardOpen)
    document.documentElement.classList.remove('keyboard-open')
  }
  if (heroCarouselTimer) clearInterval(heroCarouselTimer)
})

</script>

<template>


    <!-- Messenger shell: rail (PC/tablet) · list pane · main pane · tab bar (phone) -->
    <main id="lx-main" class="lx-shell" :class="{ 'is-detail': mobileDetailOpen, 'is-page': PAGE_NAVS.includes(activeNav) }">
      <a class="lx-skip-link" href="#lx-list">{{ t('lxSkipToMain') }}</a>
      <nav class="lx-rail" :aria-label="t('lxMainNav')">
        <button type="button" class="lx-rail-me" :title="t('profileTitle')" :aria-label="t('profileTitle')" @click="activeProfileUser = currentUser">
          <span class="lx-avatar s40" :style="{ background: currentUser?.avatar_color || 'var(--ln-accent)' }"><span>{{ initialOf(currentUser?.display_name) }}</span><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span>
          <span v-if="realtimeState === 'connected'" class="lx-online-dot" :title="t('connection_connected')"></span>
        </button>

        <div class="lx-rail-nav">
          <button
            v-for="item in PRIMARY_NAV"
            :key="item.nav"
            type="button"
            class="lx-rail-btn"
            :class="{ active: activeNav === item.nav }"
            :aria-current="activeNav === item.nav ? 'page' : undefined"
            @click="switchNav(item.nav)"
          >
            <span class="lx-rail-icon">
              <LunoIcon :name="item.icon" :size="22" />
              <span v-if="item.nav === 'chats' && totalUnreadCount > 0" class="lx-badge">{{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}</span>
            </span>
            <span class="lx-rail-label">{{ t(item.label) }}</span>
          </button>
          <button
            type="button"
            class="lx-rail-btn"
            data-shot="more"
            :class="{ active: showMorePanel || MORE_NAVS.includes(activeNav) }"
            :aria-expanded="showMorePanel"
            @click="showMorePanel = !showMorePanel"
          >
            <span class="lx-rail-icon"><LunoIcon name="open-apps" :size="22" /></span>
            <span class="lx-rail-label">{{ t('lxMore') }}</span>
          </button>
        </div>

        <div class="lx-rail-foot">
          <button type="button" class="lx-rail-tool" :title="t('navKeep')" :aria-label="t('navKeep')" @click="showKeepModal = true">
            <LunoIcon name="keep" :size="20" />
          </button>
          <button
            type="button"
            class="lx-rail-tool"
            :title="notificationsEnabled ? t('mvNotifOnTitle') : t('mvDndTitle')"
            :aria-label="notificationsEnabled ? t('mvNotifOnTitle') : t('mvDndTitle')"
            :aria-pressed="!notificationsEnabled"
            @click="toggleNotifications"
          >
            <LunoIcon :name="notificationsEnabled ? 'bell' : 'bell-off'" :size="20" />
          </button>
          <button type="button" class="lx-rail-tool" data-shot="settings" :title="t('navSettings')" :aria-label="t('navSettings')" @click="showSettingsModal = true">
            <LunoIcon name="settings" :size="20" />
          </button>
        </div>
      </nav>

      <!-- More: every secondary destination, each with a name -->
      <div v-if="showMorePanel" class="lx-more-layer" @click.self="showMorePanel = false">
        <section class="lx-more" role="dialog" :aria-label="t('lxMore')">
          <header class="lx-more-head">
            <h2>{{ t('lxMore') }}</h2>
            <button type="button" class="lx-icon-btn" :title="t('mvClose')" :aria-label="t('mvClose')" @click="showMorePanel = false"><LunoIcon name="close" :size="18" /></button>
          </header>
          <button type="button" class="lx-more-me" @click="activeProfileUser = currentUser; showMorePanel = false">
            <span class="lx-avatar s44" :style="{ background: currentUser?.avatar_color || 'var(--ln-accent)' }"><span>{{ initialOf(currentUser?.display_name) }}</span><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span>
            <span class="lx-more-me-text">
              <strong>{{ currentUser?.display_name }}</strong>
              <small>{{ currentUser?.handle ? '@' + currentUser.handle : currentUser?.email }}</small>
            </span>
            <span class="lx-more-me-go" aria-hidden="true">›</span>
          </button>
          <div class="lx-more-grid">
            <button
              v-for="item in visibleMoreItems"
              :key="item.id"
              type="button"
              class="lx-more-item"
              :class="{ active: item.nav && activeNav === item.nav }"
              @click="runMoreItem(item.id)"
            >
              <span class="lx-more-icon"><LunoIcon :name="item.icon" :size="22" /></span>
              <span>{{ t(item.label) }}</span>
            </button>
          </div>
          <div v-if="consoleLinks.length" class="lx-more-links">
            <h3>{{ t('lxConsoles') }}</h3>
            <a v-for="link in consoleLinks" :key="link.href" :href="link.href" target="_blank" rel="noopener" class="lx-more-link" @click="showMorePanel = false">{{ t(link.label) }}</a>
          </div>
          <button type="button" class="lx-more-logout" @click="showMorePanel = false; logout()">{{ t('mvLogout') }}</button>
        </section>
      </div>

      <!-- List pane -->
      <aside id="lx-list" class="lx-list" tabindex="-1">

        <!-- VIEW 1: FRIENDS / HOME (홈 및 친구 관리 - Section 3 & Screenshot 1) -->
        <FriendPanel
          v-if="activeNav === 'home'"
          :favorite-friends="favoriteFriends"
          :selected-friend-profile="selectedFriendProfile"
          :group-chats="groupChats"
          :selected-chat-id="selectedChatId"
          :official-accounts="officialAccounts"
          :filtered-friends="filteredFriends"
          v-model:friend-search-query="friendSearchQuery"
          @qr="showQrModal = true"
          @add-friend="showAddFriendModal = true"
          @profile="activeProfileUser = currentUser"
          @keep-memo="openKeepMemoChat"
          @select-friend="selectFriend"
          @direct-chat="startDirectChat"
          @friend-menu="openFriendContextMenu"
          @select-chat="selectChat"
          @follow-oa="followOrOpenOfficialAccount"
        />

        <!-- VIEW 2: CHATS (전체 대화 - Screenshot 4 & Section 11) -->
        <ChatList
          v-else-if="activeNav === 'chats'"
          :filtered-chats="filteredChats"
          :selected-chat-id="selectedChatId"
          :channel-slot="channelSlot"
          :format-time="formatListTime"
          v-model:chat-filter="chatFilter"
          v-model:search-keyword="searchKeyword"
          v-model:chat-sort-asc="chatSortAsc"
          @mark-all-read="markAllChatsRead"
          @drawer="toggleDrawer"
          @new-chat="showNewChatModal = true"
          @qr="showQrModal = true"
          @select="selectChat"
          @chat-menu="openChatContextMenu"
        />

        <!-- NEWS: full-width page (hero + ranked list) -->
        <div v-else-if="activeNav === 'news'" class="lx-pane lx-page">
          <div class="lx-pane-head">
            <h2 class="lx-pane-title">{{ t('mvNews') }}</h2>
          </div>
          <div class="lx-chips">
            <button
              v-for="cat in NEWS_CATEGORY_IDS"
              :key="cat"
              type="button"
              class="lx-chip"
              :class="{ active: selectedNewsCategory === cat }"
              @click="selectedNewsCategory = cat"
            >
              {{ newsCatLabel(cat) }}
            </button>
          </div>
          <div class="lx-scroll">
            <div class="lx-page-body">
              <p v-if="newsIsSample" class="lx-notice">{{ t('mvNewsSampleBanner') }}</p>
              <div class="lx-news-layout">
                <article
                  v-if="heroNews"
                  class="lx-news-hero"
                  role="button"
                  tabindex="0"
                  @click="openNewsArticle(heroNews)"
                  @keydown.enter="openNewsArticle(heroNews)"
                  @keydown.space.prevent="openNewsArticle(heroNews)"
                  @mouseenter="isHeroHovered = true"
                  @mouseleave="isHeroHovered = false"
                >
                  <div class="lx-news-hero-media">
                    <img :src="heroNews.image_url" alt="" />
                    <span class="lx-news-hero-count">{{ activeHeroSlideIndex + 1 }} / {{ heroNewsSlides.length }}</span>
                    <button type="button" class="lx-news-hero-nav prev" :title="t('mvPrevArticle')" :aria-label="t('mvPrevArticle')" @click.stop="prevHeroSlide"><LunoIcon name="back" :size="18" /></button>
                    <button type="button" class="lx-news-hero-nav next" :title="t('mvNextArticle')" :aria-label="t('mvNextArticle')" @click.stop="nextHeroSlide"><LunoIcon name="chevron-right" :size="18" /></button>
                  </div>
                  <div class="lx-news-hero-text">
                    <h3>{{ heroNews.title }}</h3>
                    <small>{{ heroNews.press }} · {{ heroNews.published_at }}</small>
                  </div>
                  <div class="lx-news-dots" @click.stop>
                    <button
                      v-for="(slide, idx) in heroNewsSlides"
                      :key="slide.id"
                      type="button"
                      class="lx-news-dot"
                      :class="{ active: activeHeroSlideIndex === idx }"
                      :aria-label="t('mvSlide').replace('{n}', String(idx + 1))"
                      @click.stop="activeHeroSlideIndex = idx"
                    ></button>
                  </div>
                </article>

                <section class="lx-news-list">
                  <h3 class="lx-page-subtitle">{{ t('mvTodayPopular') }}</h3>
                  <div v-if="!filteredPopularNews.length" class="lx-list-empty lx-empty-illustrated">
                    <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="news" :size="28" /></span>
                    <p>{{ t('lxNoNews') }}</p>
                  </div>
                  <button
                    v-for="article in filteredPopularNews"
                    :key="article.id"
                    type="button"
                    class="lx-news-item"
                    @click="openNewsArticle(article)"
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

        <!-- CALLS: history list (detail opens in the main pane) -->
        <div v-else-if="activeNav === 'calls'" class="lx-pane">
          <div class="lx-pane-head">
            <h2 class="lx-pane-title">{{ t('mvCall') }}</h2>
            <button type="button" class="lx-text-btn" @click="showNewCallModal = true">
              <LunoIcon name="call-voice" :size="16" />
              <span>{{ t('mvNewCall') }}</span>
            </button>
          </div>
          <div class="lx-chips">
            <button type="button" class="lx-chip" :class="{ active: callFilter === 'all' }" @click="callFilter = 'all'">{{ t('tabAll') }} {{ callHistoryList.length }}</button>
            <button type="button" class="lx-chip" :class="{ active: callFilter === 'missed' }" @click="callFilter = 'missed'">{{ t('mvMissed') }}</button>
          </div>
          <div class="lx-scroll">
            <div v-if="!filteredCallHistory.length" class="lx-list-empty lx-empty-illustrated">
              <!-- One "new call" action lives in the header; the empty state
                   shows a quiet icon instead of a second copy of it. -->
              <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="calls" :size="28" /></span>
              <p>{{ t('lxNoCalls') }}</p>
            </div>
            <div
              v-for="log in filteredCallHistory"
              :key="log.id"
              class="lx-row"
              :class="{ selected: selectedCallRecord?.id === log.id }"
              role="button"
              tabindex="0"
              @click="selectedCallRecord = log"
              @keydown.enter="selectedCallRecord = log"
            >
              <span class="lx-avatar s44" :style="{ background: log.peer_avatar_color || 'var(--ln-accent)' }">{{ initialOf(log.peer_name) }}</span>
              <span class="lx-row-main">
                <span class="lx-row-title">
                  <span class="lx-row-name" :class="{ 'lx-danger': log.direction === 'missed' }">{{ log.peer_name }}</span>
                  <span v-if="log.count && log.count > 1" class="lx-row-count">({{ log.count }})</span>
                </span>
                <span class="lx-row-preview lx-call-sub">
                  <span class="call-kind-icon" :title="log.call_type === 'video' ? t('mvVideoCallLabel') : t('mvVoiceCall')"><LunoIcon :name="log.call_type === 'video' ? 'call-video' : 'call-voice'" :size="13" /></span>
                  <span>{{ log.direction === 'missed' ? t('mvMissedCall') : log.direction === 'incoming' ? t('mvIncomingCall') : t('mvOutgoingCall') }}</span>
                  <span>· {{ log.timestamp_text }}</span>
                  <span v-if="log.duration_text">· {{ log.duration_text }}</span>
                </span>
              </span>
              <button
                type="button"
                class="lx-icon-btn lx-call-again"
                :title="t('mvCallBack').replace('{name}', log.peer_name)"
                :aria-label="t('mvCallBack').replace('{name}', log.peer_name)"
                @click.stop="startCallFromHistory(log, normalizeCallKind(log.call_type))"
              >
                <LunoIcon :name="log.call_type === 'video' ? 'call-video' : 'call-voice'" :size="19" />
              </button>
            </div>
          </div>
        </div>

        <!-- VOOM: full-width feed -->
        <div v-else-if="activeNav === 'voom'" class="lx-pane lx-page">
          <div class="lx-pane-head">
            <h2 class="lx-pane-title">VOOM</h2>
            <button type="button" class="lx-text-btn" @click="showNewStoryModal = true">
              <LunoIcon name="plus" :size="16" />
              <span>{{ t('mvAddStory') }}</span>
            </button>
          </div>
          <div class="lx-scroll">
            <div class="lx-page-body">
              <div class="lx-stories">
                <button type="button" class="lx-story" @click="showNewStoryModal = true">
                  <span class="lx-story-ring add"><LunoIcon name="plus" :size="22" /></span>
                  <small>{{ t('mvAddStory') }}</small>
                </button>
                <div v-for="s in stories" :key="s.id" class="lx-story">
                  <span class="lx-story-ring" :class="{ viewed: s.viewed }"><span class="lx-avatar s56" :style="{ background: s.bg || 'var(--ln-accent)' }"><span>{{ initialOf(s.author_name, 'L') }}</span><img v-if="s.author?.avatar_url" :src="s.author.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></span></span>
                  <small>{{ s.author_name || t('navFriends') }}</small>
                </div>
              </div>
              <div v-if="!voomVideos.length" class="lx-page-empty">
                <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="voom" :size="28" /></span>
                <strong>{{ t('lxNoVoom') }}</strong>
                <p>{{ t('lxNoVoomDesc') }}</p>
              </div>
              <div class="lx-voom-grid">
                <article v-for="v in voomVideos" :key="v.id" class="lx-card lx-voom-card">
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
                      <button type="button" class="lx-pill-btn" :class="{ liked: v.liked }" :aria-pressed="!!v.liked" @click="likeVoomPost(v.id)">
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

        <!-- OPEN CHAT: room list (the room opens in the main pane) -->
        <div v-else-if="activeNav === 'openchat'" class="lx-pane">
          <div class="lx-pane-head">
            <h2 class="lx-pane-title">{{ t('navOpenChat') }}</h2>
            <button type="button" class="lx-icon-btn" :title="t('mvCreateOpenChat')" :aria-label="t('mvCreateOpenChat')" @click="showCreateOpenChatModal = true"><LunoIcon name="plus" :size="20" /></button>
          </div>
          <div class="lx-scroll">
            <div v-if="!openChatRooms.length" class="lx-list-empty lx-empty-illustrated">
              <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="openchat" :size="28" /></span>
              <p>{{ t('lxNoOpenChat') }}</p>
              <button type="button" class="lx-text-btn" @click="showCreateOpenChatModal = true">{{ t('mvCreateOpenChat') }}</button>
            </div>
            <div
              v-for="room in openChatRooms"
              :key="room.id"
              class="lx-row"
              :class="{ selected: selectedOpenChatRoom?.id === room.id }"
              role="button"
              tabindex="0"
              @click="selectOpenChatRoom(room)"
              @keydown.enter="selectOpenChatRoom(room)"
            >
              <span class="lx-avatar s48" style="background: var(--ln-info)"><LunoIcon name="openchat" :size="22" /></span>
              <span class="lx-row-main">
                <span class="lx-row-name">{{ room.name }}</span>
                <span class="lx-row-preview">{{ room.description }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- WALLET: full-width page -->
        <div v-else-if="activeNav === 'wallet'" class="lx-pane lx-page">
          <div class="lx-pane-head">
            <h2 class="lx-pane-title">{{ t('mvWallet') }}</h2>
          </div>
          <!-- Audit P0-7: direct /wallet links land on an honest preparing
               panel while payments are off (the entry itself is hidden). -->
          <div v-if="!paymentsEnabled" class="lx-scroll">
            <div class="lx-page-body">
              <div class="lx-list-empty lx-empty-illustrated">
                <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="wallet" :size="28" /></span>
                <p>{{ t('mvPaymentsPreparing') }}</p>
              </div>
            </div>
          </div>
          <div v-else class="lx-scroll">
            <div class="lx-page-body lx-wallet">
              <section class="lx-pay-card">
                <div class="lx-pay-top">
                  <span>LUNO Pay</span>
                  <span>{{ walletPoints.toLocaleString() }} P</span>
                </div>
                <div class="lx-pay-balance">₩ {{ walletBalance.toLocaleString() }}</div>
                <div class="lx-pay-actions">
                  <button type="button" class="lx-pay-btn" @click="showChargeModal = true"><LunoIcon name="plus" :size="16" /><span>{{ t('mvCharge') }}</span></button>
                  <button type="button" class="lx-pay-btn" @click="showSendMoneyModal = true"><LunoIcon name="send" :size="16" /><span>{{ t('mvSend') }}</span></button>
                </div>
              </section>
              <section class="lx-card">
                <h3 class="lx-page-subtitle">{{ t('lxShortcuts') }}</h3>
                <div class="lx-shortcuts">
                  <button type="button" class="lx-more-item" @click="switchNav('shop')"><span class="lx-more-icon"><LunoIcon name="shop" :size="22" /></span><span>{{ t('lxStickerShop') }}</span></button>
                  <button type="button" class="lx-more-item" @click="switchNav('voom')"><span class="lx-more-icon"><LunoIcon name="voom" :size="22" /></span><span>{{ t('lxVoom') }}</span></button>
                  <button type="button" class="lx-more-item" @click="showSettingsModal = true"><span class="lx-more-icon"><LunoIcon name="settings" :size="22" /></span><span>{{ t('mvThemeSettings') }}</span></button>
                </div>
              </section>
              <section class="lx-card">
                <h3 class="lx-page-subtitle">{{ t('mvRecentTx') }}</h3>
                <div v-if="!walletTx.length" class="lx-list-empty lx-empty-illustrated">
                  <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="wallet" :size="28" /></span>
                  <p>{{ t('lxNoTx') }}</p>
                </div>
                <div v-for="tx in walletTx.slice(0, 20)" :key="tx.id" class="lx-tx-row">
                  <span class="lx-tx-main">
                    <strong>{{ tx.title || tx.note || tx.kind || t('mvTxFallback') }}</strong>
                    <small>{{ formatTime(tx.created_at) }}</small>
                  </span>
                  <span class="lx-tx-amount" :class="{ plus: tx.amount > 0 }">{{ (tx.amount > 0 ? '+' : '') + formatKRW(tx.amount) }}</span>
                </div>
              </section>
            </div>
          </div>
        </div>

        <!-- STICKER SHOP: full-width page -->
        <div v-else-if="activeNav === 'shop'" class="lx-pane lx-page">
          <div class="lx-pane-head">
            <h2 class="lx-pane-title">{{ t('shopTitle') }}</h2>
          </div>
          <div class="lx-scroll">
            <div class="lx-page-body">
              <p class="lx-notice">{{ t('shopPayNote') }}</p>
              <p v-if="storeLoading" class="lx-list-empty">{{ t('attachment_loading') }}</p>
              <div v-else-if="!storePacks.length" class="lx-list-empty lx-empty-illustrated">
                <span class="lx-empty-icon" aria-hidden="true"><LunoIcon name="shop" :size="28" /></span>
                <p>{{ t('shopEmpty') }}</p>
              </div>
              <div class="lx-shop-grid">
                <article v-for="pk in storePacks" :key="pk.id" class="lx-card lx-shop-card">
                  <div class="lx-shop-strip">
                    <span v-for="(s, i) in pk.stickers.slice(0, 8)" :key="i">{{ s }}</span>
                  </div>
                  <div class="lx-shop-meta">
                    <span class="lx-shop-text">
                      <strong>{{ pk.title }}</strong>
                      <small v-if="pk.description">{{ pk.description }}</small>
                    </span>
                    <span v-if="pk.owned" class="lx-shop-tag owned">{{ t('shopOwned') }}</span>
                    <span v-else class="lx-shop-tag">{{ pk.priceMinor <= 0 ? t('shopFree') : pk.priceMinor.toLocaleString() + ' ' + pk.currency }}</span>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main pane: room / profile / call detail / empty state -->
      <section class="lx-main">
      <section v-if="activeNav === 'calls'" class="lx-detail">
        <button v-if="selectedCallRecord" type="button" class="lx-icon-btn lx-back lx-detail-back" :title="t('mvGoBack')" :aria-label="t('mvGoBack')" @click="selectedCallRecord = null">
          <LunoIcon name="back" :size="20" />
        </button>
        <div v-if="selectedCallRecord" class="pc-call-detail-card">
          <div class="profile-preview-avatar" :style="{ background: selectedCallRecord.peer_avatar_color || '#315BCD' }">
            {{ initialOf(selectedCallRecord.peer_name) }}
          </div>
          <h2 class="profile-preview-name">{{ selectedCallRecord.peer_name }}</h2>
          <p class="profile-preview-bio">
            <span :class="{ 'text-red': selectedCallRecord.direction === 'missed' }">
              {{ selectedCallRecord.direction === 'missed' ? t('mvMissedCall') : selectedCallRecord.direction === 'incoming' ? t('mvIncomingCall') : t('mvOutgoingCall') }}
            </span>
            · {{ selectedCallRecord.timestamp_text }}
            <span v-if="selectedCallRecord.duration_text">({{ selectedCallRecord.duration_text }})</span>
          </p>
          <div class="profile-preview-actions">
            <button class="btn-start-chat-large" @click="startCallFromHistory(selectedCallRecord, 'voice')">{{ t('mvFreeCallVoice') }}</button>
            <div class="profile-preview-subactions">
              <button type="button" class="btn-subaction-pill" @click="startCallFromHistory(selectedCallRecord, 'video')">
                <LunoIcon name="call-video" :size="16" />
                <span>{{ t('mvVideoCallLabel') }}</span>
              </button>
              <button type="button" class="btn-subaction-pill" @click="openChatFromCallRecord(selectedCallRecord)">
                <LunoIcon name="chats" :size="16" />
                <span>{{ t('mvGotoDirect') }}</span>
              </button>
              <button type="button" class="btn-subaction-pill" @click="removeCallRecord(selectedCallRecord.id); selectedCallRecord = callHistoryList[0] || null">
                <span>{{ t('mvDeleteHistory') }}</span>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="pc-empty-dialog">
          <div class="pc-watermark-wrap">
            <LunoIcon name="calls" :size="68" />
          </div>
          <h3 class="pc-empty-title">{{ t('mvFreeCallsTitle') }}</h3>
          <p class="pc-empty-desc">{{ t('mvFreeCallsDesc') }}</p>
        </div>
      </section>

      <section v-else-if="activeNav === 'openchat' && selectedOpenChatRoom" class="lx-room">
        <header class="lx-room-head">
          <button type="button" class="lx-icon-btn lx-back" :title="t('mvGoBack')" :aria-label="t('mvGoBack')" @click="selectedOpenChatRoom = null">
            <LunoIcon name="back" :size="20" />
          </button>
          <span class="lx-avatar s36" style="background: var(--ln-info);"><LunoIcon name="openchat" :size="18" /></span>
          <div class="lx-room-title">
            <div class="lx-room-name">
              <span class="lx-room-name-text">{{ selectedOpenChatRoom.name }}</span>
              <span class="badge-verified">{{ t('mvPublicCommunity') }}</span>
            </div>
            <small class="lx-room-state">{{ selectedOpenChatRoom.description }}</small>
          </div>
        </header>
        <div class="pc-chat-messages-canvas">
          <p v-if="!openChatPosts.length" class="empty-muted" style="margin:auto;">{{ t('mvFirstPost') }}</p>
          <div v-for="post in openChatPosts" :key="post.id" class="openchat-post-card">
            <div class="openchat-post-meta">
              <strong>{{ t('mvAnonMember').replace('{id}', post.author_id.slice(0, 6)) }}</strong>
              <small>{{ formatTime(post.created_at) }}</small>
            </div>
            <p class="openchat-post-body">{{ post.body }}</p>
          </div>
        </div>
        <footer class="lx-composer-dock">
          <form class="lx-composer" @submit.prevent="submitOpenChatPost">
            <span class="lx-composer-tools lx-composer-count">{{ newOpenChatPostBody.length }}/500</span>
            <textarea
              v-model="newOpenChatPostBody"
              class="lx-composer-input"
              :placeholder="t('mvOpenChatPh')"
              :aria-label="t('mvOpenChatPh')"
              rows="1"
              maxlength="500"
              @keydown.enter.exact.prevent="submitOpenChatPost"
            ></textarea>
            <button class="lx-send btn-green-send" :title="t('mvSubmit')" :aria-label="t('mvSubmit')" :disabled="!newOpenChatPostBody.trim()">
              <LunoIcon name="send" :size="18" />
              <span class="lx-send-label">{{ t('mvSubmit') }}</span>
            </button>
          </form>
        </footer>
      </section>


      <MessagePane
        v-else-if="selectedChat"
        :selected-chat="selectedChat"
        :selected-chat-id="selectedChatId"
        :chats="chats"
        :realtime-state="realtimeState"
        :chat-wallpaper="chatWallpaper"
        :pinned-list="pinnedList"
        :active-polls="activePolls"
        :chat-notes="chatNotes"
        :chat-albums="chatAlbums"
        :chat-events="chatEvents"
        :chat-media-list="chatMediaList"
        :chat-search-results="chatSearchResults"
        :messages="messages"
        :proposal-states="proposalStates"
        :is-loading-messages="isLoadingMessages"
        :has-earlier-messages="hasEarlierMessages"
        :earlier-messages-loading="earlierMessagesLoading"
        :earlier-messages-error="earlierMessagesError"
        :conversation-error="conversationError"
        :message-translations="messageTranslations"
        :translate-configured="translateConfigured"
        :link-previews-enabled="linkPreviewsEnabled"
        :translate-languages="translateLanguages"
        :sending-conversations="sendingConversations"
        :filtered-stickers="filteredStickers"
        :uploading="uploading"
        :effect-file="effectFile"
        :effect-preview-url="effectPreviewUrl"
        :show-camera-modal="showCameraModal"
        :camera-mode="cameraMode"
        :camera-error="cameraError"
        :video-recording="videoRecording"
        :video-elapsed="videoElapsed"
        :is-recording-voice="isRecordingVoice"
        :messages-canvas-ref="paneRefs.canvas"
        :attachment-input="paneRefs.file"
        :camera-video-ref="paneRefs.camera"
        :format-time="formatTime"
        :format-date-divider="formatDateDivider"
        :should-show-date-divider="shouldShowDateDivider"
        :is-group-lead="isGroupLead"
        :is-group-tail="isGroupTail"
        :get-sticker-svg="getStickerSvg"
        v-model:auto-translate-enabled="autoTranslateEnabled"
        v-model:target-translate-lang="targetTranslateLang"
        v-model:active-drawer="activeDrawer"
        v-model:chat-search-query="chatSearchQuery"
        v-model:new-note-body="newNoteBody"
        v-model:new-album-title="newAlbumTitle"
        v-model:reply-to-message="replyToMessage"
        v-model:draft-message="draftMessage"
        v-model:show-sticker-picker="showStickerPicker"
        v-model:active-sticker-category="activeStickerCategory"
        v-model:sticker-replay="stickerReplay"
        v-model:editing-message-id="editingMessageId"
        v-model:editing-message-body="editingMessageBody"
        v-model:effect-choice="effectChoice"
        @back="selectedChatId = ''"
        @call="handleRoomCall"
        @drawer="toggleDrawer"
        @cycle-wallpaper="cycleWallpaper"
        @unpin="unpinMessage"
        @vote="votePoll"
        @search="runConversationSearch"
        @create-note="createNote"
        @delete-note="deleteNoteItem"
        @create-album="createAlbum"
        @rsvp="rsvpEvent"
        @new-event="showEventCreateModal = true"
        @load-earlier="loadEarlierMessages"
        @retry="selectChat(selectedChatId)"
        @security-logout="handleSecurityNoticeLogout"
        @password="showPasswordModal = true"
        @message-menu="openMessageContextMenu"
        @save-edit="saveEditMessage"
        @react="reactToMessage"
        @translate="handleTranslateMessage"
        @reply="startReply"
        @edit-start="startEditMessage"
        @keep="saveToKeep"
        @pin="pinMessage"
        @unsend="unsendMessage"
        @forward="openForwardPicker"
        @export-device="exportDeviceChat"
        @safety-code="openSafetyModal"
        @hide="hideMessage"
        @decide="decideProposal"
        @approvals="openApprovalBox"
        @group-settings="showGroupSettings = true"
        @scroll-bottom="scrollToBottom"
        @sticker="sendSticker"
        @file-change="uploadSelectedFile"
        @effect-close="closeEffectModal"
        @effect-send="sendEffectPhoto"
        @camera-close="closeCamera"
        @camera-mode="switchCameraMode"
        @photo="capturePhoto"
        @video-start="startVideoCapture"
        @video-stop="stopVideoCapture"
        @camera-open="openCamera"
        @attach="chooseAttachment"
        @voice-toggle="toggleVoiceRecording"
        @poll-create="showPollCreateModal = true"
        @location="sendLocationMessage"
        @contact="sendContactMessage"
        @capture="captureScreenToChat"
        @send-money="openSendMoneyFromChat"
        @send="sendMessage"
        @send-command="sendCommand"
        @composer-enter="handleComposerEnter"
      />

      <!-- Case B: Friend Profile Selected Preview (Screenshot 5) -->
      <section v-else-if="selectedFriendProfile" class="lx-detail">
        <button type="button" class="lx-icon-btn lx-back lx-detail-back" :title="t('mvGoBack')" :aria-label="t('mvGoBack')" @click="selectedFriendProfile = null">
          <LunoIcon name="back" :size="20" />
        </button>
        <div class="pc-profile-preview-card">
          <div class="profile-preview-avatar" :style="{ background: selectedFriendProfile.avatar_color || 'var(--ln-accent)' }">
            {{ initialOf(selectedFriendProfile.display_name) }}
          </div>
          <h2 class="profile-preview-name">{{ selectedFriendProfile.display_name }} <span v-if="(selectedFriendProfile as any).kind === 'bot'" class="badge-bot">BOT</span></h2>
          <p v-if="taglineOf(selectedFriendProfile)" class="profile-preview-bio">
            {{ taglineOf(selectedFriendProfile) }}
          </p>
          <div class="profile-preview-actions">
            <!-- Large Prominent Start Chat Button (Matching Screenshot 5) -->
            <button class="btn-start-chat-large" @click="onStartChatFromProfile(selectedFriendProfile)">
              {{ t('startChatBtn') }}
            </button>
            <div class="profile-preview-subactions">
              <button type="button" class="btn-subaction-pill" :title="t('mvVoiceCall')" @click="startCallWithUser(selectedFriendProfile, 'voice')">
                <LunoIcon name="call-voice" :size="16" />
                <span>{{ t('mvVoiceCall') }}</span>
              </button>
              <button type="button" class="btn-subaction-pill" :title="t('mvVideoCallLabel')" @click="startCallWithUser(selectedFriendProfile, 'video')">
                <LunoIcon name="call-video" :size="16" />
                <span>{{ t('mvVideoCallLabel') }}</span>
              </button>
              <button type="button" class="btn-subaction-pill" :title="t('mvSendMoney')" @click="openSendMoneyModal(selectedFriendProfile)">
                <LunoIcon name="money" :size="16" />
                <span>{{ t('mvSendMoney') }}</span>
              </button>
              <button type="button" class="btn-subaction-pill" :title="t('mvFavTitle')" @click="toggleFriendFavorite(selectedFriendProfile)">
                <span>{{ (selectedFriendProfile as any).is_favorite ? t('mvFaved') : t('mvFav') }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Case C: Clean Neutral Desktop Empty State (Screenshots 1 & 4) -->
      <section v-else class="lx-empty">
        <div class="pc-empty-dialog">
          <div class="pc-watermark-wrap">
            <LunoIcon v-if="emptyMain" :name="emptyMain.icon" :size="64" />
            <img v-else :src="lunoMark" alt="LUNO" width="72" height="72" />
          </div>
          <h3 class="pc-empty-title">{{ emptyMain ? emptyMain.title : t('emptyChatTitle') }}</h3>
          <p class="pc-empty-desc">{{ emptyMain ? emptyMain.desc : t('emptyChatDesc') }}</p>
        </div>
      </section>

      </section>

      <!-- Phone: bottom tab bar (hidden while a room or profile is open) -->
      <nav class="lx-tabbar" :aria-label="t('mvBottomNav')">
        <button
          v-for="item in PRIMARY_NAV"
          :key="item.nav"
          type="button"
          class="lx-tab"
          :class="{ active: activeNav === item.nav && !showMorePanel }"
          :aria-current="activeNav === item.nav && !showMorePanel ? 'page' : undefined"
          @click="showMorePanel = false; switchNav(item.nav)"
        >
          <span class="lx-tab-icon">
            <LunoIcon :name="item.icon" :size="24" />
            <span v-if="item.nav === 'chats' && totalUnreadCount > 0" class="lx-badge">{{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}</span>
          </span>
          <span class="lx-tab-label">{{ t(item.label) }}</span>
        </button>
        <button
          type="button"
          class="lx-tab"
          data-shot="more"
          :class="{ active: showMorePanel || MORE_NAVS.includes(activeNav) }"
          :aria-expanded="showMorePanel"
          @click="showMorePanel = !showMorePanel"
        >
          <span class="lx-tab-icon"><LunoIcon name="open-apps" :size="24" /></span>
          <span class="lx-tab-label">{{ t('lxMore') }}</span>
        </button>
      </nav>
    </main>

    <!-- QR SCANNER & MY QR CODE MODAL -->
    <div v-if="showQrModal" class="modal-backdrop" @click.self="showQrModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvMyQr') }}</h3>
          <button class="btn-modal-close" @click="showQrModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form" style="align-items:center;text-align:center;">
          <p class="modal-subtext">{{ t('mvQrDesc') }}</p>
          <div class="pc-qr-matrix-card" style="margin:12px auto;" v-html="myQrSvg"></div>
          <p class="muted">@{{ currentUser?.handle || 'luno_user' }}</p>
          <div class="modal-actions-right" style="width:100%;justify-content:center;">
            <button class="btn-primary" @click="showQrModal = false; showAddFriendModal = true">{{ t('mvSearchById') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ARTICLE READER MODAL (News Details from Screenshot 5) -->
    <div v-if="activeNewsArticle" class="modal-backdrop pc-modal-backdrop" @click.self="activeNewsArticle = null">
      <div class="standard-modal-box pc-modal-card news-reader-modal">
        <div class="news-reader-header">
          <span class="news-reader-press">{{ activeNewsArticle.press }}</span>
          <div class="news-reader-actions">
            <button class="btn-news-action" :title="newsBookmarks.has(activeNewsArticle.id) ? t('mvBookmarkRemove') : t('mvBookmarkSave')" :aria-label="newsBookmarks.has(activeNewsArticle.id) ? t('mvBookmarkRemove') : t('mvBookmarkSave')" @click="toggleNewsBookmark(activeNewsArticle.id)">
              {{ newsBookmarks.has(activeNewsArticle.id) ? '🔖' : '📑' }}
            </button>
            <button class="btn-news-action" :title="t('mvClose')" :aria-label="t('mvClose')" @click="activeNewsArticle = null">✕</button>
          </div>
        </div>
        <div class="news-reader-body">
          <img :src="activeNewsArticle.image_url" :alt="activeNewsArticle.title" class="news-reader-img" />
          <h2 class="news-reader-title">{{ activeNewsArticle.title }}</h2>
          <div class="news-reader-meta">
            <span>{{ activeNewsArticle.published_at }}</span> · <span>{{ t('mvViewsLabel') }} {{ activeNewsArticle.views || t('mvViewsDefault') }}</span>
          </div>
          <div class="news-reader-content">
            <p>{{ activeNewsArticle.summary || activeNewsArticle.content }}</p>
            <p style="margin-top: 12px; color: var(--ln-muted); font-size: 13px; line-height: 1.6;">{{ t('mvNewsSeedNote') }}</p>
          </div>

          <!-- News Comments Section -->
          <div class="news-comments-box" style="margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">{{ t('mvReaderComments').replace('{n}', String((newsArticleComments[activeNewsArticle.id] || []).length)) }}</h4>
            <div v-if="(newsArticleComments[activeNewsArticle.id] || []).length" style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px;">
              <div v-for="c in newsArticleComments[activeNewsArticle.id]" :key="c.id" style="font-size: 12px; background: #f8fafc; padding: 6px 10px; border-radius: 8px;">
                <b>{{ c.author }}</b> <span style="color:#94a3b8; font-size:11px;">{{ c.time }}</span>
                <p style="margin-top:2px;">{{ c.text }}</p>
              </div>
            </div>
            <div v-else style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">{{ t('mvFirstComment') }}</div>
            <form @submit.prevent="addNewsComment(activeNewsArticle.id)" style="display:flex; gap:6px;">
              <input v-model="newCommentInput" :placeholder="t('mvCommentPh')" style="flex:1; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:16px;" />
              <button type="submit" class="btn-primary" style="padding:6px 12px; font-size:12px;">{{ t('mvSubmit') }}</button>
            </form>
          </div>
        </div>
        <div class="news-reader-footer">
          <button class="btn-share-to-chat" @click="shareNewsToChat(activeNewsArticle)">{{ t('mvShareToChat') }}</button>
        </div>
      </div>
    </div>

<!-- CALLING OVERLAY MODAL (WebRTC Voice & Video Call with AI Live Captions) -->

    <CallModal
      v-if="activeCall"
      :active-call="activeCall"
      :call-media-issue="callMediaIssue"
      :call-duration="callDuration"
      :format-duration="formatDuration"
      :call-recording="callRecording"
      :is-call-muted="isCallMuted"
      :is-call-video-off="isCallVideoOff"
      :is-screen-sharing="isScreenSharing"
      :local-video-ref="callVideoRefs.local"
      :remote-video-ref="callVideoRefs.remote"
      :target-translate-lang="targetTranslateLang"
      v-model:is-call-speaker-on="isCallSpeakerOn"
      v-model:call-video-filter="callVideoFilter"
      @mute="toggleCallMute"
      @video="toggleCallVideo"
      @camera-switch="cycleCallCamera"
      @screenshare="toggleScreenShare"
      @record="toggleCallRecording"
      @answer="updateCallState('connected')"
      @decline="updateCallState('declined')"
      @hangup="updateCallState('ended')"
    />

    <GroupCallModal
      v-if="groupCall"
      :group-call="groupCall"
      :peers="groupPeers"
      :self-name="currentUser?.display_name || t('mvMe')"
      :self-stream="groupLocalStream"
      :group-call-duration="groupCallDuration"
      :format-duration="formatDuration"
      :is-group-muted="isGroupMuted"
      :is-group-video-off="isGroupVideoOff"
      @mute="toggleGroupMute"
      @video="toggleGroupVideo"
      @camera-switch="cycleGroupCamera"
      @hangup="leaveGroupCall"
    />

    <!-- PROFILE MODAL (Full LUNO User Profile View) -->
    <div v-if="activeProfileUser" class="modal-backdrop" @click.self="activeProfileUser = null">
      <div class="profile-modal-card" role="dialog" aria-modal="true" :aria-label="t('profileTitle')">
        <div class="profile-cover-header" data-testid="profile-cover" :style="(activeProfileUser as any).cover_url ? { backgroundImage: `url(${(activeProfileUser as any).cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: activeProfileUser.avatar_color || 'var(--ln-accent)' }">
          <button class="btn-modal-close" @click="activeProfileUser = null" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="profile-avatar-center">
          <div class="avatar-circle xl"><span>{{ initialOf(activeProfileUser.display_name) }}</span><img v-if="activeProfileUser.avatar_url" :src="activeProfileUser.avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" /></div>
        </div>
        <div v-if="activeProfileUser.id === currentUser?.id" class="profile-photo-controls" :aria-busy="photoSaving">
          <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="file-input-hidden" tabindex="-1" aria-hidden="true" @change="changeProfilePhoto" />
          <button class="btn-secondary" :disabled="photoSaving" @click="photoInput?.click()">{{ photoSaving ? t('profile_saving') : t('profile_photo_change') }}</button>
          <button v-if="currentUser?.avatar_url" class="btn-secondary" :disabled="photoSaving" @click="removeProfilePhoto">{{ t('profile_photo_remove') }}</button>
          <input ref="coverInput" type="file" accept="image/jpeg,image/png,image/webp" class="file-input-hidden" tabindex="-1" aria-hidden="true" @change="changeCoverPhoto" />
          <button class="btn-secondary" :disabled="photoSaving" @click="coverInput?.click()">{{ photoSaving ? t('profile_saving') : t('profile_cover_change') }}</button>
          <button v-if="(currentUser as any)?.cover_url" class="btn-secondary" :disabled="photoSaving" @click="removeCoverPhoto">{{ t('profile_cover_remove') }}</button>
          <small>{{ t('profile_photo_hint') }}</small>
          <p v-if="photoError" role="alert" class="ln-profile-error">{{ photoError }}</p>
        </div>
        <div class="profile-body-center">
          <h2>{{ activeProfileUser.display_name }} <span v-if="(activeProfileUser as any).kind === 'bot'" class="badge-bot">BOT</span></h2>
          <div v-if="activeProfileUser.handle" class="user-handle">@{{ activeProfileUser.handle }}</div>
          <p class="user-status-text">{{ taglineOf(activeProfileUser) || t('profile_empty') }}</p>
          <p v-if="activeProfileUser.id === currentUser?.id && currentUser?.email" class="user-handle">{{ currentUser?.email }}</p>
        </div>
        <div v-if="activeProfileUser.id === currentUser?.id" class="profile-actions-footer">
          <button class="btn-profile-action" @click="showSettingsModal = true; activeProfileUser = null">{{ t('profileEdit') }}</button>
          <button class="btn-profile-action" @click="showPasswordModal = true; activeProfileUser = null">{{ t('profile_account') }}</button>
          <p class="ln-profile-preparing">{{ t('profile_visibility_preparing') }}</p>
        </div>
        <div v-else class="profile-actions-footer">
          <button class="btn-profile-action" @click="startDirectChat(activeProfileUser); activeProfileUser = null">
            {{ t('profileChat') }}
          </button>
          <button class="btn-profile-action" @click="startDirectChat(activeProfileUser); startCall('voice'); activeProfileUser = null">
            {{ t('profileVoice') }}
          </button>
          <button class="btn-profile-action" @click="startDirectChat(activeProfileUser); startCall('video'); activeProfileUser = null">
            {{ t('profileVideo') }}
          </button>
          <button class="btn-profile-action" @click="openSendMoneyModal(activeProfileUser); activeProfileUser = null">{{ t('mvSendShort') }}</button>
        </div>
      </div>
    </div>

    <!-- KEEP VAULT MODAL -->
    <div v-if="showKeepModal" class="modal-backdrop" @click.self="showKeepModal = false">
      <div class="standard-modal-box keep-modal">
        <div class="modal-header">
          <h3>{{ t('mvKeepTitle').replace('{n}', String(keepItems.length)) }}</h3>
          <button class="btn-modal-close" @click="showKeepModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="keep-filter-bar">
          <button :class="{ active: keepFilter === 'all' }" @click="keepFilter = 'all'">{{ t('tabAll') }}</button>
          <button :class="{ active: keepFilter === 'text' }" @click="keepFilter = 'text'">{{ t('mvKeepText') }}</button>
          <button :class="{ active: keepFilter === 'image' }" @click="keepFilter = 'image'">{{ t('mvKeepMedia') }}</button>
          <button :class="{ active: keepFilter === 'link' }" @click="keepFilter = 'link'">{{ t('mvKeepLink') }}</button>
        </div>
        <input v-model="keepSearch" :placeholder="t('mvKeepSearchPh')" class="keep-search-input" />
        <div class="keep-scroll-content">
          <p v-if="!filteredKeepItems.length" class="empty-muted">{{ t('mvKeepEmpty') }}</p>
          <div v-for="k in filteredKeepItems" :key="k.id || k.message_id" class="keep-item-card">
            <div class="keep-item-header">
              <span class="badge-keep-type">{{ k.kind }}</span>
              <button class="btn-delete-keep" @click="deleteFromKeep(k)">{{ t('mvDeleteItem') }}</button>
            </div>
            <div class="keep-body-text">{{ k.body }}</div>
            <small class="muted">{{ new Date(k.created_at).toLocaleString('ko-KR') }}</small>
          </div>
        </div>
      </div>
    </div>

    <!-- SEND MONEY MODAL -->
    <div v-if="showSendMoneyModal" class="modal-backdrop" @click.self="showSendMoneyModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvSendMoneyTitle') }}</h3>
          <button class="btn-modal-close" @click="showSendMoneyModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <p class="muted" style="margin: 0; font-size: 11.5px; color: #64748b;">{{ t('mvSandboxNotice') }}</p>
          <p v-if="!paymentsEnabled" class="muted" style="margin: 0; font-size: 12px; color: #b45309;">{{ t('mvPaymentsPreparing') }}</p>
          <div v-if="sendTargetFriend" class="send-target-info">
            {{ t('mvSendTo') }} <strong>{{ sendTargetFriend.display_name }}</strong>
          </div>
          <label>{{ t('mvSendAmount') }}</label>
          <input v-model.number="sendAmountInput" type="number" min="1000" step="1000" />
          <div class="quick-amounts">
            <button @click="sendAmountInput = 10000">{{ t('mvPlus10k') }}</button>
            <button @click="sendAmountInput = 30000">{{ t('mvPlus30k') }}</button>
            <button @click="sendAmountInput = 50000">{{ t('mvPlus50k') }}</button>
            <button @click="sendAmountInput = 100000">{{ t('mvPlus100k') }}</button>
          </div>
          <label>{{ t('mvSendMemo') }}</label>
          <input v-model="sendMemoInput" :placeholder="t('mvMemoPh')" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showSendMoneyModal = false">{{ t('mvCancel') }}</button>
            <button class="btn-primary" :disabled="!paymentsEnabled" @click="executeSendMoney">{{ t('mvMockSend') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CHARGE MONEY MODAL -->
    <div v-if="showChargeModal" class="modal-backdrop" @click.self="showChargeModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvChargeTitle') }}</h3>
          <button class="btn-modal-close" @click="showChargeModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <p>{{ t('mvChargePick') }}</p>
          <p class="ln-charge-notice" role="note">{{ t('mvChargeNotice') }}</p>
          <p v-if="!paymentsEnabled" class="ln-charge-preparing" role="note">{{ t('mvPreparing') }}</p>
          <div class="charge-options-grid">
            <button class="btn-charge-option" :disabled="!paymentsEnabled" :title="t('mvChargeDisabledTitle')" @click="executeChargeMoney(10000)">{{ t('mvCharge10k') }}</button>
            <button class="btn-charge-option" :disabled="!paymentsEnabled" :title="t('mvChargeDisabledTitle')" @click="executeChargeMoney(30000)">{{ t('mvCharge30k') }}</button>
            <button class="btn-charge-option" :disabled="!paymentsEnabled" :title="t('mvChargeDisabledTitle')" @click="executeChargeMoney(50000)">{{ t('mvCharge50k') }}</button>
            <button class="btn-charge-option" :disabled="!paymentsEnabled" :title="t('mvChargeDisabledTitle')" @click="executeChargeMoney(100000)">{{ t('mvCharge100k') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE POLL MODAL -->
    <div v-if="showPollCreateModal" class="modal-backdrop" @click.self="showPollCreateModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvPollTitle') }}</h3>
          <button class="btn-modal-close" @click="showPollCreateModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <label>{{ t('mvPollQ') }}</label>
          <input v-model="newPollQuestion" :placeholder="t('mvPollQPh')" />
          <label>{{ t('mvOpt1') }}</label>
          <input v-model="newPollOption1" :placeholder="t('mvOpt1')" />
          <label>{{ t('mvOpt2') }}</label>
          <input v-model="newPollOption2" :placeholder="t('mvOpt2')" />
          <label>{{ t('mvOpt3') }}</label>
          <input v-model="newPollOption3" :placeholder="t('mvOpt3Ph')" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showPollCreateModal = false">{{ t('mvCancel') }}</button>
            <button class="btn-primary" @click="createPoll">{{ t('mvPollSubmit') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE EVENT MODAL -->
    <div v-if="showEventCreateModal" class="modal-backdrop" @click.self="showEventCreateModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvEventTitle') }}</h3>
          <button class="btn-modal-close" @click="showEventCreateModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <label>{{ t('mvEventName') }}</label>
          <input v-model="newEventTitle" :placeholder="t('mvEventNamePh')" />
          <label>{{ t('mvEventWhen') }}</label>
          <input v-model="newEventDate" type="datetime-local" />
          <label>{{ t('mvEventWhere') }}</label>
          <input v-model="newEventLocation" :placeholder="t('mvEventWherePh')" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showEventCreateModal = false">{{ t('mvCancel') }}</button>
            <button class="btn-primary" @click="createEvent">{{ t('mvAddEvent') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- SETTINGS & THEMES MODAL -->

    <div v-if="showReportModal" class="modal-backdrop" @click.self="showReportModal = false">
      <div class="standard-modal-box" role="dialog" :aria-label="t('reportTitle')">
        <div class="modal-header">
          <h3>{{ t('reportTitle') }}</h3>
          <button class="btn-modal-close" @click="showReportModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <label class="pc-input-row">
            <span>{{ t('reportCategory') }}</span>
            <select v-model="reportCategory" class="pc-login-input">
              <option value="spam">{{ t('reportCatSpam') }}</option>
              <option value="abuse">{{ t('reportCatAbuse') }}</option>
              <option value="harassment">{{ t('reportCatHarassment') }}</option>
              <option value="illegal_filming">{{ t('reportCatIllegalFilming') }}</option>
              <option value="child_exploitation">{{ t('reportCatChildExploitation') }}</option>
              <option value="violence">{{ t('reportCatViolence') }}</option>
              <option value="other">{{ t('reportCatOther') }}</option>
            </select>
          </label>
          <label class="pc-input-row">
            <span>{{ t('reportDetails') }}</span>
            <textarea v-model="reportDetails" class="pc-login-input" rows="3" maxlength="2000" />
          </label>
          <label v-if="reportMessage && reportMessage._e2ee" class="pc-input-row" style="flex-direction: row; align-items: center; gap: 8px;">
            <input v-model="reportE2eeConsent" type="checkbox" />
            <span>{{ t('reportE2eeConsent') }}</span>
          </label>
          <p v-if="reportMessage" style="margin: 0; padding: 8px 10px; border-left: 3px solid #888; background: rgb(0 0 0 / 5%); font-size: 13px; white-space: pre-wrap; word-break: break-word;">{{ reportMessage.body }}</p>
          <button class="btn-pc-submit-full" type="button" @click="submitReport">
            {{ t('reportSubmit') }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="showSafetyModal" class="modal-backdrop" @click.self="showSafetyModal = false">
      <div class="standard-modal-box" role="dialog" :aria-label="t('e2eeSfTitle')">
        <div class="modal-header">
          <h3>{{ t('e2eeSfTitle') }}</h3>
          <button class="btn-modal-close" @click="showSafetyModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <p class="muted" style="font-size: 12px; margin: 0">{{ t('e2eeSfHow') }}</p>
          <div v-if="safetyLoading" class="muted" style="font-size: 12px">…</div>
          <div v-else-if="!safetyRows.length" class="muted" style="font-size: 12px">{{ t('e2eeSfNone') }}</div>
          <div v-for="row in safetyRows" :key="row.device" style="border: 1px solid rgb(0 0 0 / 10%); border-radius: 8px; padding: 8px 10px">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px">
              <code style="font-size: 12px">{{ row.device }}</code>
              <span v-if="row.verified" class="badge-status-on" style="font-size: 11px">{{ t('e2eeSfVerified') }}</span>
              <button v-else class="btn-secondary" style="font-size: 11px; padding: 3px 8px" @click="verifySafetyDevice(row.device, row.edPub)">
                {{ t('e2eeSfVerify') }}
              </button>
            </div>
            <pre style="font-size: 13px; line-height: 1.7; margin: 6px 0 0; white-space: pre-wrap; font-family: ui-monospace, monospace;">{{ row.lines.join('\n') }}</pre>
            <div v-if="row.changed" style="font-size: 11px; color: #b3261e; margin-top: 4px">⚠️ {{ t('e2eeSfChanged') }}</div>
          </div>
          <p v-if="safetyMyCode" class="muted" style="font-size: 11px; margin: 0; word-break: break-all">{{ t('e2eeSfMyCode') }}: <code>{{ safetyMyCode }}</code></p>
        </div>
      </div>
    </div>
    <ApprovalBox
      v-if="showApprovalBox && selectedChat"
      :proposals="approvalProposals"
      :can-decide="approvalCanDecide()"
      :room-title="selectedChat.title"
      @close="showApprovalBox = false"
      @decide="decideProposal"
    />
    <GroupSettingsModal
      v-if="showGroupSettings && selectedChat && selectedChat.kind === 'group'"
      :chat="selectedChat"
      :friends="friends"
      :my-id="currentUser?.id || ''"
      @close="showGroupSettings = false"
      @changed="onGroupChanged"
      @left="onGroupLeft"
    />
    <SettingsModal
      v-if="showSettingsModal"
      :devices-list="devicesList"
      :my-reports="myReports"
      :translate-configured="translateConfigured"
      :translate-languages="translateLanguages"
      v-model:target-translate-lang="targetTranslateLang"
      v-model:delete-password-input="deletePasswordInput"
      v-model:delete-reason-input="deleteReasonInput"
      v-model:delete-confirm-input="deleteConfirmInput"
      v-model:e2ee-busy="e2eeBackupBusy"
      @close="showSettingsModal = false"
      @export="exportUserDataArchive"
      @delete="deleteUserAccount"
      @revoke-device="revokeDevice"
      @e2ee-backup="backupE2eeNow"
      @e2ee-restore="restoreE2eeNow"
    />

    <div v-if="showContactPicker" class="modal-backdrop" @click.self="showContactPicker = false">
      <section class="standard-modal-box ln-contact-picker" role="dialog" aria-modal="true" aria-labelledby="contact-picker-title">
        <header class="modal-header"><h3 id="contact-picker-title">{{ t('contact_choose') }}</h3><button class="btn-modal-close" :aria-label="t('contact_close')" @click="showContactPicker = false">✕</button></header>
        <div class="modal-body-form">
          <p v-if="!friends.length" class="muted">{{ t('contact_empty') }}</p>
          <button v-for="friend in friends" :key="friend.id" type="button" class="btn-secondary ln-contact-choice" @click="shareContact(friend)"><strong>{{ friend.display_name }}</strong><small v-if="friend.handle">@{{ friend.handle }}</small></button>
        </div>
      </section>
    </div>
    <!-- PASSWORD CHANGE MODAL -->
    <div v-if="showPasswordModal" class="modal-backdrop" @click.self="showPasswordModal = false">
      <div class="standard-modal-box password-modal" style="max-width: 420px; width: 92vw;">
        <div class="modal-header">
          <h3>{{ t('mvPwChangeTitle') }}</h3>
          <button class="btn-modal-close" @click="showPasswordModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <form class="modal-body-form" @submit.prevent="submitPasswordChange">
          <p v-if="passwordChangeError" class="error-text" style="color: #ef4444; font-size: 12px; margin: 0;">{{ passwordChangeError }}</p>
          <label>{{ t('mvPwCurrent') }}</label>
          <input v-model="currentPasswordInput" type="password" :placeholder="t('mvPwCurrentPh')" required />
          <label>{{ t('mvPwNew') }}</label>
          <input v-model="newPasswordInput" type="password" :placeholder="t('mvPwNewPh')" required minlength="12" />
          <label>{{ t('mvPwConfirm') }}</label>
          <input v-model="confirmPasswordInput" type="password" :placeholder="t('mvPwConfirmPh')" required minlength="12" />
          <div class="modal-actions-right" style="margin-top: 14px;">
            <button type="button" class="btn-secondary" @click="showPasswordModal = false">{{ t('mvCancel') }}</button>
            <button type="submit" class="btn-primary">{{ t('mvPwChange') }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- NEW STORY MODAL -->
    <div v-if="showNewStoryModal" class="modal-backdrop" @click.self="showNewStoryModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvStoryTitle') }}</h3>
          <button class="btn-modal-close" @click="showNewStoryModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <label>{{ t('mvStoryText') }}</label>
          <input v-model="newStoryText" :placeholder="t('mvStoryPh')" @keydown.enter.prevent="publishStory" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showNewStoryModal = false">{{ t('mvCancel') }}</button>
            <button class="btn-primary" @click="publishStory">{{ t('mvPublish') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- NEW VOOM POST MODAL -->
    <div v-if="showVoomCreateModal" class="modal-backdrop" @click.self="showVoomCreateModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvVoomTitle') }}</h3>
          <button class="btn-modal-close" @click="showVoomCreateModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <label>{{ t('mvVoomBody') }}</label>
          <input v-model="newVoomBody" :placeholder="t('mvVoomPh')" @keydown.enter.prevent="createVoomPost" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showVoomCreateModal = false">{{ t('mvCancel') }}</button>
            <button class="btn-primary" @click="createVoomPost">{{ t('mvPublish') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE OPENCHAT MODAL -->
    <div v-if="showCreateOpenChatModal" class="modal-backdrop" @click.self="showCreateOpenChatModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvOpenChatTitle') }}</h3>
          <button class="btn-modal-close" @click="showCreateOpenChatModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <label>{{ t('mvOpenChatName') }}</label>
          <input v-model="newOpenChatRoomName" :placeholder="t('mvOpenChatNamePh')" />
          <label>{{ t('mvDesc') }}</label>
          <input v-model="newOpenChatRoomDesc" :placeholder="t('mvDescPh')" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showCreateOpenChatModal = false">{{ t('mvCancel') }}</button>
            <button class="btn-primary" @click="createOpenChatRoom">{{ t('mvCreateRoom') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE GROUP MODAL -->
    <div v-if="showCreateGroupModal" class="modal-backdrop" @click.self="showCreateGroupModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvGroupTitle') }}</h3>
          <button class="btn-modal-close" @click="showCreateGroupModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <label>{{ t('mvGroupName') }}</label>
          <input v-model="groupTitleInput" :placeholder="t('mvGroupNamePh')" />
          <label>{{ t('mvGroupInvite').replace('{n}', String(selectedFriendsForGroup.length)) }}</label>
          <div class="select-friends-scroll">
            <label v-for="f in friends" :key="f.id" class="friend-check-item">
              <input v-model="selectedFriendsForGroup" type="checkbox" :value="f.id" />
              <span>{{ f.display_name }}</span>
            </label>
          </div>
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showCreateGroupModal = false">{{ t('mvCancel') }}</button>
            <button class="btn-primary" :disabled="!groupTitleInput.trim() || !selectedFriendsForGroup.length" @click="createGroupChat">{{ t('mvCreateGroup') }}</button>
          </div>
          <div class="setting-group">
            <strong>{{ t('gsJoinByLink') }}</strong>
            <div class="flex-row">
              <input v-model="joinLinkInput" :placeholder="t('gsJoinPh')" @keydown.enter.prevent="joinByLink" />
              <button class="btn-secondary" :disabled="!joinLinkInput.trim()" @click="joinByLink">{{ t('gsJoin') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- F7: FORWARD PICKER MODAL -->
    <div v-if="showForwardModal" class="modal-backdrop" @click.self="showForwardModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvForwardTo') }}</h3>
          <button class="btn-modal-close" @click="showForwardModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <div class="select-friends-scroll">
            <button v-for="c in chats.filter((c) => !c.official)" :key="c.id" class="friend-check-item" @click="doForward(c.id)">
              <span>{{ c.title || t('mvChatFallback') }}</span>
            </button>
          </div>
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showForwardModal = false">{{ t('mvCancel') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ADD FRIEND MODAL (Article 2.C) -->
    <div v-if="showAddFriendModal" class="modal-backdrop" @click.self="showAddFriendModal = false">
      <div class="standard-modal-box add-friend-modal">
        <div class="modal-header">
          <h3>➕ {{ t('mvAddFriend') }}</h3>
          <button class="btn-modal-close" @click="showAddFriendModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <p class="modal-subtext">{{ t('mvAddFriendDesc') }}</p>
          <label>{{ t('mvIdSearchLabel') }}</label>
          <div class="flex-row">
            <input v-model="addFriendHandleInput" :placeholder="t('mvIdSearchPh')" @keydown.enter.prevent="searchUsersForAdd" />
            <button class="btn-secondary" @click="searchUsersForAdd">{{ t('mvSearch') }}</button>
            <button class="btn-primary" @click="addFriendByHandle">{{ t('mvAdd') }}</button>
          </div>
          <div v-if="addFriendSearched && addFriendResults.length > 0" class="select-friends-scroll" style="max-height: 180px; margin-top: 10px;">
            <div
              v-for="u in addFriendResults"
              :key="'add-' + u.id"
              class="quick-pick-friend-row"
              @click="addFriendById(u.id)"
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

    <!-- FX-17: NEW CALL contact picker (never dials blind) -->
    <div v-if="showNewCallModal" class="modal-backdrop" @click.self="showNewCallModal = false">
      <div class="standard-modal-box new-call-modal" role="dialog" :aria-label="t('mvNewCall')">
        <div class="modal-header">
          <h3>{{ t('mvNewCall') }}</h3>
          <button class="btn-modal-close" @click="showNewCallModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form new-call-body">
          <p v-if="!friends.length" class="muted">{{ t('contact_empty') }}</p>
          <div v-for="f in friends" :key="f.id" class="new-call-row">
            <div class="pc-avatar circle-36" :style="{ background: (f as any).avatar_color || '#315BCD' }">{{ initialOf(f.display_name, 'U') }}</div>
            <span class="new-call-name">{{ f.display_name }}</span>
            <button class="btn-subaction-pill" :title="t('mvVoiceCall')" @click="showNewCallModal = false; startCallWithUser(f, 'voice')">📞 {{ t('mvVoiceCall') }}</button>
            <button class="btn-subaction-pill" :title="t('mvVideoCallLabel')" @click="showNewCallModal = false; startCallWithUser(f, 'video')">📹 {{ t('mvVideoCallLabel') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- NEW CHAT MODAL (Floating Action Button 💬+) -->
    <div v-if="showNewChatModal" class="modal-backdrop" @click.self="showNewChatModal = false">
      <div class="standard-modal-box new-chat-modal">
        <div class="modal-header">
          <h3>{{ t('mvNewConvo') }}</h3>
          <button class="btn-modal-close" @click="showNewChatModal = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="modal-body-form">
          <div class="new-chat-options-grid">
            <button class="btn-new-chat-type" @click="showNewChatModal = false; showCreateGroupModal = true">
              <span class="type-icon">👥</span>
              <div class="type-text">
                <strong>{{ t('mvMakeGroup') }}</strong>
                <small>{{ t('mvMakeGroupDesc') }}</small>
              </div>
            </button>
            <button class="btn-new-chat-type" @click="showNewChatModal = false; activeNav = 'openchat'">
              <span class="type-icon">🌐</span>
              <div class="type-text">
                <strong>{{ t('mvJoinOpenChat') }}</strong>
                <small>{{ t('mvJoinOpenChatDesc') }}</small>
              </div>
            </button>
          </div>

          <label style="margin-top: 14px;">{{ t('mvStartDirectDesc') }}</label>
          <div class="select-friends-scroll" style="max-height: 180px;">
            <div
              v-for="f in friends"
              :key="'new-chat-' + f.id"
              class="quick-pick-friend-row"
              @click="startDirectChat(f); showNewChatModal = false"
            >
              <span class="lx-avatar s36" :style="{ background: f.avatar_color || 'var(--ln-accent)' }">
                <span>{{ initialOf(f.display_name) }}</span><img v-if="(f as any).avatar_url" :src="(f as any).avatar_url" alt="" class="ln-profile-photo" @error="hideBrokenAvatar" />
              </span>
              <div class="friend-pick-meta">
                <strong>{{ f.display_name }}</strong>
                <small>{{ taglineOf(f) }}</small>
              </div>
              <button class="btn-mini-chat">{{ t('mvChats') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- Global LUNO PC Context Menu -->
    <LunoContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @close="contextMenu.visible = false"
    />
</template>
