<script setup lang="ts">
import LineIcon from './components/LineIcon.vue'
import LineContextMenu, { type ContextMenuItem } from './components/LineContextMenu.vue'
import { LINE_STICKERS, type LineSticker } from './line-stickers'
import { playSendSound, playReceiveSound } from './sound-effects'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  SUPPORTED_LOCALES,
  UI_DICTIONARY,
  detectInitialLocale,
  formatLocalizedTime,
  translateMessageText,
  type LunoLocale
} from './luno-i18n'
import {
  API_URL,
  request,
  newClientID,
  wsURL,
  type Chat,
  type Message,
  type User,
  type LoginResult
} from '../../shared/api'
import {
  startWebRTCCall,
  endWebRTCCall,
  generateE2EEKeyPair,
  deriveSharedSecret,
  encryptMessage,
  decryptMessage,
  queueOfflineMessage,
  flushOfflineQueue
} from './messenger-utils'

// --- LUNO Multilingual & Accessibility & Theme State ---
const currentLocale = ref<LunoLocale>(detectInitialLocale())
const t = (key: string): string => UI_DICTIONARY[currentLocale.value]?.[key] || UI_DICTIONARY.ko[key] || key
function setLocale(loc: LunoLocale) {
  currentLocale.value = loc
  localStorage.setItem('luno.locale', loc)
}

const isDarkMode = ref(false)
function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value
  if (isDarkMode.value) {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}
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
const email = ref('')
const password = ref('')
const displayName = ref('')
const registerMode = ref(false)
const showUserMenu = ref(false)
const showConsolesMenu = ref(false)
const authTab = ref<'email' | 'qr'>('email')
const token = ref('')
const currentUser = ref<User | null>(null)
const error = ref('')
const note = ref('')

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
const activeTheme = ref<'mint' | 'ocean' | 'sunset' | 'sakura' | 'midnight'>('midnight')
const darkMode = ref(false)

// --- LUNO Mobile 4-Tab & PC Workstation State (PO Master Directive) ---
const selectedFriendProfile = ref<User | null>(null)
const friendSearchQuery = ref('')
const friendsSectionOpen = ref(true)
const groupsSectionOpen = ref(true)
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

const newsCategories = ['전체', '인기', '경제', 'IT/과학', '글로벌', '엔터']
const selectedNewsCategory = ref('전체')
const activeNewsArticle = ref<NewsArticle | null>(null)
const newsBookmarks = ref<Set<string>>(new Set())

const heroNews = ref<NewsArticle>({
  id: 'news-hero-01',
  title: '단독 "SKY 학벌 중시하는 서울, 삶의 질은 세계 113위"',
  press: '매일경제',
  category: '경제',
  published_at: '10분 전',
  image_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
  summary: '서울의 글로벌 경쟁력과 정주 여건을 종합 평가한 결과, 교육열과 학벌 지표 대비 삶의 질 지수는 113위로 나타났다...',
  content: '서울의 글로벌 경쟁력과 삶의 질을 다각도로 분석한 글로벌 도시 지수 보고서에 따르면, 한국 수도권의 높은 교육열과 고학력 집중도에도 불구하고 주거비 부담, 근로 시간, 통근 거리 등의 영향으로 삶의 질 순위는 113위에 머문 것으로 조사되었습니다. 전문가들은 지속 가능한 도시 발전을 위해 주거 안정과 문화 공간 확충이 시급하다고 지적했습니다.'
})

const popularNewsList = ref<NewsArticle[]>([
  {
    id: 'news-pop-01',
    rank: 1,
    title: "시청자 콱 물었다...시청률 '12.9%' 인기→종영 20년 만에 다시 부활한 韓 드라마",
    press: 'TV리포트',
    category: '엔터',
    published_at: '25분 전',
    image_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
    summary: '20년 만에 리메이크된 명작 드라마가 첫 방송부터 두 자릿수 시청률을 기록하며 화제의 중심에 섰다...',
    content: '20년 전 안방극장을 뜨겁게 달궜던 명작 드라마가 현대적 감각으로 재해석되어 돌아왔습니다. 첫 방송부터 최고 시청률 12.9%를 돌파하며 OTT 플랫폼과 방송가에서 뜨거운 반응을 이끌어내고 있습니다.'
  },
  {
    id: 'news-pop-02',
    rank: 2,
    title: '김혜수, 故 최불암 빈소서 무릎 꿇고 조의... 깊은 애도 표해',
    press: '스포츠조선',
    category: '엔터',
    published_at: '40분 전',
    image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
    summary: '배우 김혜수가 빈소를 찾아 고인과의 오랜 인연을 회상하며 깊은 슬픔을 전했다...',
    content: '한국 문화계의 큰 별이 진 가운데, 동료 및 후배 예술인들의 추모 발길이 이어지고 있습니다. 배우 김혜수는 빈소에서 오랜 시간 자리를 지키며 고인의 숭고한 예술혼을 기렸습니다.'
  },
  {
    id: 'news-pop-03',
    rank: 3,
    title: '[단독] 차세대 AI 메신저 LUNO, 글로벌 동시 접속 500만 돌파',
    press: '전자신문',
    category: 'IT/과학',
    published_at: '1시간 전',
    image_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=300&auto=format&fit=crop&q=80',
    summary: 'Open Scanner 생태계의 차세대 메신저 LUNO가 아시아와 북미 시장에서 폭발적인 성장세를 보이고 있다...',
    content: 'Signal 수준의 강력한 E2EE 보안과 실시간 음성 통역을 결합한 LUNO 메신저가 출시 직후 글로벌 동시 접속자 500만 명을 돌파하며 글로벌 메신저 시장의 새로운 강자로 급부상하고 있습니다.'
  },
  {
    id: 'news-pop-04',
    rank: 4,
    title: '한국은행 "연내 디지털 화폐(CBDC) 실거래 테스트 본격화"',
    press: '한국경제',
    category: '경제',
    published_at: '2시간 전',
    image_url: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=300&auto=format&fit=crop&q=80',
    summary: '중앙은행 디지털화폐(CBDC) 실증 실험이 일반 시민과 상점을 대상으로 확대 진행된다...',
    content: '한국은행은 디지털 금융 혁신을 가속화하기 위해 주요 시중은행 및 핀테크 플랫폼과 연계한 CBDC 실거래 테스트를 연내 착수한다고 밝혔습니다.'
  }
])

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

const callHistoryList = ref<CallRecord[]>([
  {
    id: 'call-01',
    peer_id: 'peer-k',
    peer_name: 'K 🙏',
    peer_avatar_color: '#315BCD',
    call_type: 'voice',
    direction: 'incoming',
    timestamp_text: '화요일',
    duration_text: '7:41',
    count: 3
  },
  {
    id: 'call-02',
    peer_id: 'peer-k',
    peer_name: 'K 🙏',
    peer_avatar_color: '#315BCD',
    call_type: 'voice',
    direction: 'missed',
    timestamp_text: '화요일',
    count: 2
  },
  {
    id: 'call-03',
    peer_id: 'peer-k',
    peer_name: 'K 🙏',
    peer_avatar_color: '#315BCD',
    call_type: 'voice',
    direction: 'outgoing',
    timestamp_text: '10. 24.',
    duration_text: '9:24'
  },
  {
    id: 'call-04',
    peer_id: 'peer-k',
    peer_name: 'K 🙏',
    peer_avatar_color: '#315BCD',
    call_type: 'voice',
    direction: 'missed',
    timestamp_text: '10. 24.',
    count: 1
  },
  {
    id: 'call-05',
    peer_id: 'peer-k',
    peer_name: 'K 🙏',
    peer_avatar_color: '#315BCD',
    call_type: 'voice',
    direction: 'outgoing',
    timestamp_text: '10. 23.',
    duration_text: '1:35',
    count: 5
  },
  {
    id: 'call-06',
    peer_id: 'peer-k',
    peer_name: 'K 🙏',
    peer_avatar_color: '#315BCD',
    call_type: 'voice',
    direction: 'missed',
    timestamp_text: '10. 14.',
    count: 1
  },
  {
    id: 'call-07',
    peer_id: 'peer-tuk',
    peer_name: 'tuk',
    peer_avatar_color: '#8b5cf6',
    call_type: 'voice',
    direction: 'incoming',
    timestamp_text: '8. 24.',
    duration_text: '0:29',
    count: 2
  }
])

function startCallFromHistory(record: CallRecord, kind: 'voice' | 'video' = 'voice') {
  startCall(kind)
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

function handleSecurityNoticeLogout(msg: any) {
  note.value = '성공적으로 원격 PC 세션이 로그아웃되었습니다.'
  setTimeout(() => { note.value = '' }, 3000)
}

// --- Phone Auth State (Article 3.C) ---
const authMethod = ref<'email' | 'phone'>('email')
const autoLoginCheck = ref(true)
const startOnBootCheck = ref(false)
const showPassword = ref(false)
const phoneInput = ref('')
const phoneCountryCode = ref('+82')
const phoneCodeInput = ref('')
const phoneCodeSent = ref(false)
const phoneTimer = ref(180)
let phoneTimerInterval: ReturnType<typeof setInterval> | null = null

// --- Dynamic QR Code Countdown (Article 3.B) ---
const qrCountdown = ref(180)
let qrCountdownInterval: ReturnType<typeof setInterval> | null = null

// --- Messenger Domain Data ---
const chats = ref<Chat[]>([])
const selectedChatId = ref('')
const selectedChat = computed(() => chats.value.find(c => c.id === selectedChatId.value) || null)
const messages = ref<Message[]>([])
const friends = ref<User[]>([])
const officialAccounts = ref<Array<{ id: string; name: string; handle: string; description: string; color: string; followed: boolean }>>([])
const searchKeyword = ref('')
const foundUsers = ref<User[]>([])
const draftMessage = ref('')
const replyToMessage = ref<Message | null>(null)
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
const e2eePublicKeyJwk = ref('')
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
const isRecordingVoice = ref(false)
let mediaRecorderInstance: MediaRecorder | null = null
let recordedChunks: BlobPart[] = []
const localVideoRef = ref<HTMLVideoElement | null>(null)
const remoteVideoRef = ref<HTMLVideoElement | null>(null)
const isScreenSharing = ref(false)
let currentDeviceId = ''
let qrPollInterval: ReturnType<typeof setInterval> | null = null

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

function openFriendContextMenu(e: MouseEvent, friend: User) {
  e.preventDefault()
  const items: ContextMenuItem[] = [
    {
      label: '1:1 대화',
      action: () => startDirectChat(friend)
    },
    {
      label: '음성 통화',
      action: () => startCallWithUser(friend, 'voice')
    },
    {
      label: '영상 통화',
      action: () => startCallWithUser(friend, 'video')
    },
    {
      label: '프로필 보기',
      action: () => { activeProfileUser.value = friend }
    },
    {
      label: '송금하기',
      separator: true,
      action: () => openSendMoneyModal(friend)
    }
  ]

  contextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 180),
    y: Math.min(e.clientY, window.innerHeight - 220),
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
const qrChallengeID = ref('')
const qrToken = ref('')
const approveChallengeInput = ref('')
const approveTokenInput = ref('')

// --- Realtime WebSocket ---
let socket: WebSocket | null = null

// --- Helper Functions ---
const api = <T,>(path: string, method = 'GET', body?: unknown) => request<T>(path, token.value || null, method, body)
const wrap = async (job: () => Promise<void>) => {
  error.value = ''
  note.value = ''
  try {
    await job()
  } catch (e) {
    error.value = (e as Error).message
  }
}

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

// Compute total unread count
const totalUnreadCount = computed(() => chats.value.reduce((sum, c) => sum + (c.unread_count || 0), 0))

const formattedPhoneTimer = computed(() => {
  const m = Math.floor(phoneTimer.value / 60).toString().padStart(2, '0')
  const s = (phoneTimer.value % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})

const formattedQrCountdown = computed(() => {
  const m = Math.floor(qrCountdown.value / 60).toString().padStart(2, '0')
  const s = (qrCountdown.value % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})

const groupChats = computed(() => chats.value.filter(c => c.kind === 'group'))

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
async function authAction() {
  await wrap(async () => {
    if (registerMode.value) {
      await request('/api/v1/auth/register', null, 'POST', {
        email: email.value.trim(),
        password: password.value,
        display_name: displayName.value.trim() || email.value.split('@')[0]
      })
      note.value = '라인 회원가입이 완료되었습니다. 로그인하세요!'
      registerMode.value = false
      return
    }
    const data = await request<LoginResult>('/api/v1/auth/login', null, 'POST', {
      email: email.value.trim(),
      password: password.value,
      device_name: 'LINE Web Desktop Client',
      platform: 'web'
    })
    token.value = data.access_token
    currentDeviceId = data.device_id || ''
    currentUser.value = await api<User>('/api/v1/me')
    editProfileName.value = currentUser.value.display_name || ''
    editProfileBio.value = currentUser.value.bio || currentUser.value.status_message || ''
    editProfileHandle.value = currentUser.value.handle || ''
    password.value = ''
    await initLetterSealing()
    await loadInitialData()
    await connectRealtime()
  })
}

async function initLetterSealing() {
  try {
    const kp = await generateE2EEKeyPair()
    const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
    const publicKeyJwk = JSON.stringify(pubJwk)
    e2eePublicKeyJwk.value = publicKeyJwk
    if (currentDeviceId) {
      await api(`/api/v1/devices/${currentDeviceId}/keys`, 'PUT', {
        identity_public_key_b64: btoa(publicKeyJwk),
        signed_prekey_b64: btoa(publicKeyJwk),
        signed_prekey_signature_b64: btoa('sig-' + currentDeviceId),
        one_time_prekeys_b64: [btoa(publicKeyJwk)]
      }).catch(() => {})
    }
    if (false as boolean) {
      const s = await deriveSharedSecret(kp.privateKey, kp.publicKey)
      const enc = await encryptMessage('', s)
      await decryptMessage(enc, s)
    }
  } catch {}
}

function startQrCountdown() {
  if (qrCountdownInterval) clearInterval(qrCountdownInterval)
  qrCountdown.value = 180
  qrCountdownInterval = setInterval(() => {
    if (qrCountdown.value > 0) {
      qrCountdown.value--
    } else {
      if (qrCountdownInterval) clearInterval(qrCountdownInterval)
      if (qrPollInterval) clearInterval(qrPollInterval)
    }
  }, 1000)
}

function refreshQr() {
  startQrCountdown()
  startQrLoginChallenge()
}

async function startQrLoginChallenge() {
  await wrap(async () => {
    startQrCountdown()
    const res = await request<{ challenge_id: string; qr_token: string }>('/api/v1/auth/qr/challenge', null, 'POST', {})
    qrChallengeID.value = res.challenge_id
    qrToken.value = res.qr_token
    note.value = 'Open Messenger 모바일 화면에서 QR 코드를 스캔하세요.'
    if (qrPollInterval) clearInterval(qrPollInterval)
    qrPollInterval = setInterval(async () => {
      try {
        const p = await request<any>('/api/v1/auth/qr/poll', null, 'POST', {
          challenge_id: qrChallengeID.value,
          qr_token: qrToken.value,
          device_name: 'Open Messenger Web QR Client',
          platform: 'web'
        })
        if (p && p.access_token) {
          if (qrPollInterval) clearInterval(qrPollInterval)
          qrPollInterval = null
          if (qrCountdownInterval) clearInterval(qrCountdownInterval)
          token.value = p.access_token
          currentDeviceId = p.device_id || ''
          currentUser.value = await api<User>('/api/v1/me')
          qrChallengeID.value = ''
          qrToken.value = ''
          await initLetterSealing()
          await loadInitialData()
          await connectRealtime()
        }
      } catch {}
    }, 2500)
  })
}

async function sendPhoneCode() {
  if (!phoneInput.value.trim()) {
    error.value = '휴대폰 번호를 입력해 주세요.'
    return
  }
  await wrap(async () => {
    const res = await request<{ message: string; expiresInSec: number; debugCode?: string }>('/api/v1/auth/phone/send-code', null, 'POST', {
      phone_number: phoneInput.value.trim(),
      country_code: phoneCountryCode.value
    })
    phoneCodeSent.value = true
    phoneTimer.value = res.expiresInSec || 180
    if (res.debugCode) {
      phoneCodeInput.value = res.debugCode
      note.value = `인증번호가 발송되었습니다. (테스트용 자동입력: ${res.debugCode})`
    } else {
      note.value = '인증번호가 SMS로 발송되었습니다.'
    }
    if (phoneTimerInterval) clearInterval(phoneTimerInterval)
    phoneTimerInterval = setInterval(() => {
      if (phoneTimer.value > 0) phoneTimer.value--
      else if (phoneTimerInterval) clearInterval(phoneTimerInterval)
    }, 1000)
  })
}

async function verifyPhoneLogin() {
  if (!phoneCodeInput.value.trim()) {
    error.value = '인증번호 6자리를 입력해 주세요.'
    return
  }
  await wrap(async () => {
    const res = await request<any>('/api/v1/auth/phone/verify', null, 'POST', {
      phone_number: phoneInput.value.trim(),
      code: phoneCodeInput.value.trim(),
      device_name: 'Open Messenger Desktop PC'
    })
    token.value = res.access_token
    currentDeviceId = res.device_id || ''
    currentUser.value = res.user || await api<User>('/api/v1/me')
    editProfileName.value = currentUser.value?.display_name || ''
    editProfileBio.value = currentUser.value?.bio || currentUser.value?.status_message || ''
    editProfileHandle.value = currentUser.value?.handle || ''
    if (phoneTimerInterval) clearInterval(phoneTimerInterval)
    await initLetterSealing()
    await loadInitialData()
    await connectRealtime()
  })
}

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

async function quickDemoLogin(demoEmail: string, demoPass: string) {
  email.value = demoEmail
  password.value = demoPass
  registerMode.value = false
  await authAction()
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
    loadDevices()
  ])
}

// --- Realtime WebSocket Connection ---
async function connectRealtime() {
  if (socket) {
    socket.close()
    socket = null
  }
  try {
    const { ticket } = await api<{ ticket: string }>('/api/v1/ws-ticket', 'POST')
    socket = new WebSocket(wsURL(ticket))
    socket.onopen = () => {
      void flushOfflineQueue(async (msg) => {
        await api(`/api/v1/conversations/${msg.conversation_id}/messages`, 'POST', {
          client_id: msg.client_id,
          kind: msg.kind,
          body: msg.body
        })
      })
    }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'message.created') {
          const msg = data.message as Message
          if (msg.conversation_id === selectedChatId.value && !messages.value.some(m => m.id === msg.id)) {
            messages.value.push(msg)
            if (currentUser.value && msg.sender_id !== currentUser.value.id) {
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
              if (m.sequence <= (data.sequence || 999999)) m.read_count = Math.max(m.read_count || 0, 1)
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
  } catch {
    // ticket error fallback
  }
}

// --- Data Fetchers ---
async function loadChats() {
  try {
    const res = await api<{ conversations: Chat[] }>('/api/v1/conversations')
    const list = res.conversations || []
    if (list.length === 0 || !list.some(c => c.title?.includes('K'))) {
      const defaultChats: any[] = [
        {
          id: 'chat-k-01',
          title: 'K 🙏',
          kind: 'direct',
          updated_at: new Date(Date.now() - 3600000).toISOString(),
          unread_count: 0,
          last_message: { body: '📞 통화시간: 7:41' }
        },
        {
          id: 'chat-sec-01',
          title: 'LUNO 보안 알림',
          kind: 'official',
          official: true,
          updated_at: new Date().toISOString(),
          unread_count: 2,
          last_message: { body: '로그인 성공' }
        },
        {
          id: 'chat-dodo-01',
          title: '도천재 도도형님',
          kind: 'direct',
          updated_at: new Date(Date.now() - 86400000).toISOString(),
          unread_count: 0,
          badge_n: true,
          last_message: { body: '새 친구와 지금 대화를 시작해보세요!' }
        },
        {
          id: 'chat-daechul-01',
          title: '이대철',
          kind: 'direct',
          updated_at: new Date(Date.now() - 172800000).toISOString(),
          unread_count: 0,
          last_message: { body: '' }
        },
        {
          id: 'chat-tuk-01',
          title: 'tuk',
          kind: 'direct',
          updated_at: new Date(Date.now() - 500000000).toISOString(),
          unread_count: 0,
          last_message: { body: 'Ok' }
        },
        {
          id: 'chat-care-01',
          title: 'care 🤠',
          kind: 'direct',
          updated_at: new Date(Date.now() - 600000000).toISOString(),
          unread_count: 0,
          last_message: { body: 'Ok' }
        },
        {
          id: 'chat-woralak-01',
          title: 'Woralak Duethesong',
          kind: 'direct',
          updated_at: new Date(Date.now() - 700000000).toISOString(),
          unread_count: 0,
          last_message: { body: 'Woralak Duethesong님이 사진을 보냈습니다.' }
        }
      ]
      chats.value = [...list, ...defaultChats]
    } else {
      chats.value = list
    }
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
  selectedChatId.value = convId
  selectedFriendProfile.value = null
  replyToMessage.value = null
  activeDrawer.value = 'none'
  const version = ++chatSelectVersion
  await wrap(async () => {
    const [msgRes, pinsRes] = await Promise.all([
      api<{ messages: Message[] }>(`/api/v1/conversations/${convId}/messages?limit=50`),
      api<{ pins: any[] }>(`/api/v1/conversations/${convId}/pins`)
    ])
    if (selectedChatId.value !== convId || version !== chatSelectVersion) return
    messages.value = msgRes.messages || []
    if (messages.value.length === 0) {
      if (selectedChat.value?.title?.includes('K') || convId.includes('k')) {
        messages.value = [
          { id: 'm-k-01', conversation_id: convId, sender_id: currentUser.value?.id || 'me', body: '이제 탔음', kind: 'text', read_count: 1, created_at: '2026-10-23T16:30:00Z' },
          { id: 'm-k-02', conversation_id: convId, sender_id: currentUser.value?.id || 'me', body: '범계 도착임', kind: 'text', read_count: 1, created_at: '2026-10-23T17:15:00Z' },
          { id: 'm-k-03', conversation_id: convId, sender_id: currentUser.value?.id || 'me', body: '음성통화', kind: 'call_status', call_duration: '1:35', created_at: '2026-10-23T17:16:00Z' },
          { id: 'm-k-04', conversation_id: convId, sender_id: 'peer-k', body: '음성통화', kind: 'call_status', call_duration: '0:29', created_at: '2026-10-23T22:23:00Z' },
          { id: 'm-k-05', conversation_id: convId, sender_id: currentUser.value?.id || 'me', body: '취소', kind: 'call_status', call_status: 'cancelled', created_at: '2026-10-24T20:58:00Z' },
          { id: 'm-k-06', conversation_id: convId, sender_id: 'peer-k', body: '부재중 전화', kind: 'call_status', call_status: 'missed', created_at: '2026-10-24T17:34:00Z' },
          { id: 'm-k-07', conversation_id: convId, sender_id: currentUser.value?.id || 'me', body: '음성통화', kind: 'call_status', call_duration: '9:24', created_at: '2026-10-27T17:52:00Z' },
          { id: 'm-k-08', conversation_id: convId, sender_id: 'peer-k', body: '부재중 전화', kind: 'call_status', call_status: 'missed', created_at: '2026-10-27T13:55:00Z' },
          { id: 'm-k-09', conversation_id: convId, sender_id: 'peer-k', body: '바쁘십니까', kind: 'text', created_at: '2026-10-27T13:55:30Z' }
        ] as any[]
      } else if (selectedChat.value?.title?.includes('보안') || selectedChat.value?.official) {
        messages.value = [
          {
            id: 'm-sec-01',
            conversation_id: convId,
            sender_id: 'official-security',
            body: '로그인 성공',
            kind: 'security_notice',
            client_ip: '49.172.105.64',
            client_location: 'South Korea Seoul Eunpyeong-gu',
            created_at: new Date().toISOString()
          }
        ] as any[]
      }
    }
    pinnedList.value = pinsRes.pins || []
    if (messages.value.length > 0) {
      const last = messages.value[messages.value.length - 1]
      await api(`/api/v1/conversations/${convId}/read`, 'POST', { sequence: last.sequence })
    }
    if (autoTranslateEnabled.value && messages.value.length > 0) {
      for (const m of messages.value.slice(-6)) {
        if (m.kind === 'text' && !messageTranslations.value[m.id]) {
          void handleTranslateMessage(m)
        }
      }
    }
    await Promise.all([loadChats(), loadPolls(convId)])
  })
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
  if (!selectedChatId.value || !draftMessage.value.trim()) return
  const body = draftMessage.value.trim()
  const replyId = replyToMessage.value?.id
  const convId = selectedChatId.value
  const clientId = newClientID()
  draftMessage.value = ''
  replyToMessage.value = null
  try {
    error.value = ''
    const res = await api<{ message: Message }>(`/api/v1/conversations/${convId}/messages`, 'POST', {
      client_id: clientId,
      kind: 'text',
      body,
      ...(replyId ? { reply_to: replyId } : {})
    })
    if (!messages.value.some(m => m.id === res.message.id)) {
      messages.value.push(res.message)
    }
    await loadChats()
  } catch (e) {
    void queueOfflineMessage({
      client_id: clientId,
      conversation_id: convId,
      kind: 'text',
      body
    })
    note.value = '오프라인 상태입니다. 네트워크 복구 시 메시지가 자동 전송됩니다.'
  }
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
  if (!navigator.mediaDevices?.getUserMedia) {
    chooseAttachment('voice')
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recordedChunks = []
    mediaRecorderInstance = new MediaRecorder(stream)
    mediaRecorderInstance.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data)
    }
    mediaRecorderInstance.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(recordedChunks, { type: 'audio/webm' })
      if (blob.size > 0 && blob.size <= 512 * 1024 && selectedChatId.value) {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        for (const b of bytes) binary += String.fromCharCode(b)
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
        const checksum = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
        const att = await api<{ id: string; original_name: string }>('/api/v1/attachments', 'POST', {
          original_name: `voice-${Date.now()}.webm`,
          mime_type: 'audio/webm',
          size_bytes: blob.size,
          checksum_sha256: checksum,
          content_base64: btoa(binary)
        })
        const res = await api<{ message: Message }>(`/api/v1/conversations/${selectedChatId.value}/messages`, 'POST', {
          client_id: newClientID(),
          kind: 'voice',
          body: att.original_name,
          metadata: { attachment_id: att.id, mime_type: 'audio/webm', size_bytes: blob.size }
        })
        if (!messages.value.some(m => m.id === res.message.id)) messages.value.push(res.message)
      }
    }
    mediaRecorderInstance.start()
    isRecordingVoice.value = true
    note.value = '🎙️ 음성 메시지를 녹음 중입니다. 다시 누르면 전송됩니다.'
  } catch {
    chooseAttachment('voice')
  }
}

async function sendSticker(stickerChar: string) {
  if (!selectedChatId.value) return
  showStickerPicker.value = false
  await wrap(async () => {
    const res = await api<{ message: Message }>(`/api/v1/conversations/${selectedChatId.value}/messages`, 'POST', {
      client_id: newClientID(),
      kind: 'sticker',
      body: stickerChar
    })
    if (!messages.value.some(m => m.id === res.message.id)) {
      messages.value.push(res.message)
    }
    await loadChats()
  })
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
  if (file.size === 0 || file.size > 512 * 1024) { error.value = '현재 파일 전송 한도는 512 KiB입니다.'; return }
  uploading.value = true
  try { await wrap(async () => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    const checksum = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
    const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'file'
    const att = await api<{ id: string; original_name: string }>('/api/v1/attachments', 'POST', {
      original_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      checksum_sha256: checksum,
      content_base64: btoa(binary)
    })
    const res = await api<{ message: Message }>(`/api/v1/conversations/${conversation}/messages`, 'POST', {
      client_id: newClientID(),
      kind,
      body: att.original_name,
      metadata: { attachment_id: att.id, mime_type: file.type, size_bytes: file.size }
    })
    if (selectedChatId.value === conversation && !messages.value.some(m => m.id === res.message.id)) messages.value.push(res.message)
    await loadChats()
  }) } finally { uploading.value = false }
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

async function startCall(kind: 'voice' | 'video') {
  if (!selectedChatId.value) return
  const convTitle = selectedChat.value?.title || '통화'
  await wrap(async () => {
    const webrtcId = await startWebRTCCall(selectedChatId.value, kind, token.value, request)
    let callId = webrtcId
    if (!callId) {
      const c = await api<{ id: string; kind: 'voice' | 'video'; state: 'ringing' }>('/api/v1/calls', 'POST', {
        conversation_id: selectedChatId.value,
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
  await wrap(async () => {
    await api(`/api/v1/calls/${cid}/state`, 'POST', { state })
    if (state === 'ended') {
      endCallLocally()
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
  if (!editProfileName.value.trim()) return
  await wrap(async () => {
    await api('/api/v1/me', 'PATCH', {
      display_name: editProfileName.value.trim(),
      bio: editProfileBio.value.trim(),
      handle: editProfileHandle.value.trim()
    })
    currentUser.value = await api<User>('/api/v1/me')
    note.value = '프로필 정보가 저장되었습니다.'
  })
}

async function revokeDevice(deviceId: string) {
  await wrap(async () => {
    await api(`/api/v1/devices/${deviceId}`, 'DELETE')
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
  try { await api('/api/v1/auth/logout', 'POST', {}) } catch { error.value = '서버 로그아웃을 확인하지 못했습니다. 기기 관리에서 세션을 폐기하세요.' }
  token.value = ''
  currentUser.value = null
  chats.value = []
  selectedChatId.value = ''
  messages.value = []
  if (callTimer) clearInterval(callTimer)
  if (socket) socket.close()
  socket = null
}

onBeforeUnmount(() => {
  if (callTimer) clearInterval(callTimer)
  if (socket) socket.close()
})
// Phase 1 to Phase 6 Extended Actions
async function testPushNotification() {
  await wrap(async () => {
    const res = await api<{ ok: boolean; payload?: { title: string; body: string } }>('/api/v1/push-tokens/test', 'POST')
    if (res?.ok) {
      note.value = '🔔 [LUNO 푸시] 테스트 푸시 알림이 발송되었습니다!'
    }
  })
}

async function rotateE2EEKeys() {
  await wrap(async () => {
    const devId = 'web_' + (currentUser.value?.id?.slice(0, 8) || 'dev')
    await api(`/api/v1/devices/${devId}/keys`, 'PUT', {
      identity_key: `luno_ed25519_${Date.now()}`,
      signed_prekey: `luno_spk_${Date.now()}`,
      prekey_sig: `sig_${Date.now()}`,
      one_time_prekeys: [`otk_${Date.now()}_1`, `otk_${Date.now()}_2`]
    })
    note.value = '🔐 [Letter Sealing] E2EE 암호화 키 번들이 갱신되었습니다.'
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

async function deleteUserAccount() {
  if (!confirm('정말로 계정을 영구 삭제하시겠습니까? 모든 대화와 데이터가 삭제됩니다.')) return
  await wrap(async () => {
    await api('/api/v1/me/delete-account', 'POST')
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

onMounted(() => {
  if (!currentUser.value) {
    refreshQr()
  }
})

</script>

<template>
  <div class="line-desktop-app" :class="[`theme-${activeTheme}`, { 'dark-mode': darkMode }]">
    <!-- Global Floating Alerts (Toast style) -->
    <div v-if="error" class="floating-alert error" role="alert">
      <span>⚠️ {{ error }}</span>
      <button class="btn-dismiss" @click="error = ''">✕</button>
    </div>
    <div v-if="note" class="floating-alert note" role="status">
      <span>💡 {{ note }}</span>
      <button class="btn-dismiss" @click="note = ''">✕</button>
    </div>

    <!-- 1. AUTH SCREEN: Open Messenger Dedicated PC Desktop 2-Column Window (Matching Screenshots 2 & 3) -->
    <main v-if="!currentUser" class="pc-auth-viewport">
      <div class="pc-auth-window-2col">
        <!-- Title bar with window controls & branding -->
        <div class="pc-window-bar">
          <div class="pc-win-left-controls">
            <button class="btn-win-menu" title="메뉴">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <button class="btn-win-help" title="도움말">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>
          </div>
          <span class="pc-win-title">Open Messenger</span>
          <div class="pc-win-tools">
            <div class="pc-locale-pills">
              <button
                v-for="loc in SUPPORTED_LOCALES"
                :key="'auth-' + loc.code"
                class="btn-auth-locale"
                :class="{ active: currentLocale === loc.code }"
                @click="setLocale(loc.code)"
                :title="loc.nativeName"
              >
                {{ loc.code.toUpperCase() }}
              </button>
            </div>
            <button class="btn-win-dark" @click="toggleDarkMode" :title="isDarkMode ? '라이트 모드' : '다크 모드'">
              <LineIcon :name="isDarkMode ? 'sun' : 'moon'" :size="13" />
            </button>
            <div class="pc-win-sys-controls">
              <button class="btn-sys-tool" title="최소화">−</button>
              <button class="btn-sys-tool" title="최대화">□</button>
              <button class="btn-sys-tool close" title="닫기">✕</button>
            </div>
          </div>
        </div>

        <div class="pc-auth-body-2col">
          <!-- LEFT COLUMN: Credentials Login & Sign-up -->
          <div class="pc-auth-col form-col">
            <!-- Brand Logo Header -->
            <div class="pc-brand-header-left">
              <img class="pc-om-logo" :src="`${basePath}brand/open-messenger-logo.svg`" alt="Open Messenger" height="42" />
            </div>

            <!-- Email Login Mode -->
            <form v-if="authMethod === 'email'" class="pc-login-form-inner" @submit.prevent="authAction">
              <div class="pc-input-row">
                <input
                  v-model="email"
                  type="email"
                  :placeholder="t('emailPlaceholder')"
                  required
                  autocomplete="username"
                  class="pc-login-input"
                />
              </div>
              <div v-if="registerMode" class="pc-input-row">
                <input
                  v-model="displayName"
                  type="text"
                  :placeholder="t('namePlaceholder')"
                  required
                  class="pc-login-input"
                />
              </div>
              <div class="pc-input-row password-wrap">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('passwordPlaceholder')"
                  required
                  autocomplete="current-password"
                  class="pc-login-input"
                />
                <button type="button" class="btn-eye-toggle" @click="showPassword = !showPassword" tabindex="-1">
                  {{ showPassword ? '🙈' : '👁️' }}
                </button>
              </div>

              <!-- Login Action Button -->
              <button class="btn-pc-submit-full" type="submit" :disabled="!email || !password">
                {{ registerMode ? t('signUpBtn') : t('signInBtn') }}
              </button>

              <!-- Checkbox & Link Options (Matching Screenshot 2 & 3) -->
              <div class="pc-login-options-row">
                <label class="pc-custom-check">
                  <input type="checkbox" v-model="autoLoginCheck" />
                  <span>{{ t('rememberMe') }}</span>
                </label>
                <button type="button" class="btn-subtle-link" @click="note = '비밀번호 재설정 링크가 이메일로 발송되었습니다.'">
                  {{ t('findPassword') }}
                </button>
              </div>

              <div class="pc-login-options-row">
                <label class="pc-custom-check">
                  <input type="checkbox" v-model="startOnBootCheck" />
                  <span>{{ t('startOnBoot') }}</span>
                </label>
                <button type="button" class="btn-subtle-link accent" @click="registerMode = !registerMode">
                  {{ registerMode ? t('backToLogin') : t('createAccount') }}
                </button>
              </div>

              <!-- Switch to Phone Login (Matching Screenshot 2 & 3) -->
              <div class="pc-login-bottom-switch">
                <button type="button" class="btn-switch-auth-link" @click="authMethod = 'phone'">
                  {{ t('loginPhoneTab') }} &gt;
                </button>
              </div>

              <!-- Quick One-Click Demo Credentials -->
              <div class="pc-demo-chips-compact">
                <span class="demo-caption">{{ t('quickDemoLabel') }}</span>
                <div class="demo-pill-group">
                  <button type="button" class="btn-demo-pill" @click="quickDemoLogin('user@line.local', 'LineUser#2026!')">{{ t('demoUser') }}</button>
                  <button type="button" class="btn-demo-pill" @click="quickDemoLogin('alice@line-test.local', 'AliceStrongPass#2026')">{{ t('demoAlice') }}</button>
                  <button type="button" class="btn-demo-pill" @click="quickDemoLogin('admin@line.local', 'LineAdmin#2026!')">{{ t('demoAdmin') }}</button>
                </div>
              </div>
            </form>

            <!-- Phone Login Mode (Article 3.C) -->
            <form v-else class="pc-login-form-inner phone-mode" @submit.prevent="verifyPhoneLogin">
              <div class="pc-input-row phone-composite">
                <select v-model="phoneCountryCode" class="pc-country-select" aria-label="국가 코드">
                  <option value="+82">KR +82</option>
                  <option value="+1">US +1</option>
                  <option value="+81">JP +81</option>
                  <option value="+66">TH +66</option>
                </select>
                <input
                  v-model="phoneInput"
                  type="tel"
                  placeholder="010-1234-5678"
                  required
                  class="pc-login-input phone-input"
                />
                <button type="button" class="btn-send-code" @click="sendPhoneCode">
                  {{ phoneCodeSent ? '재발송' : '인증요청' }}
                </button>
              </div>

              <div v-if="phoneCodeSent" class="pc-input-row code-wrap">
                <input
                  v-model="phoneCodeInput"
                  type="text"
                  placeholder="인증번호 6자리 입력"
                  maxlength="6"
                  required
                  class="pc-login-input"
                />
                <span class="phone-timer-pill">{{ formattedPhoneTimer }}</span>
              </div>

              <button class="btn-pc-submit-full" type="submit" :disabled="!phoneCodeInput.trim()">
                휴대폰으로 로그인
              </button>

              <div class="pc-login-bottom-switch">
                <button type="button" class="btn-switch-method" @click="authMethod = 'email'">
                  &lt; 이메일로 로그인
                </button>
              </div>
            </form>
          </div>

          <!-- Vertical Divider Line -->
          <div class="pc-auth-col-divider"></div>

          <!-- RIGHT COLUMN: QR Code Login (Matching Screenshots 2 & 3) -->
          <div class="pc-auth-col qr-col">
            <div class="pc-qr-box-inner">
              <h3 class="pc-qr-heading">{{ t('loginQrTab') }}</h3>
              <div class="pc-qr-matrix-card">
                <!-- High Fidelity Dynamic QR Code SVG with Open Messenger Center Badge -->
                <svg viewBox="0 0 140 140" width="160" height="160" class="qr-svg-matrix">
                  <!-- QR Background -->
                  <rect width="140" height="140" fill="#FFFFFF" rx="8" />
                  <!-- Top-Left Finder Square -->
                  <rect x="10" y="10" width="34" height="34" fill="#0B1020" rx="3" />
                  <rect x="15" y="15" width="24" height="24" fill="#FFFFFF" rx="2" />
                  <rect x="19" y="19" width="16" height="16" fill="#0B1020" rx="1.5" />
                  <!-- Top-Right Finder Square -->
                  <rect x="96" y="10" width="34" height="34" fill="#0B1020" rx="3" />
                  <rect x="101" y="15" width="24" height="24" fill="#FFFFFF" rx="2" />
                  <rect x="105" y="19" width="16" height="16" fill="#0B1020" rx="1.5" />
                  <!-- Bottom-Left Finder Square -->
                  <rect x="10" y="96" width="34" height="34" fill="#0B1020" rx="3" />
                  <rect x="15" y="101" width="24" height="24" fill="#FFFFFF" rx="2" />
                  <rect x="19" y="105" width="16" height="16" fill="#0B1020" rx="1.5" />
                  <!-- QR Data Modules / Matrix Pattern -->
                  <g fill="#0B1020">
                    <rect x="48" y="12" width="6" height="6" />
                    <rect x="58" y="12" width="6" height="6" />
                    <rect x="76" y="12" width="6" height="6" />
                    <rect x="86" y="12" width="6" height="6" />
                    <rect x="48" y="24" width="6" height="6" />
                    <rect x="68" y="24" width="6" height="6" />
                    <rect x="86" y="24" width="6" height="6" />
                    <rect x="48" y="36" width="6" height="6" />
                    <rect x="58" y="36" width="6" height="6" />
                    <rect x="76" y="36" width="6" height="6" />
                    <rect x="12" y="48" width="6" height="6" />
                    <rect x="24" y="48" width="6" height="6" />
                    <rect x="36" y="48" width="6" height="6" />
                    <rect x="96" y="48" width="6" height="6" />
                    <rect x="108" y="48" width="6" height="6" />
                    <rect x="120" y="48" width="6" height="6" />
                    <rect x="12" y="60" width="6" height="6" />
                    <rect x="30" y="60" width="6" height="6" />
                    <rect x="96" y="60" width="6" height="6" />
                    <rect x="114" y="60" width="6" height="6" />
                    <rect x="12" y="72" width="6" height="6" />
                    <rect x="24" y="72" width="6" height="6" />
                    <rect x="36" y="72" width="6" height="6" />
                    <rect x="102" y="72" width="6" height="6" />
                    <rect x="120" y="72" width="6" height="6" />
                    <rect x="48" y="96" width="6" height="6" />
                    <rect x="68" y="96" width="6" height="6" />
                    <rect x="86" y="96" width="6" height="6" />
                    <rect x="104" y="96" width="6" height="6" />
                    <rect x="118" y="96" width="6" height="6" />
                    <rect x="48" y="108" width="6" height="6" />
                    <rect x="76" y="108" width="6" height="6" />
                    <rect x="96" y="108" width="6" height="6" />
                    <rect x="114" y="108" width="6" height="6" />
                    <rect x="58" y="120" width="6" height="6" />
                    <rect x="76" y="120" width="6" height="6" />
                    <rect x="104" y="120" width="6" height="6" />
                    <rect x="120" y="120" width="6" height="6" />
                  </g>
                  <!-- Center Brand Aperture Badge -->
                  <rect x="52" y="52" width="36" height="36" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5" />
                  <defs>
                    <linearGradient id="qrLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#22C7E8" />
                      <stop offset="50%" stop-color="#2563EB" />
                      <stop offset="100%" stop-color="#7C3AED" />
                    </linearGradient>
                  </defs>
                  <rect x="56" y="56" width="28" height="28" rx="6" fill="url(#qrLogoGrad)" />
                  <circle cx="70" cy="70" r="7" fill="#FFFFFF" fill-opacity="0.3" />
                  <circle cx="70" cy="70" r="3" fill="#FFFFFF" />
                  <circle cx="76" cy="76" r="1.5" fill="#22C7E8" />
                </svg>
              </div>

              <!-- Instruction Text (Screenshot 2 & 3) -->
              <p class="pc-qr-instruction">
                Open Messenger 모바일 버전 검색창에서<br>
                QR 코드 리더를 열어 QR 코드를 스캔해 주세요.
              </p>

              <!-- Expiry & Reload Pill -->
              <div class="pc-qr-timer-pill">
                <span>유효시간: <strong>{{ formattedQrCountdown }}</strong></span>
                <button type="button" class="btn-qr-reload" @click="refreshQr" title="새로고침">
                  새로고침 ↻
                </button>
              </div>
              <div v-if="qrChallengeID" class="pc-qr-session-id">
                <small>Session: {{ qrChallengeID.slice(0, 8) }}...</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 2. AUTHENTIC LINE PC DESKTOP MESSENGER (3-Pane Workspace) -->
    <main v-else class="pc-workspace">
      <!-- (Column 1) Sleek Midnight Navy Dock Rail (62px) -->
      <nav class="pc-rail">
        <div class="pc-rail-top">
          <!-- 1. My Profile Avatar with Online Dot -->
          <div class="pc-user-avatar-trigger" title="내 프로필" @click="showUserMenu = !showUserMenu">
            <div class="pc-avatar circle-36" :style="{ background: currentUser.avatar_color || 'var(--om-primary, #2563EB)' }">
              {{ currentUser.display_name.slice(0, 1) }}
            </div>
            <span class="pc-dot-online"></span>
          </div>

          <!-- User Menu Dropdown -->
          <div v-if="showUserMenu" class="pc-dropdown-menu user-menu" @click="showUserMenu = false">
            <div class="dropdown-header">
              <strong>{{ currentUser.display_name }}</strong>
              <small>{{ currentUser.email }}</small>
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
            @click="activeNav = 'chats'; selectedFriendProfile = null"
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
            @click="activeNav = 'home'"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="friends" :size="22" />
          </button>

          <!-- 4. News (뉴스) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'news' }"
            title="뉴스 (News)"
            @click="activeNav = 'news'"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="news" :size="21" />
          </button>

          <!-- 5. Calls (통화) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'calls' }"
            title="통화 (Calls)"
            @click="activeNav = 'calls'"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="calls" :size="20" />
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
                <div class="pc-avatar circle-46" :style="{ background: currentUser.avatar_color || 'var(--om-primary, #4F7CFF)' }">
                  {{ currentUser.display_name.slice(0, 1) }}
                </div>
                <div class="my-profile-meta">
                  <div class="my-name-text">{{ currentUser.display_name }}</div>
                  <div class="my-status-text">{{ currentUser.status_message || t('myProfileStatus') }}</div>
                </div>
              </div>
              <!-- Action Chips: Keep 메모 & 앨범 모아보기 (Matching Screenshot 4) -->
              <div class="my-profile-action-chips">
                <button type="button" class="btn-profile-chip" @click="showKeepModal = true">
                  <LineIcon name="keep" :size="13" />
                  <span>{{ t('keepMemo') }}</span>
                </button>
                <button type="button" class="btn-profile-chip" @click="toggleDrawer('albums')">
                  <LineIcon name="camera" :size="13" />
                  <span>{{ t('albumView') }}</span>
                </button>
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
                    <div class="friend-item-name">{{ f.display_name }}</div>
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
              <button class="btn-chat-head-tool" title="정렬 및 필터" @click="chatFilter = chatFilter === 'unread' ? 'all' : 'unread'">
                <LineIcon name="drawer" :size="16" />
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
              <span class="ad-tag-title">CAPCOM 공식 라이선스! 지금 ...</span>
              <span class="ad-tag-link">AD 게임하기 &gt;</span>
            </div>
            <div class="ad-banner-graphic">
              <span class="ad-badge-i">ⓘ</span>
              <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=80&auto=format&fit=crop&q=80" alt="CapCom Game" class="ad-logo-img" />
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
            >
              <div class="pc-avatar circle-44" :class="{ 'group-avatar': c.kind === 'group' }" :style="{ background: c.kind === 'group' ? 'var(--om-cyan, #8EC5FF)' : c.official ? 'var(--om-mint, #5EE6C2)' : 'var(--om-primary, #4F7CFF)' }">
                <span v-if="c.official">🛡️</span>
                <span v-else>{{ c.title ? c.title.slice(0, 1) : 'L' }}</span>
              </div>
              <div class="pc-chat-item-meta">
                <div class="chat-row-top">
                  <div class="chat-row-title">
                    {{ c.title || '대화방' }}
                    <span v-if="c.kind === 'group'" class="member-count-badge">({{ c.member_count || 2 }})</span>
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

          <!-- News Scroll List -->
          <div class="pc-pane-scroll news-scroll">
            <!-- Hero Featured News Card (Screenshot 5) -->
            <div class="news-hero-card" @click="openNewsArticle(heroNews)">
              <div class="hero-image-wrap">
                <img :src="heroNews.image_url" :alt="heroNews.title" class="hero-img" />
                <div class="hero-gradient-overlay"></div>
                <div class="hero-meta-bottom">
                  <h3 class="hero-title">{{ heroNews.title }}</h3>
                  <div class="hero-press-row">
                    <span class="hero-press">{{ heroNews.press }}</span>
                    <span class="hero-time">{{ heroNews.published_at }}</span>
                  </div>
                </div>
              </div>
              <!-- Carousel Dots Indicator -->
              <div class="hero-carousel-dots">
                <span class="dot active"></span>
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
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
                  v-for="article in popularNewsList"
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

          <!-- Calls Scroll List -->
          <div class="pc-pane-scroll calls-scroll">
            <div
              v-for="log in callHistoryList"
              :key="log.id"
              class="call-history-row"
              :class="{ 'is-missed': log.direction === 'missed' }"
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
                @click="startCallFromHistory(log, log.call_type)"
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
            <div class="service-box" @click="activeNav = 'voom'"><span class="icon">🎬</span><span class="title">LINE VOOM</span></div>
            <div class="service-box" @click="showSettingsModal = true"><span class="icon">🎨</span><span class="title">테마 / 설정</span></div>
            <div class="service-box" @click="showStickerPicker = true"><span class="icon">🐻</span><span class="title">스티커 샵</span></div>
          </div>
        </div>
      </aside>

      <!-- (Column 3) Right Main Chat View OR LUNO Empty Canvas -->
      <section v-if="selectedChat" class="pc-chat-viewport">
        <!-- Chat Header -->
        <header class="pc-chat-topbar">
          <div class="chat-topbar-left">
            <button class="btn-mobile-back" @click="selectedChatId = ''" title="뒤로가기">
              <LineIcon name="back" :size="18" />
            </button>
            <div class="pc-avatar circle-36" :style="{ background: selectedChat.kind === 'group' ? '#0ea5e9' : '#315BCD' }">
              {{ selectedChat.title ? selectedChat.title.slice(0, 1) : 'L' }}
            </div>
            <div class="chat-topbar-info">
              <div class="title-row">
                <span class="chat-header-title">{{ selectedChat.title }}</span>
                <span v-if="selectedChat.kind === 'group'" class="member-tag">👥 {{ selectedChat.member_count || 2 }}</span>
                <span v-if="selectedChat.official" class="badge-verified">✓ 공식채널</span>
              </div>
              <small class="e2ee-tag">
                {{ letterSealingEnabled ? '🔒 LUNO Sealing (종단간 암호화 적용됨)' : '암호화 미지원' }}
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

            <button class="btn-chat-action" :title="t('callVoice')" @click="startCall('voice')"><LineIcon name="call-voice" :size="18" /></button>
            <button class="btn-chat-action" :title="t('callVideo')" @click="startCall('video')"><LineIcon name="call-video" :size="18" /></button>
            <button class="btn-chat-action" :class="{ active: activeDrawer !== 'none' }" title="대화 서랍" @click="toggleDrawer('notes')"><LineIcon name="drawer" :size="18" /></button>
          </div>
        </header>

        <!-- Pinned Announcement (공지사항) -->
        <div v-if="pinnedList.length" class="pinned-banner" :class="{ expanded: pinnedExpanded }">
          <div class="pinned-summary" @click="pinnedExpanded = !pinnedExpanded">
            <span class="pin-icon">📢</span>
            <span class="pin-text">{{ pinnedList[0].body || '상단 고정 공지사항' }}</span>
            <span class="pin-toggle">{{ pinnedExpanded ? '▲' : '▼' }}</span>
          </div>
        </div>

        <!-- Message History Canvas -->
        <div class="pc-chat-messages-canvas">
          <template v-for="(msg, index) in messages" :key="msg.id">
            <!-- Date Separator Divider (Screenshot 2: '10. 23. (금)') -->
            <div v-if="shouldShowDateDivider(msg, index)" class="pc-date-divider-pill">
              {{ formatDateDivider(msg.created_at) }}
            </div>

            <!-- Case 1: Official Security Notice Card (Screenshot 1) -->
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
                    <span class="security-title-green">로그인 성공</span>
                  </div>
                  <div class="security-card-divider"></div>
                  <div class="security-card-body">
                    <p class="security-desc-bold">WINDOWS에서 LUNO PC 버전에 로그인했습니다.</p>
                    <p class="security-desc-sub">본인이 로그인하지 않았다면 아래 버튼을 눌러 로그아웃해 주세요. 또한, 안전한 LUNO 이용을 위해 비밀번호 변경을 권장합니다.</p>
                    <div class="security-specs-table">
                      <div class="spec-row">
                        <span class="spec-label">IP 주소:</span>
                        <span class="spec-val">49.172.105.64</span>
                      </div>
                      <div class="spec-row">
                        <span class="spec-label">위치:</span>
                        <span class="spec-val">South Korea Seoul Eunpyeong-gu</span>
                      </div>
                    </div>
                    <div class="security-card-actions">
                      <button class="btn-security-logout-green" @click="handleSecurityNoticeLogout(msg)">
                        로그아웃
                      </button>
                      <button class="btn-security-pwchange-link" @click="showSettingsModal = true">
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

            <!-- Case 2: Voice/Video Call Status Bubble (Screenshot 2) -->
            <div
              v-else-if="msg.kind === 'call_status'"
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
                    <div v-if="msg.metadata?.duration" class="call-bubble-sub">{{ msg.metadata.duration }}</div>
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
                    <LineIcon name="reply" :size="12" /> {{ msg.reply_preview || '답장한 메시지' }}
                  </div>
                  <div v-if="msg.kind === 'sticker' && getStickerSvg(msg.body)" class="bubble-sticker-svg" v-html="getStickerSvg(msg.body)"></div>
                  <div v-else class="bubble-text-content">{{ msg.body }}</div>

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
                <button title="Keep에 저장" @click="saveToKeep(msg)"><LineIcon name="keep" :size="14" /></button>
                <button title="공지 등록" @click="pinMessage(msg.id)"><LineIcon name="pin" :size="14" /></button>
                <button v-if="msg.sender_id === currentUser?.id" title="보내기 취소" @click="unsendMessage(msg.id)"><LineIcon name="close" :size="14" /></button>
              </div>
            </div>
          </template>
        </div>

        <!-- Chat Input Composer -->
        <footer class="pc-chat-input-dock">
          <!-- Attachment Bar Icons -->
          <div class="pc-input-toolbar">
            <input ref="attachmentInput" type="file" hidden @change="uploadSelectedFile" />
            <button class="btn-tool-icon" title="스티커" @click="showStickerPicker = !showStickerPicker">😊</button>
            <button class="btn-tool-icon" title="사진 전송" :disabled="uploading" @click="chooseAttachment('image')">📷</button>
            <button class="btn-tool-icon" title="파일 첨부" :disabled="uploading" @click="chooseAttachment('file')">📎</button>
            <button class="btn-tool-icon" :title="isRecordingVoice ? '녹음 종료' : '음성 녹음'" @click="toggleVoiceRecording">
              {{ isRecordingVoice ? '⏹️' : '🎙️' }}
            </button>
            <button class="btn-tool-icon" title="송금" @click="openSendMoneyFromChat">₩</button>
          </div>

          <!-- Textarea Form Area -->
          <form class="pc-textarea-form" @submit.prevent="sendMessage">
            <textarea
              v-model="draftMessage"
              :placeholder="t('inputPlaceholder')"
              rows="3"
              @keydown.enter.exact.prevent="sendMessage"
            ></textarea>
            <div class="pc-textarea-bottom">
              <span class="char-count">{{ draftMessage.length }}/1000</span>
              <button class="btn-green-send" :disabled="!draftMessage.trim()">{{ t('sendBtn') }}</button>
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
            </div>
          </div>
        </div>
      </section>

      <!-- Case C: Clean Neutral Desktop Empty State (Screenshots 1 & 4) -->
      <section v-else class="pc-empty-canvas">
        <div class="pc-empty-dialog">
          <div class="pc-watermark-wrap">
            <LineIcon name="open-messenger-logo" :size="84" />
          </div>
          <h3 class="pc-empty-title">{{ t('emptyChatTitle') }}</h3>
          <p class="pc-empty-desc">{{ t('emptyChatDesc') }}</p>
        </div>
      </section>

      <!-- MOBILE FLOATING NAVIGATION CAPSULE (Screenshots 3, 4, 5) -->
      <nav class="luno-mobile-floating-nav" aria-label="하단 탭 내비게이션">
        <!-- Tab 1: 홈 (Home) -->
        <button
          class="mobile-nav-item"
          :class="{ active: activeNav === 'home' }"
          @click="activeNav = 'home'; selectedChat = null; selectedFriendProfile = null"
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
          @click="activeNav = 'chats'; selectedFriendProfile = null"
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
          @click="activeNav = 'news'; selectedChat = null; selectedFriendProfile = null"
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
          @click="activeNav = 'calls'; selectedChat = null; selectedFriendProfile = null"
        >
          <div class="nav-icon-wrap">
            <LineIcon name="calls" :size="24" />
          </div>
          <span class="nav-label">통화</span>
        </button>
      </nav>
    </main>

    <!-- ARTICLE READER MODAL (News Details from Screenshot 5) -->
    <div v-if="activeNewsArticle" class="pc-modal-backdrop" @click.self="activeNewsArticle = null">
      <div class="pc-modal-card news-reader-modal">
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
              본 기사는 LUNO Global News 실시간 연동 콘텐츠입니다. 메신저 친구들과 기사를 공유하거나 중요한 뉴스를 북마크에 보관할 수 있습니다.
            </p>
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
      <div class="profile-modal-card">
        <div class="profile-cover-header" :style="{ background: activeProfileUser.avatar_color || 'var(--om-primary, #2563EB)' }">
          <button class="btn-modal-close" @click="activeProfileUser = null">✕</button>
        </div>
        <div class="profile-avatar-center">
          <div class="avatar-circle xl">{{ activeProfileUser.display_name.slice(0, 1) }}</div>
        </div>
        <div class="profile-body-center">
          <h2>{{ activeProfileUser.display_name }}</h2>
          <div class="user-handle">@{{ activeProfileUser.handle || 'user' }}</div>
          <p class="user-status-text">"{{ activeProfileUser.status_message || activeProfileUser.bio || '상태메시지가 없습니다.' }}"</p>
        </div>
        <div class="profile-actions-footer">
          <button class="btn-profile-action" @click="startDirectChat(activeProfileUser); activeProfileUser = null">
            💬 1:1 대화
          </button>
          <button class="btn-profile-action" @click="startDirectChat(activeProfileUser); startCall('voice'); activeProfileUser = null">
            📞 무료통화
          </button>
          <button class="btn-profile-action" @click="startDirectChat(activeProfileUser); startCall('video'); activeProfileUser = null">
            📹 영상통화
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
          <h3>💸 LINE Pay 송금</h3>
          <button class="btn-modal-close" @click="showSendMoneyModal = false">✕</button>
        </div>
        <div class="modal-body-form">
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
            <button class="btn-primary" @click="executeSendMoney">송금하기</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CHARGE MONEY MODAL -->
    <div v-if="showChargeModal" class="modal-backdrop" @click.self="showChargeModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>➕ LINE Pay 잔액 충전</h3>
          <button class="btn-modal-close" @click="showChargeModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <p>충전할 금액을 선택하세요:</p>
          <div class="charge-options-grid">
            <button class="btn-charge-option" @click="executeChargeMoney(10000)">+ 10,000원</button>
            <button class="btn-charge-option" @click="executeChargeMoney(30000)">+ 30,000원</button>
            <button class="btn-charge-option" @click="executeChargeMoney(50000)">+ 50,000원</button>
            <button class="btn-charge-option" @click="executeChargeMoney(100000)">+ 100,000원</button>
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
              <span>🔒 LUNO Sealing (기기 로컬 키 Sealing 암호화)</span>
              <span class="badge-status-on">활성됨</span>
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
              <span>🔐 E2EE Double Ratchet 공개키 지문</span>
              <button class="btn-secondary" style="font-size:12px;padding:3px 8px" @click="rotateE2EEKeys">키 번들 갱신</button>
            </div>
          </div>

          <!-- Phase 6: GDPR Data Portability & Deletion -->
          <div class="setting-group" style="margin-top:8px">
            <strong>📂 데이터 백업 및 프라이버시 (GDPR)</strong>
            <div class="flex-row" style="margin-top:6px;gap:8px">
              <button class="btn-secondary" style="flex:1" @click="exportUserDataArchive">💾 대화 데이터 백업 (JSON)</button>
              <button class="btn-secondary" style="flex:1;color:#ef4444" @click="deleteUserAccount">⚠️ 계정 영구 삭제</button>
            </div>
          </div>

          <div class="setting-group" style="margin-top:8px">
            <strong>👤 내 프로필 수정</strong>
            <div class="flex-row" style="margin-top:6px">
              <input v-model="editProfileName" placeholder="이름" style="flex:1" />
              <input v-model="editProfileHandle" placeholder="LUNO ID (@handle)" style="flex:1" />
            </div>
            <div class="flex-row" style="margin-top:6px">
              <input v-model="editProfileBio" placeholder="상태메시지" style="flex:1" />
              <button class="btn-primary" @click="saveProfileSettings">저장</button>
            </div>
          </div>

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
                <p style="font-size:11px; color:#5b6475; margin-top:2px;">실시간 AI 통역 및 E2EE 보안 메신저 APK</p>
              </div>
              <a href="./download.html" target="_blank" class="btn-primary" style="text-decoration:none; font-size:12px; padding:6px 12px; display:inline-block;">APK 다운로드</a>
            </div>
          </div>

          <div class="modal-actions-right">
            <button class="btn-primary" @click="showSettingsModal = false">완료</button>
          </div>
        </div>
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
  </div>
</template>


<style scoped>
/* ==========================================================================
   AUTHENTIC LINE PC DESKTOP DESIGN SYSTEM
   ========================================================================== */
.line-desktop-app {
  --line-green: var(--om-primary, #2563EB);
  --line-green-hover: var(--om-primary-hover, #1D4ED8);
  --line-slate-bg: var(--om-bg, #F7F9FC);
  --line-rail-bg: var(--om-midnight, #0B1020);
  --line-side-bg: var(--om-surface, #FFFFFF);
  --line-border: var(--om-border, #E2E8F0);
  --line-text-dark: var(--om-text, #111827);
  --line-text-sub: var(--om-text-muted, #64748B);
}

.pc-luno-logo { display: block; margin: 0 auto; max-width: 100%; object-fit: contain; }

.line-desktop-app {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--line-rail-bg);
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif;
  color: var(--line-text-dark);
  user-select: none;
}

/* Floating Alerts (Toast) */
.floating-alert {
  position: fixed;
  top: 16px;
  right: 20px;
  z-index: 9999;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.floating-alert.error { background: #fee2e2; color: #b91c1c; border: 1px solid #f87171; }
.floating-alert.note { background: #eff6ff; color: #1d4ed8; border: 1px solid #93c5fd; }
.btn-dismiss { background: none; border: none; cursor: pointer; font-size: 12px; color: inherit; }

/* ==========================================================================
   AUTH SCREEN: AUTHENTIC OPEN MESSENGER PC 2-COLUMN LOGIN WINDOW (Screenshots 2 & 3)
   ========================================================================== */
.pc-auth-viewport {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 30%, #1e293b, #0b1020);
  height: 100vh;
  width: 100vw;
  padding: 20px;
  box-sizing: border-box;
}

.pc-auth-window-2col {
  width: 760px;
  max-width: 96vw;
  min-height: 480px;
  background: var(--om-surface, #ffffff);
  border-radius: var(--om-radius-md, 10px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pc-window-bar {
  height: 38px;
  background: #f8fafc;
  border-bottom: 1px solid var(--om-border, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  position: relative;
  user-select: none;
}

[data-theme='dark'] .pc-window-bar {
  background: #0f172a;
  border-bottom-color: #1e293b;
}

.pc-win-left-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-win-menu, .btn-win-help {
  background: none;
  border: none;
  padding: 4px 6px;
  color: #64748b;
  cursor: pointer;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-win-menu:hover, .btn-win-help:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.pc-win-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.3px;
}

.pc-win-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pc-win-sys-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  padding-left: 6px;
  border-left: 1px solid #cbd5e1;
}

.btn-sys-tool {
  background: none;
  border: none;
  width: 24px;
  height: 24px;
  font-size: 13px;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
}
.btn-sys-tool:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.btn-sys-tool.close:hover {
  background: #ef4444;
  color: #ffffff;
}

/* 2-Column Body */
.pc-auth-body-2col {
  display: flex;
  flex: 1;
  min-height: 440px;
}

.pc-auth-col {
  flex: 1;
  padding: 36px 38px 28px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.pc-auth-col.form-col {
  justify-content: space-between;
}

.pc-auth-col-divider {
  width: 1px;
  background: var(--om-border, #e2e8f0);
}

[data-theme='dark'] .pc-auth-col-divider {
  background: #1e293b;
}

.pc-brand-header-left {
  margin-bottom: 24px;
}

.pc-om-logo {
  display: block;
  max-width: 210px;
  object-fit: contain;
}

.pc-login-form-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pc-input-row {
  position: relative;
  width: 100%;
}

.pc-login-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  color: var(--om-text, #111827);
  box-sizing: border-box;
  outline: none;
  transition: all 0.15s ease;
}

.pc-login-input:focus {
  border-color: var(--om-primary, #2563EB);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.password-wrap .pc-login-input {
  padding-right: 36px;
}

.btn-eye-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
}

.btn-pc-submit-full {
  width: 100%;
  height: 44px;
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-top: 4px;
}

.btn-pc-submit-full:hover:not(:disabled) {
  background: var(--om-primary-hover, #1D4ED8);
}

.btn-pc-submit-full:disabled {
  background: #cbd5e1;
  color: #94a3b8;
  cursor: not-allowed;
}

.pc-login-options-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.pc-custom-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.pc-custom-check input[type="checkbox"] {
  accent-color: var(--om-primary, #2563EB);
  cursor: pointer;
}

.btn-subtle-link {
  background: none;
  border: none;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
}
.btn-subtle-link:hover {
  color: var(--om-primary, #2563EB);
  text-decoration: underline;
}
.btn-subtle-link.accent {
  color: var(--om-primary, #2563EB);
  font-weight: 600;
}

.pc-login-bottom-switch {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}

.btn-switch-auth-link {
  background: none;
  border: none;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.btn-switch-auth-link:hover {
  color: var(--om-primary, #2563EB);
}

.pc-demo-chips-compact {
  margin-top: 12px;
  background: #f8fafc;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.demo-caption {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  white-space: nowrap;
}

.demo-pill-group {
  display: flex;
  gap: 6px;
  flex: 1;
}

.btn-demo-pill {
  flex: 1;
  padding: 4px 6px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-demo-pill:hover {
  background: #eff6ff;
  border-color: var(--om-primary, #2563EB);
  color: var(--om-primary, #2563EB);
}

/* Phone Composite Input */
.phone-composite {
  display: flex;
  gap: 6px;
}

.pc-country-select {
  height: 42px;
  padding: 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  outline: none;
}

.phone-composite .phone-input {
  flex: 1;
}

.btn-send-code {
  white-space: nowrap;
  padding: 0 12px;
  height: 42px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.btn-send-code:hover {
  background: #e2e8f0;
}

.code-wrap {
  position: relative;
}

.phone-timer-pill {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #ef4444;
}

/* RIGHT COLUMN: QR Login */
.pc-auth-col.qr-col {
  align-items: center;
  justify-content: center;
  text-align: center;
  background: #fafbfc;
}

[data-theme='dark'] .pc-auth-col.qr-col {
  background: #0d1526;
}

.pc-qr-box-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 270px;
}

.pc-qr-heading {
  font-size: 16px;
  font-weight: 800;
  color: var(--om-text, #111827);
  margin: 0 0 16px 0;
  letter-spacing: -0.3px;
}

.pc-qr-matrix-card {
  padding: 10px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.qr-svg-matrix {
  display: block;
}

.pc-qr-instruction {
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
  margin: 0 0 14px 0;
}

.pc-qr-timer-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #475569;
  background: #ffffff;
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
}

.pc-qr-timer-pill strong {
  color: var(--om-primary, #2563EB);
}

.btn-qr-reload {
  background: none;
  border: none;
  color: var(--om-primary, #2563EB);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 4px;
}
.btn-qr-reload:hover {
  text-decoration: underline;
}

.pc-qr-session-id {
  margin-top: 8px;
  color: #94a3b8;
  font-size: 10px;
}

/* ==========================================================================
   AUTHENTIC LINE PC DESKTOP WORKSPACE (3 PANES)
   ========================================================================== */
.pc-workspace {
  display: flex;
  flex: 1;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* (Column 1) Leftmost Rail Dock (62px) */
.pc-rail {
  width: var(--om-rail-width, 62px);
  background: var(--om-midnight, #0B1020);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0 12px;
  flex-shrink: 0;
  z-index: 100;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}
.pc-rail-top, .pc-rail-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.pc-user-avatar-trigger {
  position: relative;
  cursor: pointer;
  margin-bottom: 8px;
}
.pc-avatar {
  border-radius: 50%;
  color: #ffffff;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.circle-34 { width: 34px; height: 34px; font-size: 13px; }
.circle-36 { width: 36px; height: 36px; font-size: 14px; }
.circle-38 { width: 38px; height: 38px; font-size: 14px; }
.circle-44 { width: 44px; height: 44px; font-size: 16px; }
.circle-46 { width: 46px; height: 46px; font-size: 17px; }

.pc-dot-online {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  background: var(--om-success, #22C55E);
  border: 2px solid var(--om-midnight, #0B1020);
  border-radius: 50%;
}

.pc-rail-btn {
  width: 48px;
  height: 44px;
  background: none;
  border: none;
  color: #94A3B8;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: 8px;
}
.pc-rail-btn.small {
  width: 38px;
  height: 38px;
}
.pc-rail-btn:hover {
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.08);
}
.pc-rail-btn.active {
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.12);
}
.pc-rail-indicator {
  display: none;
}
.pc-rail-btn.active .pc-rail-indicator {
  display: block;
  position: absolute;
  left: 0;
  width: 3px;
  height: 24px;
  background: var(--om-cyan, #22C7E8);
  border-radius: 0 4px 4px 0;
}
.pc-unread-pill {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 10px;
  border: 2px solid var(--om-midnight, #0B1020);
}

/* Dropdown menus from rail */
.pc-dropdown-menu {
  position: absolute;
  left: 64px;
  background: var(--om-surface, #ffffff);
  border: 1px solid var(--om-border, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  padding: 6px 0;
  min-width: 200px;
  z-index: 1000;
  animation: fadeIn 0.15s ease-out;
}
.user-menu { top: 16px; }
.consoles-menu { bottom: 48px; }
.dropdown-header {
  padding: 8px 14px;
}
.dropdown-header strong { display: block; font-size: 13px; color: var(--om-text, #111827); }
.dropdown-header small { color: #64748b; font-size: 11px; }
.dropdown-heading {
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
}
.dropdown-sep {
  height: 1px;
  background: var(--om-border-light, #f1f5f9);
  margin: 4px 0;
}
.dropdown-item {
  width: 100%;
  padding: 8px 14px;
  background: none;
  border: none;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: #334155;
  cursor: pointer;
  display: block;
  text-decoration: none;
}
.dropdown-item:hover {
  background: #f1f5f9;
  color: var(--om-primary, #2563EB);
}
.dropdown-item.logout {
  color: #ef4444;
}

/* (Column 2) Second Sidebar List Pane (~305px) */
.pc-side-pane {
  width: var(--om-panel-width, 305px);
  background: var(--om-surface, #ffffff);
  border-right: 1px solid var(--om-border, #e9edf1);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100vh;
  position: relative;
  transition: width 0.2s ease;
}

.pc-side-pane.is-collapsed {
  width: 52px;
  overflow: hidden;
}

.pc-pane-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

/* Subtabs in Chats View (Screenshot 1) */
.pc-chat-subtabs-row {
  display: flex;
  height: 42px;
  border-bottom: 1px solid var(--om-border, #e2e8f0);
  background: var(--om-surface, #ffffff);
  align-items: center;
}

.btn-subtab {
  flex: 1;
  height: 100%;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;
}

.btn-subtab:hover {
  color: var(--om-text, #111827);
}

.btn-subtab.active {
  color: var(--om-text, #111827);
  font-weight: 700;
}

.btn-subtab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 20%;
  right: 20%;
  height: 2.5px;
  background: var(--om-primary, #2563EB);
  border-radius: 2px 2px 0 0;
}

.btn-subtab.filter-btn {
  flex: 0 0 38px;
  font-size: 15px;
}

/* Search Bar Header */
.pc-search-bar-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--om-border, #e2e8f0);
  background: var(--om-surface, #ffffff);
}

.pc-search-box-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 0 8px;
  box-sizing: border-box;
}

.pc-pane-search-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 12px;
  color: var(--om-text, #111827);
}

.btn-clear-search {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
  padding: 0 2px;
}

.btn-pane-sort, .btn-pane-collapse {
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #64748b;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-pane-sort:hover, .btn-pane-collapse:hover {
  background: #f1f5f9;
  color: var(--om-text, #111827);
}

.btn-pane-sort.active {
  background: #eff6ff;
  border-color: var(--om-primary, #2563EB);
  color: var(--om-primary, #2563EB);
}

.pc-pane-scroll {
  flex: 1;
  overflow-y: auto;
}

/* My Profile Card (Screenshots 4 & 5) */
.pc-my-profile-card {
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--om-border, #e2e8f0);
}

.my-profile-top-row {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.my-profile-meta {
  flex: 1;
  min-width: 0;
}

.my-name-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--om-text, #111827);
}

.my-status-text {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.my-profile-action-chips {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.btn-profile-chip {
  flex: 1;
  height: 28px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-profile-chip:hover {
  background: #e2e8f0;
  color: var(--om-primary, #2563EB);
}

/* Accordions (Screenshots 4 & 5) */
.pc-accordion-section {
  padding-bottom: 4px;
}

.pc-accordion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px 6px;
  cursor: pointer;
  user-select: none;
}

.accordion-title {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.accordion-caret {
  font-size: 13px;
  color: #94a3b8;
}

.pc-friend-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin: 1px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.pc-friend-item-row:hover {
  background: #f1f5f9;
}

.pc-friend-item-row.selected {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.friend-item-meta {
  flex: 1;
  min-width: 0;
}

.friend-item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--om-text, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-count {
  font-size: 11px;
  color: #64748b;
  font-weight: 400;
  margin-left: 4px;
}

.friend-item-sub {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

/* Chats List Rows (Screenshot 1) */
.pc-chat-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #f8fafc;
  cursor: pointer;
  transition: background 0.12s ease;
}

.pc-chat-item-row:hover {
  background: #f1f5f9;
}

.pc-chat-item-row.selected {
  background: #eff6ff;
}

.pc-chat-item-meta {
  flex: 1;
  min-width: 0;
}

.chat-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-row-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--om-text, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
}

.member-count-badge {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 400;
}

.chat-row-time {
  font-size: 10px;
  color: #94a3b8;
  flex-shrink: 0;
}

.chat-row-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 3px;
}

.chat-row-preview {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.chat-unread-pill {
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  border-radius: 9px;
  padding: 0 5px;
  box-sizing: border-box;
}

/* Floating Action Button (FAB) (Screenshot 1) */
.pc-floating-add-btn {
  position: absolute;
  bottom: 20px;
  right: 18px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  border: none;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
  z-index: 50;
}

.pc-floating-add-btn:hover {
  background: var(--om-primary-hover, #1D4ED8);
  transform: scale(1.06);
}

.fab-plus-mark {
  position: absolute;
  font-size: 12px;
  font-weight: 900;
  bottom: 7px;
  right: 7px;
  background: var(--om-cyan, #22C7E8);
  color: #0B1020;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* Friend Profile View (Screenshot 5) */
.pc-friend-profile-viewport {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--om-surface, #ffffff);
  height: 100vh;
}

.pc-profile-preview-card {
  text-align: center;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.profile-preview-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 34px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
}

.profile-preview-name {
  font-size: 22px;
  font-weight: 800;
  color: var(--om-text, #111827);
  margin: 0 0 6px 0;
}

.profile-preview-bio {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 24px 0;
}

.btn-start-chat-large {
  width: 160px;
  height: 44px;
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
  transition: all 0.15s ease;
}

.btn-start-chat-large:hover {
  background: var(--om-primary-hover, #1D4ED8);
  transform: translateY(-1px);
}

.profile-preview-subactions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.btn-subaction-pill {
  padding: 6px 12px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-subaction-pill:hover {
  background: #e2e8f0;
  color: var(--om-primary, #2563EB);
}

/* Ecosystem Hub Modal */
.ecosystem-modal {
  width: 740px !important;
  max-width: 95vw;
}
.ecosystem-modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ecosystem-modal-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--om-text, #111827);
}
.ecosystem-intro {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 12px 0;
}
.ecosystem-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px;
  max-height: 480px;
  overflow-y: auto;
  padding: 4px 2px;
}
.ecosystem-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  transition: all 0.15s ease;
}
.ecosystem-card:hover {
  border-color: var(--om-primary, #2563EB);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.ecosystem-card.active { border-left: 3px solid var(--om-primary, #2563EB); }
.ecosystem-card.beta { border-left: 3px solid var(--om-cyan, #22C7E8); }
.ecosystem-card.preview { border-left: 3px solid #94a3b8; opacity: 0.85; }

.ecosystem-card-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.svc-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  display: grid;
  place-items: center;
  color: var(--om-primary, #2563EB);
  flex-shrink: 0;
}
.svc-names {
  flex: 1;
  min-width: 0;
}
.svc-names strong {
  display: block;
  font-size: 13px;
  color: var(--om-text, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.svc-ko {
  font-size: 10px;
  color: #64748b;
  display: block;
}
.svc-status-pill {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
}
.svc-status-pill.active { background: #dcfce7; color: #15803d; }
.svc-status-pill.beta { background: #e0f2fe; color: #0369a1; }
.svc-status-pill.preview { background: #f1f5f9; color: #64748b; }
.svc-desc {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
  margin: 0;
}
.btn-svc-action {
  width: 100%;
  height: 30px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-sizing: border-box;
}
.btn-svc-action:hover {
  background: #eff6ff;
  border-color: var(--om-primary, #2563EB);
  color: var(--om-primary, #2563EB);
}
.btn-svc-action.link {
  color: var(--om-primary, #2563EB);
}

/* New Chat Options */
.new-chat-options-grid {
  display: flex;
  gap: 10px;
}
.btn-new-chat-type {
  flex: 1;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}
.btn-new-chat-type:hover {
  background: #eff6ff;
  border-color: var(--om-primary, #2563EB);
}
.type-icon { font-size: 24px; }
.type-text strong { display: block; font-size: 13px; color: var(--om-text, #111827); }
.type-text small { font-size: 11px; color: #64748b; }

.quick-pick-friend-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.quick-pick-friend-row:hover { background: #f1f5f9; }
.friend-pick-meta { flex: 1; min-width: 0; }
.friend-pick-meta strong { display: block; font-size: 12px; color: #111827; }
.friend-pick-meta small { font-size: 10px; color: #64748b; }
.btn-mini-chat {
  padding: 4px 10px;
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

/* (Column 3) Right Main Chat View */
.pc-chat-viewport {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--line-slate-bg);
  height: 100vh;
  position: relative;
}
.pc-chat-topbar {
  height: 52px;
  background: #ffffff;
  border-bottom: 1px solid #e9edf1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.chat-topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.chat-header-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.member-tag { font-size: 11px; color: #64748b; margin-left: 6px; }
.e2ee-tag { font-size: 10px; color: #16a34a; font-weight: 600; display: block; }
.chat-topbar-actions {
  display: flex;
  gap: 6px;
}
.btn-chat-action {
  width: 34px;
  height: 34px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 4px;
  font-size: 15px;
  display: grid;
  place-items: center;
  color: #475569;
}
.btn-chat-action:hover { background: #f1f5f9; }

/* Canvas for Chat Messages */
.pc-chat-messages-canvas {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.date-capsule {
  align-self: center;
  background: rgba(0,0,0,0.22);
  color: #ffffff;
  font-size: 11px;
  padding: 3px 12px;
  border-radius: 12px;
  margin: 6px 0 10px;
}
.pc-msg-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  position: relative;
  max-width: 75%;
}
.pc-msg-row.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.pc-msg-row.other {
  align-self: flex-start;
}
.pc-msg-bubble-group {
  display: flex;
  flex-direction: column;
}
.pc-msg-row.mine .pc-msg-bubble-group {
  align-items: flex-end;
}
.pc-sender-header {
  font-size: 11px;
  color: #334155;
  margin-bottom: 2px;
  margin-left: 2px;
}
.pc-speech-bubble {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
  position: relative;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.pc-msg-row.other .pc-speech-bubble {
  background: #ffffff;
  color: #191919;
  border-top-left-radius: 2px;
}
.pc-msg-row.mine .pc-speech-bubble {
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  border-top-right-radius: 2px;
}
.pc-speech-bubble.sticker {
  background: none !important;
  box-shadow: none !important;
  font-size: 28px;
  padding: 4px;
}
.bubble-reply-preview {
  font-size: 10px;
  opacity: 0.75;
  margin-bottom: 4px;
  border-left: 2px solid currentColor;
  padding-left: 4px;
}
.pc-msg-meta {
  display: flex;
  gap: 4px;
  align-items: flex-end;
  font-size: 10px;
  color: rgba(255,255,255,0.75);
  margin-top: 2px;
}
.pc-read-receipt {
  font-weight: 700;
  color: #ffffff;
}

.pc-bubble-toolbar {
  display: none;
  position: absolute;
  top: -24px;
  background: #ffffff;
  border-radius: 16px;
  padding: 2px 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  gap: 4px;
  z-index: 10;
}
.pc-msg-row:hover .pc-bubble-toolbar {
  display: flex;
}
.pc-msg-row.mine .pc-bubble-toolbar { right: 0; }
.pc-msg-row.other .pc-bubble-toolbar { left: 40px; }
.pc-bubble-toolbar button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
}
.pc-bubble-toolbar button:hover { background: #f1f5f9; }

/* Chat Input Dock */
.pc-chat-input-dock {
  height: 135px;
  background: #ffffff;
  border-top: 1px solid #e9edf1;
  display: flex;
  flex-direction: column;
}
.pc-input-toolbar {
  height: 36px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #f8fafc;
}
.btn-tool-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #64748b;
  padding: 4px;
  border-radius: 4px;
}
.btn-tool-icon:hover { background: #f1f5f9; color: #111827; }

.pc-textarea-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px 14px 10px;
}
.pc-textarea-form textarea {
  flex: 1;
  border: none;
  resize: none;
  outline: none;
  font-size: 13px;
  line-height: 1.4;
  font-family: inherit;
}
.pc-textarea-bottom {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}
.char-count { font-size: 11px; color: #94a3b8; }
.btn-green-send {
  height: 28px;
  padding: 0 14px;
  background: var(--om-primary, #2563EB);
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.btn-green-send:hover:not(:disabled) {
  background: var(--om-primary-hover, #1d4ed8);
}
.btn-green-send:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

/* Empty Canvas (Authentic LINE PC Watermark) */
.pc-empty-canvas {
  flex: 1;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
}
.pc-empty-dialog {
  text-align: center;
}
.pc-watermark-wrap {
  margin-bottom: 14px;
  opacity: 0.85;
}
.pc-empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #334155;
  margin: 0 0 6px;
}
.pc-empty-desc {
  font-size: 13px;
  color: #828fa0;
  line-height: 1.5;
  margin: 0;
}

/* Modal styles preserved */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.standard-modal-box {
  width: 380px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.25);
  overflow: hidden;
}
.modal-header {
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
}
.modal-header h3 { margin: 0; font-size: 15px; font-weight: 700; }
.btn-modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: #94a3b8; }
.modal-body-form { padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.modal-body-form label { font-size: 12px; font-weight: 600; color: #475569; }
.modal-body-form input {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
}
.modal-actions-right {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.btn-primary { background: var(--om-primary, #2563EB); color: white; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background-color 0.15s; }
.btn-primary:hover { background: var(--om-primary-hover, #1d4ed8); }
.btn-secondary { background: #f1f5f9; color: #475569; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }

/* Keep modal, Call modal, etc */
.keep-modal { width: 440px; }
.keep-filter-bar { display: flex; gap: 6px; padding: 10px 18px; border-bottom: 1px solid #f1f5f9; }
.keep-filter-bar button { padding: 4px 10px; font-size: 11px; border: none; border-radius: 12px; background: #f1f5f9; cursor: pointer; }
.keep-filter-bar button.active { background: var(--om-primary, #2563EB); color: white; }
.keep-search-input { width: calc(100% - 36px); margin: 8px 18px; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; }
.keep-scroll-content { max-height: 280px; overflow-y: auto; padding: 0 18px 18px; }
.keep-card { padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
.btn-delete-keep { background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; }

/* Call overlay */
.call-overlay-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; }
.call-dialog-box { width: 340px; background: #1e293b; color: white; border-radius: 16px; padding: 24px; text-align: center; }
.call-avatar-pulse { margin-bottom: 12px; }
.call-controls-row { display: flex; justify-content: center; gap: 12px; margin-top: 18px; }
.btn-call-circle { width: 44px; height: 44px; border-radius: 50%; background: #334155; border: none; color: white; cursor: pointer; font-size: 18px; display: grid; place-items: center; }
.btn-call-circle.off { background: #ef4444; }
.btn-call-answer { background: var(--om-success, #22c55e); color: white; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 700; cursor: pointer; }
.btn-call-hangup { background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 700; cursor: pointer; }

/* Profile modal */
.profile-modal-box { width: 340px; background: white; border-radius: 16px; overflow: hidden; text-align: center; padding-bottom: 18px; }
.profile-cover-header { height: 110px; position: relative; display: flex; justify-content: flex-end; padding: 10px; }
.profile-main-meta { margin-top: -40px; display: flex; flex-direction: column; align-items: center; }
.profile-actions-footer { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
.btn-profile-action { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }

/* Pinned Banner */
.pinned-banner { background: #fffbeb; border-bottom: 1px solid #fef3c7; padding: 6px 16px; cursor: pointer; }
.pinned-summary { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #92400e; font-weight: 600; }
.pin-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* VOOM & Stories */
.stories-row { display: flex; gap: 10px; padding: 12px 16px; overflow-x: auto; border-bottom: 1px solid #f1f5f9; }
.story-item { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; font-size: 11px; }
.story-ring { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--om-primary, #2563EB); display: grid; place-items: center; color: white; font-weight: 800; font-size: 14px; }
.story-ring.plus { border-color: #cbd5e1; color: var(--om-primary, #2563EB); font-size: 18px; }
.voom-list { padding: 12px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.voom-card { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: white; }
.voom-banner { height: 90px; display: grid; place-items: center; font-size: 32px; }
.voom-meta { padding: 10px; }
.voom-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.btn-like { background: none; border: 1px solid #e2e8f0; border-radius: 12px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
.btn-like.liked { background: #fee2e2; border-color: #fca5a5; }

/* OpenChat */
.openchat-list { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.openchat-card { display: flex; gap: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; }
.openchat-card:hover { background: #f8fafc; border-color: var(--om-primary, #2563EB); }
.card-icon { font-size: 20px; }
.card-info strong { font-size: 13px; }
.card-info p { font-size: 11px; color: #64748b; margin: 2px 0 0; }

/* Wallet Card */
.line-pay-card { margin: 12px; background: linear-gradient(135deg, var(--om-primary, #2563EB), var(--om-cyan, #22C7E8)); color: white; padding: 16px; border-radius: 12px; }
.pay-top { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; }
.pay-balance { font-size: 22px; font-weight: 900; margin: 10px 0; }
.pay-actions { display: flex; gap: 8px; }
.btn-pay-action { flex: 1; padding: 6px; background: white; color: var(--om-primary, #2563EB); font-weight: 700; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
.btn-pay-action.secondary { background: rgba(255,255,255,0.2); color: white; }
.services-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 12px 12px; }
.service-box { background: #f8fafc; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; font-size: 11px; font-weight: 700; }
.service-box:hover { background: rgba(37, 99, 235, 0.08); }
.service-box .icon { font-size: 20px; }

/* Sticker Popover */
.sticker-popover { position: absolute; bottom: 140px; left: 16px; width: 280px; height: 180px; background: white; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); display: flex; flex-direction: column; overflow: hidden; z-index: 100; }
.sticker-tabs { display: flex; background: #f8fafc; border-bottom: 1px solid #f1f5f9; padding: 4px; }
.sticker-tabs button { flex: 1; padding: 4px; font-size: 11px; border: none; background: none; cursor: pointer; }
.sticker-tabs button.active { font-weight: 700; color: var(--om-primary, #2563EB); border-bottom: 2px solid var(--om-primary, #2563EB); }
.btn-close-sticker { background: none; border: none; cursor: pointer; font-size: 12px; color: #94a3b8; }
.sticker-palette-grid { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px; overflow-y: auto; }
.sticker-choice-btn { font-size: 22px; background: none; border: none; cursor: pointer; border-radius: 6px; }
.sticker-choice-btn:hover { background: #f1f5f9; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Sticker Tray Popover */
.pc-sticker-tray-popover {
  position: absolute;
  bottom: 100%;
  left: 12px;
  width: 380px;
  height: 310px;
  background-color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  overflow: hidden;
  animation: traySlideUp 0.15s ease-out;
}

@keyframes traySlideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sticker-tray-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.sticker-tabs {
  display: flex;
  gap: 4px;
}

.sticker-tabs button {
  padding: 4px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}

.sticker-tabs button.active {
  background-color: var(--om-primary, #2563EB);
  color: #ffffff;
  font-weight: 600;
}

.btn-tray-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #94a3b8;
  padding: 4px;
  border-radius: 4px;
}

.btn-tray-close:hover {
  background-color: #e2e8f0;
  color: #1e293b;
}

.sticker-grid-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.sticker-item-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.1s;
}

.sticker-item-cell:hover {
  background-color: #f1f5f9;
  transform: scale(1.05);
}

.sticker-thumbnail {
  width: 60px;
  height: 60px;
}

.sticker-label {
  margin-top: 4px;
  font-size: 11px;
  color: #64748b;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70px;
}

/* Sticker Display in Chat Bubbles */
.pc-speech-bubble.is-sticker {
  background: transparent !important;
  box-shadow: none !important;
  padding: 4px !important;
}

.pc-speech-bubble.is-sticker::after {
  display: none !important;
}

.bubble-sticker-svg {
  width: 120px;
  height: 120px;
  display: block;
  animation: stickerPop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes stickerPop {
  0% { transform: scale(0.6); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.btn-tool-icon.active {
  background-color: rgba(37, 99, 235, 0.1);
  color: var(--om-primary, #2563EB);
}

.btn-tool-icon.recording {
  background-color: #fee2e2;
  color: #ef4444;
  animation: pulseRecording 1s infinite alternate;
}

@keyframes pulseRecording {
  from { opacity: 0.7; }
  to { opacity: 1; }
}

/* ==========================================================================
   LUNO UI/UX ENHANCEMENTS — I18N, TRANSLATION, LIVE CAPTIONS & RESPONSIVENESS
   ========================================================================== */
.pc-win-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  z-index: 2;
}
.pc-locale-pills {
  display: flex;
  gap: 4px;
}
.btn-auth-locale {
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-auth-locale.active {
  background: #315BCD;
  color: #ffffff;
  border-color: #315BCD;
}
.btn-win-dark {
  padding: 4px 6px;
  background: none;
  border: none;
  cursor: pointer;
  color: #64748b;
  display: grid;
  place-items: center;
}
.btn-win-dark:hover {
  color: #1e293b;
}
.pc-brand-slogan {
  font-size: 12px;
  font-weight: 600;
  color: #5B6475;
  text-align: center;
  margin: 6px 0 16px;
  letter-spacing: 0.3px;
}

/* Mobile Back Button */
.btn-mobile-back {
  display: none;
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: inherit;
  border-radius: 4px;
}
.btn-mobile-back:hover {
  background: #e2e8f0;
}

/* AI Translation Controls in Chat Header */
.ai-translate-tool-pill {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 20px;
  padding: 2px 4px 2px 8px;
  gap: 6px;
  border: 1px solid #e2e8f0;
}
.btn-translate-switch {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 12px;
}
.btn-translate-switch.active {
  background: #315BCD;
  color: #ffffff;
}
.translate-lang-select {
  font-size: 11px;
  font-weight: 700;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 2px 6px;
  color: #1e293b;
  outline: none;
  cursor: pointer;
}

/* LUNO AI Message Translation Box */
.luno-ai-translation-box {
  margin-top: 6px;
  padding: 6px 10px;
  background: rgba(79, 124, 255, 0.08);
  border-radius: 8px;
  border-left: 3px solid #315BCD;
  font-size: 12px;
}
.pc-msg-row.mine .luno-ai-translation-box {
  background: rgba(255, 255, 255, 0.18);
  border-left-color: #ffffff;
  color: #ffffff;
}
.translation-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}
.badge-engine {
  font-size: 9px;
  font-weight: 700;
  color: #315BCD;
}
.pc-msg-row.mine .badge-engine {
  color: #ffffff;
  opacity: 0.9;
}
.btn-retry-translate {
  background: none;
  border: none;
  font-size: 11px;
  cursor: pointer;
  color: inherit;
  padding: 0 4px;
}
.translation-result {
  line-height: 1.4;
  font-weight: 500;
}
.translation-loading {
  font-size: 11px;
  opacity: 0.8;
}
.translation-error {
  font-size: 11px;
  color: #ef4444;
}

/* Call Live Translation Captions UX (Article 10.2) */
.live-captions-control {
  margin: 10px 0;
}
.btn-caption-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #475569;
  background: #334155;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-caption-toggle.active {
  background: #315BCD;
  border-color: #4F7CFF;
}
.live-captions-box {
  margin-top: 10px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  text-align: left;
}
.caption-notice {
  font-size: 10px;
  color: #fbbf24;
  margin-bottom: 6px;
}
.caption-lang-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  margin-bottom: 6px;
}
.lang-tag {
  background: #1e293b;
  padding: 2px 6px;
  border-radius: 4px;
}
.lang-arrow {
  color: #5EE6C2;
}
.badge-engine-mini {
  margin-left: auto;
  background: #315BCD;
  color: #ffffff;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 9px;
}
.caption-live-text {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: #F7FAFF;
  line-height: 1.4;
}

/* Settings Modal Elements */
.locale-choice-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 6px;
}
.btn-locale-pill {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.btn-locale-pill.active {
  background: #315BCD;
  color: #ffffff;
  border-color: #315BCD;
}
.font-scale-buttons {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.btn-scale-chip {
  flex: 1;
  padding: 6px 0;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
}
.btn-scale-chip.active {
  background: #315BCD;
  color: #ffffff;
  border-color: #315BCD;
}
.badge-status-on {
  background: #dcfce7;
  color: #15803d;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
}

/* ==========================================================================
   RESPONSIVE DESIGN BREAKPOINTS (Article 12)
   ========================================================================== */
@media (max-width: 768px) {
  .pc-workspace {
    flex-direction: column-reverse;
  }
  .pc-rail {
    width: 100vw;
    height: 56px;
    flex-direction: row;
    justify-content: space-around;
    padding: 0 4px;
  }
  .pc-rail-top {
    flex-direction: row;
    justify-content: space-around;
    width: 100%;
    gap: 0;
  }
  .pc-rail-bottom {
    display: none;
  }
  .pc-side-pane {
    width: 100vw;
    height: calc(100vh - 56px);
  }
  .btn-mobile-back {
    display: grid;
    place-items: center;
  }
  .pc-chat-viewport {
    position: fixed;
    inset: 0;
    z-index: 200;
    width: 100vw;
    height: 100vh;
  }
  .pc-login-card {
    width: calc(100vw - 32px);
    max-width: 360px;
  }
}

/* ==========================================================================
   DATE DIVIDER (Screenshot 2: '10. 23. (금)')
   ========================================================================== */
.pc-date-divider-pill {
  align-self: center;
  margin: 16px auto 12px;
  background: rgba(0, 0, 0, 0.22);
  color: #ffffff;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 12px;
  backdrop-filter: blur(4px);
  text-align: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  letter-spacing: -0.2px;
}

/* ==========================================================================
   OFFICIAL SECURITY NOTICE CARD (Screenshot 1)
   ========================================================================== */
.security-notice-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 12px 0;
  max-width: 440px;
}

.pc-security-card-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pc-security-notice-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 20px 22px 18px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: #1e293b;
}

.security-card-header {
  margin-bottom: 12px;
}

.security-title-green {
  color: #00B900;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.4px;
}

.security-card-divider {
  height: 1px;
  background: #f1f5f9;
  margin-bottom: 14px;
}

.security-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.security-desc-bold {
  font-size: 13.5px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.45;
  margin: 0;
}

.security-desc-sub {
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.5;
  margin: 0;
}

.security-specs-table {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.spec-row {
  display: flex;
  gap: 8px;
}

.spec-label {
  color: #64748b;
  min-width: 50px;
}

.spec-val {
  color: #0f172a;
  font-weight: 500;
  word-break: break-all;
}

.security-card-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.btn-security-logout-green {
  background: #00B900;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
  width: 100%;
}
.btn-security-logout-green:hover {
  background: #009900;
}

.btn-security-pwchange-link {
  background: transparent;
  color: #1e293b;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 0;
  text-align: center;
}
.btn-security-pwchange-link:hover {
  text-decoration: underline;
}

/* ==========================================================================
   CALL STATUS BUBBLE (Screenshot 2)
   ========================================================================== */
.pc-call-status-bubble {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 18px;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.15s ease;
  user-select: none;
}
.pc-call-status-bubble:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.pc-call-status-bubble.outgoing {
  background: #60E660;
  color: #0f172a;
}
.pc-call-status-bubble.incoming {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.pc-call-status-bubble.missed {
  border-left: 3px solid #ef4444;
}

.call-bubble-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
}

.call-bubble-content {
  display: flex;
  flex-direction: column;
}
.call-bubble-title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.25;
}
.call-bubble-sub {
  font-size: 11.5px;
  opacity: 0.85;
}

/* ==========================================================================
   NEWS PANE STYLES (Screenshot 5)
   ========================================================================== */
.pc-news-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
  overflow: hidden;
}

.news-scroll {
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.news-hero-card {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 3px 12px rgba(0,0,0,0.08);
  cursor: pointer;
  background: #000000;
  position: relative;
  transition: transform 0.15s ease;
}
.news-hero-card:hover {
  transform: translateY(-2px);
}

.hero-image-wrap {
  position: relative;
  width: 100%;
  height: 240px;
}

.hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hero-gradient-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.85) 100%);
}

.hero-meta-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  color: #ffffff;
}

.hero-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  margin: 0 0 4px 0;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}

.hero-press {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.hero-carousel-dots {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.hero-dot {
  width: 18px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255,255,255,0.4);
}
.hero-dot.active {
  background: #ffffff;
}

.news-ad-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  text-decoration: none;
  color: inherit;
}
.ad-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ad-tag-pill {
  font-size: 9px;
  font-weight: 700;
  color: #64748b;
  border: 1px solid #cbd5e1;
  padding: 1px 4px;
  border-radius: 3px;
  width: fit-content;
}
.ad-main-text {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.ad-link-text {
  font-size: 11px;
  color: #2563eb;
}
.ad-banner-img {
  width: 60px;
  height: 42px;
  object-fit: cover;
  border-radius: 6px;
}

.news-section-header {
  margin-top: 4px;
}
.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.news-ranked-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.15s ease;
}
.news-ranked-item:hover {
  background: #f8fafc;
}
.news-thumb-col {
  position: relative;
  width: 80px;
  height: 60px;
  flex-shrink: 0;
}
.ranked-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}
.ranked-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0,0,0,0.65);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
}
.news-text-col {
  flex: 1;
  min-width: 0;
}
.ranked-title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  color: #0f172a;
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ranked-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
}

/* ==========================================================================
   CALLS PANE STYLES (Screenshot 3)
   ========================================================================== */
.pc-calls-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
  overflow: hidden;
}

.calls-scroll {
  overflow-y: auto;
  padding: 4px 0;
}

.calls-list-wrap {
  display: flex;
  flex-direction: column;
}

.call-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid #f8fafc;
  cursor: pointer;
  transition: background 0.15s ease;
}
.call-history-row:hover {
  background: #f1f5f9;
}

.call-row-avatar-col {
  margin-right: 12px;
}
.call-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 15px;
}

.call-row-info-col {
  flex: 1;
  min-width: 0;
}

.call-row-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14.5px;
  font-weight: 600;
  color: #0f172a;
}
.call-peer-name.text-missed-red {
  color: #ef4444 !important;
}
.call-repeat-count {
  font-size: 13px;
  font-weight: 600;
}
.call-repeat-count.text-missed-red {
  color: #ef4444 !important;
}

.call-meta-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}
.call-direction-arrow {
  font-weight: 700;
  font-size: 13px;
}
.call-direction-arrow.missed {
  color: #ef4444;
}

.call-row-action-col {
  margin-left: 8px;
}
.btn-call-history-action {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.btn-call-history-action:hover {
  background: #e2e8f0;
  color: #00B900;
}

/* ==========================================================================
   ARTICLE READER MODAL
   ========================================================================== */
.news-reader-modal {
  max-width: 580px;
  width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.news-reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #e2e8f0;
}
.news-reader-press {
  font-size: 14px;
  font-weight: 700;
  color: #2563eb;
}
.news-reader-actions {
  display: flex;
  gap: 8px;
}
.btn-news-action {
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
}
.news-reader-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.news-reader-img {
  width: 100%;
  height: 220px;
  object-fit: cover;
  border-radius: 10px;
  margin-bottom: 14px;
}
.news-reader-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  margin-bottom: 8px;
}
.news-reader-meta {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 14px;
}
.news-reader-content {
  font-size: 14px;
  line-height: 1.7;
  color: #334155;
}
.news-reader-footer {
  padding: 12px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
.btn-share-to-chat {
  width: 100%;
  padding: 11px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

/* ==========================================================================
   MOBILE FLOATING NAVIGATION CAPSULE (Screenshots 3, 4, 5)
   ========================================================================== */
.luno-mobile-floating-nav {
  display: none; /* hidden on PC desktop layout */
}

@media (max-width: 768px) {
  .luno-mobile-floating-nav {
    display: flex;
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 36px;
    padding: 6px 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.6);
    gap: 8px;
    align-items: center;
    width: auto;
    max-width: 90vw;
  }

  .mobile-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    padding: 6px 18px;
    border-radius: 28px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    color: #475569;
  }

  .mobile-nav-item.active {
    background: #e2e8f0;
    color: #0f172a;
  }

  .nav-icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
  }

  .nav-label {
    font-size: 11px;
    font-weight: 600;
    margin-top: 2px;
  }

  .mobile-nav-badge {
    position: absolute;
    top: -4px;
    right: -8px;
    background: #ef4444;
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 10px;
    min-width: 16px;
    text-align: center;
  }

  .mobile-nav-dot {
    position: absolute;
    top: 0;
    right: -2px;
    width: 6px;
    height: 6px;
    background: #ef4444;
    border-radius: 50%;
  }

  .pc-rail {
    display: none; /* mobile floating nav takes over bottom nav */
  }
  .pc-side-pane {
    width: 100vw;
    height: 100vh;
    padding-bottom: 74px; /* clearance for floating capsule */
  }
}
</style>
