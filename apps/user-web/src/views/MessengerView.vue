<script setup lang="ts">
import lunoMark from '../../../shared/brand/luno-logo-appicon.svg'
import LineIcon from '../components/LineIcon.vue'
import MessageAttachment from '../components/MessageAttachment.vue'
import LineContextMenu, { type ContextMenuItem } from '../components/LineContextMenu.vue'
import { LINE_STICKERS, type LineSticker } from '../line-stickers'
import { playSendSound, playReceiveSound } from '../sound-effects'
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
  formatLocalizedTime,
  translateMessageText,
  type LunoLocale
} from '../luno-i18n'
import {
  API_URL,
  request,
  ApiError,
  newClientID,
  wsURL,
  type Chat,
  type Message,
  type User,
} from '../../../shared/api'
import {
  startWebRTCCall,
  endWebRTCCall,
  queueOfflineMessage,
  flushOfflineQueue
} from '../messenger-utils'

// --- LUNO Multilingual & Accessibility & Theme State ---

function enableLightMode() {
  if (isDarkMode.value) toggleDarkMode()
}
function enableDarkMode() {
  if (!isDarkMode.value) toggleDarkMode()
}

const fontScale = ref<'normal' | 'large' | 'xlarge'>('normal')
function setFontScale(scale: 'normal' | 'large' | 'xlarge') {
  fontScale.value = scale
  if (scale === 'normal') {
    document.documentElement.removeAttribute('data-font-scale')
  } else {
    document.documentElement.setAttribute('data-font-scale', scale)
  }
}

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
      error: '번역에 실패했습니다.'
    }
  }
}

// --- AI Voice/Video Call Live Captions UX ---
const liveCaptionsEnabled = ref(false)
const callSubtitles = ref('실시간 AI 통역 자막이 연결되었습니다.')

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
const friendsSectionOpen = ref(true)
const groupsSectionOpen = ref(true)
const favoritesSectionOpen = ref(true)
const officialSectionOpen = ref(true)
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

const newsCategories = ['전체', '인기', '경제', 'IT/과학', '글로벌', '엔터', '북마크']
const selectedNewsCategory = ref('전체')
const activeNewsArticle = ref<NewsArticle | null>(null)
const newsBookmarks = ref<Set<string>>(new Set())

const heroNewsSlides = ref<NewsArticle[]>([])
const newsIsSample = ref(false)

function relTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return min + '분 전'
  if (min < 60 * 24) return Math.round(min / 60) + '시간 전'
  return Math.round(min / 1440) + '일 전'
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
  if (selectedNewsCategory.value === '북마크') {
    const all = [...heroNewsSlides.value, ...popularNewsList.value]
    return all.filter(a => newsBookmarks.value.has(a.id))
  }
  if (selectedNewsCategory.value === '전체' || selectedNewsCategory.value === '인기') {
    return popularNewsList.value
  }
  const filtered = popularNewsList.value.filter(a => a.category === selectedNewsCategory.value)
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
  const shareText = `[뉴스 공유] ${article.title}\n출처: ${article.press} · ${article.category}\n${article.content}`
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
    author: currentUser.value?.display_name || '나',
    text,
    time: '방금 전'
  })
  newCommentInput.value = ''
  note.value = '기사에 댓글이 등록되었습니다.'
}


// --- Calls Tab State (Section 9 & Screenshot 3) ---
export interface CallRecord {
  id: string
  peer_id: string
  peer_name: string
  peer_avatar_color: string
  call_type: 'voice' | 'video'
  direction: 'incoming' | 'outgoing' | 'missed'
  timestamp_text: string
  duration_text?: string
  count?: number
}

const callHistoryList = ref<CallRecord[]>([])

const selectedCallRecord = ref<CallRecord | null>(null)

function callDateText(iso: string): string {
  const d = new Date(iso)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diffDays < 1) return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  if (diffDays < 7) return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] + '요일'
  return (d.getMonth() + 1) + '. ' + d.getDate() + '.'
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

// --- Recent Search History (Section 3.2 & 4) ---
const recentSearchKeywords = ref<string[]>(['K 🙏', '매일경제', '오픈채팅', 'CapCom', '회의록'])

function addSearchKeyword(kw: string) {
  if (!kw.trim()) return
  const t = kw.trim()
  recentSearchKeywords.value = [t, ...recentSearchKeywords.value.filter(k => k !== t)].slice(0, 10)
}

function removeSearchKeyword(kw: string) {
  recentSearchKeywords.value = recentSearchKeywords.value.filter(k => k !== kw)
}

function clearAllSearchKeywords() {
  recentSearchKeywords.value = []
}

// --- Date Dividers & Security Notice Helpers ---
function formatDateDivider(dateStr?: string) {
  if (!dateStr) return '오늘'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const month = d.getMonth() + 1
  const day = d.getDate()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const dayOfWeek = days[d.getDay()]
  return `${month}. ${day}. (${dayOfWeek})`
}

function shouldShowDateDivider(msg: any, index: number) {
  if (index === 0) return true
  const prev = messages.value[index - 1]
  if (!prev) return true
  const d1 = new Date(msg.created_at).toDateString()
  const d2 = new Date(prev.created_at).toDateString()
  return d1 !== d2
}

async function handleSecurityNoticeLogout(msg: any) {
  const sessionId = msg.metadata?.session_id
  if (!sessionId) {
    error.value = '이 알림에는 종료할 로그인 세션 정보가 없습니다 (샘플 알림).'
    return
  }
  try {
    const res = await api<{ status: string; self?: boolean }>('/api/v1/auth/sessions/revoke', 'POST', { session_id: sessionId })
    if (res.self) {
      clearLocalSession()
      void router.push('/login')
      return
    }
    note.value = '해당 로그인 세션이 서버에서 종료되었습니다.'
    await loadDevices()
  } catch (e) {
    // Never claim success when the server did not revoke anything.
    error.value = e instanceof Error ? e.message : '세션 종료에 실패했습니다.'
  }
}

const approveChallengeInput = ref('')
const approveTokenInput = ref('')
const showPasswordModal = ref(false)
const currentPasswordInput = ref('')
const newPasswordInput = ref('')
const confirmPasswordInput = ref('')
const passwordChangeError = ref('')

async function submitPasswordChange() {
  if (!currentPasswordInput.value) {
    passwordChangeError.value = '현재 비밀번호를 입력하세요.'
    return
  }
  if (newPasswordInput.value !== confirmPasswordInput.value) {
    passwordChangeError.value = '새 비밀번호가 일치하지 않습니다.'
    return
  }
  if (newPasswordInput.value.length < 12) {
    passwordChangeError.value = '새 비밀번호는 12자 이상이어야 합니다.'
    return
  }
  try {
    await api('/api/v1/auth/password', 'PATCH', {
      current_password: currentPasswordInput.value,
      new_password: newPasswordInput.value
    })
    note.value = '비밀번호가 성공적으로 변경되었습니다. 다른 모든 세션이 만료되었습니다.'
    showPasswordModal.value = false
    currentPasswordInput.value = ''
    newPasswordInput.value = ''
    confirmPasswordInput.value = ''
    passwordChangeError.value = ''
  } catch (err: any) {
    passwordChangeError.value = err?.message || '비밀번호 변경 실패'
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
    draftMessage.value = `[포스트백] ${tile.action.data || tile.label}`
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
const pinnedExpanded = ref(false)
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
const letterSealingEnabled = ref(true)
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
const editProfileName = ref('')
const editProfileBio = ref('')
const editProfileHandle = ref('')
const profileSaving = ref(false)
const profileSaveError = ref('')
const profileSaved = ref(false)
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
const profileDirty = computed(() => editProfileName.value.trim() !== (currentUser.value?.display_name || '') || editProfileHandle.value.trim() !== (currentUser.value?.handle || '') || editProfileBio.value.trim() !== (currentUser.value?.status_message || currentUser.value?.bio || ''))
const isRecordingVoice = ref(false)
let mediaRecorderInstance: MediaRecorder | null = null
let recordedChunks: BlobPart[] = []
const localVideoRef = ref<HTMLVideoElement | null>(null)
const remoteVideoRef = ref<HTMLVideoElement | null>(null)
const isScreenSharing = ref(false)
let currentDeviceId = ''

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

const activeStickerCategory = ref<'All' | LineSticker['character']>('All')

const filteredStickers = computed(() => {
  if (activeStickerCategory.value === 'All') return LINE_STICKERS
  return LINE_STICKERS.filter(s => s.character === activeStickerCategory.value)
})

function getStickerSvg(id: string): string {
  const found = LINE_STICKERS.find(s => s.id === id)
  return found ? found.svg : ''
}

function openMessageContextMenu(e: MouseEvent, msg: Message) {
  e.preventDefault()
  const items: ContextMenuItem[] = [
    {
      label: '텍스트 복사',
      shortcut: 'Ctrl+C',
      action: () => {
        navigator.clipboard?.writeText(msg.body).catch(() => {})
        note.value = '메시지가 클립보드에 복사되었습니다.'
      }
    },
    {
      label: '답장',
      action: () => startReply(msg)
    },
    {
      label: 'Keep에 저장',
      action: () => saveToKeep(msg)
    },
    {
      label: '공지로 등록',
      action: () => pinMessage(msg.id)
    }
  ]

  if (currentUser.value && msg.sender_id === currentUser.value.id) {
    items.push({
      label: '보내기 취소',
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
    note.value = next ? `★ ${friend.display_name}님을 즐겨찾기에 추가했습니다.` : `${friend.display_name}님을 즐겨찾기에서 해제했습니다.`
  })
}

async function toggleFriendBlock(friend: User) {
  await wrap(async () => {
    const next = !(friend as any).is_blocked
    await api(`/api/v1/friends/${friend.id}`, 'PATCH', { blocked: next })
    ;(friend as any).is_blocked = next
    await loadFriends()
    note.value = next ? `🚫 ${friend.display_name}님을 차단했습니다.` : `${friend.display_name}님 차단을 해제했습니다.`
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
    note.value = next ? '📌 대화방을 상단에 고정했습니다.' : '상단 고정을 해제했습니다.'
  })
}

async function toggleChatMute(chat: Chat) {
  await wrap(async () => {
    const next = !(chat as any).muted
    await api(`/api/v1/conversations/${chat.id}/meta`, 'PATCH', { muted: next })
    ;(chat as any).muted = next
    await loadChats()
    note.value = next ? '🔕 대화방 알림을 껐습니다.' : '🔔 대화방 알림을 켰습니다.'
  })
}

async function markChatAsRead(chat: Chat) {
  await wrap(async () => {
    await api(`/api/v1/conversations/${chat.id}/read`, 'POST', { sequence: chat.last_sequence || 999999 })
    await loadChats()
    note.value = '✓ 읽음 처리되었습니다.'
  })
}

async function markAllChatsRead() {
  await wrap(async () => {
    await api('/api/v1/conversations/read-all', 'POST', {})
    await loadChats()
    note.value = '✓✓ 모든 대화방을 읽음 처리했습니다.'
  })
}

async function leaveOrHideChat(chat: Chat) {
  await wrap(async () => {
    await api(`/api/v1/conversations/${chat.id}`, 'DELETE')
    if (selectedChatId.value === chat.id) selectedChatId.value = ''
    await loadChats()
    note.value = '대화방에서 나갔습니다.'
  })
}

function openChatContextMenu(e: MouseEvent, chat: Chat) {
  e.preventDefault()
  const isPinned = !!(chat as any).pinned
  const isMuted = !!(chat as any).muted
  const items: ContextMenuItem[] = [
    {
      label: isPinned ? '📌 상단 고정 해제' : '📌 대화방 상단 고정',
      action: () => toggleChatPin(chat)
    },
    {
      label: isMuted ? '🔔 알림 켜기' : '🔕 알림 끄기',
      action: () => toggleChatMute(chat)
    },
    {
      label: '✓ 읽음으로 표시',
      action: () => markChatAsRead(chat)
    },
    {
      label: '🚪 대화방 나가기',
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
      label: '💬 1:1 대화',
      action: () => startDirectChat(friend)
    },
    {
      label: isFav ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기 추가',
      action: () => toggleFriendFavorite(friend)
    },
    {
      label: '📞 음성 통화',
      action: () => startCallWithUser(friend, 'voice')
    },
    {
      label: '📹 영상 통화',
      action: () => startCallWithUser(friend, 'video')
    },
    {
      label: '👤 프로필 보기',
      action: () => { activeProfileUser.value = friend }
    },
    {
      label: '💸 송금하기',
      separator: true,
      action: () => openSendMoneyModal(friend)
    },
    {
      label: isBlk ? '차단 해제' : '🚫 차단하기',
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
  { id: 'pack-brown', name: '브라운 & 프렌즈', items: ['🐻', '🐰', '🐥', '🐸', '🐱', '🐶', '🐼', '🐨', '🦁', '🐯', '🦊', '🦄'] },
  { id: 'pack-emotions', name: '표정 & 감정', items: ['😀', '😂', '😍', '🥳', '😎', '😭', '😡', '🤔', '😴', '😱', '🤩', '😇'] },
  { id: 'pack-daily', name: '일상 & 음식', items: ['☕', '🍰', '🍕', '🍔', '🍣', '🍜', '🍺', '🍙', '🎉', '🎁', '💖', '👍'] },
  { id: 'pack-work', name: '직장인 & 개발', items: ['💻', '⌨️', '📱', '🚀', '🔥', '✨', '💯', '☕', '💪', '🙏', '🆗', '✅'] }
]

// --- Calling Simulation ---
const activeCall = ref<{ id: string; kind: 'voice' | 'video'; state: 'ringing' | 'connected' | 'ended'; title: string } | null>(null)
const callDuration = ref(0)
const isCallMuted = ref(false)
const isCallVideoOff = ref(false)
const isCallSpeakerOn = ref(true)
let callTimer: ReturnType<typeof setInterval> | null = null

// --- Modals & Popups ---
const activeProfileUser = ref<User | null>(null)
const showCreateGroupModal = ref(false)
const groupTitleInput = ref('')
const selectedFriendsForGroup = ref<string[]>([])
const showAddFriendModal = ref(false)
const addFriendHandleInput = ref('')
const showSettingsModal = ref(false)
const showContactPicker = ref(false)
watch(showSettingsModal, () => {
  profileSaved.value = false
  profileSaveError.value = ''
})
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

// --- Realtime WebSocket ---
let socket: WebSocket | null = null
const realtimeState = ref<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting')
let realtimeGeneration = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let messageSyncTimer: ReturnType<typeof setInterval> | null = null
let messageSyncInFlight: Promise<void> | null = null
// Each reconcile costs four API calls (sync, messages, read, conversations). While the
// realtime socket is open the Durable Object hub already delivers every event, so the
// poll only runs as a slow safety net; it falls back to every tick when the socket is
// down or the last reconcile failed (for example an offline message still queued).
const MESSAGE_SYNC_TICK_MS = 10000
const MESSAGE_SYNC_CONNECTED_MS = 60000
let lastMessageSyncAt = 0
let lastMessageSyncOk = false
const reportedReadSequence = new Map<string, number>()
function stopRealtime() {
  realtimeGeneration++
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  socket?.close()
  socket = null
}
function scheduleReconnect(generation: number) {
  if (generation !== realtimeGeneration || !token.value || reconnectTimer) return
  realtimeState.value = navigator.onLine ? 'reconnecting' : 'offline'
  if (!navigator.onLine) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connectRealtime()
  }, Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts++, 5)))
}

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
  note.value = notificationsEnabled.value ? '알림이 켜졌습니다.' : '방해금지 모드: 알림이 꺼졌습니다.'
}

function openEcosystemService(serviceId: string) {
  activeEcosystemId.value = serviceId
  if (serviceId === 'open-ai') {
    autoTranslateEnabled.value = true
    note.value = 'Open AI 지능형 비서가 활성화되었습니다. 메시지 번역 및 AI 통역 기능을 이용하세요.'
  } else if (serviceId === 'open-video') {
    if (friends.value.length > 0) {
      startCallWithUser(friends.value[0], 'video')
    } else {
      note.value = '영상 통화를 진행할 대화 상대를 선택해 주세요.'
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

async function approveQrLogin() {
  if (!approveChallengeInput.value.trim() || !approveTokenInput.value.trim()) return
  await wrap(async () => {
    await api('/api/v1/auth/qr/approve', 'POST', {
      challenge_id: approveChallengeInput.value.trim(),
      qr_token: approveTokenInput.value.trim()
    })
    approveChallengeInput.value = ''
    approveTokenInput.value = ''
    note.value = 'PC/Web QR 로그인이 승인되었습니다.'
  })
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

// --- Realtime WebSocket Connection ---
async function connectRealtime() {
  stopRealtime()
  if (!token.value) return
  const generation = realtimeGeneration
  const sessionToken = token.value
  realtimeState.value = navigator.onLine ? 'connecting' : 'offline'
  if (!navigator.onLine) return
  try {
    const { ticket } = await api<{ ticket: string }>('/api/v1/ws-ticket', 'POST')
    if (generation !== realtimeGeneration || sessionToken !== token.value) return
    const connection = new WebSocket(wsURL(ticket))
    socket = connection
    connection.onclose = () => scheduleReconnect(generation)
    connection.onerror = () => connection.close()
    connection.onopen = () => {
      if (generation !== realtimeGeneration) return
      realtimeState.value = 'connected'
      reconnectAttempts = 0
      void processOfflineQueue()
    }
    connection.onmessage = (event) => {
      if (generation !== realtimeGeneration) return
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'message.created') {
          const msg = data.message as Message
          if (msg.conversation_id === selectedChatId.value && !messages.value.some(m => m.id === msg.id)) {
            const canvas = messagesCanvasRef.value
            const followLatest = !canvas || canvas.scrollHeight - canvas.scrollTop - canvas.clientHeight < 100
            messages.value.push(msg)
            if (currentUser.value && msg.sender_id !== currentUser.value.id) {
              if (document.visibilityState === 'visible') {
                void api(`/api/v1/conversations/${msg.conversation_id}/read`, 'POST', { sequence: msg.sequence }).catch(() => {})
              }
              if (followLatest) scrollToBottom()
              playReceiveSound()
              if (autoTranslateEnabled.value && msg.kind === 'text') {
                void handleTranslateMessage(msg)
              }
            }
          }
          void loadChats()
        } else if (data.type === 'message.updated') {
          const mid = data.message_id || data.message?.id
          const target = messages.value.find(m => m.id === mid)
          if (target) {
            target.body = data.body || data.message?.body || target.body
            target.edited_at = data.message?.edited_at || new Date().toISOString()
          }
        } else if (data.type === 'message.unsent' || data.type === 'message.deleted') {
          const target = messages.value.find(m => m.id === data.message_id)
          if (target) {
            target.unsent = true
            target.body = '메시지를 취소했습니다'
          }
        } else if (data.type === 'message.reaction') {
          const target = messages.value.find(m => m.id === data.message_id)
          if (target) target.reactions = data.reactions
        } else if (data.type === 'conversation.read') {
          void loadChats()
          if (data.conversation_id === selectedChatId.value) {
            messages.value.forEach(m => {
              if (data.user_id !== currentUser.value?.id && m.sequence <= (data.sequence || 0)) m.read_count = Math.max(m.read_count || 0, 1)
            })
          }
        } else if (data.type === 'call.ringing') {
          activeCall.value = { id: data.call_id, kind: data.kind || 'voice', state: 'ringing', title: '수신된 통화' }
        } else if (data.type === 'call.signal') {
          void handleIncomingCallSignal(data)
        } else if (data.type === 'call.state') {
          if (data.state === 'ended') {
            endCallLocally()
          } else if (activeCall.value && activeCall.value.id === data.call_id) {
            activeCall.value.state = 'connected'
            startCallTimer()
          }
        } else if (data.type === 'poll.updated' || data.type === 'poll.created' || data.type === 'poll.closed') {
          if (data.conversation_id === selectedChatId.value) void loadPolls(selectedChatId.value)
        } else if (data.type === 'saved-messages.updated') {
          void loadKeep()
        }
      } catch {
        // ignore malformed ws message
      }
    }
  } catch (err) {
    if (generation !== realtimeGeneration) return
    if (err instanceof ApiError && err.status === 401) {
      clearLocalSession()
      error.value = t('session_expired')
      return
    }
    scheduleReconnect(generation)
  }
}

// --- Data Fetchers ---
async function loadChats() {
  const sessionToken = token.value
  try {
    const res = await api<{ conversations: Chat[] }>('/api/v1/conversations')
    if (sessionToken === token.value) chats.value = res.conversations || []
  } catch {}
}

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
      conversationError.value = e?.message || '대화방 메시지를 불러올 수 없습니다.'
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
    note.value = '새 공유 앨범이 생성되었습니다.'
  })
}

async function createNote() {
  if (!selectedChatId.value || !newNoteBody.value.trim()) return
  const cid = selectedChatId.value
  await wrap(async () => {
    await api(`/api/v1/conversations/${cid}/notes`, 'POST', { body: newNoteBody.value.trim() })
    newNoteBody.value = ''
    await loadNotes(cid)
    note.value = '대화방 릴레이 노트가 등록되었습니다.'
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
    note.value = '일정 참석 여부가 반영되었습니다.'
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
    note.value = '메시지가 수정되었습니다.'
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
      uploading.value = true
      try { await wrap(() => sendAttachmentFile(new File([blob], `voice-${Date.now()}.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime }), conversation, sessionToken)) }
      finally { uploading.value = false; isRecordingVoice.value = false }
    }
    mediaRecorderInstance.start()
    isRecordingVoice.value = true
    note.value = '🎙️ 음성 메시지를 녹음 중입니다. 다시 누르면 전송됩니다.'
  } catch {
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
  const found = LINE_STICKERS.find(s => s.id === stickerId)
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
    note.value = '📍 현재 위치 정보가 전송되었습니다.'
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
  const names: Record<string, string> = { skyblue: 'LINE 스카이블루', slate: '클린 화이트', mint: '민트 브리즈', dark: '미드나잇 다크' }
  note.value = `🎨 대화방 배경이 [${names[next]}]로 변경되었습니다.`
}

function chooseAttachment(kind: 'image' | 'voice' | 'file') {
  if (attachmentInput.value) {
    attachmentInput.value.accept = kind === 'image' ? 'image/*' : kind === 'voice' ? 'audio/*' : '*/*'
    attachmentInput.value.click()
  }
}

async function uploadSelectedFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const conversation = selectedChatId.value
  if (!file || !conversation || uploading.value) return
  uploading.value = true
  try { await wrap(() => sendAttachmentFile(file, conversation, token.value)) } finally { uploading.value = false }
}

async function sendAttachmentFile(file: File, conversation: string, sessionToken: string) {
    if (file.size === 0 || file.size > 512 * 1024) throw new Error(t('attachment_size_limit'))
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    const checksum = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
    const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'file'
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
      metadata: { attachment_id: att.id, mime_type: file.type, size_bytes: file.size }
    })
    if (sessionToken === token.value && selectedChatId.value === conversation && !messages.value.some(m => m.id === res.message.id)) messages.value.push(res.message)
    await loadChats()
}

async function downloadAttachment(message: Message) {
  const id = message.metadata?.attachment_id
  if (typeof id !== 'string') return
  await wrap(async () => {
    const response = await fetch(`${API_URL}/api/v1/attachments/${encodeURIComponent(id)}/content`, { headers: { Authorization: `Bearer ${token.value}` } })
    if (!response.ok) throw new Error('파일을 다운로드할 수 없습니다.')
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
      target.unsent = true
      target.body = '메시지를 취소했습니다'
    }
    note.value = '메시지를 성공적으로 전송 취소했습니다.'
  })
}

// Pin message as Announcement
async function pinMessage(msgId: string) {
  if (!selectedChatId.value) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${selectedChatId.value}/pins`, 'POST', { message_id: msgId })
    const res = await api<{ pins: any[] }>(`/api/v1/conversations/${selectedChatId.value}/pins`)
    pinnedList.value = res.pins || []
    note.value = '대화방 상단 공지로 등록했습니다.'
  })
}

async function unpinMessage(msgId: string) {
  if (!selectedChatId.value) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${selectedChatId.value}/pins/${msgId}`, 'DELETE')
    pinnedList.value = pinnedList.value.filter(p => p.message_id !== msgId)
    note.value = '공지를 내렸습니다.'
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
    note.value = '라인 Keep 보관함에 저장되었습니다.'
  })
}

async function deleteFromKeep(item: any) {
  const sid = item.id || item.message_id
  if (!sid) return
  await wrap(async () => {
    await api(`/api/v1/saved-messages/${sid}`, 'DELETE')
    await loadKeep()
    note.value = 'Keep 보관함에서 항목을 삭제했습니다.'
  })
}

// Copy text helper
function copyMessageText(text: string) {
  navigator.clipboard.writeText(text)
  note.value = '메시지가 클립보드에 복사되었습니다.'
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
    note.value = '새 투표가 생성되었습니다.'
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
    note.value = '대화방 일정이 등록되었습니다.'
  })
}

// --- Calling (Voice & Video WebRTC) ---
let rtcSession: { pc: RTCPeerConnection; stream: MediaStream | null } | null = null

async function initPeerSession(callId: string, kind: 'voice' | 'video') {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  let stream: MediaStream | null = null
  if (navigator.mediaDevices?.getUserMedia) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' })
      stream.getTracks().forEach(track => pc.addTrack(track, stream!))
      if (localVideoRef.value) localVideoRef.value.srcObject = stream
    } catch {}
  }
  pc.ontrack = (ev) => {
    if (remoteVideoRef.value && ev.streams[0]) remoteVideoRef.value.srcObject = ev.streams[0]
  }
  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      void api(`/api/v1/calls/${callId}/signal`, 'POST', {
        signal_type: 'ice-candidate',
        candidate: JSON.stringify(ev.candidate)
      }).catch(() => {})
    }
  }
  return { pc, stream }
}

async function startCall(kind: 'voice' | 'video', overrideTitle?: string) {
  const targetConvId = selectedChatId.value || chats.value[0]?.id || 'chat-k-01'
  selectedChatId.value = targetConvId
  const convTitle = overrideTitle || selectedChat.value?.title || '통화'
  await wrap(async () => {
    const webrtcId = await startWebRTCCall(targetConvId, kind, token.value, request)
    let callId = webrtcId
    if (!callId) {
      const c = await api<{ id: string; kind: 'voice' | 'video'; state: 'ringing' }>('/api/v1/calls', 'POST', {
        conversation_id: targetConvId,
        kind
      })
      callId = c.id
    }
    activeCall.value = { id: callId, kind, state: 'ringing', title: convTitle }
    callDuration.value = 0
    try {
      const sess = await initPeerSession(callId, kind)
      rtcSession = sess
      const offer = await sess.pc.createOffer()
      await sess.pc.setLocalDescription(offer)
      await api(`/api/v1/calls/${callId}/signal`, 'POST', {
        signal_type: 'offer',
        sdp: offer.sdp || ''
      }).catch(() => {})
    } catch {}
  })
}

async function handleIncomingCallSignal(data: any) {
  if (!activeCall.value || data.from_user_id === currentUser.value?.id) return
  try {
    if (!rtcSession) {
      rtcSession = await initPeerSession(activeCall.value.id, activeCall.value.kind)
    }
    const sess = rtcSession
    if (!sess) return
    if (data.signal_type === 'offer' && data.sdp) {
      await sess.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
      const answer = await sess.pc.createAnswer()
      await sess.pc.setLocalDescription(answer)
      await api(`/api/v1/calls/${activeCall.value.id}/signal`, 'POST', {
        signal_type: 'answer',
        sdp: answer.sdp || ''
      }).catch(() => {})
    } else if (data.signal_type === 'answer' && data.sdp) {
      await sess.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
    } else if (data.signal_type === 'ice-candidate' && data.candidate) {
      await sess.pc.addIceCandidate(JSON.parse(data.candidate))
    }
  } catch {}
}

function toggleCallMute() {
  isCallMuted.value = !isCallMuted.value
  rtcSession?.stream?.getAudioTracks().forEach(t => { t.enabled = !isCallMuted.value })
}

function toggleCallVideo() {
  isCallVideoOff.value = !isCallVideoOff.value
  rtcSession?.stream?.getVideoTracks().forEach(t => { t.enabled = !isCallVideoOff.value })
}

async function toggleScreenShare() {
  if (!navigator.mediaDevices?.getDisplayMedia) return
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    isScreenSharing.value = true
    if (localVideoRef.value) localVideoRef.value.srcObject = screenStream
    if (activeCall.value) {
      await api(`/api/v1/calls/${activeCall.value.id}/signal`, 'POST', { signal_type: 'screen-share' }).catch(() => {})
    }
  } catch {}
}

async function updateCallState(state: 'connected' | 'ended') {
  if (!activeCall.value) return
  const cid = activeCall.value.id
  const prevCall = { ...activeCall.value }
  const durSec = callDuration.value
  await wrap(async () => {
    await api(`/api/v1/calls/${cid}/state`, 'POST', { state }).catch(() => {})
    if (state === 'ended') {
      const targetConvId = selectedChatId.value
      const durText = durSec > 0 ? formatDuration(durSec) : undefined
      const wasConnected = prevCall.state === 'connected' && durSec > 0
      const msgBody = wasConnected ? (prevCall.kind === 'video' ? '영상통화' : '음성통화') : '취소'
      endCallLocally()
      callHistoryList.value.unshift({
        id: 'call-' + Date.now(),
        peer_id: targetConvId || 'peer-k',
        peer_name: prevCall.title,
        peer_avatar_color: '#315BCD',
        call_type: prevCall.kind,
        direction: wasConnected ? 'outgoing' : 'missed',
        timestamp_text: '방금 전',
        duration_text: durText
      })
      if (targetConvId) {
        try {
          const res = await api<{ message: Message }>(`/api/v1/conversations/${targetConvId}/messages`, 'POST', {
            client_id: newClientID(),
            kind: 'call_status',
            body: msgBody,
            metadata: {
              duration: durText || '',
              status: wasConnected ? 'completed' : 'cancelled',
              call_type: prevCall.kind
            }
          })
          if (selectedChatId.value === targetConvId && !messages.value.some(m => m.id === res.message.id)) {
            messages.value.push(res.message)
          }
          await loadChats()
        } catch {}
      }
    } else if (activeCall.value) {
      activeCall.value.state = 'connected'
      startCallTimer()
    }
  })
}

function startCallTimer() {
  if (callTimer) clearInterval(callTimer)
  callDuration.value = 0
  callTimer = setInterval(() => { callDuration.value++ }, 1000)
}

function endCallLocally() {
  if (callTimer) {
    clearInterval(callTimer)
    callTimer = null
  }
  endWebRTCCall(rtcSession?.pc || null, rtcSession?.stream || null)
  rtcSession = null
  isScreenSharing.value = false
  activeCall.value = null
  callDuration.value = 0
}

// --- Wallet & Pay ---
function openSendMoneyModal(friend: User) {
  sendTargetFriend.value = friend
  sendAmountInput.value = 10000
  sendMemoInput.value = '커피값 보냅니다 ☕'
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
    note.value = `${sendTargetFriend.value!.display_name}님께 ${sendAmountInput.value.toLocaleString()}원을 송금했습니다.`
    await Promise.all([loadWallet(), loadChats()])
  })
}

async function executeChargeMoney(amount: number) {
  await wrap(async () => {
    const res = await api<{ balance: number }>('/api/v1/wallet/charge', 'POST', { amount })
    walletBalance.value = res.balance
    showChargeModal.value = false
    note.value = `LINE Pay 잔액이 ${amount.toLocaleString()}원 충전되었습니다.`
    await loadWallet()
  })
}

// --- Friends & Direct Chat ---
async function startDirectChat(friend: User) {
  await wrap(async () => {
    const c = await api<{ id: string }>('/api/v1/conversations', 'POST', {
      kind: 'direct',
      member_ids: [friend.id],
      title: friend.display_name
    })
    await loadChats()
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
    note.value = '새 그룹 채팅방이 생성되었습니다.'
  })
}

async function addFriendByHandle() {
  if (!addFriendHandleInput.value.trim()) return
  await wrap(async () => {
    await api('/api/v1/friends', 'POST', { handle: addFriendHandleInput.value.trim() })
    addFriendHandleInput.value = ''
    showAddFriendModal.value = false
    await loadFriends()
    note.value = '친구가 추가되었습니다.'
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
    note.value = '내 24시간 스토리가 등록되었습니다.'
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
    note.value = 'LINE VOOM 포스트가 게시되었습니다.'
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
    note.value = '새 오픈채팅방이 개설되었습니다.'
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
async function saveProfileSettings() {
  if (!editProfileName.value.trim() || profileSaving.value || !profileDirty.value) return
  profileSaving.value = true
  profileSaveError.value = ''
  profileSaved.value = false
  try {
    const textBio = editProfileBio.value.trim()
    await api('/api/v1/me', 'PATCH', {
      display_name: editProfileName.value.trim(),
      bio: textBio,
      ...(currentUser.value && 'status_message' in currentUser.value ? { status_message: textBio } : {}),
      handle: editProfileHandle.value.trim()
    })
    currentUser.value = await api<User>('/api/v1/me')
    profileSaved.value = true
  } catch (err) {
    profileSaveError.value = err instanceof Error ? err.message : t('profile_save_error')
  } finally {
    profileSaving.value = false
  }
}

async function revokeDevice(deviceId: string) {
  await wrap(async () => {
    const res = await api<{ self?: boolean }>(`/api/v1/devices/${deviceId}`, 'DELETE')
    if (res.self) {
      clearLocalSession()
      void router.push('/login')
      return
    }
    await loadDevices()
    note.value = '기기 세션이 해제되었습니다.'
  })
}

// --- Settings & Themes ---
function switchTheme(theme: 'mint' | 'ocean' | 'sunset' | 'sakura' | 'midnight') {
  activeTheme.value = theme
  darkMode.value = theme === 'midnight'
  note.value = `테마가 [${theme.toUpperCase()}]로 변경되었습니다.`
}

// --- Logout ---
async function logout() {
  try {
    if (currentDeviceId) await api(`/api/v1/devices/${currentDeviceId}`, 'DELETE')
    else throw new Error('Current device unavailable')
  } catch { error.value = t('logout_unconfirmed') }
  clearLocalSession()
  void router.push('/login')
}

function clearLocalSession() {
  for (const controller of pendingSends.values()) controller.abort()
  pendingSends.clear()
  sendingConversations.value = new Set()
  chatSelectVersion++
  discardVoiceRecording()
  stopRealtime()
  reconnectAttempts = 0
  localStorage.removeItem('luno.auth_token')
  sessionStorage.removeItem('luno.auth_token')
  localStorage.removeItem('luno.device_id')
  sessionStorage.removeItem('luno.device_id')
  currentDeviceId = ''
  token.value = ''
  currentUser.value = null
  chats.value = []
  selectedChatId.value = ''
  conversationDrafts.clear()
  draftMessage.value = ''
  replyToMessage.value = null
  messages.value = []
  if (callTimer) clearInterval(callTimer)
}

async function processOfflineQueue() {
  if (messageSyncInFlight) return messageSyncInFlight
  messageSyncInFlight = synchronizeMessages()
  try { await messageSyncInFlight } finally { messageSyncInFlight = null }
}

async function synchronizeMessages() {
  if (!token.value || !currentUser.value) return
  const sessionToken = token.value
  const ownerId = currentUser.value.id
  const recoveryConvId = selectedChatId.value
  const recoveryAfter = messages.value.reduce((highest, msg) => Math.max(highest, msg.sequence), 0)
  lastMessageSyncAt = Date.now()
  lastMessageSyncOk = false
  try {
    await flushOfflineQueue(ownerId, async (msg) => {
      if (sessionToken !== token.value) throw new Error('Session changed')
      await request(`/api/v1/conversations/${msg.conversation_id}/messages`, sessionToken, 'POST', {
        client_id: msg.client_id,
        kind: msg.kind,
        body: msg.body,
        ...(msg.reply_to ? { reply_to: msg.reply_to } : {})
      })
    })
    if (sessionToken !== token.value) return
    if (selectedChatId.value) {
      const convId = selectedChatId.value
      // Replay every missed sequence, including gaps larger than the latest-page size.
      const missed: Message[] = []
      let after = convId === recoveryConvId ? recoveryAfter : 0
      while (sessionToken === token.value && selectedChatId.value === convId) {
        const delta = await api<{ messages?: Message[]; delta_messages?: Message[] }>(`/api/v1/conversations/${convId}/sync?after_sequence=${after}&since_sequence=${after}&limit=500`)
        const batch = delta.messages || delta.delta_messages || []
        missed.push(...batch)
        const next = batch.reduce((highest, msg) => Math.max(highest, msg.sequence), after)
        if (batch.length < 500 || next <= after) break
        after = next
      }
      const { messages: recovered } = await api<{ messages: Message[] }>(`/api/v1/conversations/${convId}/messages?limit=50`)
      if (sessionToken === token.value && selectedChatId.value === convId) {
        const byId = new Map(messages.value.map(m => [m.id, m]))
        for (const message of [...missed, ...(recovered || [])]) byId.set(message.id, message)
        messages.value = [...byId.values()].sort((a, b) => a.sequence - b.sequence)
        const last = messages.value[messages.value.length - 1]
        // Report a read position only when it moved; the server keeps the maximum anyway.
        if (last && document.visibilityState === 'visible' && last.sequence > (reportedReadSequence.get(`${ownerId}:${convId}`) || 0)) {
          await api(`/api/v1/conversations/${convId}/read`, 'POST', { sequence: last.sequence })
            .then(() => reportedReadSequence.set(`${ownerId}:${convId}`, last.sequence)).catch(() => {})
        }
      }
      await loadChats()
    } else {
      await loadChats()
    }
    lastMessageSyncOk = true
  } catch {}
}

function handleNetworkOnline() {
  void connectRealtime()
}

function handleNetworkOffline() {
  realtimeState.value = 'offline'
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible' || !token.value) return
  if (socket?.readyState === WebSocket.OPEN) void processOfflineQueue()
  else void connectRealtime()
}

onBeforeUnmount(() => {
  if (callTimer) clearInterval(callTimer)
  discardVoiceRecording()
  for (const controller of pendingSends.values()) controller.abort()
  stopRealtime()
  if (messageSyncTimer) clearInterval(messageSyncTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleNetworkOnline)
    window.removeEventListener('offline', handleNetworkOffline)
  }
})
// Phase 1 to Phase 6 Extended Actions
async function testPushNotification() {
  await wrap(async () => {
    const deviceId = devicesList.value[0]?.id
    if (!deviceId) { note.value = '등록된 기기가 없어 테스트 푸시를 발송할 수 없습니다.'; return }
    const res = await api<{ status: string }>('/api/v1/push/test', 'POST', { device_id: deviceId })
    if (res?.status === 'test_push_queued') {
      note.value = '🔔 [LUNO 푸시] 테스트 푸시 알림이 발송되었습니다!'
    }
  })
}


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
    note.value = '💾 [GDPR] 사용자 대화 데이터 아카이브 다운로드가 완료되었습니다.'
  })
}

const deletePasswordInput = ref('')
async function deleteUserAccount() {
  if (!deletePasswordInput.value) { error.value = '계정 삭제를 위해 비밀번호를 입력하세요.'; return }
  if (!confirm('정말로 계정을 영구 삭제하시겠습니까? 모든 대화와 데이터가 삭제됩니다.')) return
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
    nameKo: '통합 검색 & 지식 베이스',
    icon: 'open-search',
    category: 'core',
    status: 'active',
    statusText: '운영 중 (v2.4)',
    description: '대화방, 메시지, 파일 및 외부 웹 정보를 통합 인덱싱하여 검색합니다.'
  },
  {
    id: 'open-mail',
    name: 'Open Mail',
    nameKo: '보안 메일 시스템',
    icon: 'open-mail',
    category: 'communication',
    status: 'active',
    statusText: '연동 완료',
    description: '메신저 계정과 일원화된 엔드투엔드 암호화 비즈니스 메일 서비스입니다.'
  },
  {
    id: 'open-apps',
    name: 'Open Apps',
    nameKo: '생태계 앱 허브',
    icon: 'open-apps',
    category: 'productivity',
    status: 'active',
    statusText: '공식 런처',
    description: 'Open Scanner 생태계의 모든 웹 & 데스크톱 애플리케이션 모음입니다.'
  },
  {
    id: 'open-video',
    name: 'Open Video',
    nameKo: '고화질 영상 회의',
    icon: 'open-video',
    category: 'communication',
    status: 'active',
    statusText: 'WebRTC SFU 지원',
    description: '실시간 AI 통역 자막과 노이즈 캔슬링을 지원하는 다자간 고화질 화상회의 솔루션입니다.'
  },
  {
    id: 'open-stream',
    name: 'Open Stream',
    nameKo: '라이브 스트리밍 & 보이스 룸',
    icon: 'open-stream',
    category: 'communication',
    status: 'beta',
    statusText: '베타 테스트 중',
    description: '크리에이터 및 커뮤니티를 위한 초저지연 라이브 방송과 오디오 룸입니다.'
  },
  {
    id: 'open-ai',
    name: 'Open AI Assistant',
    nameKo: '지능형 AI 비서 & 실시간 통번역',
    icon: 'open-ai',
    category: 'core',
    status: 'active',
    statusText: '운영 중 (Gemini 2.5 Pro)',
    description: '메시지 다국어 자동번역, 음성 실시간 통역, 대화 요약 및 스마트 답장을 제공합니다.'
  },
  {
    id: 'open-shopping',
    name: 'Open Shopping',
    nameKo: '소셜 커머스 & 간편 결제',
    icon: 'money',
    category: 'lifestyle',
    status: 'beta',
    statusText: 'LUNO Pay 연동',
    description: '채팅 중 선물하기, 디지털 쿠폰 구매, 간편 결제 및 정산 플랫폼입니다.'
  },
  {
    id: 'open-news',
    name: 'Open News',
    nameKo: '실시간 뉴스 & 토픽',
    icon: 'globe',
    category: 'lifestyle',
    status: 'preview',
    statusText: '피드 준비 중',
    description: '신뢰할 수 있는 언론사의 맞춤형 속보와 인기 토픽을 실시간으로 전달합니다.'
  },
  {
    id: 'open-travel',
    name: 'Open Travel',
    nameKo: '여행 & 모빌리티',
    icon: 'globe',
    category: 'lifestyle',
    status: 'preview',
    statusText: '개발 중',
    description: '여행 일정 공유, 항공/호텔 예약, 그룹 여행 정산 기능을 제공합니다.'
  },
  {
    id: 'open-cloud',
    name: 'Open Cloud (Keep Vault)',
    nameKo: '암호화 클라우드 저장소',
    icon: 'keep',
    category: 'productivity',
    status: 'active',
    statusText: 'E2EE 암호화 적용',
    description: '사진, 대용량 파일, 링크, 메모를 기기 간 즉시 동기화하는 영구 보관소입니다.'
  },
  {
    id: 'open-workspace',
    name: 'Open Workspace',
    nameKo: '실시간 공동 문서 & 스프레드시트',
    icon: 'file',
    category: 'productivity',
    status: 'beta',
    statusText: '협업 에디터 탑재',
    description: '팀원과 함께 채팅창 내에서 실시간으로 문서를 작성하고 공유합니다.'
  },
  {
    id: 'open-chat',
    name: 'Open Chat (공개 커뮤니티)',
    nameKo: '관심사 기반 오픈채팅',
    icon: 'openchat',
    category: 'communication',
    status: 'active',
    statusText: '공식 운영 중',
    description: '개인정보 노출 없이 익명 프로필로 대화할 수 있는 주제별 오픈 커뮤니티입니다.'
  },
  {
    id: 'open-developer',
    name: 'Open Developer Platform',
    nameKo: '개발자 센터 & 봇 API',
    icon: 'settings',
    category: 'developer',
    status: 'active',
    statusText: 'REST/WebSocket/SDK 완비',
    description: '메시징 봇, 웹훅, OAuth 연동, 엔터프라이즈 통합 API 콘솔입니다.',
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
  messageSyncTimer = setInterval(() => {
    if (document.visibilityState !== 'visible' || !navigator.onLine || !token.value) return
    const due = realtimeState.value !== 'connected' || !lastMessageSyncOk || Date.now() - lastMessageSyncAt >= MESSAGE_SYNC_CONNECTED_MS
    if (due) void processOfflineQueue()
  }, MESSAGE_SYNC_TICK_MS)
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
    currentDeviceId = readStoredDeviceId()
    try {
      if (!currentUser.value) currentUser.value = await api<User>('/api/v1/me')
      editProfileName.value = currentUser.value.display_name || ''
      editProfileBio.value = currentUser.value.status_message || currentUser.value.bio || ''
      editProfileHandle.value = currentUser.value.handle || ''
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


    <!-- 2. AUTHENTIC LINE PC DESKTOP MESSENGER (3-Pane Workspace) -->
    <main class="pc-workspace">
      <!-- (Column 1) Sleek Midnight Navy Dock Rail (62px) -->
      <nav class="pc-rail">
        <div class="pc-rail-top">
          <!-- 1. My Profile Avatar with Online Dot -->
          <button type="button" class="pc-user-avatar-trigger" :title="t('profileTitle')" :aria-label="t('profileTitle')" @click="activeProfileUser = currentUser">
            <div class="pc-avatar circle-36" :style="{ background: currentUser?.avatar_color || 'var(--om-primary, #2563EB)' }"><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" /><span v-else>{{ currentUser?.display_name?.slice(0, 1) }}</span>
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
            <button class="dropdown-item" @click="activeProfileUser = currentUser">👤 프로필 설정</button>
            <button class="dropdown-item" @click="showSettingsModal = true">⚙️ {{ t('navSettings') }}</button>
            <button class="dropdown-item" @click="showKeepModal = true">💾 {{ t('navKeep') }}</button>
            <div class="dropdown-sep"></div>
            <button class="dropdown-item logout" @click="logout">로그아웃</button>
          </div>

          <!-- 2. Chats (대화) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'chats' }"
            :title="t('navChats')"
            @click="switchNav('chats')"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="chats" :size="22" />
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
            <LineIcon name="friends" :size="22" />
          </button>

          <!-- 4. News (뉴스) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'news' }"
            title="뉴스 (News)"
            @click="switchNav('news')"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="news" :size="21" />
          </button>

          <!-- 5. Calls (통화) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'calls' }"
            title="통화 (Calls)"
            @click="switchNav('calls')"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="calls" :size="20" />
          </button>

          <!-- 5b. Wallet (지갑) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'wallet' }"
            title="지갑 (Wallet)"
            @click="switchNav('wallet')"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="money" :size="20" />
          </button>

          <!-- 6. Add Friends (친구 추가) -->
          <button
            class="pc-rail-btn"
            title="친구 추가"
            @click="showAddFriendModal = true"
          >
            <LineIcon name="add-friends" :size="20" />
          </button>

          <!-- 5. Open Scanner Search -->
          <button
            class="pc-rail-btn"
            title="Open Scanner Search (통합 검색)"
            @click="openEcosystemService('open-search')"
          >
            <LineIcon name="open-search" :size="20" />
          </button>

          <!-- 6. Open Mail -->
          <button
            class="pc-rail-btn"
            title="Open Mail (보안 메일)"
            @click="openEcosystemService('open-mail')"
          >
            <LineIcon name="open-mail" :size="20" />
          </button>

          <!-- 7. Open Apps (앱 허브) -->
          <button
            class="pc-rail-btn"
            title="Open Apps (생태계 앱)"
            @click="openEcosystemService('open-apps')"
          >
            <LineIcon name="open-apps" :size="20" />
          </button>

          <!-- 8. Open Video (화상 회의) -->
          <button
            class="pc-rail-btn"
            title="Open Video (화상 회의)"
            @click="openEcosystemService('open-video')"
          >
            <LineIcon name="open-video" :size="20" />
          </button>

          <!-- 9. Open Stream (라이브 방송) -->
          <button
            class="pc-rail-btn"
            title="Open Stream (라이브 방송)"
            @click="openEcosystemService('open-stream')"
          >
            <LineIcon name="open-stream" :size="20" />
          </button>

          <!-- 10. Open AI (지능형 AI 비서) -->
          <button
            class="pc-rail-btn"
            title="Open AI (지능형 비서 & 실시간 번역)"
            @click="openEcosystemService('open-ai')"
          >
            <LineIcon name="open-ai" :size="20" />
          </button>

          <!-- 11. Open Services (전체 생태계) -->
          <button
            class="pc-rail-btn"
            title="Open Services (전체 플랫폼)"
            @click="openEcosystemService('open-services')"
          >
            <LineIcon name="open-services" :size="20" />
          </button>
        </div>

        <div class="pc-rail-bottom">
          <!-- Mobile APK Download Button -->
          <a href="./download.html" target="_blank" class="pc-rail-btn small" title="📱 Open Messenger 모바일 앱 (APK)" style="text-decoration: none;">
            <span style="font-size: 16px;">📱</span>
          </a>

          <!-- Screen Capture Button (Screenshot 1 & 4) -->
          <button class="pc-rail-btn small" title="화면 캡처 전송" @click="captureScreenToChat">
            <span style="font-size: 15px;">✂️</span>
          </button>

          <!-- Keep Button -->
          <button class="pc-rail-btn small" :title="t('navKeep')" @click="showKeepModal = true">
            <LineIcon name="keep" :size="19" />
          </button>

          <!-- 12. Notifications Toggle -->
          <button
            class="pc-rail-btn small"
            :title="notificationsEnabled ? '알림 켜짐' : '방해금지 (알림 꺼짐)'"
            @click="toggleNotifications"
          >
            <LineIcon :name="notificationsEnabled ? 'bell' : 'bell-off'" :size="19" />
          </button>

          <!-- 13. Settings Button -->
          <button class="pc-rail-btn small" :title="t('navSettings')" @click="showSettingsModal = true">
            <LineIcon name="settings" :size="19" />
          </button>

          <!-- 14. More / Consoles Menu Button -->
          <div class="rail-more-wrapper">
            <button class="pc-rail-btn small" title="더보기 / 플랫폼 콘솔" @click="showConsolesMenu = !showConsolesMenu">
              <LineIcon name="more" :size="19" />
            </button>

            <!-- Consoles Dropdown Popover -->
            <div v-if="showConsolesMenu" class="pc-dropdown-menu consoles-menu" @click="showConsolesMenu = false">
              <div class="dropdown-heading">🌐 Open Scanner 생태계 콘솔</div>
              <a href="./admin/" target="_blank" class="dropdown-item">👑 관리자 콘솔 (Admin)</a>
              <a href="./partner/" target="_blank" class="dropdown-item">🏢 파트너 콘솔 (Official)</a>
              <a href="./developer/" target="_blank" class="dropdown-item">💻 개발자 콘솔 (Developers)</a>
              <a href="./creator/" target="_blank" class="dropdown-item">🎨 크리에이터 마켓</a>
              <a href="./ads/" target="_blank" class="dropdown-item">📢 광고주 센터</a>
              <div class="dropdown-sep"></div>
              <button class="dropdown-item" @click="showEcosystemHub = true">🚀 Open Scanner 생태계 허브</button>
              <a href="./download.html" target="_blank" class="dropdown-item" style="color: var(--om-primary, #2563EB); font-weight: 700;">📱 모바일 앱 다운로드 (APK)</a>
              <button class="dropdown-item" @click="showSettingsModal = true">⚙️ {{ t('navSettings') }}</button>
              <button class="dropdown-item logout" @click="logout">로그아웃</button>
            </div>
          </div>
        </div>
      </nav>

      <!-- (Column 2) Second Sidebar List Pane (~305px) -->
      <aside class="pc-side-pane" :class="{ 'is-collapsed': isPanelCollapsed }">
        <!-- VIEW 1: FRIENDS / HOME (홈 및 친구 관리 - Section 3 & Screenshot 1) -->
        <div v-if="activeNav === 'home'" class="pc-pane-body">
          <!-- Top Search Header with Collapse Toggle -->
          <div class="pc-search-bar-header">
            <div class="pc-search-box-wrap">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input v-model="friendSearchQuery" :placeholder="t('searchFriends')" class="pc-pane-search-input" @keydown.enter="addSearchKeyword(friendSearchQuery)" />
              <button v-if="friendSearchQuery" class="btn-clear-search" @click="friendSearchQuery = ''">✕</button>
              <button class="btn-scan-qr-search" title="QR 코드 스캔" @click="showQrModal = true">
                <LineIcon name="scan" :size="15" />
              </button>
            </div>
            <button class="btn-pane-collapse" title="접기/펼치기" @click="isPanelCollapsed = !isPanelCollapsed">&lt;</button>
          </div>

          <!-- Recent Search Keywords (Section 3.2) -->
          <div v-if="recentSearchKeywords.length > 0" class="home-recent-searches">
            <div class="recent-searches-header">
              <small>최근 검색어</small>
              <button class="btn-clear-all-searches" @click="clearAllSearchKeywords">전체 삭제</button>
            </div>
            <div class="recent-search-chips">
              <span v-for="kw in recentSearchKeywords" :key="kw" class="recent-keyword-chip">
                <span class="kw-text" @click="friendSearchQuery = kw">{{ kw }}</span>
                <button class="btn-del-kw" @click="removeSearchKeyword(kw)">✕</button>
              </span>
            </div>
          </div>

          <!-- Quick Service Shortcuts (Section 3.3) -->
          <div class="home-services-bar">
            <div class="home-service-item" @click="showStickerPicker = true">
              <span class="srv-icon">🐻</span>
              <span class="srv-label">스티커</span>
            </div>
            <div class="home-service-item" @click="showSettingsModal = true">
              <span class="srv-icon">🎨</span>
              <span class="srv-label">테마</span>
            </div>
            <div class="home-service-item" @click="activeNav = 'chats'">
              <span class="srv-icon">🛡️</span>
              <span class="srv-label">공식 계정</span>
            </div>
            <div class="home-service-item" @click="showEcosystemHub = true">
              <span class="srv-icon">📱</span>
              <span class="srv-label">LUNO 서비스</span>
            </div>
          </div>

          <!-- Friends List Scroll Area -->
          <div class="pc-pane-scroll">
            <!-- My Profile Card with Keep & Album Buttons (Screenshot 4 & 5) -->
            <div class="pc-my-profile-card">
              <div class="my-profile-top-row" @click="activeProfileUser = currentUser">
                <div class="pc-avatar circle-46" :style="{ background: currentUser?.avatar_color || 'var(--om-primary, #4F7CFF)' }"><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" /><span v-else>{{ currentUser?.display_name?.slice(0, 1) }}</span>
                </div>
                <div class="my-profile-meta">
                  <div class="my-name-text">{{ currentUser?.display_name }}</div>
                  <div class="my-status-text">{{ currentUser?.status_message || t('myProfileStatus') }}</div>
                </div>
              </div>
              <!-- Action Chips: Keep 메모 & 앨범 모아보기 (Matching Screenshot 4) -->
              <div class="my-profile-action-chips">
                <button type="button" class="btn-profile-chip" @click="openKeepMemoChat">
                  <LineIcon name="keep" :size="13" />
                  <span>{{ t('keepMemo') }}</span>
                </button>
                <button type="button" class="btn-profile-chip" @click="toggleDrawer('albums')">
                  <LineIcon name="camera" :size="13" />
                  <span>{{ t('albumView') }}</span>
                </button>
              </div>
            </div>

            <!-- Accordion 0: Favorites (즐겨찾기 - 항상 노출) -->
            <div class="pc-accordion-section">
              <div class="pc-accordion-header" @click="favoritesSectionOpen = !favoritesSectionOpen">
                <span class="accordion-title">즐겨찾기 {{ favoriteFriends.length }}</span>
                <span class="accordion-caret">{{ favoritesSectionOpen ? '⌵' : '›' }}</span>
              </div>
              <div v-show="favoritesSectionOpen" class="pc-accordion-content">
                <div v-if="favoriteFriends.length === 0" class="accordion-empty-hint" style="padding: 10px 14px; font-size: 12px; color: #94a3b8;">
                  즐겨찾기한 친구가 없습니다. (친구 우클릭 또는 프로필에서 ★ 추가)
                </div>
                <div
                  v-else
                  v-for="fav in favoriteFriends"
                  :key="'fav-' + fav.id"
                  class="pc-friend-item-row"
                  :class="{ selected: selectedFriendProfile?.id === fav.id }"
                  @click="selectFriend(fav)"
                  @dblclick="startDirectChat(fav)"
                  @contextmenu.prevent="openFriendContextMenu($event, fav)"
                >
                  <div class="pc-avatar circle-38" :style="{ background: fav.avatar_color || 'var(--om-primary, #4F7CFF)' }">
                    {{ fav.display_name.slice(0, 1) }}
                  </div>
                  <div class="friend-item-meta">
                    <div class="friend-item-name">★ {{ fav.display_name }}</div>
                    <div class="friend-item-sub">{{ fav.status_message || fav.bio || 'LUNO 즐겨찾기 친구' }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Accordion 1: Groups (그룹 - Screenshots 4 & 5) -->
            <div class="pc-accordion-section">
              <div class="pc-accordion-header" @click="groupsSectionOpen = !groupsSectionOpen">
                <span class="accordion-title">{{ t('groupSection') }} {{ groupChats.length }}</span>
                <span class="accordion-caret">{{ groupsSectionOpen ? '⌵' : '›' }}</span>
              </div>
              <div v-show="groupsSectionOpen" class="pc-accordion-content">
                <div
                  v-for="grp in groupChats"
                  :key="grp.id"
                  class="pc-friend-item-row"
                  :class="{ selected: selectedChatId === grp.id }"
                  @click="selectChat(grp.id)"
                >
                  <div class="pc-avatar circle-38 group-avatar" style="background: var(--om-cyan, #8EC5FF);">
                    {{ grp.title ? grp.title.slice(0, 1) : 'G' }}
                  </div>
                  <div class="friend-item-meta">
                    <div class="friend-item-name">
                      {{ grp.title }}
                      <span class="group-count">({{ grp.member_count || 2 }})</span>
                    </div>
                    <div class="friend-item-sub">{{ grp.last_message?.body || '그룹 대화방' }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Accordion 1.5: Official Accounts (공식 계정) -->
            <div v-if="officialAccounts.length > 0" class="pc-accordion-section">
              <div class="pc-accordion-header" @click="officialSectionOpen = !officialSectionOpen">
                <span class="accordion-title">공식 계정 {{ officialAccounts.length }}</span>
                <span class="accordion-caret">{{ officialSectionOpen ? '⌵' : '›' }}</span>
              </div>
              <div v-show="officialSectionOpen" class="pc-accordion-content">
                <div
                  v-for="oa in officialAccounts"
                  :key="oa.id"
                  class="pc-friend-item-row"
                  @click="followOrOpenOfficialAccount(oa)"
                >
                  <div class="pc-avatar circle-38" :style="{ background: oa.color || '#06C755' }">
                    🛡️
                  </div>
                  <div class="friend-item-meta">
                    <div class="friend-item-name">{{ oa.name }} <span class="badge-verified">공식</span></div>
                    <div class="friend-item-sub">{{ oa.description }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Accordion 2: Friends (친구 - Screenshots 4 & 5) -->
            <div class="pc-accordion-section">
              <div class="pc-accordion-header" @click="friendsSectionOpen = !friendsSectionOpen">
                <span class="accordion-title">{{ t('friendSection') }} {{ filteredFriends.length }}</span>
                <span class="accordion-caret">{{ friendsSectionOpen ? '⌵' : '›' }}</span>
              </div>
              <div v-show="friendsSectionOpen" class="pc-accordion-content">
                <div
                  v-for="f in filteredFriends"
                  :key="f.id"
                  class="pc-friend-item-row"
                  :class="{ selected: selectedFriendProfile?.id === f.id }"
                  @click="selectFriend(f)"
                  @dblclick="startDirectChat(f)"
                  @contextmenu.prevent="openFriendContextMenu($event, f)"
                >
                  <div class="pc-avatar circle-38" :style="{ background: f.avatar_color || 'var(--om-primary, #4F7CFF)' }">
                    {{ f.display_name.slice(0, 1) }}
                  </div>
                  <div class="friend-item-meta">
                    <div class="friend-item-name">
                      <span v-if="(f as any).is_favorite" class="fav-star-inline">★</span>
                      {{ f.display_name }}
                    </div>
                    <div class="friend-item-sub">{{ f.status_message || f.bio || 'LUNO 친구' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- VIEW 2: CHATS (전체 대화 - Screenshot 4 & Section 11) -->
        <div v-else-if="activeNav === 'chats'" class="pc-pane-body">
          <!-- Top Chat Header Bar with Category Dropdown & Action Icons (Screenshot 4) -->
          <div class="pc-chat-main-header">
            <div class="chat-header-title-dropdown">
              <span class="chat-main-heading">대화</span>
              <span class="dropdown-caret">▾</span>
            </div>
            <div class="chat-header-action-group">
              <button class="btn-chat-head-tool" title="모든 대화 읽음 처리" @click="markAllChatsRead">
                ✓✓
              </button>
              <button class="btn-chat-head-tool" :title="chatSortAsc ? '이름순 정렬 중' : '최신순 정렬 중'" @click="chatSortAsc = !chatSortAsc">
                ⇅
              </button>
              <button class="btn-chat-head-tool" title="사진 및 파일 모아보기" @click="toggleDrawer('media')">
                <LineIcon name="photo" :size="16" />
              </button>
              <button class="btn-chat-head-tool" title="캘린더" @click="toggleDrawer('events')">
                <LineIcon name="calendar" :size="16" />
              </button>
              <button class="btn-chat-head-tool" title="새 대화 생성" @click="showNewChatModal = true">
                <LineIcon name="chats" :size="16" />
                <span class="tiny-plus">+</span>
              </button>
            </div>
          </div>

          <!-- Top Sub-Tabs: 전체 | 친구 | 그룹 | ⇄ (Screenshot 1) -->
          <div class="pc-chat-subtabs-row">
            <button class="btn-subtab" :class="{ active: chatFilter === 'all' }" @click="chatFilter = 'all'">{{ t('tabAll') }}</button>
            <button class="btn-subtab" :class="{ active: chatFilter === 'direct' }" @click="chatFilter = 'direct'">{{ t('tabDirect') }}</button>
            <button class="btn-subtab" :class="{ active: chatFilter === 'group' }" @click="chatFilter = 'group'">{{ t('tabGroup') }}</button>
            <button class="btn-subtab filter-btn" :class="{ active: chatFilter === 'unread' }" @click="chatFilter = chatFilter === 'unread' ? 'all' : 'unread'" title="정렬 및 필터">⇄</button>
          </div>

          <!-- Search Bar with Scan QR icon and Collapse (<) (Screenshot 4) -->
          <div class="pc-search-bar-header">
            <div class="pc-search-box-wrap">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input v-model="searchKeyword" placeholder="검색" class="pc-pane-search-input" />
              <button v-if="searchKeyword" class="btn-clear-search" @click="searchKeyword = ''">✕</button>
              <button class="btn-scan-qr-search" title="QR 코드 스캔" @click="showQrModal = true">
                <LineIcon name="scan" :size="15" />
              </button>
            </div>
            <button class="btn-pane-collapse" title="접기/펼치기" @click="isPanelCollapsed = !isPanelCollapsed">&lt;</button>
          </div>

          <!-- CapCom / Open Scanner Game Banner Ad (Screenshot 4) -->
          <div class="chat-ad-banner-card" @click="openEcosystemService('open-apps')">
            <div class="ad-banner-info">
              <span class="ad-tag-title">LUNO</span>
              <span class="ad-tag-link">{{ t('soon_tag') }}</span>
            </div>
            <div class="ad-banner-graphic">
              <span class="ad-badge-i">ⓘ</span>
              <img :src="lunoMark" alt="LUNO" class="ad-logo-img" />
            </div>
          </div>

          <!-- Chats Scroll List (Screenshots 1 & 4) -->
          <div class="pc-pane-scroll">
            <div
              v-for="c in filteredChats"
              :key="c.id"
              class="pc-chat-item-row"
              :class="{ selected: selectedChatId === c.id }"
              @click="selectChat(c.id)"
              @contextmenu.prevent="openChatContextMenu($event, c)"
            >
              <div class="pc-avatar circle-44" :class="{ 'group-avatar': c.kind === 'group' }" :style="{ background: c.kind === 'group' ? 'var(--om-cyan, #8EC5FF)' : c.official ? '#06C755' : 'var(--om-primary, #4F7CFF)' }">
                <span v-if="c.official">🛡️</span>
                <span v-else>{{ c.title ? c.title.slice(0, 1) : 'L' }}</span>
              </div>
              <div class="pc-chat-item-meta">
                <div class="chat-row-top">
                  <div class="chat-row-title">
                    <span v-if="(c as any).pinned" class="chat-pin-mark" title="상단 고정됨">📌</span>
                    {{ c.title || '대화방' }}
                    <span v-if="c.kind === 'group'" class="member-count-badge">({{ c.member_count || 2 }})</span>
                    <span v-if="(c as any).muted" class="chat-mute-mark" title="알림 꺼짐">🔕</span>
                  </div>
                  <span class="chat-row-time">{{ formatTime(c.updated_at || '') }}</span>
                </div>
                <div class="chat-row-bottom">
                  <span class="chat-row-preview">{{ c.last_message?.body || '메시지가 없습니다.' }}</span>
                  <div class="chat-row-badges">
                    <span v-if="c.badge_n" class="badge-green-n">N</span>
                    <span v-else-if="c.unread_count && c.unread_count > 0" class="chat-unread-pill">{{ c.unread_count }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Floating Action Button (FAB) New Chat (Screenshot 1) -->
          <button class="pc-floating-add-btn" title="새 대화 시작" @click="showNewChatModal = true">
            <LineIcon name="chats" :size="20" />
            <span class="fab-plus-mark">+</span>
          </button>
        </div>

        <!-- VIEW: NEWS (뉴스 & 콘텐츠 - Screenshot 5 & Section 10) -->
        <div v-else-if="activeNav === 'news'" class="pc-pane-body pc-news-pane">
          <!-- News Header -->
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">뉴스</h2>
            <div class="news-header-tools">
              <button class="btn-pc-header-tool" title="뉴스 설정" @click="showSettingsModal = true">
                <LineIcon name="settings" :size="17" />
              </button>
            </div>
          </div>
          <!-- News Category Filter Tabs -->
          <div class="pc-chat-subtabs-row">
            <button
              v-for="cat in newsCategories"
              :key="cat"
              class="btn-subtab"
              :class="{ active: selectedNewsCategory === cat }"
              @click="selectedNewsCategory = cat"
            >
              {{ cat }}
            </button>
          </div>

          <!-- News Scroll List -->
          <div class="pc-pane-scroll news-scroll">
            <div v-if="newsIsSample" class="news-sample-banner" style="margin:8px 12px;padding:8px 12px;border-radius:8px;background:#fff7e0;color:#7a5b00;font-size:12px;">
              LUNO 에디토리얼 샘플 콘텐츠입니다. 실제 언론 기사가 아닙니다.
            </div>
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
                <button class="btn-hero-nav prev" title="이전 기사" @click.stop="prevHeroSlide">‹</button>
                <button class="btn-hero-nav next" title="다음 기사" @click.stop="nextHeroSlide">›</button>
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
                  :title="'슬라이드 ' + (idx + 1)"
                  @click.stop="activeHeroSlideIndex = idx"
                ></span>
              </div>
            </div>

            <!-- Ad Banner Card (Screenshot 5) -->
            <div class="news-ad-banner" @click="openEcosystemService('open-apps')">
              <div class="ad-text-block">
                <span class="ad-headline">타협 없는 모바일 액션</span>
                <span class="ad-sub">AD 몬스터헌터 아웃랜더스 &gt;</span>
              </div>
              <div class="ad-thumb">
                <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=120&auto=format&fit=crop&q=80" alt="AD" />
              </div>
            </div>

            <!-- Category Section: 오늘의 인기 기사 (Screenshot 5) -->
            <div class="news-section-wrap">
              <div class="news-section-header">
                <h4 class="section-title">오늘의 인기 기사</h4>
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
            <h2 class="pc-pane-title">통화</h2>
            <div class="calls-header-tools">
              <button class="btn-pc-header-tool" title="새 통화 시작" @click="startCall('voice')">
                <LineIcon name="call-voice" :size="17" />
              </button>
            </div>
          </div>

          <!-- Calls Filter Subtabs -->
          <div class="pc-chat-subtabs-row">
            <button class="btn-subtab" :class="{ active: callFilter === 'all' }" @click="callFilter = 'all'">전체 ({{ callHistoryList.length }})</button>
            <button class="btn-subtab" :class="{ active: callFilter === 'missed' }" @click="callFilter = 'missed'">부재중</button>
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
                {{ log.peer_name.slice(0, 1) }}
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
                :title="log.peer_name + '에게 전화 걸기'"
                @click.stop="startCallFromHistory(log, log.call_type)"
              >
                <LineIcon name="calls" :size="18" />
              </button>
            </div>
          </div>
        </div>

        <!-- VIEW 3: VOOM -->
        <div v-else-if="activeNav === 'voom'" class="pc-pane-body">
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">LINE VOOM</h2>
            <button class="btn-pc-header-tool" title="새 스토리" @click="showNewStoryModal = true">➕</button>
          </div>
          <div class="stories-row">
            <div class="story-item" @click="showNewStoryModal = true">
              <div class="story-ring plus">＋</div>
              <small>스토리 추가</small>
            </div>
            <div v-for="s in stories" :key="s.id" class="story-item">
              <div class="story-ring" :style="{ background: s.bg || 'var(--om-primary, #2563EB)' }">{{ (s.author_name || 'L').slice(0, 1) }}</div>
              <small>{{ s.author_name || '친구' }}</small>
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
                  <small>{{ v.comments?.length || 0 }}개의 댓글</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- VIEW 4: OPENCHAT -->
        <div v-else-if="activeNav === 'openchat'" class="pc-pane-body">
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">오픈채팅</h2>
            <button class="btn-pc-header-tool" title="오픈채팅 만들기" @click="showCreateOpenChatModal = true">➕</button>
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
            <h2 class="pc-pane-title">LINE Pay / 서비스</h2>
          </div>
          <div class="line-pay-card">
            <div class="pay-top">
              <span>LINE Pay</span>
              <span>POINT {{ walletPoints.toLocaleString() }} P</span>
            </div>
            <div class="pay-balance">₩ {{ walletBalance.toLocaleString() }}</div>
            <div class="pay-actions">
              <button class="btn-pay-action" @click="showChargeModal = true">충전</button>
              <button class="btn-pay-action secondary" @click="showSendMoneyModal = true">송금</button>
            </div>
          </div>
          <div class="services-grid">
            <div class="service-box" @click="switchNav('voom')"><span class="icon">🎬</span><span class="title">LINE VOOM</span></div>
            <div class="service-box" @click="showSettingsModal = true"><span class="icon">🎨</span><span class="title">테마 / 설정</span></div>
            <div class="service-box" @click="showStickerPicker = true"><span class="icon">🐻</span><span class="title">스티커 샵</span></div>
          </div>
          <div v-if="walletTx.length" class="wallet-tx-section">
            <h4 class="wallet-tx-heading">최근 거래 내역</h4>
            <div v-for="tx in walletTx.slice(0, 8)" :key="tx.id" class="wallet-tx-row">
              <div class="wallet-tx-info">
                <strong>{{ tx.title || tx.note || tx.kind || 'LUNO Pay 거래' }}</strong>
                <small>{{ formatTime(tx.created_at) }}</small>
              </div>
              <span class="wallet-tx-amount" :class="{ plus: tx.amount > 0 }">
                {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount.toLocaleString() }}원
              </span>
            </div>
          </div>
        </div>
      </aside>

      <!-- (Column 3) Right Main Viewport: Chat / Calls / OpenChat / Friend Profile / Empty Canvas -->
      <section v-if="activeNav === 'calls'" class="pc-calls-viewport">
        <div v-if="selectedCallRecord" class="pc-call-detail-card">
          <div class="profile-preview-avatar" :style="{ background: selectedCallRecord.peer_avatar_color || '#315BCD' }">
            {{ selectedCallRecord.peer_name.slice(0, 1) }}
          </div>
          <h2 class="profile-preview-name">{{ selectedCallRecord.peer_name }}</h2>
          <p class="profile-preview-bio">
            <span :class="{ 'text-red': selectedCallRecord.direction === 'missed' }">
              {{ selectedCallRecord.direction === 'missed' ? '부재중 전화' : selectedCallRecord.direction === 'incoming' ? '수신 통화' : '발신 통화' }}
            </span>
            · {{ selectedCallRecord.timestamp_text }}
            <span v-if="selectedCallRecord.duration_text">({{ selectedCallRecord.duration_text }})</span>
          </p>
          <div class="profile-preview-actions">
            <button class="btn-start-chat-large" @click="startCallFromHistory(selectedCallRecord, 'voice')">
              📞 무료 음성통화 걸기
            </button>
            <div class="profile-preview-subactions">
              <button type="button" class="btn-subaction-pill" @click="startCallFromHistory(selectedCallRecord, 'video')">
                <LineIcon name="call-video" :size="16" />
                <span>영상 통화</span>
              </button>
              <button type="button" class="btn-subaction-pill" @click="openChatFromCallRecord(selectedCallRecord)">
                <LineIcon name="chats" :size="16" />
                <span>1:1 대화방 이동</span>
              </button>
              <button type="button" class="btn-subaction-pill" @click="removeCallRecord(selectedCallRecord.id); selectedCallRecord = callHistoryList[0] || null">
                <span>🗑️ 이력 삭제</span>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="pc-empty-dialog">
          <div class="pc-watermark-wrap">
            <LineIcon name="calls" :size="68" />
          </div>
          <h3 class="pc-empty-title">LUNO 무료 음성·영상 통화</h3>
          <p class="pc-empty-desc">좌측 통화 이력에서 상대를 선택하거나 통화 아이콘을 눌러 통화를 시작하세요.</p>
        </div>
      </section>

      <section v-else-if="activeNav === 'openchat' && selectedOpenChatRoom" class="pc-openchat-viewport">
        <header class="pc-chat-topbar">
          <div class="chat-topbar-left">
            <div class="pc-avatar circle-36" style="background: #2563EB;">💬</div>
            <div class="chat-topbar-info">
              <div class="title-row">
                <span class="chat-header-title">{{ selectedOpenChatRoom.name }}</span>
                <span class="badge-verified">공개 커뮤니티</span>
              </div>
              <small class="e2ee-tag">{{ selectedOpenChatRoom.description }}</small>
            </div>
          </div>
        </header>
        <div class="pc-chat-messages-canvas">
          <p v-if="!openChatPosts.length" class="empty-muted" style="margin:auto;">첫 커뮤니티 게시글을 남겨보세요!</p>
          <div v-for="post in openChatPosts" :key="post.id" class="openchat-post-card">
            <div class="openchat-post-meta">
              <strong>익명 멤버 ({{ post.author_id.slice(0, 6) }})</strong>
              <small>{{ formatTime(post.created_at) }}</small>
            </div>
            <p class="openchat-post-body">{{ post.body }}</p>
          </div>
        </div>
        <footer class="pc-chat-input-dock">
          <form class="pc-textarea-form" @submit.prevent="submitOpenChatPost">
            <textarea
              v-model="newOpenChatPostBody"
              placeholder="오픈채팅 커뮤니티에 메시지를 입력하세요..."
              rows="2"
              @keydown.enter.exact.prevent="submitOpenChatPost"
            ></textarea>
            <div class="pc-textarea-bottom">
              <span class="char-count">{{ newOpenChatPostBody.length }}/500</span>
              <button class="btn-green-send" :disabled="!newOpenChatPostBody.trim()">등록</button>
            </div>
          </form>
        </footer>
      </section>

      <section v-else-if="selectedChat" class="pc-chat-viewport">
        <!-- Chat Header -->
        <header class="pc-chat-topbar">
          <div class="chat-topbar-left">
            <button class="btn-mobile-back" @click="selectedChatId = ''" title="뒤로가기">
              <LineIcon name="back" :size="18" />
            </button>
            <div class="pc-avatar circle-36" :style="{ background: selectedChat.kind === 'group' ? '#0ea5e9' : selectedChat.official ? '#00B900' : '#315BCD' }">
              {{ selectedChat.official ? 'L' : selectedChat.title ? selectedChat.title.slice(0, 1) : 'L' }}
            </div>
            <div class="chat-topbar-info">
              <div class="title-row">
                <span class="chat-header-title">{{ selectedChat.title }}</span>
                <span v-if="selectedChat.kind === 'group'" class="member-tag">👥 {{ selectedChat.member_count || 2 }}</span>
                <span v-if="selectedChat.official" class="badge-verified">✓ 공식채널</span>
              </div>
              <small class="e2ee-tag ln-connection-state" :data-state="realtimeState" role="status">
                {{ t('connection_' + realtimeState) }}
              </small>
            </div>
          </div>

          <div class="chat-topbar-actions">
            <!-- AI Translation Bar Controls (Article 10) -->
            <div class="ai-translate-tool-pill">
              <button
                class="btn-translate-switch"
                :class="{ active: autoTranslateEnabled }"
                :title="t('translateToggle')"
                @click="autoTranslateEnabled = !autoTranslateEnabled"
              >
                <LineIcon name="translate" :size="16" />
                <span>{{ autoTranslateEnabled ? 'AI 자동번역 ON' : 'AI 번역' }}</span>
              </button>
              <select v-model="targetTranslateLang" class="translate-lang-select" aria-label="Target language">
                <option value="ko">KR</option>
                <option value="en">EN</option>
                <option value="th">TH</option>
                <option value="ja">JA</option>
              </select>
            </div>

            <button class="btn-chat-action" title="배경 테마 변경" @click="cycleWallpaper">🎨</button>
            <button class="btn-chat-action" :title="t('callVoice')" @click="startCall('voice')"><LineIcon name="call-voice" :size="18" /></button>
            <button class="btn-chat-action" :title="t('callVideo')" @click="startCall('video')"><LineIcon name="call-video" :size="18" /></button>
            <button class="btn-chat-action" :class="{ active: activeDrawer === 'events' }" title="일정 캘린더" @click="toggleDrawer('events')"><LineIcon name="calendar" :size="18" /></button>
            <button class="btn-chat-action" :class="{ active: activeDrawer !== 'none' }" title="대화 서랍 (노트/앨범/파일)" @click="toggleDrawer('notes')"><LineIcon name="drawer" :size="18" /></button>
          </div>
        </header>

        <!-- Pinned Announcement (공지사항) -->
        <div v-if="pinnedList.length" class="pinned-banner" :class="{ expanded: pinnedExpanded }">
          <div class="pinned-summary" @click="pinnedExpanded = !pinnedExpanded">
            <span class="pin-icon">📢</span>
            <span class="pin-text">{{ pinnedList[0].body || '상단 고정 공지사항' }}</span>
            <button class="btn-unpin-inline" title="공지 내리기" @click.stop="unpinMessage(pinnedList[0].message_id)">✕</button>
            <span class="pin-toggle">{{ pinnedExpanded ? '▲' : '▼' }}</span>
          </div>
        </div>

        <!-- Active Polls Banner -->
        <div v-if="activePolls.length" class="polls-banner-wrap">
          <div v-for="poll in activePolls.slice(0, 2)" :key="poll.id" class="poll-inline-card">
            <div class="poll-inline-head">
              <strong>📊 {{ poll.question }}</strong>
              <small>{{ poll.closed ? '마감됨' : '투표 진행 중' }}</small>
            </div>
            <div class="poll-options-row">
              <button
                v-for="opt in poll.options"
                :key="opt.id"
                class="btn-poll-opt"
                :class="{ voted: opt.voted }"
                @click="votePoll(poll.id, opt.id)"
              >
                <span>{{ opt.text || opt.label }}</span>
                <strong>{{ opt.votes ?? opt.count ?? 0 }}표</strong>
              </button>
            </div>
          </div>
        </div>

        <!-- Slide-Over Conversation Drawer (Notes / Albums / Events / Media / Search) -->
        <div v-if="activeDrawer !== 'none'" class="pc-drawer-panel">
          <div class="drawer-tabs-bar">
            <button :class="{ active: activeDrawer === 'notes' }" @click="toggleDrawer('notes')">📝 노트</button>
            <button :class="{ active: activeDrawer === 'albums' }" @click="toggleDrawer('albums')">🖼️ 앨범</button>
            <button :class="{ active: activeDrawer === 'events' }" @click="toggleDrawer('events')">📅 일정</button>
            <button :class="{ active: activeDrawer === 'media' }" @click="toggleDrawer('media')">🗂️ 미디어</button>
            <button class="btn-drawer-close" @click="activeDrawer = 'none'">✕</button>
          </div>
          <div class="drawer-search-bar">
            <input v-model="chatSearchQuery" placeholder="대화방 내 메시지 검색..." @keydown.enter.prevent="runConversationSearch" />
            <button class="btn-secondary" @click="runConversationSearch">검색</button>
          </div>
          <div v-if="chatSearchResults.length" class="drawer-search-results">
            <div v-for="sr in chatSearchResults" :key="sr.id" class="drawer-item-card">
              <strong>{{ sr.body }}</strong>
              <small>{{ formatTime(sr.created_at) }}</small>
            </div>
          </div>
          <div v-if="activeDrawer === 'notes'" class="drawer-body">
            <form class="flex-row" @submit.prevent="createNote">
              <input v-model="newNoteBody" placeholder="새 대화방 노트 작성..." />
              <button class="btn-primary" type="submit">등록</button>
            </form>
            <p v-if="!chatNotes.length" class="empty-muted">등록된 노트가 없습니다.</p>
            <div v-for="n in chatNotes" :key="n.id" class="drawer-item-card">
              <div class="flex-row" style="justify-content:space-between">
                <strong>{{ n.body }}</strong>
                <button class="btn-delete-keep" @click="deleteNoteItem(n.id)">삭제</button>
              </div>
              <small class="muted">{{ formatTime(n.created_at) }}</small>
            </div>
          </div>
          <div v-else-if="activeDrawer === 'albums'" class="drawer-body">
            <form class="flex-row" @submit.prevent="createAlbum">
              <input v-model="newAlbumTitle" placeholder="새 공유 앨범 제목..." />
              <button class="btn-primary" type="submit">생성</button>
            </form>
            <p v-if="!chatAlbums.length" class="empty-muted">생성된 공유 앨범이 없습니다.</p>
            <div v-for="alb in chatAlbums" :key="alb.id" class="drawer-item-card">
              <strong>🖼️ {{ alb.title }}</strong>
              <small class="muted">{{ formatTime(alb.created_at) }}</small>
            </div>
          </div>
          <div v-else-if="activeDrawer === 'events'" class="drawer-body">
            <div class="flex-row" style="justify-content:space-between">
              <strong>대화방 일정 ({{ chatEvents.length }})</strong>
              <button class="btn-primary" @click="showEventCreateModal = true">+ 새 일정</button>
            </div>
            <p v-if="!chatEvents.length" class="empty-muted">등록된 일정이 없습니다.</p>
            <div v-for="ev in chatEvents" :key="ev.id" class="drawer-item-card">
              <strong>📅 {{ ev.title }}</strong>
              <small class="muted">{{ ev.starts_at }} · {{ ev.location || '온라인' }}</small>
              <div class="flex-row" style="margin-top:6px">
                <button class="btn-secondary" @click="rsvpEvent(ev.id, 'going')">참석 ({{ ev.going?.length || 0 }})</button>
                <button class="btn-secondary" @click="rsvpEvent(ev.id, 'declined')">불참 ({{ ev.declined?.length || 0 }})</button>
              </div>
            </div>
          </div>
          <div v-else-if="activeDrawer === 'media'" class="drawer-body">
            <p v-if="!chatMediaList.length" class="empty-muted">주고받은 사진·파일이 없습니다.</p>
            <div v-for="m in chatMediaList" :key="m.id" class="drawer-item-card">
              <strong>📎 {{ m.body }}</strong>
              <small class="muted">{{ m.kind }} · {{ formatTime(m.created_at) }}</small>
            </div>
          </div>
        </div>

        <!-- Message History Canvas -->
        <div ref="messagesCanvasRef" class="pc-chat-messages-canvas" :class="'wallpaper-' + chatWallpaper">
          <div v-if="!isLoadingMessages && hasEarlierMessages" class="ln-history-control">
            <button type="button" class="btn-secondary" :disabled="earlierMessagesLoading" @click="loadEarlierMessages">{{ t(earlierMessagesLoading ? 'history_loading' : 'history_earlier') }}</button>
            <p v-if="earlierMessagesError" role="alert">{{ earlierMessagesError }}</p>
          </div>
          <!-- Loading State -->
          <div v-if="isLoadingMessages" class="chat-canvas-state">
            <p class="empty-muted">대화 내용을 불러오는 중입니다...</p>
          </div>

          <!-- Scoped Error State with Retry -->
          <div v-else-if="conversationError" class="chat-canvas-state error-state">
            <p class="error-state-text">⚠️ {{ conversationError }}</p>
            <button class="btn-primary" @click="selectChat(selectedChatId)">다시 시도</button>
          </div>

          <!-- Empty Conversation State -->
          <div v-else-if="messages.length === 0" class="chat-canvas-state">
            <p class="empty-muted">아직 주고받은 메시지가 없습니다. 첫 인사를 건네보세요!</p>
          </div>

          <template v-else>
            <template v-for="(msg, index) in messages" :key="msg.id">
              <!-- Date Separator Divider (Screenshot 2: '10. 23. (금)') -->
              <div v-if="shouldShowDateDivider(msg, index)" class="pc-date-divider-pill">
                {{ formatDateDivider(msg.created_at) }}
              </div>

              <!-- Case 1: Official Security Notice Card (Screenshot 6) -->
              <div
                v-if="msg.kind === 'security_notice'"
                class="pc-msg-row security-notice-row"
              >
                <div class="pc-avatar circle-34 other-avatar luno-official-avatar" style="background: #00B900; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px;">
                  LUNO
                </div>
                <div class="pc-security-card-container">
                  <div class="pc-security-notice-card">
                    <div class="security-card-header">
                      <span class="security-title-green">{{ msg.body || '로그인 성공' }}</span>
                    </div>
                    <div class="security-card-divider"></div>
                    <div class="security-card-body">
                      <p class="security-desc-bold">{{ msg.metadata?.device_name || t('security_login_notice') }}</p>
                      <p class="security-desc-sub">본인이 로그인하지 않았다면 아래 버튼을 눌러 로그아웃해 주세요. 또한, 안전한 LUNO 이용을 위해 비밀번호 변경을 권장합니다.</p>
                      <div class="security-specs-table">
                        <div class="spec-row">
                          <span class="spec-label">IP 주소:</span>
                          <span class="spec-val">{{ (msg as any).client_ip || msg.metadata?.ip || '—' }}</span>
                        </div>
                        <div class="spec-row">
                          <span class="spec-label">위치:</span>
                          <span class="spec-val">{{ (msg as any).client_location || msg.metadata?.location || '—' }}</span>
                        </div>
                      </div>
                      <div class="security-card-actions">
                        <button class="btn-security-logout-green" @click="handleSecurityNoticeLogout(msg)">
                          로그아웃
                        </button>
                        <button class="btn-security-pwchange-link" @click="showPasswordModal = true">
                          비밀번호 변경
                        </button>
                      </div>
                    </div>
                  </div>
                  <div class="pc-msg-meta security-meta">
                    <span class="pc-timestamp">{{ formatTime(msg.created_at) }}</span>
                  </div>
                </div>
              </div>

              <!-- Case 2: Voice/Video Call Status Bubble (Screenshot 7) -->
              <div
                v-else-if="msg.kind === 'call_status' || msg.kind === 'call'"
                class="pc-msg-row"
                :class="{ mine: msg.sender_id === currentUser?.id, other: msg.sender_id !== currentUser?.id }"
              >
                <div v-if="msg.sender_id !== currentUser?.id" class="pc-avatar circle-34 other-avatar" style="background:#315BCD">
                  {{ selectedChat.title ? selectedChat.title.slice(0, 1) : 'U' }}
                </div>
                <div class="pc-msg-bubble-group">
                  <div v-if="msg.sender_id !== currentUser?.id" class="pc-sender-header">
                    {{ selectedChat.title }}
                  </div>
                  <div
                    class="pc-call-status-bubble"
                    :class="{
                      outgoing: msg.sender_id === currentUser?.id,
                      incoming: msg.sender_id !== currentUser?.id,
                      missed: msg.body.includes('부재중') || msg.body.includes('취소')
                    }"
                    @click="startCall('voice')"
                  >
                    <div class="call-bubble-icon-wrap">
                      <LineIcon name="calls" :size="16" />
                    </div>
                    <div class="call-bubble-content">
                      <div class="call-bubble-title">{{ msg.body }}</div>
                      <div v-if="(msg as any).call_duration || msg.metadata?.duration" class="call-bubble-sub">
                        {{ (msg as any).call_duration || msg.metadata?.duration }}
                      </div>
                    </div>
                  </div>
                  <div class="pc-msg-meta">
                    <span v-if="msg.sender_id === currentUser?.id && (msg.read_count || 0) > 0" class="pc-read-receipt">{{ t('readStatus') }}</span>
                    <span class="pc-timestamp">{{ formatTime(msg.created_at) }}</span>
                  </div>
                </div>
              </div>

              <!-- Case 3: Standard Speech Bubble -->
              <div
                v-else
                class="pc-msg-row"
                :class="{ mine: msg.sender_id === currentUser?.id, other: msg.sender_id !== currentUser?.id }"
              >
                <!-- Other User Avatar -->
                <div v-if="msg.sender_id !== currentUser?.id" class="pc-avatar circle-34 other-avatar" style="background:#315BCD">
                  {{ selectedChat.title ? selectedChat.title.slice(0, 1) : 'U' }}
                </div>

                <div class="pc-msg-bubble-group">
                  <div v-if="msg.sender_id !== currentUser?.id" class="pc-sender-header">
                    {{ selectedChat.title }}
                  </div>

                  <!-- Speech Bubble -->
                  <div
                    class="pc-speech-bubble"
                    :class="{ 'is-sticker': msg.kind === 'sticker' }"
                    @contextmenu.prevent="openMessageContextMenu($event, msg)"
                  >
                    <div v-if="msg.reply_to" class="bubble-reply-preview">
                      <LineIcon name="reply" :size="12" /> {{ (msg.reply_preview as any)?.body || msg.reply_preview || '답장한 메시지' }}
                    </div>

                    <div v-if="editingMessageId === msg.id" class="inline-edit-box">
                      <input v-model="editingMessageBody" class="inline-edit-input" @keydown.enter.prevent="saveEditMessage" />
                      <div class="flex-row" style="margin-top:4px;gap:4px">
                        <button class="btn-primary" style="padding:2px 8px;font-size:11px" @click="saveEditMessage">저장</button>
                        <button class="btn-secondary" style="padding:2px 8px;font-size:11px" @click="editingMessageId = ''">취소</button>
                      </div>
                    </div>
                    <div v-else-if="msg.kind === 'sticker' && getStickerSvg(String(msg.metadata?.sticker_id || msg.body))" class="bubble-sticker-svg" v-html="getStickerSvg(String(msg.metadata?.sticker_id || msg.body))"></div>
                    <div v-else-if="msg.kind === 'location'" class="bubble-location-card">
                      <div class="loc-card-top">📍 위치 공유</div>
                      <strong class="loc-card-label">{{ msg.metadata?.label || msg.body }}</strong>
                      <small v-if="typeof msg.metadata?.lat === 'number' && typeof msg.metadata?.lng === 'number'" class="loc-card-coords">{{ msg.metadata.lat }}, {{ msg.metadata.lng }}</small>
                    </div>
                    <div v-else-if="msg.kind === 'contact'" class="bubble-contact-card">
                      <div class="contact-card-top">👤 연락처 카드</div>
                      <strong class="contact-card-name">{{ msg.body }}</strong>
                      <small v-if="msg.metadata?.handle" class="contact-card-handle">@{{ msg.metadata.handle }}</small>
                    </div>
                    <MessageAttachment v-else-if="msg.metadata?.attachment_id" :message="msg" :token="token" :labels="{ download: t('attachment_download'), retry: t('attachment_retry'), loading: t('attachment_loading'), error: t('attachment_error') }" />
                    <div v-else class="bubble-text-content">{{ msg.body }}</div>

                    <!-- Reactions Display -->
                    <div v-if="msg.reactions && Object.keys(msg.reactions).length" class="bubble-reactions-row">
                      <span v-for="(cnt, emo) in msg.reactions" :key="emo" class="reaction-chip" @click="reactToMessage(msg.id, String(emo))">
                        {{ emo }} {{ cnt }}
                      </span>
                    </div>

                    <!-- AI Translation Display Box (Article 10) -->
                    <div v-if="messageTranslations[msg.id]" class="luno-ai-translation-box">
                      <div class="translation-meta">
                        <span class="badge-engine">🌐 {{ messageTranslations[msg.id].engine }} ({{ messageTranslations[msg.id].sourceLang }} → {{ targetTranslateLang.toUpperCase() }})</span>
                        <button class="btn-retry-translate" :title="t('retranslateBtn')" @click="handleTranslateMessage(msg)">↻</button>
                      </div>
                      <div v-if="messageTranslations[msg.id].loading" class="translation-loading">
                        <span>✨ {{ t('translating') }}</span>
                      </div>
                      <div v-else-if="messageTranslations[msg.id].error" class="translation-error">
                        <span>⚠️ {{ messageTranslations[msg.id].error }}</span>
                      </div>
                      <div v-else class="translation-result">
                        {{ messageTranslations[msg.id].translated }}
                      </div>
                    </div>
                  </div>

                  <!-- Status Info: Read receipt & Time -->
                  <div class="pc-msg-meta">
                    <span v-if="msg.sender_id === currentUser?.id && (msg.read_count || 0) > 0" class="pc-read-receipt">{{ t('readStatus') }}</span>
                    <span class="pc-timestamp">{{ formatTime(msg.created_at) }}</span>
                  </div>
                </div>

                <!-- Bubble Hover Floating Action Bar -->
                <div class="pc-bubble-toolbar">
                  <button :title="t('translateBtn')" @click="handleTranslateMessage(msg)"><LineIcon name="translate" :size="14" /></button>
                  <button title="하트" @click="reactToMessage(msg.id, '❤️')"><LineIcon name="heart" :size="14" /></button>
                  <button title="좋아요" @click="reactToMessage(msg.id, '👍')"><LineIcon name="thumbsup" :size="14" /></button>
                  <button title="답장" @click="startReply(msg)"><LineIcon name="reply" :size="14" /></button>
                  <button v-if="msg.sender_id === currentUser?.id" title="수정" @click="startEditMessage(msg)">✎</button>
                  <button title="Keep에 저장" @click="saveToKeep(msg)"><LineIcon name="keep" :size="14" /></button>
                  <button title="공지 등록" @click="pinMessage(msg.id)"><LineIcon name="pin" :size="14" /></button>
                  <button v-if="msg.sender_id === currentUser?.id" title="보내기 취소" @click="unsendMessage(msg.id)"><LineIcon name="close" :size="14" /></button>
                </div>
              </div>
            </template>
          </template>
        </div>

        <!-- Floating Scroll-to-Bottom Button (Matching Screenshot 7) -->
        <button class="btn-scroll-bottom" title="맨 아래로 이동" @click="scrollToBottom">
          ↓
        </button>

        <!-- Chat Input Composer -->
        <footer class="pc-chat-input-dock">
          <!-- Reply Preview Banner -->
          <div v-if="replyToMessage" class="reply-composer-bar">
            <span>↩ 답장 대상: <strong>{{ replyToMessage.body }}</strong></span>
            <button class="btn-clear-search" @click="replyToMessage = null">✕</button>
          </div>

          <!-- Sticker Picker Popover -->
          <div v-if="showStickerPicker" class="sticker-picker-popover">
            <div class="sticker-cat-tabs">
              <button :class="{ active: activeStickerCategory === 'All' }" @click="activeStickerCategory = 'All'">전체</button>
              <button :class="{ active: activeStickerCategory === 'Lumi' }" @click="activeStickerCategory = 'Lumi'">Lumi (루미)</button>
              <button :class="{ active: activeStickerCategory === 'Nori' }" @click="activeStickerCategory = 'Nori'">Nori (노리)</button>
              <button :class="{ active: activeStickerCategory === 'Poko' }" @click="activeStickerCategory = 'Poko'">Poko (포코)</button>
              <button class="btn-clear-search" style="margin-left:auto" @click="showStickerPicker = false">✕</button>
            </div>
            <div class="sticker-grid-items">
              <button
                v-for="st in filteredStickers"
                :key="st.id"
                class="btn-sticker-cell"
                :title="st.name"
                @click="sendSticker(st.id)"
              >
                <div class="sticker-svg-mini" v-html="st.svg"></div>
                <small>{{ st.name }}</small>
              </button>
            </div>
          </div>

          <!-- Attachment Bar Icons -->
          <div class="pc-input-toolbar">
            <input ref="attachmentInput" type="file" hidden @change="uploadSelectedFile" />
            <button class="btn-tool-icon" title="스티커" @click="showStickerPicker = !showStickerPicker">😊</button>
            <button class="btn-tool-icon" title="사진 전송" :disabled="uploading" @click="chooseAttachment('image')">📷</button>
            <button class="btn-tool-icon" title="파일 첨부" :disabled="uploading" @click="chooseAttachment('file')">📎</button>
            <button class="btn-tool-icon" :title="isRecordingVoice ? '녹음 종료' : '음성 녹음'" @click="toggleVoiceRecording">
              {{ isRecordingVoice ? '⏹️' : '🎙️' }}
            </button>
            <button class="btn-tool-icon" title="투표 만들기" @click="showPollCreateModal = true">📊</button>
            <button class="btn-tool-icon" title="일정 등록" @click="showEventCreateModal = true">📅</button>
            <button class="btn-tool-icon" title="위치 공유" @click="sendLocationMessage">📍</button>
            <button class="btn-tool-icon" title="연락처 공유" @click="sendContactMessage">👤</button>
            <button class="btn-tool-icon" title="화면 캡처" @click="captureScreenToChat">✂️</button>
            <button class="btn-tool-icon" title="송금" @click="openSendMoneyFromChat">₩</button>
          </div>

          <!-- Textarea Form Area -->
          <form class="pc-textarea-form" :aria-busy="sendingConversations.has(selectedChatId)" @submit.prevent="sendMessage">
            <textarea
              v-model="draftMessage"
              :disabled="sendingConversations.has(selectedChatId)"
              :placeholder="t('inputPlaceholder')"
              rows="3"
              @keydown.enter.exact="handleComposerEnter"
            ></textarea>
            <div class="pc-textarea-bottom">
              <span class="char-count">{{ draftMessage.length }}</span>
              <button class="btn-green-send" :disabled="!draftMessage.trim() || sendingConversations.has(selectedChatId)">{{ sendingConversations.has(selectedChatId) ? t('message_sending') : t('sendBtn') }}</button>
            </div>
          </form>
        </footer>
      </section>

      <!-- Case B: Friend Profile Selected Preview (Screenshot 5) -->
      <section v-else-if="selectedFriendProfile" class="pc-friend-profile-viewport">
        <div class="pc-profile-preview-card">
          <div class="profile-preview-avatar" :style="{ background: selectedFriendProfile.avatar_color || 'var(--om-primary, #2563EB)' }">
            {{ selectedFriendProfile.display_name.slice(0, 1) }}
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
              <button type="button" class="btn-subaction-pill" title="음성 통화" @click="startCallWithUser(selectedFriendProfile, 'voice')">
                <LineIcon name="call-voice" :size="16" />
                <span>음성 통화</span>
              </button>
              <button type="button" class="btn-subaction-pill" title="영상 통화" @click="startCallWithUser(selectedFriendProfile, 'video')">
                <LineIcon name="call-video" :size="16" />
                <span>영상 통화</span>
              </button>
              <button type="button" class="btn-subaction-pill" title="송금하기" @click="openSendMoneyModal(selectedFriendProfile)">
                <LineIcon name="money" :size="16" />
                <span>송금하기</span>
              </button>
              <button type="button" class="btn-subaction-pill" title="즐겨찾기" @click="toggleFriendFavorite(selectedFriendProfile)">
                <span>{{ (selectedFriendProfile as any).is_favorite ? '★ 즐겨찾기됨' : '☆ 즐겨찾기' }}</span>
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
      <nav v-if="!selectedChat" class="luno-mobile-floating-nav" aria-label="하단 탭 내비게이션">
        <!-- Tab 1: 홈 (Home) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'home' }"
          @click="switchNav('home')"
        >
          <div class="nav-icon-wrap">
            <LineIcon name="home" :size="24" />
          </div>
          <span class="nav-label">홈</span>
        </button>

        <!-- Tab 2: 대화 (Chats) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'chats' }"
          @click="switchNav('chats')"
        >
          <div class="nav-icon-wrap">
            <LineIcon name="chats" :size="24" />
            <span v-if="totalUnreadCount > 0" class="mobile-nav-badge">{{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}</span>
          </div>
          <span class="nav-label">대화</span>
        </button>

        <!-- Tab 3: 뉴스 (News) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'news' }"
          @click="switchNav('news')"
        >
          <div class="nav-icon-wrap">
            <LineIcon name="news" :size="24" />
            <span class="mobile-nav-dot"></span>
          </div>
          <span class="nav-label">뉴스</span>
        </button>

        <!-- Tab 4: 통화 (Calls) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'calls' }"
          @click="switchNav('calls')"
        >
          <div class="nav-icon-wrap">
            <LineIcon name="calls" :size="24" />
          </div>
          <span class="nav-label">통화</span>
        </button>
        <!-- Tab 5: 지갑 (Wallet) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'wallet' }"
          @click="switchNav('wallet')"
        >
          <div class="nav-icon-wrap">
            <LineIcon name="money" :size="24" />
          </div>
          <span class="nav-label">지갑</span>
        </button>
        <button class="mobile-nav-item" @click="activeProfileUser = currentUser" :aria-label="t('profileTitle')"><div class="nav-icon-wrap"><span class="mobile-profile-avatar"><img v-if="currentUser?.avatar_url" :src="currentUser?.avatar_url" alt="" class="ln-profile-photo" /><span v-else>{{ currentUser?.display_name?.slice(0, 1) }}</span></span></div><span class="nav-label">{{ t('profileTitle') }}</span></button>
      </nav>
    </main>

    <!-- QR SCANNER & MY QR CODE MODAL -->
    <div v-if="showQrModal" class="modal-backdrop" @click.self="showQrModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>📷 내 QR 코드 및 스캔</h3>
          <button class="btn-modal-close" @click="showQrModal = false">✕</button>
        </div>
        <div class="modal-body-form" style="align-items:center;text-align:center;">
          <p class="modal-subtext">상대방이 아래 QR 코드를 스캔하면 즉시 친구로 추가됩니다.</p>
          <div class="pc-qr-matrix-card" style="margin:12px auto;">
            <LineIcon name="scan" :size="96" />
          </div>
          <p class="muted">@{{ currentUser?.handle || 'luno_user' }}</p>
          <div class="modal-actions-right" style="width:100%;justify-content:center;">
            <button class="btn-primary" @click="showQrModal = false; showAddFriendModal = true">ID로 친구 검색하기</button>
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
            <button class="btn-news-action" :title="newsBookmarks.has(activeNewsArticle.id) ? '북마크 취소' : '북마크 저장'" @click="toggleNewsBookmark(activeNewsArticle.id)">
              {{ newsBookmarks.has(activeNewsArticle.id) ? '🔖' : '📑' }}
            </button>
            <button class="btn-news-action" title="닫기" @click="activeNewsArticle = null">✕</button>
          </div>
        </div>
        <div class="news-reader-body">
          <img :src="activeNewsArticle.image_url" :alt="activeNewsArticle.title" class="news-reader-img" />
          <h2 class="news-reader-title">{{ activeNewsArticle.title }}</h2>
          <div class="news-reader-meta">
            <span>{{ activeNewsArticle.published_at }}</span> · <span>조회 {{ activeNewsArticle.views || '1.2만' }}</span>
          </div>
          <div class="news-reader-content">
            <p>{{ activeNewsArticle.summary || activeNewsArticle.content }}</p>
            <p style="margin-top: 12px; color: var(--om-text-secondary, #64748B); font-size: 13px; line-height: 1.6;">
              본 기사는 LUNO Global News 에디토리얼 시드 콘텐츠입니다. (실시간 언론사 RSS 제휴는 운영자 결정 게이트 대상) 메신저 친구들과 기사를 공유하거나 중요한 뉴스를 북마크에 보관할 수 있습니다.
            </p>
          </div>

          <!-- News Comments Section -->
          <div class="news-comments-box" style="margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">💬 독자 댓글 ({{ (newsArticleComments[activeNewsArticle.id] || []).length }})</h4>
            <div v-if="(newsArticleComments[activeNewsArticle.id] || []).length" style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px;">
              <div v-for="c in newsArticleComments[activeNewsArticle.id]" :key="c.id" style="font-size: 12px; background: #f8fafc; padding: 6px 10px; border-radius: 8px;">
                <b>{{ c.author }}</b> <span style="color:#94a3b8; font-size:11px;">{{ c.time }}</span>
                <p style="margin-top:2px;">{{ c.text }}</p>
              </div>
            </div>
            <div v-else style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">첫 번째 댓글을 작성해 보세요.</div>
            <form @submit.prevent="addNewsComment(activeNewsArticle.id)" style="display:flex; gap:6px;">
              <input v-model="newCommentInput" placeholder="댓글을 입력하세요..." style="flex:1; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px;" />
              <button type="submit" class="btn-primary" style="padding:6px 12px; font-size:12px;">등록</button>
            </form>
          </div>
        </div>
        <div class="news-reader-footer">
          <button class="btn-share-to-chat" @click="shareNewsToChat(activeNewsArticle)">💬 대화방으로 공유하기</button>
        </div>
      </div>
    </div>

<!-- CALLING OVERLAY MODAL (WebRTC Voice & Video Call with AI Live Captions) -->
    <div v-if="activeCall" class="call-overlay-modal">
      <div class="call-dialog-box">
        <div v-if="activeCall.kind === 'video'" style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">
          <video ref="remoteVideoRef" autoplay playsinline style="width:180px;height:130px;background:#0f172a;border-radius:12px;object-fit:cover"></video>
          <video ref="localVideoRef" autoplay muted playsinline style="width:100px;height:130px;background:#334155;border-radius:12px;object-fit:cover"></video>
        </div>
        <div v-else class="call-avatar-pulse">
          <div class="avatar-circle lg" style="background:#315BCD">{{ activeCall.title.slice(0, 1) }}</div>
        </div>
        <h3>{{ activeCall.title }}</h3>
        <p class="call-type-status">
          {{ activeCall.kind === 'video' ? '📹 ' + t('callVideo') : '📞 ' + t('callVoice') }} ·
          <span v-if="activeCall.state === 'ringing'">연결 중...</span>
          <span v-else-if="activeCall.state === 'connected'" class="timer-active">{{ formatDuration(callDuration) }}</span>
        </p>

        <!-- AI Live Translation Captions UX (Article 10.2) -->
        <div class="live-captions-control">
          <button
            class="btn-caption-toggle"
            :class="{ active: liveCaptionsEnabled }"
            @click="liveCaptionsEnabled = !liveCaptionsEnabled"
          >
            <LineIcon name="translate" :size="15" />
            <span>{{ liveCaptionsEnabled ? t('callLiveTranslate') + ' (ON)' : t('callLiveTranslate') + ' (OFF)' }}</span>
          </button>
        </div>

        <div v-if="liveCaptionsEnabled" class="live-captions-box">
          <div class="caption-notice">ℹ️ {{ t('callConsentNotice') }}</div>
          <div class="caption-lang-badge">
            <span class="lang-tag">{{ currentLocale.toUpperCase() }}</span>
            <span class="lang-arrow">⇄</span>
            <span class="lang-tag">{{ targetTranslateLang.toUpperCase() }}</span>
            <span class="badge-engine-mini">AI Live</span>
          </div>
          <div class="caption-stream">
            <p class="caption-live-text">"{{ callSubtitles }}"</p>
          </div>
        </div>

        <!-- Call Action Buttons -->
        <div class="call-controls-row">
          <template v-if="activeCall.state === 'connected'">
            <button class="btn-call-circle" :class="{ off: isCallMuted }" title="마이크 음소거" @click="toggleCallMute">
              {{ isCallMuted ? '🔇' : '🎤' }}
            </button>
            <button v-if="activeCall.kind === 'video'" class="btn-call-circle" :class="{ off: isCallVideoOff }" title="카메라 켜기/끄기" @click="toggleCallVideo">
              {{ isCallVideoOff ? '🚫' : '📹' }}
            </button>
            <button v-if="activeCall.kind === 'video'" class="btn-call-circle" :class="{ off: isScreenSharing }" title="화면 공유" @click="toggleScreenShare">
              🖥️
            </button>
            <button class="btn-call-circle" :class="{ off: !isCallSpeakerOn }" title="스피커폰" @click="isCallSpeakerOn = !isCallSpeakerOn">
              🔊
            </button>
          </template>
          <button v-if="activeCall.state === 'ringing'" class="btn-call-answer" @click="updateCallState('connected')">
            📞 수락
          </button>
          <button class="btn-call-hangup" @click="updateCallState('ended')">
            🔴 통화 종료
          </button>
        </div>
      </div>
    </div>

    <!-- PROFILE MODAL (Full LINE User Profile View) -->
    <div v-if="activeProfileUser" class="modal-backdrop" @click.self="activeProfileUser = null">
      <div class="profile-modal-card" role="dialog" aria-modal="true" :aria-label="t('profileTitle')">
        <div class="profile-cover-header" :style="{ background: activeProfileUser.avatar_color || 'var(--om-primary, #2563EB)' }">
          <button class="btn-modal-close" @click="activeProfileUser = null">✕</button>
        </div>
        <div class="profile-avatar-center">
          <div class="avatar-circle xl"><img v-if="activeProfileUser.avatar_url" :src="activeProfileUser.avatar_url" alt="" class="ln-profile-photo" /><span v-else>{{ activeProfileUser.display_name.slice(0, 1) }}</span></div>
        </div>
        <div v-if="activeProfileUser.id === currentUser?.id" class="profile-photo-controls" :aria-busy="photoSaving">
          <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="changeProfilePhoto" />
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
          <button class="btn-profile-action" @click="openSendMoneyModal(activeProfileUser); activeProfileUser = null">
            💸 송금
          </button>
        </div>
      </div>
    </div>

    <!-- KEEP VAULT MODAL -->
    <div v-if="showKeepModal" class="modal-backdrop" @click.self="showKeepModal = false">
      <div class="standard-modal-box keep-modal">
        <div class="modal-header">
          <h3>💾 LINE Keep 보관함 ({{ keepItems.length }})</h3>
          <button class="btn-modal-close" @click="showKeepModal = false">✕</button>
        </div>
        <div class="keep-filter-bar">
          <button :class="{ active: keepFilter === 'all' }" @click="keepFilter = 'all'">전체</button>
          <button :class="{ active: keepFilter === 'text' }" @click="keepFilter = 'text'">텍스트</button>
          <button :class="{ active: keepFilter === 'image' }" @click="keepFilter = 'image'">사진/미디어</button>
          <button :class="{ active: keepFilter === 'link' }" @click="keepFilter = 'link'">링크</button>
        </div>
        <input v-model="keepSearch" placeholder="보관된 내용 검색..." class="keep-search-input" />
        <div class="keep-scroll-content">
          <p v-if="!filteredKeepItems.length" class="empty-muted">저장된 Keep 항목이 없습니다.</p>
          <div v-for="k in filteredKeepItems" :key="k.id || k.message_id" class="keep-item-card">
            <div class="keep-item-header">
              <span class="badge-keep-type">{{ k.kind }}</span>
              <button class="btn-delete-keep" @click="deleteFromKeep(k)">✕ 삭제</button>
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
          <h3>💸 LUNO Pay 간편 송금 (모의 송금 / Sandbox)</h3>
          <button class="btn-modal-close" @click="showSendMoneyModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <p class="muted" style="margin: 0; font-size: 11.5px; color: #64748b;">* 본 기능은 샌드박스 모의 송금이며 실제 금융 자산이 이동하지 않습니다.</p>
          <div v-if="sendTargetFriend" class="send-target-info">
            받는 사람: <strong>{{ sendTargetFriend.display_name }}</strong>
          </div>
          <label>송금 금액 (원)</label>
          <input v-model.number="sendAmountInput" type="number" min="1000" step="1000" />
          <div class="quick-amounts">
            <button @click="sendAmountInput = 10000">+1만</button>
            <button @click="sendAmountInput = 30000">+3만</button>
            <button @click="sendAmountInput = 50000">+5만</button>
            <button @click="sendAmountInput = 100000">+10만</button>
          </div>
          <label>보내는 메모</label>
          <input v-model="sendMemoInput" placeholder="메모 입력" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showSendMoneyModal = false">취소</button>
            <button class="btn-primary" @click="executeSendMoney">모의 송금하기</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CHARGE MONEY MODAL -->
    <div v-if="showChargeModal" class="modal-backdrop" @click.self="showChargeModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>➕ LUNO Pay 잔액 충전</h3>
          <button class="btn-modal-close" @click="showChargeModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <p>충전할 금액을 선택하세요:</p>
          <p class="ln-charge-notice" role="note">실제 결제(PG) 연동 전까지 충전이 비활성화되어 있습니다. 지갑 간 송금은 정상 동작합니다.</p>
          <div class="charge-options-grid">
            <button class="btn-charge-option" disabled title="PG 연동 전에는 충전할 수 없습니다">+ 10,000원</button>
            <button class="btn-charge-option" disabled title="PG 연동 전에는 충전할 수 없습니다">+ 30,000원</button>
            <button class="btn-charge-option" disabled title="PG 연동 전에는 충전할 수 없습니다">+ 50,000원</button>
            <button class="btn-charge-option" disabled title="PG 연동 전에는 충전할 수 없습니다">+ 100,000원</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE POLL MODAL -->
    <div v-if="showPollCreateModal" class="modal-backdrop" @click.self="showPollCreateModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>📊 대화방 새 투표 만들기</h3>
          <button class="btn-modal-close" @click="showPollCreateModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <label>질문</label>
          <input v-model="newPollQuestion" placeholder="예: 오늘 점심 메뉴는?" />
          <label>선택지 1</label>
          <input v-model="newPollOption1" placeholder="선택지 1" />
          <label>선택지 2</label>
          <input v-model="newPollOption2" placeholder="선택지 2" />
          <label>선택지 3 (선택)</label>
          <input v-model="newPollOption3" placeholder="선택지 3" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showPollCreateModal = false">취소</button>
            <button class="btn-primary" @click="createPoll">투표 등록</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE EVENT MODAL -->
    <div v-if="showEventCreateModal" class="modal-backdrop" @click.self="showEventCreateModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>📅 대화방 일정 잡기</h3>
          <button class="btn-modal-close" @click="showEventCreateModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <label>일정 제목</label>
          <input v-model="newEventTitle" placeholder="예: 팀 주간 싱크 미팅" />
          <label>날짜 및 시간</label>
          <input v-model="newEventDate" type="datetime-local" />
          <label>장소 / 링크</label>
          <input v-model="newEventLocation" placeholder="예: 구글 미트 / 강남역" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showEventCreateModal = false">취소</button>
            <button class="btn-primary" @click="createEvent">일정 등록</button>
          </div>
        </div>
      </div>
    </div>

    <!-- SETTINGS & THEMES MODAL -->
    <div v-if="showSettingsModal" class="modal-backdrop" @click.self="showSettingsModal = false">
      <div class="standard-modal-box settings-modal">
        <div class="modal-header">
          <h3>⚙️ {{ t('settingsTitle') }}</h3>
          <button class="btn-modal-close" @click="showSettingsModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <!-- 1. Language Selector (Article 11) -->
          <div class="setting-group">
            <strong>🌐 {{ t('languageLabel') }}</strong>
            <div class="locale-choice-grid">
              <button
                v-for="loc in SUPPORTED_LOCALES"
                :key="loc.code"
                class="btn-locale-pill"
                :class="{ active: currentLocale === loc.code }"
                @click="setLocale(loc.code)"
              >
                <span>{{ loc.flag }}</span> {{ loc.nativeName }} ({{ loc.code.toUpperCase() }})
              </button>
            </div>
          </div>

          <!-- 2. AI Translation Target Language (Article 10) -->
          <div class="setting-group">
            <strong>✨ {{ t('targetLangLabel') }}</strong>
            <div class="locale-choice-grid">
              <button
                v-for="loc in SUPPORTED_LOCALES"
                :key="'pref-target-' + loc.code"
                class="btn-locale-pill"
                :class="{ active: targetTranslateLang === loc.code }"
                @click="targetTranslateLang = loc.code"
              >
                <span>{{ loc.flag }}</span> {{ loc.nativeName }}
              </button>
            </div>
          </div>

          <!-- 3. Accessible Font Scale (Article 6.2 & 17.3) -->
          <div class="setting-group">
            <strong>🔤 {{ t('fontScaleLabel') }}</strong>
            <div class="font-scale-buttons">
              <button class="btn-scale-chip" :class="{ active: fontScale === 'normal' }" @click="setFontScale('normal')">보통 (100%)</button>
              <button class="btn-scale-chip" :class="{ active: fontScale === 'large' }" @click="setFontScale('large')">크게 (112%)</button>
              <button class="btn-scale-chip" :class="{ active: fontScale === 'xlarge' }" @click="setFontScale('xlarge')">아주 크게 (125%)</button>
            </div>
          </div>

          <!-- 4. Design Theme & Dark Mode (Article 4 & 4.5) -->
          <div class="setting-group">
            <strong>🎨 디자인 모드</strong>
            <div class="theme-choice-buttons">
              <button class="btn-theme-swatch default" :class="{ active: !isDarkMode }" @click="enableLightMode">
                🔵 LUNO Blue (라이트)
              </button>
              <button class="btn-theme-swatch dark" :class="{ active: isDarkMode }" @click="enableDarkMode">
                🌙 LUNO Deep (다크)
              </button>
            </div>
          </div>

          <!-- 5. Honest Security (Article 14 & 17.4) -->
          <div class="setting-group">
            <strong>🛡️ {{ t('securitySection') }}</strong>
            <div class="setting-toggle-row">
              <span>연결 및 저장소 보안</span>
              <span class="badge-status-on">서버 검증 필요</span>
            </div>
            <div class="setting-toggle-row">
              <span>👀 읽음 확인 표시 (Read Receipts)</span>
              <input type="checkbox" checked />
            </div>
            <div class="setting-toggle-row">
              <span>🔔 메시지 수신 사운드 알림</span>
              <input type="checkbox" checked />
            </div>
            <!-- Phase 1: Push Notifications -->
            <div class="setting-toggle-row">
              <span>🔔 WebPush / FCM 푸시 알림</span>
              <button class="btn-secondary" style="font-size:12px;padding:3px 8px" @click="testPushNotification">테스트 발송</button>
            </div>

            <!-- Phase 2: E2EE Key Management -->
            <div class="setting-toggle-row">
              <span>실험적 암호화 키 관리</span>
              <span class="muted">{{ t('e2ee_preparing') }}</span>
            </div>
          </div>

          <!-- Phase 6: GDPR Data Portability & Deletion -->
          <div class="setting-group" style="margin-top:8px">
            <strong>📂 데이터 백업 및 프라이버시 (GDPR)</strong>
            <input v-model="deletePasswordInput" type="password" autocomplete="current-password" placeholder="계정 삭제를 위해 비밀번호 입력" aria-label="계정 삭제 확인용 비밀번호" class="pc-login-input" style="margin:2px 0 6px" />
            <div class="flex-row" style="margin-top:6px;gap:8px">
              <button class="btn-secondary" style="flex:1" @click="exportUserDataArchive">💾 대화 데이터 백업 (JSON)</button>
              <button class="btn-secondary" style="flex:1;color:#ef4444" @click="deleteUserAccount">⚠️ 계정 영구 삭제</button>
            </div>
          </div>

          <form class="setting-group ln-profile-editor" :aria-busy="profileSaving" @submit.prevent="saveProfileSettings" @input="profileSaved = false; profileSaveError = ''">
            <div class="ln-section-heading"><strong>{{ t('profileEdit') }}</strong><span>{{ t('profile_details') }}</span></div>
            <div class="ln-profile-fields">
              <label for="profile-name">{{ t('profile_name_label') }}<input id="profile-name" v-model="editProfileName" autocomplete="name" required :disabled="profileSaving" /></label>
              <label for="profile-handle">LUNO ID<input id="profile-handle" v-model="editProfileHandle" autocomplete="off" autocapitalize="none" spellcheck="false" :disabled="profileSaving" /></label>
              <label for="profile-bio" class="ln-profile-bio">{{ t('profile_bio_label') }}<textarea id="profile-bio" v-model="editProfileBio" rows="3" :disabled="profileSaving" /></label>
            </div>
            <p class="ln-profile-hint">{{ t('profile_visibility_preparing') }}</p>
            <p v-if="profileSaveError" class="ln-profile-error" role="alert">{{ profileSaveError }}</p>
            <div class="ln-profile-save"><span role="status">{{ profileSaved ? t('profile_saved') : '' }}</span><button type="submit" class="btn-primary" :disabled="profileSaving || !profileDirty || !editProfileName.trim()">{{ profileSaving ? t('profile_saving') : t('profile_save') }}</button></div>
          </form>

          <div class="setting-group" style="margin-top:8px">
            <strong>📱 PC/웹 QR 로그인 승인</strong>
            <div class="flex-row" style="margin-top:6px">
              <input v-model="approveChallengeInput" placeholder="Challenge ID" style="flex:1" />
              <input v-model="approveTokenInput" placeholder="QR Token" style="flex:1" />
              <button class="btn-secondary" @click="approveQrLogin">승인</button>
            </div>
          </div>

          <div v-if="devicesList.length" class="setting-group" style="margin-top:8px">
            <strong>💻 로그인된 기기 관리 ({{ devicesList.length }})</strong>
            <div v-for="dv in devicesList" :key="dv.id" class="setting-toggle-row">
              <span>{{ dv.name }} ({{ dv.platform }})</span>
              <button class="btn-delete-keep" @click="revokeDevice(dv.id)">해제</button>
            </div>
          </div>

          <div class="setting-group" style="margin-top:12px; background: #eaf1ff; padding: 12px; border-radius: 12px; border: 1px solid #d9e1ec;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:#315BCD; font-size:13px;">📱 LUNO 모바일 네이티브 앱 (Android)</strong>
                <p style="font-size:11px; color:#5b6475; margin-top:2px;">Android 앱 다운로드 및 빌드 정보</p>
              </div>
              <a href="./download.html" target="_blank" class="btn-primary" style="text-decoration:none; font-size:12px; padding:6px 12px; display:inline-block;">APK 다운로드</a>
            </div>
          </div>

          <div class="setting-group" style="margin-top:8px; font-size:12px; color:#64748b;">
            <strong>📄 약관 및 개인정보</strong>
            <div style="margin-top:4px; display:flex; gap:12px;">
              <a href="./legal/terms.html" target="_blank" rel="noopener">이용약관</a>
              <a href="./legal/privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>
            </div>
          </div>

          <div class="setting-group" style="margin-top:8px; font-size:12px; color:#64748b;">
            <strong>ℹ️ 버전 및 빌드 정보</strong>
            <div style="margin-top:4px; display:flex; flex-direction:column; gap:2px;">
              <span><b>LUNO Messenger:</b> {{ appVersion.worker_version || '—' }}</span>
              <span><b>Git Commit:</b> <code>{{ appVersion.commit || '확인 중…' }}</code></span>
              <span><b>Build Time:</b> {{ appVersion.build_time || '—' }}</span>
              <span><b>Environment:</b> {{ appVersion.env || '—' }}</span>
            </div>
          </div>

          <div class="modal-actions-right">
            <button class="btn-primary" @click="showSettingsModal = false">완료</button>
          </div>
        </div>
      </div>
    </div>

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
          <h3>🔐 비밀번호 변경</h3>
          <button class="btn-modal-close" @click="showPasswordModal = false">✕</button>
        </div>
        <form class="modal-body-form" @submit.prevent="submitPasswordChange">
          <p v-if="passwordChangeError" class="error-text" style="color: #ef4444; font-size: 12px; margin: 0;">{{ passwordChangeError }}</p>
          <label>현재 비밀번호</label>
          <input v-model="currentPasswordInput" type="password" placeholder="현재 비밀번호를 입력하세요" required />
          <label>새 비밀번호 (12자 이상)</label>
          <input v-model="newPasswordInput" type="password" placeholder="새 비밀번호를 입력하세요" required minlength="12" />
          <label>새 비밀번호 확인</label>
          <input v-model="confirmPasswordInput" type="password" placeholder="새 비밀번호를 한 번 더 입력하세요" required minlength="12" />
          <div class="modal-actions-right" style="margin-top: 14px;">
            <button type="button" class="btn-secondary" @click="showPasswordModal = false">취소</button>
            <button type="submit" class="btn-primary">비밀번호 변경</button>
          </div>
        </form>
      </div>
    </div>

    <!-- NEW STORY MODAL -->
    <div v-if="showNewStoryModal" class="modal-backdrop" @click.self="showNewStoryModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>📷 내 24시간 스토리 올리기</h3>
          <button class="btn-modal-close" @click="showNewStoryModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <label>스토리 텍스트</label>
          <input v-model="newStoryText" placeholder="오늘의 순간을 공유하세요..." @keydown.enter.prevent="publishStory" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showNewStoryModal = false">취소</button>
            <button class="btn-primary" @click="publishStory">게시하기</button>
          </div>
        </div>
      </div>
    </div>

    <!-- NEW VOOM POST MODAL -->
    <div v-if="showVoomCreateModal" class="modal-backdrop" @click.self="showVoomCreateModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>🎬 새 LINE VOOM 포스트</h3>
          <button class="btn-modal-close" @click="showVoomCreateModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <label>포스트 내용</label>
          <input v-model="newVoomBody" placeholder="VOOM 영상/포스트 설명 입력..." @keydown.enter.prevent="createVoomPost" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showVoomCreateModal = false">취소</button>
            <button class="btn-primary" @click="createVoomPost">게시하기</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE OPENCHAT MODAL -->
    <div v-if="showCreateOpenChatModal" class="modal-backdrop" @click.self="showCreateOpenChatModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>🌐 새 오픈채팅방 만들기</h3>
          <button class="btn-modal-close" @click="showCreateOpenChatModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <label>오픈채팅방 이름</label>
          <input v-model="newOpenChatRoomName" placeholder="예: 판교 러닝 크루" />
          <label>설명</label>
          <input v-model="newOpenChatRoomDesc" placeholder="자유롭게 소개를 입력하세요" />
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showCreateOpenChatModal = false">취소</button>
            <button class="btn-primary" @click="createOpenChatRoom">개설하기</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE GROUP MODAL -->
    <div v-if="showCreateGroupModal" class="modal-backdrop" @click.self="showCreateGroupModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>👥 새 그룹 채팅방 만들기</h3>
          <button class="btn-modal-close" @click="showCreateGroupModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <label>그룹 이름</label>
          <input v-model="groupTitleInput" placeholder="그룹 채팅방 이름을 입력하세요" />
          <label>초대할 친구 선택 ({{ selectedFriendsForGroup.length }}명 선택됨)</label>
          <div class="select-friends-scroll">
            <label v-for="f in friends" :key="f.id" class="friend-check-item">
              <input v-model="selectedFriendsForGroup" type="checkbox" :value="f.id" />
              <span>{{ f.display_name }}</span>
            </label>
          </div>
          <div class="modal-actions-right">
            <button class="btn-secondary" @click="showCreateGroupModal = false">취소</button>
            <button class="btn-primary" :disabled="!groupTitleInput.trim() || !selectedFriendsForGroup.length" @click="createGroupChat">
              그룹 생성
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ADD FRIEND MODAL (Article 2.C) -->
    <div v-if="showAddFriendModal" class="modal-backdrop" @click.self="showAddFriendModal = false">
      <div class="standard-modal-box add-friend-modal">
        <div class="modal-header">
          <h3>➕ {{ t('navFriends') }} 추가</h3>
          <button class="btn-modal-close" @click="showAddFriendModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <p class="modal-subtext">Open Scanner 생태계의 친구를 ID, 이메일, 전화번호로 검색하여 추가하세요.</p>
          <label>사용자 ID 또는 이메일 검색</label>
          <div class="flex-row">
            <input v-model="addFriendHandleInput" placeholder="예: alice_kim 또는 alice@line-test.local" @keydown.enter.prevent="addFriendByHandle" />
            <button class="btn-primary" @click="addFriendByHandle">추가</button>
          </div>
          <div class="add-friend-quick-options">
            <div class="quick-opt-item">
              <span class="icon">📱</span>
              <div>
                <strong>QR 코드로 친구 추가</strong>
                <small>모바일 카메라로 상대방 QR 코드를 스캔하세요.</small>
              </div>
            </div>
            <div class="quick-opt-item">
              <span class="icon">🔗</span>
              <div>
                <strong>초대 링크 공유</strong>
                <small>초대 링크를 생성하여 친구를 메신저로 초대합니다.</small>
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
          <h3>💬 새 대화 시작</h3>
          <button class="btn-modal-close" @click="showNewChatModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <div class="new-chat-options-grid">
            <button class="btn-new-chat-type" @click="showNewChatModal = false; showCreateGroupModal = true">
              <span class="type-icon">👥</span>
              <div class="type-text">
                <strong>그룹 대화방 만들기</strong>
                <small>여러 친구를 한 번에 초대하여 그룹 대화를 나눕니다.</small>
              </div>
            </button>
            <button class="btn-new-chat-type" @click="showNewChatModal = false; activeNav = 'openchat'">
              <span class="type-icon">🌐</span>
              <div class="type-text">
                <strong>오픈채팅 참여하기</strong>
                <small>공통 관심사 주제의 대화방을 둘러보고 대화에 참여합니다.</small>
              </div>
            </button>
          </div>

          <label style="margin-top: 14px;">친구 목록에서 1:1 대화 시작</label>
          <div class="select-friends-scroll" style="max-height: 180px;">
            <div
              v-for="f in friends"
              :key="'new-chat-' + f.id"
              class="quick-pick-friend-row"
              @click="startDirectChat(f); showNewChatModal = false"
            >
              <div class="pc-avatar circle-34" :style="{ background: f.avatar_color || 'var(--om-primary, #2563EB)' }">
                {{ f.display_name.slice(0, 1) }}
              </div>
              <div class="friend-pick-meta">
                <strong>{{ f.display_name }}</strong>
                <small>{{ f.status_message || f.bio || 'Open Messenger' }}</small>
              </div>
              <button class="btn-mini-chat">대화</button>
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
            <LineIcon name="open-messenger-logo" :size="24" />
            <h3>Open Scanner 생태계 서비스 센터</h3>
          </div>
          <button class="btn-modal-close" @click="showEcosystemHub = false">✕</button>
        </div>
        <div class="modal-body-form ecosystem-body">
          <p class="ecosystem-intro">
            Open Messenger는 Open Scanner 생태계의 모든 서비스를 연결하는 중앙 허브입니다.
          </p>
          <div class="ecosystem-cards-grid">
            <div
              v-for="svc in ECOSYSTEM_SERVICES"
              :key="svc.id"
              class="ecosystem-card"
              :class="svc.status"
            >
              <div class="ecosystem-card-header">
                <div class="svc-icon-box">
                  <LineIcon :name="svc.icon" :size="20" />
                </div>
                <div class="svc-names">
                  <strong>{{ svc.name }}</strong>
                  <span class="svc-ko">{{ svc.nameKo }}</span>
                </div>
                <span class="svc-status-pill" :class="svc.status">{{ svc.statusText }}</span>
              </div>
              <p class="svc-desc">{{ svc.description }}</p>
              <div class="svc-card-footer">
                <a
                  v-if="svc.actionUrl"
                  :href="svc.actionUrl"
                  target="_blank"
                  class="btn-svc-action link"
                >
                  콘솔 열기 ↗
                </a>
                <button
                  v-else
                  type="button"
                  class="btn-svc-action"
                  @click="openEcosystemService(svc.id); showEcosystemHub = false"
                >
                  {{ svc.status === 'preview' ? '준비 중 안내' : '실행하기' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Global LINE PC Context Menu -->
    <LineContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @close="contextMenu.visible = false"
    />
</template>
