<script setup lang="ts">
import lunoMark from '../../../shared/brand/luno-logo-appicon.svg'
import LunoIcon from '../components/LunoIcon.vue'
import MessageAttachment from '../components/MessageAttachment.vue'
import LunoContextMenu, { type ContextMenuItem } from '../components/LunoContextMenu.vue'
import CallModal from '../components/CallModal.vue'
import ChatList from '../components/ChatList.vue'
import FriendPanel from '../components/FriendPanel.vue'
import MessagePane from '../components/MessagePane.vue'
import SettingsModal from '../components/SettingsModal.vue'
import { LUNO_STICKERS, type LunoSticker } from '../luno-stickers'
import { parseStorePacks } from '../../../shared/shop'
import { findDirectChatId } from '../../../shared/direct_chat'
import { makeFriendQrSvg } from '../../../shared/friend_qr'
import { listRowTime } from '../../../shared/list_time'
import { initialOf } from '../../../shared/avatar_initial'
import { playSendSound } from '../sound-effects'
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
  readStoredDeviceId,
  readStoredToken,
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
  translateMessageText,
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
import { useAuth } from '../composables/useAuth'
import { useWebRTC, type CallRecord } from '../composables/useWebRTC'

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

async function handleTranslateMessage(msg: Message) {
  if (messageTranslations.value[msg.id]?.translated && !messageTranslations.value[msg.id]?.error) {
    delete messageTranslations.value[msg.id]
    return
  }
  messageTranslations.value[msg.id] = {
    translated: '',
    sourceLang: 'auto',
    engine: 'luno-ai',
    loading: true
  }
  try {
    const res = await translateMessageText(msg.body, targetTranslateLang.value)
    messageTranslations.value[msg.id] = {
      translated: res.translated,
      sourceLang: res.sourceLang,
      engine: res.engine,
      loading: false
    }
  } catch {
    messageTranslations.value[msg.id] = {
      translated: '',
      sourceLang: 'auto',
      engine: 'luno-ai',
      loading: false,
      error: t('mvTranslateFailed')
    }
  }
}


// --- Auth & Session State ---
const basePath = import.meta.env.BASE_URL
const showUserMenu = ref(false)
const showConsolesMenu = ref(false)

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
const isPanelCollapsed = ref(false)
const chatSortAsc = ref(false)
const showNewChatModal = ref(false)
const showEcosystemHub = ref(false)
const activeEcosystemId = ref<string | null>(null)
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

// News categories use stable IDs; labels resolve via t() (server sample feed still carries ko labels).
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

// News comes from GET /api/v1/news (explicitly labelled editorial SAMPLE content, never real press).
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
  try {
    const res = await api<{ calls: any[] }>('/api/v1/calls')
    callHistoryList.value = (res.calls || []).map((c: any): CallRecord => ({
      id: c.id,
      peer_id: c.peer_id || '',
      peer_name: c.title || '',
      peer_avatar_color: c.peer_color || '#315BCD',
      call_type: c.kind === 'video' ? 'video' : 'voice',
      direction: c.result === 'missed' ? 'missed' : (c.outgoing ? 'outgoing' : 'incoming'),
      timestamp_text: callDateText(c.started_at),
      duration_text: c.duration > 0 ? formatDuration(c.duration) : undefined
    }))
  } catch {
    callHistoryList.value = []
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
  if (nav === 'calls' && !selectedCallRecord.value && callHistoryList.value.length > 0) {
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

async function startCallFromHistory(record: CallRecord, kind: 'voice' | 'video' = 'voice') {
  selectedCallRecord.value = record
  const cid = await resolvePeerConversationId(record)
  selectedChatId.value = cid
  await startCall(kind, record.peer_name)
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
    await api('/api/v1/auth/password', 'PATCH', {
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
const walletBalance = ref(50000)
const walletPoints = ref(3450)
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
const showAddFriendModal = ref(false)
const addFriendHandleInput = ref('')
const addFriendResults = ref<User[]>([])
const addFriendSearched = ref(false)
const showSettingsModal = ref(false)
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

function openEcosystemService(serviceId: string) {
  activeEcosystemId.value = serviceId
  if (serviceId === 'open-ai') {
    autoTranslateEnabled.value = true
    note.value = t('mvAiEnabled')
  } else if (serviceId === 'open-video') {
    if (friends.value.length > 0) {
      startCallWithUser(friends.value[0], 'video')
    } else {
      note.value = t('mvPickCallPeer')
    }
  } else if (serviceId === 'open-cloud') {
    showKeepModal.value = true
  } else if (serviceId === 'open-chat') {
    activeNav.value = 'openchat'
  } else if (serviceId === 'open-search') {
    activeNav.value = 'chats'
    searchKeyword.value = ''
  } else {
    showEcosystemHub.value = true
  }
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
async function loadChats() {
  const sessionToken = token.value
  try {
    const res = await api<{ conversations: Chat[] }>('/api/v1/conversations')
    if (sessionToken === token.value) chats.value = res.conversations || []
  } catch {}
  void loadChannelSlot()
}

// I-4: calling state machine (names unchanged; template and socket untouched).
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
  handleIncomingCallSignal,
  toggleCallMute,
  toggleCallVideo,
  toggleScreenShare,
  updateCallState,
  startCallTimer,
  stopCallTimer,
  toggleCallRecording,
  endCallLocally,
} = useWebRTC({ selectedChatId, chats, selectedChat, callHistoryList, loadChats, formatDuration })
// Template expressions unwrap top-level refs, so the modal receives the stream
// ref objects through this plain holder instead of the bare bindings.
const callVideoRefs = { local: localVideoRef, remote: remoteVideoRef }

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
  isLoadingMessages.value = true
  const version = ++chatSelectVersion
  try {
    const [msgRes, pinsRes] = await Promise.all([
      api<{ messages: Message[] }>(`/api/v1/conversations/${convId}/messages?limit=50`),
      api<{ pins: any[] }>(`/api/v1/conversations/${convId}/pins`).catch(() => ({ pins: [] }))
    ])
    if (selectedChatId.value !== convId || version !== chatSelectVersion) return
    const received = new Map((msgRes.messages || []).map(message => [message.id, message]))
    for (const message of messages.value) if (message.conversation_id === convId) received.set(message.id, message)
    messages.value = [...received.values()].sort((a, b) => a.sequence - b.sequence)
    hasEarlierMessages.value = (msgRes.messages || []).length === 50
    pinnedList.value = pinsRes.pins || []
    if (messages.value.length > 0) {
      const last = messages.value[messages.value.length - 1]
      if (last.sequence) {
        await api(`/api/v1/conversations/${convId}/read`, 'POST', { sequence: last.sequence }).catch(() => {})
      }
    }
    if (autoTranslateEnabled.value && messages.value.length > 0) {
      for (const m of messages.value.slice(-6)) {
        if (m.kind === 'text' && !messageTranslations.value[m.id]) {
          void handleTranslateMessage(m)
        }
      }
    }
    scrollToBottom()
    await Promise.all([loadChats(), loadPolls(convId)])
  } catch (e: any) {
    if (selectedChatId.value === convId && version === chatSelectVersion) {
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

async function runConversationSearch() {
  if (!selectedChatId.value) return
  const q = chatSearchQuery.value.trim()
  if (!q) {
    chatSearchResults.value = []
    return
  }
  try {
    const res = await api<{ results: any[] }>(`/api/v1/conversations/${selectedChatId.value}/search?q=${encodeURIComponent(q)}`)
    chatSearchResults.value = res.results || []
  } catch {}
}

// --- Messaging ---
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
      kind: 'text',
      body,
      ...(replyId ? { reply_to: replyId } : {})
    }, controller.signal)
    if (sessionToken !== token.value) return
    if (selectedChatId.value === convId && !messages.value.some(m => m.id === res.message.id)) {
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
    await api(`/api/v1/conversations/${selectedChatId.value}/messages/${mid}`, 'PATCH', { body: newBody })
    const target = messages.value.find(m => m.id === mid)
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
    const res = await api<{ message: Message }>(`/api/v1/conversations/${selectedChatId.value}/messages`, 'POST', {
      client_id: newClientID(),
      kind: 'sticker',
      body: stickerId,
      metadata: {
        sticker_id: stickerId,
        character: found?.character || 'Lumi',
        label: found?.name || stickerId
      }
    })
    if (!messages.value.some(m => m.id === res.message.id)) {
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
    const res = await request<{ message: Message }>(`/api/v1/conversations/${convId}/messages`, sessionToken, 'POST', {
      client_id: newClientID(),
      kind: 'location',
      body: t('location_shared'),
      metadata: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy_m: position.coords.accuracy
      }
    })
    if (sessionToken === token.value && selectedChatId.value === convId && !messages.value.some(m => m.id === res.message.id)) {
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
    const res = await request<{ message: Message }>(`/api/v1/conversations/${convId}/messages`, sessionToken, 'POST', {
      client_id: newClientID(),
      kind: 'contact',
      body: f.display_name,
      metadata: {
        user_id: f.id,
        ...(f.handle ? { handle: f.handle } : {}),
        display_name: f.display_name
      }
    })
    if (sessionToken === token.value && selectedChatId.value === convId && !messages.value.some(m => m.id === res.message.id)) {
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

async function sendAttachmentFile(file: File, conversation: string, sessionToken: string, voiceDurationSec?: number) {
    if (file.size === 0 || file.size > 512 * 1024) throw new Error(t('attachment_size_limit'))
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    const checksum = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
    const kind = voiceDurationSec !== undefined ? 'voice' : file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'file'
    if (sessionToken !== token.value) return
    const att = await request<{ id: string; original_name: string }>('/api/v1/attachments', sessionToken, 'POST', {
      original_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      checksum_sha256: checksum,
      content_base64: btoa(binary)
    })
    if (sessionToken !== token.value) return
    const res = await request<{ message: Message }>(`/api/v1/conversations/${conversation}/messages`, sessionToken, 'POST', {
      client_id: newClientID(),
      kind,
      body: att.original_name,
      metadata: { attachment_id: att.id, mime_type: file.type, size_bytes: file.size, ...(voiceDurationSec !== undefined ? { duration: voiceDurationSec } : {}) }
    })
    if (sessionToken === token.value && selectedChatId.value === conversation && !messages.value.some(m => m.id === res.message.id)) messages.value.push(res.message)
    await loadChats()
}

async function downloadAttachment(message: Message) {
  const id = message.metadata?.attachment_id
  if (typeof id !== 'string') return
  await wrap(async () => {
    const response = await fetch(`${API_URL}/api/v1/attachments/${encodeURIComponent(id)}/content`, { headers: { Authorization: `Bearer ${token.value}` } })
    if (!response.ok) throw new Error(t('mvDownloadFailed'))
    const url = URL.createObjectURL(await response.blob())
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
  endCallLocally,
  startCallTimer,
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
async function deleteUserAccount() {
  if (!deletePasswordInput.value) { error.value = t('mvDeletePwRequired'); return }
  if (!confirm(t('mvDeleteConfirm'))) return
  await wrap(async () => {
    await api('/api/v1/me', 'DELETE', { password: deletePasswordInput.value })
    deletePasswordInput.value = ''
    logout()
  })
}

export interface EcosystemServiceItem {
  id: string
  name: string
  nameKo: string
  icon: string
  category: 'core' | 'communication' | 'productivity' | 'lifestyle' | 'developer'
  status: 'active' | 'beta' | 'preview'
  statusText: string
  description: string
  actionUrl?: string
}

const ECOSYSTEM_SERVICES: EcosystemServiceItem[] = [
  {
    id: 'open-search',
    name: 'Open Search',
    nameKo: t('mvEcoSearchName'),
    icon: 'open-search',
    category: 'core',
    status: 'active',
    statusText: t('mvEcoSearchStatus'),
    description: t('mvEcoSearchDesc')
  },
  {
    id: 'open-mail',
    name: 'Open Mail',
    nameKo: t('mvEcoMailName'),
    icon: 'open-mail',
    category: 'communication',
    status: 'active',
    statusText: t('mvEcoMailStatus'),
    description: t('mvEcoMailDesc')
  },
  {
    id: 'open-apps',
    name: 'Open Apps',
    nameKo: t('mvEcoAppsName'),
    icon: 'open-apps',
    category: 'productivity',
    status: 'active',
    statusText: t('mvEcoAppsStatus'),
    description: t('mvEcoAppsDesc')
  },
  {
    id: 'open-video',
    name: 'Open Video',
    nameKo: t('mvEcoVideoName'),
    icon: 'open-video',
    category: 'communication',
    status: 'active',
    statusText: t('mvEcoVideoStatus'),
    description: t('mvEcoVideoDesc')
  },
  {
    id: 'open-stream',
    name: 'Open Stream',
    nameKo: t('mvEcoStreamName'),
    icon: 'open-stream',
    category: 'communication',
    status: 'beta',
    statusText: t('mvEcoStreamStatus'),
    description: t('mvEcoStreamDesc')
  },
  {
    id: 'open-ai',
    name: 'Open AI Assistant',
    nameKo: t('mvEcoAiName'),
    icon: 'open-ai',
    category: 'core',
    status: 'active',
    statusText: t('mvEcoAiStatus'),
    description: t('mvEcoAiDesc')
  },
  {
    id: 'open-shopping',
    name: 'Open Shopping',
    nameKo: t('mvEcoPayName'),
    icon: 'money',
    category: 'lifestyle',
    status: 'beta',
    statusText: t('mvEcoPayStatus'),
    description: t('mvEcoPayDesc')
  },
  {
    id: 'open-news',
    name: 'Open News',
    nameKo: t('mvEcoNewsName'),
    icon: 'globe',
    category: 'lifestyle',
    status: 'preview',
    statusText: t('mvEcoNewsStatus'),
    description: t('mvEcoNewsDesc')
  },
  {
    id: 'open-travel',
    name: 'Open Travel',
    nameKo: t('mvEcoTravelName'),
    icon: 'globe',
    category: 'lifestyle',
    status: 'preview',
    statusText: t('mvEcoTravelStatus'),
    description: t('mvEcoTravelDesc')
  },
  {
    id: 'open-cloud',
    name: 'Open Cloud (Keep Vault)',
    nameKo: t('mvEcoDriveName'),
    icon: 'keep',
    category: 'productivity',
    status: 'active',
    statusText: t('mvEcoDriveStatus'),
    description: t('mvEcoDriveDesc')
  },
  {
    id: 'open-workspace',
    name: 'Open Workspace',
    nameKo: t('mvEcoDocsName'),
    icon: 'file',
    category: 'productivity',
    status: 'beta',
    statusText: t('mvEcoDocsStatus'),
    description: t('mvEcoDocsDesc')
  },
  {
    id: 'open-chat',
    name: t('mvEcoOcName'),
    nameKo: t('mvEcoOcTag'),
    icon: 'openchat',
    category: 'communication',
    status: 'active',
    statusText: t('mvEcoOcStatus'),
    description: t('mvEcoOcDesc')
  },
  {
    id: 'open-developer',
    name: 'Open Developer Platform',
    nameKo: t('mvEcoDevName'),
    icon: 'settings',
    category: 'developer',
    status: 'active',
    statusText: t('mvEcoDevStatus'),
    description: t('mvEcoDevDesc'),
    actionUrl: './developer/'
  }
]

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

onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // Reconcile durable messages when an edge isolate cannot fan out to another one.
  startMessageSyncLoop()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleNetworkOnline)
    window.addEventListener('offline', handleNetworkOffline)
    window.addEventListener('keydown', handleGlobalKeydown)
  }
  await fetchAppVersion()
  applyRouteNav()
  const savedToken = token.value || readStoredToken()
  if (savedToken) {
    token.value = savedToken
    currentDeviceId.value = readStoredDeviceId()
    try {
      if (!currentUser.value) currentUser.value = await api<User>('/api/v1/me')
      await loadInitialData()
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
  }
  if (heroCarouselTimer) clearInterval(heroCarouselTimer)
})

</script>

<template>


    <!-- 2. AUTHENTIC LUNO PC DESKTOP MESSENGER (3-Pane Workspace) -->
    <main class="pc-workspace">
      <!-- (Column 1) Sleek Midnight Navy Dock Rail (62px) -->
      <nav class="pc-rail">
        <div class="pc-rail-top">
          <!-- 1. My Profile Avatar with Online Dot -->
          <button type="button" class="pc-user-avatar-trigger" :title="t('profileTitle')" :aria-label="t('profileTitle')" @click="activeProfileUser = currentUser">
            <div class="pc-avatar circle-36" :style="{ background: currentUser?.avatar_color || 'var(--om-primary, #2563EB)' }"><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" /><span v-else>{{ initialOf(currentUser?.display_name) }}</span>
            </div>
            <span v-if="realtimeState === 'connected'" class="pc-dot-online" :title="t('connection_connected')"></span>
          </button>

          <!-- User Menu Dropdown -->
          <div v-if="showUserMenu" class="pc-dropdown-menu user-menu" @click="showUserMenu = false">
            <div class="dropdown-header">
              <strong>{{ currentUser?.display_name }}</strong>
              <small>{{ currentUser?.email }}</small>
            </div>
            <div class="dropdown-sep"></div>
            <button class="dropdown-item" @click="activeProfileUser = currentUser">{{ t('mvProfileSettings') }}</button>
            <button class="dropdown-item" @click="showSettingsModal = true">⚙️ {{ t('navSettings') }}</button>
            <button class="dropdown-item" @click="showKeepModal = true">💾 {{ t('navKeep') }}</button>
            <div class="dropdown-sep"></div>
            <button class="dropdown-item logout" @click="logout">{{ t('mvLogout') }}</button>
          </div>

          <!-- 2. Chats (대화) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'chats' }"
            :title="t('navChats')"
            @click="switchNav('chats')"
          >
            <span class="pc-rail-indicator"></span>
            <LunoIcon name="chats" :size="22" />
            <span v-if="totalUnreadCount > 0" class="pc-unread-pill">{{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}</span>
          </button>

          <!-- 3. Friends (친구 / 홈) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'home' }"
            :title="t('navFriends')"
            @click="switchNav('home')"
          >
            <span class="pc-rail-indicator"></span>
            <LunoIcon name="friends" :size="22" />
          </button>

          <!-- 4. News (뉴스) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'news' }"
            :title="t('mvRailNews')"
            @click="switchNav('news')"
          >
            <span class="pc-rail-indicator"></span>
            <LunoIcon name="news" :size="21" />
          </button>

          <!-- 5. Calls (통화) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'calls' }"
            :title="t('mvRailCalls')"
            @click="switchNav('calls')"
          >
            <span class="pc-rail-indicator"></span>
            <LunoIcon name="calls" :size="20" />
          </button>

          <!-- 5b. Wallet (지갑) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'wallet' }"
            :title="t('mvRailWallet')"
            @click="switchNav('wallet')"
          >
            <span class="pc-rail-indicator"></span>
            <LunoIcon name="money" :size="20" />
          </button>

          <!-- 5c. Shop (쇼핑) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'shop' }"
            :title="t('mvRailShop')"
            @click="switchNav('shop')"
          >
            <span class="pc-rail-indicator"></span>
            <LunoIcon name="shop" :size="20" />
          </button>

          <!-- 6. Add Friends (친구 추가) -->
          <button
            class="pc-rail-btn"
            :title="t('mvAddFriend')"
            @click="showAddFriendModal = true"
          >
            <LunoIcon name="add-friends" :size="20" />
          </button>

          <!-- 5. Open Scanner Search -->
          <button
            class="pc-rail-btn"
            :title="t('mvRailSearch')"
            @click="openEcosystemService('open-search')"
          >
            <LunoIcon name="open-search" :size="20" />
          </button>

          <!-- 6. Open Mail -->
          <button
            class="pc-rail-btn"
            :title="t('mvRailMail')"
            @click="openEcosystemService('open-mail')"
          >
            <LunoIcon name="open-mail" :size="20" />
          </button>

          <!-- 7. Open Apps (앱 허브) -->
          <button
            class="pc-rail-btn"
            :title="t('mvRailApps')"
            @click="openEcosystemService('open-apps')"
          >
            <LunoIcon name="open-apps" :size="20" />
          </button>

          <!-- 8. Open Video (화상 회의) -->
          <button
            class="pc-rail-btn"
            :title="t('mvRailVideo')"
            @click="openEcosystemService('open-video')"
          >
            <LunoIcon name="open-video" :size="20" />
          </button>

          <!-- 9. Open Stream (라이브 방송) -->
          <button
            class="pc-rail-btn"
            :title="t('mvRailStream')"
            @click="openEcosystemService('open-stream')"
          >
            <LunoIcon name="open-stream" :size="20" />
          </button>

          <!-- 10. Open AI (지능형 AI 비서) -->
          <button
            class="pc-rail-btn"
            :title="t('mvRailAi')"
            @click="openEcosystemService('open-ai')"
          >
            <LunoIcon name="open-ai" :size="20" />
          </button>

          <!-- 11. Open Services (전체 생태계) -->
          <button
            class="pc-rail-btn"
            :title="t('mvRailServices')"
            @click="openEcosystemService('open-services')"
          >
            <LunoIcon name="open-services" :size="20" />
          </button>
        </div>

        <div class="pc-rail-bottom">
          <!-- Mobile APK Download Button -->
          <a href="./download.html" target="_blank" class="pc-rail-btn small" :title="t('mvRailMobileApp')" style="text-decoration: none;">
            <span style="font-size: 16px;">📱</span>
          </a>

          <!-- Screen Capture Button (Screenshot 1 & 4) -->
          <button class="pc-rail-btn small" :title="t('mvRailCapture')" @click="captureScreenToChat">
            <span style="font-size: 15px;">✂️</span>
          </button>

          <!-- Keep Button -->
          <button class="pc-rail-btn small" :title="t('navKeep')" @click="showKeepModal = true">
            <LunoIcon name="keep" :size="19" />
          </button>

          <!-- 12. Notifications Toggle -->
          <button
            class="pc-rail-btn small"
            :title="notificationsEnabled ? t('mvNotifOnTitle') : t('mvDndTitle')"
            @click="toggleNotifications"
          >
            <LunoIcon :name="notificationsEnabled ? 'bell' : 'bell-off'" :size="19" />
          </button>

          <!-- 13. Settings Button -->
          <button class="pc-rail-btn small" :title="t('navSettings')" @click="showSettingsModal = true">
            <LunoIcon name="settings" :size="19" />
          </button>

          <!-- 14. More / Consoles Menu Button -->
          <div class="rail-more-wrapper">
            <button class="pc-rail-btn small" :title="t('mvRailMore')" @click="showConsolesMenu = !showConsolesMenu">
              <LunoIcon name="more" :size="19" />
            </button>

            <!-- Consoles Dropdown Popover -->
            <div v-if="showConsolesMenu" class="pc-dropdown-menu consoles-menu" @click="showConsolesMenu = false">
              <div class="dropdown-heading">{{ t('mvConsolesTitle') }}</div>
              <a href="./admin/" target="_blank" class="dropdown-item">{{ t('mvConsoleAdmin') }}</a>
              <a href="./partner/" target="_blank" class="dropdown-item">{{ t('mvConsolePartner') }}</a>
              <a href="./developer/" target="_blank" class="dropdown-item">{{ t('mvConsoleDev') }}</a>
              <a href="./creator/" target="_blank" class="dropdown-item">{{ t('mvConsoleCreator') }}</a>
              <a href="./ads/" target="_blank" class="dropdown-item">{{ t('mvConsoleAds') }}</a>
              <div class="dropdown-sep"></div>
              <button class="dropdown-item" @click="showEcosystemHub = true">{{ t('mvEcosystemHub') }}</button>
              <a href="./download.html" target="_blank" class="dropdown-item" style="color: var(--om-primary, #2563EB); font-weight: 700;">{{ t('mvDownloadApp') }}</a>
              <button class="dropdown-item" @click="showSettingsModal = true">⚙️ {{ t('navSettings') }}</button>
              <button class="dropdown-item logout" @click="logout">{{ t('mvLogout') }}</button>
            </div>
          </div>
        </div>
      </nav>

      <!-- (Column 2) Second Sidebar List Pane (~305px) -->
      <aside class="pc-side-pane" :class="{ 'is-collapsed': isPanelCollapsed }">
        <button v-if="isPanelCollapsed" class="btn-pane-expand" :title="t('mvCollapse')" @click="isPanelCollapsed = false">&gt;</button>

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
          v-model:is-panel-collapsed="isPanelCollapsed"
          @qr="showQrModal = true"
          @sticker="showStickerPicker = true"
          @settings="showSettingsModal = true"
          @official="activeNav = 'chats'"
          @services="showEcosystemHub = true"
          @profile="activeProfileUser = currentUser"
          @keep-memo="openKeepMemoChat"
          @drawer="toggleDrawer"
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
          v-model:is-panel-collapsed="isPanelCollapsed"
          @mark-all-read="markAllChatsRead"
          @drawer="toggleDrawer"
          @new-chat="showNewChatModal = true"
          @qr="showQrModal = true"
          @ecosystem="openEcosystemService"
          @select="selectChat"
          @chat-menu="openChatContextMenu"
        />

        <!-- VIEW: NEWS (뉴스 & 콘텐츠 - Screenshot 5 & Section 10) -->
        <div v-else-if="activeNav === 'news'" class="pc-pane-body pc-news-pane">
          <!-- News Header -->
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">{{ t('mvNews') }}</h2>
            <div class="news-header-tools">
              <button class="btn-pc-header-tool" :title="t('mvNewsSettings')" @click="showSettingsModal = true">
                <LunoIcon name="settings" :size="17" />
              </button>
            </div>
          </div>
          <!-- News Category Filter Tabs -->
          <div class="pc-chat-subtabs-row">
            <button
              v-for="cat in NEWS_CATEGORY_IDS"
              :key="cat"
              class="btn-subtab"
              :class="{ active: selectedNewsCategory === cat }"
              @click="selectedNewsCategory = cat"
            >
              {{ newsCatLabel(cat) }}
            </button>
          </div>

          <!-- News Scroll List -->
          <div class="pc-pane-scroll news-scroll">
            <div v-if="newsIsSample" class="news-sample-banner" style="margin:8px 12px;padding:8px 12px;border-radius:8px;background:#fff7e0;color:#7a5b00;font-size:12px;">{{ t('mvNewsSampleBanner') }}</div>
            <!-- Hero Featured News Card (Screenshot 5 & 9) -->
            <div
              v-if="heroNews"
              class="news-hero-card"
              @click="openNewsArticle(heroNews)"
              @mouseenter="isHeroHovered = true"
              @mouseleave="isHeroHovered = false"
            >
              <div class="hero-image-wrap">
                <img :src="heroNews.image_url" :alt="heroNews.title" class="hero-img" />
                <div class="hero-gradient-overlay"></div>
                <button class="btn-hero-nav prev" :title="t('mvPrevArticle')" @click.stop="prevHeroSlide">‹</button>
                <button class="btn-hero-nav next" :title="t('mvNextArticle')" @click.stop="nextHeroSlide">›</button>
                <div class="hero-slide-badge">{{ activeHeroSlideIndex + 1 }} / {{ heroNewsSlides.length }}</div>
                <div class="hero-meta-bottom">
                  <h3 class="hero-title">{{ heroNews.title }}</h3>
                  <div class="hero-press-row">
                    <span class="hero-press">{{ heroNews.press }}</span>
                    <span class="hero-time">{{ heroNews.published_at }}</span>
                  </div>
                </div>
              </div>
              <!-- Carousel Dots Indicator (Interactive 5 Slides - Screenshot 9) -->
              <div class="hero-carousel-dots" @click.stop>
                <span
                  v-for="(slide, idx) in heroNewsSlides"
                  :key="slide.id"
                  class="hero-dot"
                  :class="{ active: activeHeroSlideIndex === idx }"
                  :title="t('mvSlide').replace('{n}', String(idx + 1))"
                  @click.stop="activeHeroSlideIndex = idx"
                ></span>
              </div>
            </div>

            <!-- Ad Banner Card (Screenshot 5) -->
            <div class="news-ad-banner" @click="openEcosystemService('open-apps')">
              <div class="ad-text-block">
                <span class="ad-headline">{{ t('mvAdHeadline') }}</span>
                <span class="ad-sub">{{ t('mvAdSub') }}</span>
              </div>
              <div class="ad-thumb">
                <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=120&auto=format&fit=crop&q=80" alt="AD" />
              </div>
            </div>

            <!-- Category Section: 오늘의 인기 기사 (Screenshot 5) -->
            <div class="news-section-wrap">
              <div class="news-section-header">
                <h4 class="section-title">{{ t('mvTodayPopular') }}</h4>
              </div>

              <div class="news-ranked-list">
                <div
                  v-for="article in filteredPopularNews"
                  :key="article.id"
                  class="news-ranked-item"
                  @click="openNewsArticle(article)"
                >
                  <div class="news-thumb-col">
                    <img :src="article.image_url" :alt="article.title" class="ranked-thumb" />
                    <span class="ranked-badge">{{ article.rank }}</span>
                  </div>
                  <div class="news-info-col">
                    <h5 class="ranked-title">{{ article.title }}</h5>
                    <div class="ranked-meta">
                      <span class="ranked-press">{{ article.press }}</span>
                      <span class="ranked-time">{{ article.published_at }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- VIEW: CALLS (통화 이력 - Screenshot 3 & Section 9) -->
        <div v-else-if="activeNav === 'calls'" class="pc-pane-body pc-calls-pane">
          <!-- Calls Header -->
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">{{ t('mvCall') }}</h2>
            <div class="calls-header-tools">
              <button class="btn-pc-header-tool" :title="t('mvNewCall')" :disabled="!selectedChatId && chats.length === 0" @click="startCall('voice')">
                <LunoIcon name="call-voice" :size="17" />
              </button>
            </div>
          </div>

          <!-- Calls Filter Subtabs -->
          <div class="pc-chat-subtabs-row">
            <button class="btn-subtab" :class="{ active: callFilter === 'all' }" @click="callFilter = 'all'">{{ t('tabAll') }} ({{ callHistoryList.length }})</button>
            <button class="btn-subtab" :class="{ active: callFilter === 'missed' }" @click="callFilter = 'missed'">{{ t('mvMissed') }}</button>
          </div>

          <!-- Calls Scroll List -->
          <div class="pc-pane-scroll calls-scroll">
            <div
              v-for="log in filteredCallHistory"
              :key="log.id"
              class="call-history-row"
              :class="{ 'is-missed': log.direction === 'missed', selected: selectedCallRecord?.id === log.id }"
              @click="selectedCallRecord = log"
            >
              <!-- Peer Avatar -->
              <div class="pc-avatar circle-40" :style="{ background: log.peer_avatar_color || '#315BCD' }">
                {{ initialOf(log.peer_name) }}
              </div>

              <!-- Meta: Name, Direction Arrow, Date -->
              <div class="call-history-meta">
                <div class="call-row-name" :class="{ 'text-red': log.direction === 'missed' }">
                  {{ log.peer_name }}
                  <span v-if="log.count && log.count > 1" class="call-count-tag">({{ log.count }})</span>
                </div>
                <div class="call-row-sub">
                  <span class="direction-arrow">{{ log.direction === 'incoming' || log.direction === 'missed' ? '↙' : '↗' }}</span>
                  <span class="timestamp-text">{{ log.timestamp_text }}</span>
                  <span v-if="log.duration_text" class="duration-text">({{ log.duration_text }})</span>
                </div>
              </div>

              <!-- Quick Call Button on the Right -->
              <button
                class="btn-call-history-action"
                :title="t('mvCallBack').replace('{name}', log.peer_name)"
                @click.stop="startCallFromHistory(log, log.call_type)"
              >
                <LunoIcon name="calls" :size="18" />
              </button>
            </div>
          </div>
        </div>

        <!-- VIEW 3: VOOM -->
        <div v-else-if="activeNav === 'voom'" class="pc-pane-body">
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">LUNO VOOM</h2>
            <button class="btn-pc-header-tool" :title="t('mvNewStory')" @click="showNewStoryModal = true">➕</button>
          </div>
          <div class="stories-row">
            <div class="story-item" @click="showNewStoryModal = true">
              <div class="story-ring plus">＋</div>
              <small>{{ t('mvAddStory') }}</small>
            </div>
            <div v-for="s in stories" :key="s.id" class="story-item">
              <div class="story-ring" :style="{ background: s.bg || 'var(--om-primary, #2563EB)' }">{{ initialOf(s.author_name, 'L') }}</div>
              <small>{{ s.author_name || t('navFriends') }}</small>
            </div>
          </div>
          <div class="voom-list">
            <div v-for="v in voomVideos" :key="v.id" class="voom-card">
              <div class="voom-banner" :style="{ background: v.media_bg || v.bg || '#e2e8f0' }">
                <span>{{ v.media_emoji || v.emoji || '🎬' }}</span>
              </div>
              <div class="voom-meta">
                <strong>{{ v.title || v.body }}</strong>
                <div class="voom-actions">
                  <button class="btn-like" :class="{ liked: v.liked }" @click="likeVoomPost(v.id)">
                    {{ v.liked ? '❤️' : '🤍' }} {{ v.likes || v.like_count || 0 }}
                  </button>
                  <small>{{ t('mvCommentCount').replace('{n}', String(v.comments?.length || 0)) }}</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- VIEW 4: OPENCHAT -->
        <div v-else-if="activeNav === 'openchat'" class="pc-pane-body">
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">{{ t('navOpenChat') }}</h2>
            <button class="btn-pc-header-tool" :title="t('mvCreateOpenChat')" @click="showCreateOpenChatModal = true">➕</button>
          </div>
          <div class="openchat-list">
            <div v-for="room in openChatRooms" :key="room.id" class="openchat-card" @click="selectOpenChatRoom(room)">
              <div class="card-icon">💬</div>
              <div class="card-info">
                <strong>{{ room.name }}</strong>
                <p>{{ room.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- VIEW 5: WALLET / SERVICES -->
        <div v-else-if="activeNav === 'wallet'" class="pc-pane-body">
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">{{ t('mvLunoPayServices') }}</h2>
          </div>
          <div class="luno-pay-card">
            <div class="pay-top">
              <span>LUNO Pay</span>
              <span>POINT {{ walletPoints.toLocaleString() }} P</span>
            </div>
            <div class="pay-balance">₩ {{ walletBalance.toLocaleString() }}</div>
            <div class="pay-actions">
              <button class="btn-pay-action" @click="showChargeModal = true">{{ t('mvCharge') }}</button>
              <button class="btn-pay-action secondary" @click="showSendMoneyModal = true">{{ t('mvSend') }}</button>
            </div>
          </div>
          <div class="services-grid">
            <div class="service-box" @click="switchNav('voom')"><span class="icon">🎬</span><span class="title">LUNO VOOM</span></div>
            <div class="service-box" @click="showSettingsModal = true"><span class="icon">🎨</span><span class="title">{{ t('mvThemeSettings') }}</span></div>
            <div class="service-box" @click="showStickerPicker = true"><span class="icon">🐻</span><span class="title">{{ t('mvStickerShop') }}</span></div>
          </div>
          <div v-if="walletTx.length" class="wallet-tx-section">
            <h4 class="wallet-tx-heading">{{ t('mvRecentTx') }}</h4>
            <div v-for="tx in walletTx.slice(0, 8)" :key="tx.id" class="wallet-tx-row">
              <div class="wallet-tx-info">
                <strong>{{ tx.title || tx.note || tx.kind || t('mvTxFallback') }}</strong>
                <small>{{ formatTime(tx.created_at) }}</small>
              </div>
              <span class="wallet-tx-amount" :class="{ plus: tx.amount > 0 }">
                {{ (tx.amount > 0 ? '+' : '') + formatKRW(tx.amount) }}
              </span>
            </div>
          </div>
        </div>
        <div v-else-if="activeNav === 'shop'" class="pc-pane-body">
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">{{ t('shopTitle') }}</h2>
          </div>
          <div v-if="storeLoading" class="shop-empty">{{ t('attachment_loading') }}</div>
          <div v-else-if="!storePacks.length" class="shop-empty">{{ t('shopEmpty') }}</div>
          <div v-for="pk in storePacks" :key="pk.id" class="shop-pack-row">
            <div class="shop-pack-main">
              <strong>{{ pk.title }}</strong>
              <small v-if="pk.description">{{ pk.description }}</small>
              <span v-if="pk.stickers.length" class="shop-pack-strip">{{ pk.stickers.slice(0, 8).join(' ') }}</span>
            </div>
            <span v-if="pk.owned" class="shop-owned">{{ t('shopOwned') }}</span>
            <span v-else class="shop-price">{{ pk.priceMinor <= 0 ? t('shopFree') : pk.priceMinor + ' ' + pk.currency }}</span>
          </div>
          <p class="shop-pay-note">{{ t('shopPayNote') }}</p>
        </div>
      </aside>

      <!-- (Column 3) Right Main Viewport: Chat / Calls / OpenChat / Friend Profile / Empty Canvas -->
      <section v-if="activeNav === 'calls'" class="pc-calls-viewport">
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

      <section v-else-if="activeNav === 'openchat' && selectedOpenChatRoom" class="pc-openchat-viewport">
        <header class="pc-chat-topbar">
          <div class="chat-topbar-left">
            <div class="pc-avatar circle-36" style="background: #2563EB;">💬</div>
            <div class="chat-topbar-info">
              <div class="title-row">
                <span class="chat-header-title">{{ selectedOpenChatRoom.name }}</span>
                <span class="badge-verified">{{ t('mvPublicCommunity') }}</span>
              </div>
              <small class="e2ee-tag">{{ selectedOpenChatRoom.description }}</small>
            </div>
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
        <footer class="pc-chat-input-dock">
          <form class="pc-textarea-form" @submit.prevent="submitOpenChatPost">
            <textarea
              v-model="newOpenChatPostBody"
              :placeholder="t('mvOpenChatPh')"
              rows="2"
              @keydown.enter.exact.prevent="submitOpenChatPost"
            ></textarea>
            <div class="pc-textarea-bottom">
              <span class="char-count">{{ newOpenChatPostBody.length }}/500</span>
              <button class="btn-green-send" :disabled="!newOpenChatPostBody.trim()">{{ t('mvSubmit') }}</button>
            </div>
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
        :is-loading-messages="isLoadingMessages"
        :has-earlier-messages="hasEarlierMessages"
        :earlier-messages-loading="earlierMessagesLoading"
        :earlier-messages-error="earlierMessagesError"
        :conversation-error="conversationError"
        :message-translations="messageTranslations"
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
        @call="startCall"
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
        @composer-enter="handleComposerEnter"
      />

      <!-- Case B: Friend Profile Selected Preview (Screenshot 5) -->
      <section v-else-if="selectedFriendProfile" class="pc-friend-profile-viewport">
        <div class="pc-profile-preview-card">
          <div class="profile-preview-avatar" :style="{ background: selectedFriendProfile.avatar_color || 'var(--om-primary, #2563EB)' }">
            {{ initialOf(selectedFriendProfile.display_name) }}
          </div>
          <h2 class="profile-preview-name">{{ selectedFriendProfile.display_name }}</h2>
          <p v-if="selectedFriendProfile.status_message || selectedFriendProfile.bio" class="profile-preview-bio">
            {{ selectedFriendProfile.status_message || selectedFriendProfile.bio }}
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
      <section v-else class="pc-empty-canvas">
        <div class="pc-empty-dialog">
          <div class="pc-watermark-wrap">
            <img :src="lunoMark" alt="LUNO" width="72" height="72" />
          </div>
          <h3 class="pc-empty-title">{{ t('emptyChatTitle') }}</h3>
          <p class="pc-empty-desc">{{ t('emptyChatDesc') }}</p>
        </div>
      </section>

      <!-- MOBILE FLOATING NAVIGATION CAPSULE (Screenshots 3, 4, 5) -->
      <nav v-if="!selectedChat" class="luno-mobile-floating-nav" :aria-label="t('mvBottomNav')">
        <!-- Tab 1: 홈 (Home) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'home' }"
          @click="switchNav('home')"
        >
          <div class="nav-icon-wrap">
            <LunoIcon name="home" :size="24" />
          </div>
          <span class="nav-label">{{ t('mvHome') }}</span>
        </button>

        <!-- Tab 2: 대화 (Chats) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'chats' }"
          @click="switchNav('chats')"
        >
          <div class="nav-icon-wrap">
            <LunoIcon name="chats" :size="24" />
            <span v-if="totalUnreadCount > 0" class="mobile-nav-badge">{{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}</span>
          </div>
          <span class="nav-label">{{ t('mvChats') }}</span>
        </button>

        <!-- Tab 3: 뉴스 (News) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'news' }"
          @click="switchNav('news')"
        >
          <div class="nav-icon-wrap">
            <LunoIcon name="news" :size="24" />
            <span class="mobile-nav-dot"></span>
          </div>
          <span class="nav-label">{{ t('mvNews') }}</span>
        </button>

        <!-- Tab 4: 통화 (Calls) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'calls' }"
          @click="switchNav('calls')"
        >
          <div class="nav-icon-wrap">
            <LunoIcon name="calls" :size="24" />
          </div>
          <span class="nav-label">{{ t('mvCall') }}</span>
        </button>
        <!-- Tab 5: 지갑 (Wallet) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'wallet' }"
          @click="switchNav('wallet')"
        >
          <div class="nav-icon-wrap">
            <LunoIcon name="money" :size="24" />
          </div>
          <span class="nav-label">{{ t('mvWallet') }}</span>
        </button>
        <button class="mobile-nav-item" @click="activeProfileUser = currentUser" :aria-label="t('profileTitle')"><div class="nav-icon-wrap"><span class="mobile-profile-avatar"><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" /><span v-else>{{ initialOf(currentUser?.display_name) }}</span></span></div><span class="nav-label">{{ t('profileTitle') }}</span></button>
      </nav>
    </main>

    <!-- QR SCANNER & MY QR CODE MODAL -->
    <div v-if="showQrModal" class="modal-backdrop" @click.self="showQrModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvMyQr') }}</h3>
          <button class="btn-modal-close" @click="showQrModal = false">✕</button>
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
            <button class="btn-news-action" :title="newsBookmarks.has(activeNewsArticle.id) ? t('mvBookmarkRemove') : t('mvBookmarkSave')" @click="toggleNewsBookmark(activeNewsArticle.id)">
              {{ newsBookmarks.has(activeNewsArticle.id) ? '🔖' : '📑' }}
            </button>
            <button class="btn-news-action" :title="t('mvClose')" @click="activeNewsArticle = null">✕</button>
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
            <p style="margin-top: 12px; color: var(--om-text-secondary, #64748B); font-size: 13px; line-height: 1.6;">{{ t('mvNewsSeedNote') }}</p>
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
              <input v-model="newCommentInput" :placeholder="t('mvCommentPh')" style="flex:1; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px;" />
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
      @screenshare="toggleScreenShare"
      @record="toggleCallRecording"
      @answer="updateCallState('connected')"
      @hangup="updateCallState('ended')"
    />

    <!-- PROFILE MODAL (Full LUNO User Profile View) -->
    <div v-if="activeProfileUser" class="modal-backdrop" @click.self="activeProfileUser = null">
      <div class="profile-modal-card" role="dialog" aria-modal="true" :aria-label="t('profileTitle')">
        <div class="profile-cover-header" :style="{ background: activeProfileUser.avatar_color || 'var(--om-primary, #2563EB)' }">
          <button class="btn-modal-close" @click="activeProfileUser = null">✕</button>
        </div>
        <div class="profile-avatar-center">
          <div class="avatar-circle xl"><img v-if="activeProfileUser.avatar_url" :src="activeProfileUser.avatar_url" alt="" class="ln-profile-photo" /><span v-else>{{ initialOf(activeProfileUser.display_name) }}</span></div>
        </div>
        <div v-if="activeProfileUser.id === currentUser?.id" class="profile-photo-controls" :aria-busy="photoSaving">
          <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="file-input-hidden" tabindex="-1" aria-hidden="true" @change="changeProfilePhoto" />
          <button class="btn-secondary" :disabled="photoSaving" @click="photoInput?.click()">{{ photoSaving ? t('profile_saving') : t('profile_photo_change') }}</button>
          <button v-if="currentUser?.avatar_url" class="btn-secondary" :disabled="photoSaving" @click="removeProfilePhoto">{{ t('profile_photo_remove') }}</button>
          <small>{{ t('profile_photo_hint') }}</small>
          <p v-if="photoError" role="alert" class="ln-profile-error">{{ photoError }}</p>
        </div>
        <div class="profile-body-center">
          <h2>{{ activeProfileUser.display_name }}</h2>
          <div v-if="activeProfileUser.handle" class="user-handle">@{{ activeProfileUser.handle }}</div>
          <p class="user-status-text">{{ activeProfileUser.status_message || activeProfileUser.bio || t('profile_empty') }}</p>
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
          <button class="btn-modal-close" @click="showKeepModal = false">✕</button>
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
          <button class="btn-modal-close" @click="showSendMoneyModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <p class="muted" style="margin: 0; font-size: 11.5px; color: #64748b;">{{ t('mvSandboxNotice') }}</p>
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
            <button class="btn-primary" @click="executeSendMoney">{{ t('mvMockSend') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CHARGE MONEY MODAL -->
    <div v-if="showChargeModal" class="modal-backdrop" @click.self="showChargeModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvChargeTitle') }}</h3>
          <button class="btn-modal-close" @click="showChargeModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <p>{{ t('mvChargePick') }}</p>
          <p class="ln-charge-notice" role="note">{{ t('mvChargeNotice') }}</p>
          <div class="charge-options-grid">
            <button class="btn-charge-option" disabled :title="t('mvChargeDisabledTitle')">{{ t('mvCharge10k') }}</button>
            <button class="btn-charge-option" disabled :title="t('mvChargeDisabledTitle')">{{ t('mvCharge30k') }}</button>
            <button class="btn-charge-option" disabled :title="t('mvChargeDisabledTitle')">{{ t('mvCharge50k') }}</button>
            <button class="btn-charge-option" disabled :title="t('mvChargeDisabledTitle')">{{ t('mvCharge100k') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE POLL MODAL -->
    <div v-if="showPollCreateModal" class="modal-backdrop" @click.self="showPollCreateModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>{{ t('mvPollTitle') }}</h3>
          <button class="btn-modal-close" @click="showPollCreateModal = false">✕</button>
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
          <button class="btn-modal-close" @click="showEventCreateModal = false">✕</button>
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

    <SettingsModal
      v-if="showSettingsModal"
      :devices-list="devicesList"
      v-model:target-translate-lang="targetTranslateLang"
      v-model:delete-password-input="deletePasswordInput"
      @close="showSettingsModal = false"
      @export="exportUserDataArchive"
      @delete="deleteUserAccount"
      @revoke-device="revokeDevice"
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
          <button class="btn-modal-close" @click="showPasswordModal = false">✕</button>
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
          <button class="btn-modal-close" @click="showNewStoryModal = false">✕</button>
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
          <button class="btn-modal-close" @click="showVoomCreateModal = false">✕</button>
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
          <button class="btn-modal-close" @click="showCreateOpenChatModal = false">✕</button>
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
          <button class="btn-modal-close" @click="showCreateGroupModal = false">✕</button>
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
        </div>
      </div>
    </div>

    <!-- ADD FRIEND MODAL (Article 2.C) -->
    <div v-if="showAddFriendModal" class="modal-backdrop" @click.self="showAddFriendModal = false">
      <div class="standard-modal-box add-friend-modal">
        <div class="modal-header">
          <h3>➕ {{ t('mvAddFriend') }}</h3>
          <button class="btn-modal-close" @click="showAddFriendModal = false">✕</button>
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
              <div class="pc-avatar circle-34" :style="{ background: u.avatar_color || 'var(--om-primary, #2563EB)' }">
                {{ initialOf(u.display_name, '?') }}
              </div>
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

    <!-- NEW CHAT MODAL (Floating Action Button 💬+) -->
    <div v-if="showNewChatModal" class="modal-backdrop" @click.self="showNewChatModal = false">
      <div class="standard-modal-box new-chat-modal">
        <div class="modal-header">
          <h3>{{ t('mvNewConvo') }}</h3>
          <button class="btn-modal-close" @click="showNewChatModal = false">✕</button>
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
              <div class="pc-avatar circle-34" :style="{ background: f.avatar_color || 'var(--om-primary, #2563EB)' }">
                {{ initialOf(f.display_name) }}
              </div>
              <div class="friend-pick-meta">
                <strong>{{ f.display_name }}</strong>
                <small>{{ f.status_message || f.bio || 'Open Messenger' }}</small>
              </div>
              <button class="btn-mini-chat">{{ t('mvChats') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- OPEN SCANNER ECOSYSTEM CENTER MODAL (Article 4 & Left Rail) -->
    <div v-if="showEcosystemHub" class="modal-backdrop" @click.self="showEcosystemHub = false">
      <div class="standard-modal-box ecosystem-modal">
        <div class="modal-header">
          <div class="ecosystem-modal-title">
            <LunoIcon name="open-messenger-logo" :size="24" />
            <h3>{{ t('mvEcoTitle') }}</h3>
          </div>
          <button class="btn-modal-close" @click="showEcosystemHub = false">✕</button>
        </div>
        <div class="modal-body-form ecosystem-body">
          <p class="ecosystem-intro">{{ t('mvEcoIntro') }}</p>
          <div class="ecosystem-cards-grid">
            <div
              v-for="svc in ECOSYSTEM_SERVICES"
              :key="svc.id"
              class="ecosystem-card"
              :class="svc.status"
            >
              <div class="ecosystem-card-header">
                <div class="svc-icon-box">
                  <LunoIcon :name="svc.icon" :size="20" />
                </div>
                <div class="svc-names">
                  <strong>{{ svc.name }}</strong>
                  <span class="svc-ko">{{ svc.nameKo }}</span>
                </div>
                <span class="svc-status-pill" :class="svc.status" :title="svc.statusText">{{ svc.statusText }}</span>
              </div>
              <p class="svc-desc">{{ svc.description }}</p>
              <div class="svc-card-footer">
                <a
                  v-if="svc.actionUrl"
                  :href="svc.actionUrl"
                  target="_blank"
                  class="btn-svc-action link"
                >{{ t('mvOpenConsole') }}</a>
                <button
                  v-else
                  type="button"
                  class="btn-svc-action"
                  @click="openEcosystemService(svc.id); showEcosystemHub = false"
                >
                  {{ svc.status === 'preview' ? t('mvPreviewGuide') : t('mvRunService') }}
                </button>
              </div>
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
