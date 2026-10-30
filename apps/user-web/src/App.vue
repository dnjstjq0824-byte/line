<script setup lang="ts">
import LineIcon from './components/LineIcon.vue'
import LineContextMenu, { type ContextMenuItem } from './components/LineContextMenu.vue'
import { LINE_STICKERS, type LineSticker } from './line-stickers'
import { playSendSound, playReceiveSound } from './sound-effects'
import { computed, onBeforeUnmount, ref } from 'vue'
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

// --- Auth & Session State ---
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

// --- Navigation Tabs ---
// 'home' (Friends/Profile), 'chats', 'voom' (Timeline/Stories), 'openchat', 'wallet' (Pay/Services)
const activeNav = ref<'home' | 'chats' | 'voom' | 'openchat' | 'wallet'>('chats')
const activeTheme = ref<'mint' | 'ocean' | 'sunset' | 'sakura' | 'midnight'>('mint')
const darkMode = ref(false)

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

const activeStickerCategory = ref<'All' | 'Brown' | 'Cony' | 'Sally'>('All')

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

// Format time
function formatTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// Compute total unread count
const totalUnreadCount = computed(() => chats.value.reduce((sum, c) => sum + (c.unread_count || 0), 0))

// Chat search / filter
const chatFilter = ref<'all' | 'direct' | 'group' | 'unread'>('all')
const filteredChats = computed(() => {
  return chats.value.filter(c => {
    if (chatFilter.value === 'direct' && c.kind !== 'direct') return false
    if (chatFilter.value === 'group' && c.kind !== 'group') return false
    if (chatFilter.value === 'unread' && (!c.unread_count || c.unread_count === 0)) return false
    if (searchKeyword.value.trim()) {
      const q = searchKeyword.value.toLowerCase()
      return (c.title || '').toLowerCase().includes(q) || (c.last_message?.body || '').toLowerCase().includes(q)
    }
    return true
  })
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

async function startQrLoginChallenge() {
  await wrap(async () => {
    const res = await request<{ challenge_id: string; qr_token: string }>('/api/v1/auth/qr/challenge', null, 'POST', {})
    qrChallengeID.value = res.challenge_id
    qrToken.value = res.qr_token
    note.value = '모바일 LINE 설정 화면에서 QR 코드 번호를 승인하세요.'
    if (qrPollInterval) clearInterval(qrPollInterval)
    qrPollInterval = setInterval(async () => {
      try {
        const p = await request<any>('/api/v1/auth/qr/poll', null, 'POST', {
          challenge_id: qrChallengeID.value,
          qr_token: qrToken.value,
          device_name: 'LINE Web QR Client',
          platform: 'web'
        })
        if (p && p.access_token) {
          if (qrPollInterval) clearInterval(qrPollInterval)
          qrPollInterval = null
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
    chats.value = res.conversations || []
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
    pinnedList.value = pinsRes.pins || []
    if (messages.value.length > 0) {
      const last = messages.value[messages.value.length - 1]
      await api(`/api/v1/conversations/${convId}/read`, 'POST', { sequence: last.sequence })
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
      'linear-gradient(135deg, #06C755, #0ea5e9)',
      'linear-gradient(135deg, #f97316, #ec4899)',
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

    <!-- 1. AUTH SCREEN: LINE PC Desktop Login Window -->
    <main v-if="!currentUser" class="pc-auth-viewport">
      <div class="pc-login-card">
        <!-- Title bar with window controls -->
        <div class="pc-window-bar">
          <div class="pc-win-dots">
            <span class="dot close"></span>
            <span class="dot min"></span>
            <span class="dot max"></span>
          </div>
          <span class="pc-win-title">LINE</span>
        </div>

        <div class="pc-login-body">
          <!-- Logo Header -->
          <div class="pc-brand-header">
            <div class="pc-line-badge">LINE</div>
          </div>

          <!-- Login Method Tabs -->
          <div class="pc-auth-nav-tabs">
            <button :class="{ active: authTab === 'email' }" @click="authTab = 'email'">이메일 로그인</button>
            <button :class="{ active: authTab === 'qr' }" @click="authTab = 'qr'; startQrLoginChallenge()">QR코드 로그인</button>
          </div>

          <!-- Email Login & Sign-up -->
          <div v-if="authTab === 'email'" class="pc-tab-content">
            <form class="pc-login-form" @submit.prevent="authAction">
              <div class="pc-input-wrap">
                <input v-model="email" type="email" placeholder="이메일 주소" required autocomplete="username" />
              </div>
              <div v-if="registerMode" class="pc-input-wrap">
                <input v-model="displayName" type="text" placeholder="이름 (닉네임)" required />
              </div>
              <div class="pc-input-wrap">
                <input v-model="password" type="password" placeholder="비밀번호" required autocomplete="current-password" />
              </div>

              <div class="pc-form-helpers">
                <label class="pc-remember-check">
                  <input type="checkbox" checked />
                  <span>자동 로그인</span>
                </label>
                <button type="button" class="btn-register-toggle" @click="registerMode = !registerMode">
                  {{ registerMode ? '로그인으로 돌아가기' : '새 계정 만들기' }}
                </button>
              </div>

              <button class="btn-pc-submit" type="submit">
                {{ registerMode ? '회원가입' : '로그인' }}
              </button>
            </form>

            <!-- Quick Demo Accounts -->
            <div class="pc-demo-section">
              <div class="demo-label">원클릭 테스트 계정:</div>
              <div class="demo-buttons-group">
                <button class="btn-demo-chip" @click="quickDemoLogin('user@line.local', 'LineUser#2026!')">일반 유저</button>
                <button class="btn-demo-chip" @click="quickDemoLogin('alice@line-test.local', 'AliceStrongPass#2026')">앨리스</button>
                <button class="btn-demo-chip" @click="quickDemoLogin('admin@line.local', 'LineAdmin#2026!')">관리자</button>
              </div>
            </div>
          </div>

          <!-- QR Code Login -->
          <div v-else class="pc-tab-content qr-mode">
            <div class="pc-qr-box">
              <svg viewBox="0 0 100 100" width="130" height="130" fill="#111827">
                <path d="M10 10h30v30h-30z M16 16v18h18v-18z M22 22h6v6h-6z M60 10h30v30h-30z M66 16v18h18v-18z M72 22h6v6h-6z M10 60h30v30h-30z M16 66v18h18v-18z M22 72h6v6h-6z M50 15h6v12h-6z M70 50h10v10h-10z M50 50h10v10h-10z M60 65h10v15h-10z M80 65h10v25h-10z M50 80h10v10h-10z" />
              </svg>
            </div>
            <p class="qr-guide">스마트폰의 LINE 앱에서<br><strong>설정 &gt; QR코드</strong>로 스캔하여 로그인하세요.</p>
            <div v-if="qrChallengeID" class="qr-details">
              <small>Challenge: {{ qrChallengeID.slice(0, 8) }}... | Token: {{ qrToken.slice(0, 8) }}...</small>
            </div>
            <button class="btn-qr-reload" @click="startQrLoginChallenge">새로고침</button>
          </div>
        </div>
      </div>
    </main>

    <!-- 2. AUTHENTIC LINE PC DESKTOP MESSENGER (3-Pane Workspace) -->
    <main v-else class="pc-workspace">
      <!-- (Column 1) Sleek Dark Charcoal Dock (60px) -->
      <nav class="pc-rail">
        <div class="pc-rail-top">
          <!-- Current User Profile Avatar with Online Dot -->
          <div class="pc-user-avatar-trigger" title="내 프로필" @click="showUserMenu = !showUserMenu">
            <div class="pc-avatar circle-36" :style="{ background: currentUser.avatar_color || '#06C755' }">
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
            <button class="dropdown-item" @click="showSettingsModal = true">⚙️ 환경설정</button>
            <button class="dropdown-item" @click="showKeepModal = true">💾 Keep 보관함</button>
            <div class="dropdown-sep"></div>
            <button class="dropdown-item logout" @click="logout">로그아웃</button>
          </div>

          <!-- Nav 1: Friends (친구) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'home' }"
            title="친구"
            @click="activeNav = 'home'"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="friends" :size="22" />
          </button>

          <!-- Nav 2: Chats (대화) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'chats' }"
            title="대화"
            @click="activeNav = 'chats'"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="chats" :size="22" />
            <span v-if="totalUnreadCount > 0" class="pc-unread-pill">{{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}</span>
          </button>

          <!-- Nav 3: VOOM -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'voom' }"
            title="LINE VOOM"
            @click="activeNav = 'voom'"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="voom" :size="22" />
          </button>

          <!-- Nav 4: OpenChat (오픈채팅) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'openchat' }"
            title="오픈채팅"
            @click="activeNav = 'openchat'"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="openchat" :size="22" />
          </button>

          <!-- Nav 5: Wallet & Services (더보기 / Pay) -->
          <button
            class="pc-rail-btn"
            :class="{ active: activeNav === 'wallet' }"
            title="LINE Pay / 서비스"
            @click="activeNav = 'wallet'"
          >
            <span class="pc-rail-indicator"></span>
            <LineIcon name="wallet" :size="22" />
          </button>
        </div>

        <div class="pc-rail-bottom">
          <!-- Keep Vault Button -->
          <button class="pc-rail-btn small" title="Keep 메모 보관함" @click="showKeepModal = true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <!-- Keep Button -->
          <button class="pc-rail-btn small" title="Keep 보관함" @click="showKeepModal = true">
            <LineIcon name="keep" :size="20" />
          </button>

          <!-- Consoles Menu Button (...) -->
          <div class="rail-more-wrapper">
            <button class="pc-rail-btn small" title="Enterprise 콘솔 및 바로가기" @click="showConsolesMenu = !showConsolesMenu">
              <LineIcon name="more" :size="20" />
            </button>

            <!-- Consoles Dropdown Popover -->
            <div v-if="showConsolesMenu" class="pc-dropdown-menu consoles-menu" @click="showConsolesMenu = false">
              <div class="dropdown-heading">🏢 Enterprise 관리 콘솔</div>
              <a href="./admin/" target="_blank" class="dropdown-item">👑 관리자 콘솔 (Admin)</a>
              <a href="./partner/" target="_blank" class="dropdown-item">🏢 파트너 콘솔 (Official)</a>
              <a href="./developer/" target="_blank" class="dropdown-item">💻 개발자 콘솔 (Developers)</a>
              <a href="./creator/" target="_blank" class="dropdown-item">🎨 크리에이터 마켓</a>
              <a href="./ads/" target="_blank" class="dropdown-item">📢 광고주 센터</a>
              <div class="dropdown-sep"></div>
              <button class="dropdown-item" @click="showSettingsModal = true">⚙️ 설정</button>
              <button class="dropdown-item logout" @click="logout">로그아웃</button>
            </div>
          </div>

          <!-- Settings Button -->
          <button class="pc-rail-btn small" title="환경설정" @click="showSettingsModal = true">
            <LineIcon name="settings" :size="20" />
          </button>
        </div>
      </nav>

      <!-- (Column 2) Second Sidebar List Pane (310px) -->
      <aside class="pc-side-pane">
        <!-- VIEW 1: FRIENDS (친구) -->
        <div v-if="activeNav === 'home'" class="pc-pane-body">
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">친구</h2>
            <div class="pc-pane-tools">
              <button class="btn-pc-header-tool" title="친구 추가" @click="showAddFriendModal = true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              </button>
            </div>
          </div>

          <!-- Clean Search Input -->
          <div class="pc-search-box">
            <div class="pc-search-inner">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#999" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input v-model="searchKeyword" placeholder="이름, 공식 계정 검색" />
              <button v-if="searchKeyword" class="btn-search-clear" @click="searchKeyword = ''">✕</button>
            </div>
          </div>

          <!-- Friends List Scroll Area -->
          <div class="pc-pane-scroll">
            <!-- My Profile Card -->
            <div class="pc-my-card" @click="activeProfileUser = currentUser">
              <div class="pc-avatar circle-46" :style="{ background: currentUser.avatar_color || '#06C755' }">
                {{ currentUser.display_name.slice(0, 1) }}
              </div>
              <div class="pc-card-meta">
                <div class="name-line">{{ currentUser.display_name }}</div>
                <div class="status-line">{{ currentUser.status_message || '상태메시지를 설정해보세요' }}</div>
              </div>
            </div>

            <!-- Birthday Category -->
            <div class="pc-category">
              <div class="category-title">생일인 친구</div>
              <div class="pc-row-item" @click="startDirectChat({ id: '00000000-0000-0000-0000-000000000003', display_name: 'Alice Kim' })">
                <div class="pc-avatar circle-38" style="background:#f97316">A</div>
                <div class="pc-row-meta">
                  <div class="row-name">Alice Kim 🎂</div>
                  <div class="row-desc">오늘 생일입니다 🎉</div>
                </div>
              </div>
            </div>

            <!-- Official Accounts Category -->
            <div class="pc-category">
              <div class="category-title">공식 계정 {{ officialAccounts.length }}</div>
              <div
                v-for="oa in officialAccounts"
                :key="oa.id"
                class="pc-row-item"
                @click="startDirectChat({ id: oa.id, display_name: oa.name, official: true })"
              >
                <div class="pc-avatar circle-38" :style="{ background: oa.color || '#06C755' }">
                  {{ oa.name.slice(0, 1) }}
                </div>
                <div class="pc-row-meta">
                  <div class="row-name">{{ oa.name }} <span class="badge-verified">✓</span></div>
                  <div class="row-desc">{{ oa.description }}</div>
                </div>
              </div>
            </div>

            <!-- Friends Category -->
            <div class="pc-category">
              <div class="category-title">친구 {{ friends.length }}</div>
              <div
                v-for="f in friends"
                :key="f.id"
                class="pc-row-item"
                @click="startDirectChat(f)"
                @contextmenu.prevent="openFriendContextMenu($event, f)"
              >
                <div class="pc-avatar circle-38" :style="{ background: f.avatar_color || '#0ea5e9' }">
                  {{ f.display_name.slice(0, 1) }}
                </div>
                <div class="pc-row-meta">
                  <div class="row-name">{{ f.display_name }}</div>
                  <div class="row-desc">{{ f.status_message || f.bio || 'LINE 친구' }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- VIEW 2: CHATS (대화) -->
        <div v-else-if="activeNav === 'chats'" class="pc-pane-body">
          <div class="pc-pane-header">
            <h2 class="pc-pane-title">대화</h2>
            <div class="pc-pane-tools">
              <button class="btn-pc-header-tool" title="그룹 대화방 만들기" @click="showCreateGroupModal = true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
            </div>
          </div>

          <!-- Chat Filter Tabs -->
          <div class="pc-filter-tabs">
            <button :class="{ active: chatFilter === 'all' }" @click="chatFilter = 'all'">전체</button>
            <button :class="{ active: chatFilter === 'direct' }" @click="chatFilter = 'direct'">1:1</button>
            <button :class="{ active: chatFilter === 'group' }" @click="chatFilter = 'group'">그룹</button>
            <button :class="{ active: chatFilter === 'unread' }" @click="chatFilter = 'unread'">안읽음</button>
          </div>

          <!-- Search Box -->
          <div class="pc-search-box">
            <div class="pc-search-inner">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#999" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input v-model="searchKeyword" placeholder="대화방 또는 메시지 검색" />
            </div>
          </div>

          <!-- Chats Scroll List -->
          <div class="pc-pane-scroll">
            <div
              v-for="c in filteredChats"
              :key="c.id"
              class="pc-chat-row"
              :class="{ selected: selectedChatId === c.id }"
              @click="selectChat(c.id)"
            >
              <div class="pc-avatar circle-44" :class="{ 'group-avatar': c.kind === 'group' }">
                {{ c.title ? c.title.slice(0, 1) : 'L' }}
              </div>
              <div class="pc-chat-meta">
                <div class="chat-top-line">
                  <div class="chat-title-text">
                    {{ c.title || '대화방' }}
                    <span v-if="c.kind === 'group'" class="member-count">{{ c.member_count || 2 }}</span>
                  </div>
                  <span class="chat-timestamp">{{ formatTime(c.updated_at || '') }}</span>
                </div>
                <div class="chat-bottom-line">
                  <span class="chat-last-message">{{ c.last_message?.body || '메시지가 없습니다' }}</span>
                  <span v-if="c.unread_count > 0" class="chat-unread-badge">{{ c.unread_count }}</span>
                </div>
              </div>
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
              <div class="story-ring" :style="{ background: s.bg || '#06C755' }">{{ (s.author_name || 'L').slice(0, 1) }}</div>
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

      <!-- (Column 3) Right Main Chat View OR Authentic Neutral Empty State -->
      <section v-if="selectedChat" class="pc-chat-viewport">
        <!-- Chat Header -->
        <header class="pc-chat-topbar">
          <div class="chat-topbar-left">
            <div class="pc-avatar circle-36" :style="{ background: selectedChat.kind === 'group' ? '#0ea5e9' : '#06C755' }">
              {{ selectedChat.title ? selectedChat.title.slice(0, 1) : 'L' }}
            </div>
            <div class="chat-topbar-info">
              <div class="title-row">
                <span class="chat-header-title">{{ selectedChat.title }}</span>
                <span v-if="selectedChat.kind === 'group'" class="member-tag">👥 {{ selectedChat.member_count || 2 }}</span>
                <span v-if="selectedChat.official" class="badge-verified">✓ 공식계정</span>
              </div>
              <small class="e2ee-tag">
                {{ letterSealingEnabled ? '🔒 Letter Sealing (종단간 암호화 적용됨)' : '암호화 미지원' }}
              </small>
            </div>
          </div>

          <div class="chat-topbar-actions">
            <button class="btn-chat-action" title="음성통화" @click="startCall('voice')"><LineIcon name="call-voice" :size="18" /></button>
            <button class="btn-chat-action" title="영상통화" @click="startCall('video')"><LineIcon name="call-video" :size="18" /></button>
            <button class="btn-chat-action" :class="{ active: activeDrawer !== 'none' }" title="대화방 서랍" @click="toggleDrawer('notes')"><LineIcon name="drawer" :size="18" /></button>
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

        <!-- Message History Canvas (Authentic LINE Slate Blue Wallpaper) -->
        <div class="pc-chat-messages-canvas">
          <div class="date-capsule">오늘</div>

          <div
            v-for="msg in messages"
            :key="msg.id"
            class="pc-msg-row"
            :class="{ mine: msg.sender_id === currentUser.id, other: msg.sender_id !== currentUser.id }"
          >
            <!-- Other User Avatar -->
            <div v-if="msg.sender_id !== currentUser.id" class="pc-avatar circle-34 other-avatar">
              {{ selectedChat.title ? selectedChat.title.slice(0, 1) : 'U' }}
            </div>

            <div class="pc-msg-bubble-group">
              <div v-if="msg.sender_id !== currentUser.id" class="pc-sender-header">
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
              </div>

              <!-- Status Info: Read receipt & Time -->
              <div class="pc-msg-meta">
                <span v-if="msg.sender_id === currentUser.id && (msg.read_count || 0) > 0" class="pc-read-receipt">읽음</span>
                <span class="pc-timestamp">{{ formatTime(msg.created_at) }}</span>
              </div>
            </div>

            <!-- Bubble Hover Floating Action Bar -->
            <div class="pc-bubble-toolbar">
              <button title="하트" @click="reactToMessage(msg.id, '❤️')"><LineIcon name="heart" :size="14" /></button>
              <button title="좋아요" @click="reactToMessage(msg.id, '👍')"><LineIcon name="thumbsup" :size="14" /></button>
              <button title="답장" @click="startReply(msg)"><LineIcon name="reply" :size="14" /></button>
              <button title="Keep에 저장" @click="saveToKeep(msg)"><LineIcon name="keep" :size="14" /></button>
              <button title="공지 등록" @click="pinMessage(msg.id)"><LineIcon name="pin" :size="14" /></button>
              <button v-if="msg.sender_id === currentUser.id" title="보내기 취소" @click="unsendMessage(msg.id)"><LineIcon name="close" :size="14" /></button>
            </div>
          </div>
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
              placeholder="메시지를 입력하세요 (Enter: 전송, Shift+Enter: 줄바꿈)"
              rows="3"
              @keydown.enter.exact.prevent="sendMessage"
            ></textarea>
            <div class="pc-textarea-bottom">
              <span class="char-count">{{ draftMessage.length }}/1000</span>
              <button class="btn-green-send" :disabled="!draftMessage.trim()">전송</button>
            </div>
          </form>
        </footer>
      </section>

      <!-- Clean Neutral Desktop Empty State (Authentic LINE PC) -->
      <section v-else class="pc-empty-canvas">
        <div class="pc-empty-dialog">
          <div class="pc-watermark-wrap">
            <svg viewBox="0 0 64 64" width="80" height="80" fill="none">
              <rect width="64" height="64" rx="20" fill="#e8edf2" />
              <path d="M32 15c-10.5 0-19 6.8-19 15.2 0 4.8 2.8 9.1 7.2 11.8-.3 1.5-1.4 5.2-1.6 5.9-.2.8.4.9 1 .5 1-.4 5.9-3.6 8.3-5.1 1.3.3 2.7.4 4.1.4 10.5 0 19-6.8 19-15.2S42.5 15 32 15z" fill="#b4c2ce" />
            </svg>
          </div>
          <h3 class="pc-empty-title">대화를 시작하세요</h3>
          <p class="pc-empty-desc">친구 목록에서 대화할 상대를 클릭하거나<br>새로운 그룹 대화를 시작하세요.</p>
        </div>
      </section>
    </main>

<!-- CALLING OVERLAY MODAL (WebRTC Voice & Video Call) -->
    <div v-if="activeCall" class="call-overlay-modal">
      <div class="call-dialog-box">
        <div v-if="activeCall.kind === 'video'" style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">
          <video ref="remoteVideoRef" autoplay playsinline style="width:180px;height:130px;background:#0f172a;border-radius:12px;object-fit:cover"></video>
          <video ref="localVideoRef" autoplay muted playsinline style="width:100px;height:130px;background:#334155;border-radius:12px;object-fit:cover"></video>
        </div>
        <div v-else class="call-avatar-pulse">
          <div class="avatar-circle lg">{{ activeCall.title.slice(0, 1) }}</div>
        </div>
        <h3>{{ activeCall.title }}</h3>
        <p class="call-type-status">
          {{ activeCall.kind === 'video' ? '📹 영상통화' : '📞 음성통화' }} ·
          <span v-if="activeCall.state === 'ringing'">연결 중...</span>
          <span v-else-if="activeCall.state === 'connected'" class="timer-active">{{ formatDuration(callDuration) }}</span>
        </p>

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
        <div class="profile-cover-header" :style="{ background: activeProfileUser.avatar_color || '#06C755' }">
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
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>⚙️ 라인 환경설정 & 테마</h3>
          <button class="btn-modal-close" @click="showSettingsModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <div class="setting-group">
            <strong>🎨 디자인 테마 선택</strong>
            <div class="theme-choice-buttons">
              <button class="btn-theme-swatch mint" :class="{ active: activeTheme === 'mint' }" @click="switchTheme('mint')">
                🌱 민트 (LINE 기본)
              </button>
              <button class="btn-theme-swatch ocean" :class="{ active: activeTheme === 'ocean' }" @click="switchTheme('ocean')">
                🌊 오션 블루
              </button>
              <button class="btn-theme-swatch sunset" :class="{ active: activeTheme === 'sunset' }" @click="switchTheme('sunset')">
                🌅 선셋 글로우
              </button>
              <button class="btn-theme-swatch sakura" :class="{ active: activeTheme === 'sakura' }" @click="switchTheme('sakura')">
                🌸 사쿠라 핑크
              </button>
              <button class="btn-theme-swatch midnight" :class="{ active: activeTheme === 'midnight' }" @click="switchTheme('midnight')">
                🌙 미드나잇 다크
              </button>
            </div>
          </div>

          <div class="setting-toggle-row">
            <span>🔒 Letter Sealing (Signal ECDH 종단간 암호화)</span>
            <input v-model="letterSealingEnabled" type="checkbox" aria-label="종단간 암호화 설정" />
          </div>
          <div class="setting-toggle-row">
            <span>👀 읽음 확인 표시 (Read Receipts)</span>
            <input type="checkbox" checked />
          </div>
          <div class="setting-toggle-row">
            <span>🔔 메시지 수신 사운드 알림</span>
            <input type="checkbox" checked />
          </div>

          <div class="setting-group" style="margin-top:8px">
            <strong>👤 내 프로필 수정</strong>
            <div class="flex-row" style="margin-top:6px">
              <input v-model="editProfileName" placeholder="이름" style="flex:1" />
              <input v-model="editProfileHandle" placeholder="LINE ID (@handle)" style="flex:1" />
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

    <!-- ADD FRIEND MODAL -->
    <div v-if="showAddFriendModal" class="modal-backdrop" @click.self="showAddFriendModal = false">
      <div class="standard-modal-box">
        <div class="modal-header">
          <h3>➕ 친구 추가</h3>
          <button class="btn-modal-close" @click="showAddFriendModal = false">✕</button>
        </div>
        <div class="modal-body-form">
          <label>라인 아이디(ID)로 검색</label>
          <div class="flex-row">
            <input v-model="addFriendHandleInput" placeholder="예: alice_kim" />
            <button class="btn-primary" @click="addFriendByHandle">추가</button>
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
:root {
  --line-green: #06C755;
  --line-green-hover: #05b34c;
  --line-slate-bg: #849ebf;
  --line-rail-bg: #20252b;
  --line-side-bg: #ffffff;
  --line-border: #e9edf1;
  --line-text-dark: #191919;
  --line-text-sub: #788290;
}

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
.floating-alert.note { background: #dcfce7; color: #15803d; border: 1px solid #4ade80; }
.btn-dismiss { background: none; border: none; cursor: pointer; font-size: 12px; color: inherit; }

/* ==========================================================================
   AUTH SCREEN: AUTHENTIC LINE PC LOGIN WINDOW
   ========================================================================== */
.pc-auth-viewport {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #20252b;
  height: 100vh;
  width: 100vw;
}
.pc-login-card {
  width: 360px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pc-window-bar {
  height: 32px;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  padding: 0 12px;
  position: relative;
}
.pc-win-dots {
  display: flex;
  gap: 6px;
}
.pc-win-dots .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.pc-win-dots .dot.close { background: #ff5f56; }
.pc-win-dots .dot.min { background: #ffbd2e; }
.pc-win-dots .dot.max { background: #27c93f; }
.pc-win-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.5px;
}
.pc-login-body {
  padding: 28px 24px 24px;
}
.pc-brand-header {
  text-align: center;
  margin-bottom: 20px;
}
.pc-line-badge {
  display: inline-block;
  background: #06C755;
  color: #ffffff;
  font-weight: 900;
  font-size: 26px;
  letter-spacing: 0.5px;
  padding: 8px 22px;
  border-radius: 12px;
}
.pc-auth-nav-tabs {
  display: flex;
  border-bottom: 2px solid #f1f5f9;
  margin-bottom: 20px;
}
.pc-auth-nav-tabs button {
  flex: 1;
  padding: 10px 0;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: #8892a0;
  cursor: pointer;
  position: relative;
  transition: all 0.15s;
}
.pc-auth-nav-tabs button.active {
  color: #111827;
  font-weight: 700;
}
.pc-auth-nav-tabs button.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: #06C755;
}
.pc-input-wrap {
  margin-bottom: 12px;
}
.pc-input-wrap input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;
}
.pc-input-wrap input:focus {
  border-color: #06C755;
}
.pc-form-helpers {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #4b5563;
  margin: 10px 0 16px;
}
.pc-remember-check {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.btn-register-toggle {
  background: none;
  border: none;
  color: #06C755;
  font-weight: 600;
  cursor: pointer;
}
.btn-pc-submit {
  width: 100%;
  height: 44px;
  background: #06C755;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-pc-submit:hover { background: #05b34c; }

.pc-demo-section {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed #e2e8f0;
}
.demo-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 6px;
}
.demo-buttons-group {
  display: flex;
  gap: 6px;
}
.btn-demo-chip {
  flex: 1;
  padding: 6px 0;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.btn-demo-chip:hover {
  background: #e8f8ee;
  border-color: #06C755;
  color: #06C755;
}

/* QR Tab */
.pc-tab-content.qr-mode {
  text-align: center;
  padding: 10px 0;
}
.pc-qr-box {
  display: inline-block;
  padding: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.qr-guide {
  font-size: 12px;
  color: #4b5563;
  margin: 12px 0 6px;
  line-height: 1.4;
}
.qr-details {
  font-size: 10px;
  color: #64748b;
  margin-bottom: 12px;
}
.btn-qr-reload {
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #ffffff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
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

/* (Column 1) Leftmost Rail Dock (60px) */
.pc-rail {
  width: 60px;
  background: #20252b;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  flex-shrink: 0;
  z-index: 100;
}
.pc-rail-top, .pc-rail-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.pc-user-avatar-trigger {
  position: relative;
  cursor: pointer;
  margin-bottom: 12px;
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
  background: #06C755;
  border: 2px solid #20252b;
  border-radius: 50%;
}

.pc-rail-btn {
  width: 52px;
  height: 48px;
  background: none;
  border: none;
  color: #7b8794;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 8px;
}
.pc-rail-btn.small {
  width: 40px;
  height: 40px;
}
.pc-rail-btn:hover {
  color: #ffffff;
  background: rgba(255,255,255,0.06);
}
.pc-rail-btn.active {
  color: #ffffff;
  background: rgba(255,255,255,0.1);
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
  background: #06C755;
  border-radius: 0 2px 2px 0;
}
.pc-unread-pill {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #06C755;
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 10px;
}

/* Dropdown menus from rail */
.pc-dropdown-menu {
  position: absolute;
  left: 64px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  padding: 6px 0;
  min-width: 190px;
  z-index: 1000;
  animation: fadeIn 0.15s ease-out;
}
.user-menu { top: 16px; }
.consoles-menu { bottom: 48px; }
.dropdown-header {
  padding: 8px 14px;
}
.dropdown-header strong { display: block; font-size: 13px; color: #111827; }
.dropdown-header small { color: #64748b; font-size: 11px; }
.dropdown-heading {
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
}
.dropdown-sep {
  height: 1px;
  background: #f1f5f9;
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
  color: #06C755;
}
.dropdown-item.logout {
  color: #ef4444;
}

/* (Column 2) Second Sidebar List Pane (310px) */
.pc-side-pane {
  width: 310px;
  background: #ffffff;
  border-right: 1px solid #e9edf1;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100vh;
}
.pc-pane-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.pc-pane-header {
  height: 52px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pc-pane-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #111827;
}
.btn-pc-header-tool {
  background: none;
  border: none;
  color: #475569;
  cursor: pointer;
  padding: 4px;
  display: grid;
  place-items: center;
  border-radius: 4px;
}
.btn-pc-header-tool:hover { background: #f1f5f9; }

.pc-search-box {
  padding: 0 12px 8px;
}
.pc-search-inner {
  height: 32px;
  background: #f2f4f6;
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 6px;
}
.pc-search-inner input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 12px;
}
.btn-search-clear {
  background: none;
  border: none;
  font-size: 11px;
  color: #94a3b8;
  cursor: pointer;
}

.pc-filter-tabs {
  display: flex;
  gap: 4px;
  padding: 0 12px 8px;
}
.pc-filter-tabs button {
  flex: 1;
  padding: 5px 0;
  border: none;
  background: #f1f5f9;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
}
.pc-filter-tabs button.active {
  background: #06C755;
  color: #ffffff;
}

.pc-pane-scroll {
  flex: 1;
  overflow-y: auto;
}
.pc-my-card {
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
}
.pc-my-card:hover { background: #f8fafc; }
.pc-card-meta {
  flex: 1;
  min-width: 0;
}
.name-line {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.status-line {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.pc-category {
  padding-bottom: 4px;
}
.category-title {
  padding: 10px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
}
.pc-row-item {
  height: 52px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: background 0.1s;
}
.pc-row-item:hover { background: #f4f6f8; }
.pc-row-meta {
  flex: 1;
  min-width: 0;
}
.row-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}
.row-desc {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.badge-verified { color: #06C755; font-size: 11px; font-weight: 700; }

/* Chats List Rows */
.pc-chat-row {
  height: 64px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(0,0,0,0.02);
  transition: background 0.1s;
}
.pc-chat-row:hover { background: #f4f6f8; }
.pc-chat-row.selected {
  background: #e8f8ee;
}
.pc-chat-meta {
  flex: 1;
  min-width: 0;
}
.chat-top-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chat-title-text {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.member-count {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 400;
  margin-left: 4px;
}
.chat-timestamp {
  font-size: 10px;
  color: #94a3b8;
}
.chat-bottom-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 3px;
}
.chat-last-message {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 170px;
}
.chat-unread-badge {
  background: #06C755;
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 10px;
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
  background: #06C755;
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
  background: #06C755;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
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
.btn-primary { background: #06C755; color: white; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-secondary { background: #f1f5f9; color: #475569; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }

/* Keep modal, Call modal, etc */
.keep-modal { width: 440px; }
.keep-filter-bar { display: flex; gap: 6px; padding: 10px 18px; border-bottom: 1px solid #f1f5f9; }
.keep-filter-bar button { padding: 4px 10px; font-size: 11px; border: none; border-radius: 12px; background: #f1f5f9; cursor: pointer; }
.keep-filter-bar button.active { background: #06C755; color: white; }
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
.btn-call-answer { background: #06C755; color: white; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 700; cursor: pointer; }
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
.story-ring { width: 44px; height: 44px; border-radius: 50%; border: 2px solid #06C755; display: grid; place-items: center; color: white; font-weight: 800; font-size: 14px; }
.story-ring.plus { border-color: #cbd5e1; color: #06C755; font-size: 18px; }
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
.openchat-card:hover { background: #f8fafc; border-color: #06C755; }
.card-icon { font-size: 20px; }
.card-info strong { font-size: 13px; }
.card-info p { font-size: 11px; color: #64748b; margin: 2px 0 0; }

/* Wallet Card */
.line-pay-card { margin: 12px; background: linear-gradient(135deg, #06C755, #0ea5e9); color: white; padding: 16px; border-radius: 12px; }
.pay-top { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; }
.pay-balance { font-size: 22px; font-weight: 900; margin: 10px 0; }
.pay-actions { display: flex; gap: 8px; }
.btn-pay-action { flex: 1; padding: 6px; background: white; color: #06C755; font-weight: 700; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
.btn-pay-action.secondary { background: rgba(255,255,255,0.2); color: white; }
.services-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 12px 12px; }
.service-box { background: #f8fafc; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; font-size: 11px; font-weight: 700; }
.service-box:hover { background: #e8f8ee; }
.service-box .icon { font-size: 20px; }

/* Sticker Popover */
.sticker-popover { position: absolute; bottom: 140px; left: 16px; width: 280px; height: 180px; background: white; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); display: flex; flex-direction: column; overflow: hidden; z-index: 100; }
.sticker-tabs { display: flex; background: #f8fafc; border-bottom: 1px solid #f1f5f9; padding: 4px; }
.sticker-tabs button { flex: 1; padding: 4px; font-size: 11px; border: none; background: none; cursor: pointer; }
.sticker-tabs button.active { font-weight: 700; color: #06C755; border-bottom: 2px solid #06C755; }
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
  background-color: #06C755;
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
  background-color: #e8f8ee;
  color: #06C755;
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

</style>
