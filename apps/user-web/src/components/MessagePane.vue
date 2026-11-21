<script setup lang="ts">
// I-4: chat viewport (message stream + drawer + composer), extracted verbatim
// from MessengerView.vue. Presentational: data and loaders stay in the view,
// the pane owns only the pin-banner expand flag. Element refs arrive through
// a holder (template expressions would unwrap the bare bindings).
import { computed, nextTick, onMounted, ref, watch, type Ref } from 'vue'

import { API_URL, type Chat, type Message, type User } from '../../../shared/api'
import { initialOf } from '../../../shared/avatar_initial'
import { senderDisplayName } from '../../../shared/sender_name'
import { isImageStickerId, stickerImagePath, categoryTitle } from '../../../shared/stickers'
import { loadStickerCatalog, type StickerCatalogCategory } from '../../../shared/sticker_catalog'
import type { LunoSticker } from '../luno-stickers'
import type { LunoLocale } from '../luno-i18n'
import LinkPreview from './LinkPreview.vue'
import { currentUser, t, token, currentLocale } from '../store/session'
import LunoIcon from './LunoIcon.vue'
import MessageAttachment from './MessageAttachment.vue'
import PcAgentBar from './PcAgentBar.vue'
import type { DrawerTab } from './ChatList.vue'

export interface PinnedItem { message_id: string; pinned_by: string; pinned_at: string; body?: string }
export interface PollItem { id: string; question: string; options: { id: string; text?: string; label?: string; votes?: number; count?: number; voted?: boolean }[]; closed?: boolean }
export interface NoteItem { id: string; title?: string; body: string; author?: User; author_name?: string; likes?: number; created_at: string }
export interface AlbumItem { id: string; title: string; created_by: string; created_at: string }
export interface EventItem { id: string; title: string; starts_at: string; location: string; my_rsvp?: string; going?: string[]; declined?: string[]; creator?: User }
export interface MediaItem { id: string; kind: string; body: string; created_at: string; metadata?: any }
export interface SearchHit { id: string; body: string; created_at: string }
export type RealtimeState = 'connecting' | 'connected' | 'reconnecting' | 'offline'
export type ChatWallpaper = 'skyblue' | 'slate' | 'mint' | 'dark'

const props = defineProps<{
  selectedChat: Chat
  selectedChatId: string
  chats: Chat[]
  realtimeState: RealtimeState
  chatWallpaper: ChatWallpaper
  pinnedList: PinnedItem[]
  activePolls: PollItem[]
  chatNotes: NoteItem[]
  chatAlbums: AlbumItem[]
  chatEvents: EventItem[]
  chatMediaList: MediaItem[]
  chatSearchResults: SearchHit[]
  messages: Message[]
  proposalStates: Record<string, string>
  isLoadingMessages: boolean
  hasEarlierMessages: boolean
  earlierMessagesLoading: boolean
  earlierMessagesError: string
  conversationError: string
  messageTranslations: Record<string, { translated: string; sourceLang: string; engine: string; loading?: boolean; error?: string }>
  translateConfigured: boolean
  linkPreviewsEnabled: boolean
  translateLanguages: string[]
  sendingConversations: Set<string>
  filteredStickers: LunoSticker[]
  uploading: boolean
  effectFile: File | null
  effectPreviewUrl: string
  showCameraModal: boolean
  cameraMode: 'photo' | 'video'
  cameraError: string
  videoRecording: boolean
  videoElapsed: number
  isRecordingVoice: boolean
  messagesCanvasRef: Ref<HTMLElement | null>
  attachmentInput: Ref<HTMLInputElement | null>
  cameraVideoRef: Ref<HTMLVideoElement | null>
  formatTime: (iso: string) => string
  formatDateDivider: (dateStr?: string) => string
  shouldShowDateDivider: (msg: any, index: number) => boolean
  isGroupLead: (msg: any, index: number) => boolean
  isGroupTail: (msg: any, index: number) => boolean
  getStickerSvg: (id: string) => string
}>()

const emit = defineEmits<{
  back: []
  call: [kind: 'voice' | 'video']
  drawer: [tab: DrawerTab]
  'cycle-wallpaper': []
  unpin: [messageId: string]
  vote: [pollId: string, optId: string]
  search: []
  'create-note': []
  'delete-note': [noteId: string]
  'create-album': []
  rsvp: [eventId: string, status: 'going' | 'maybe' | 'declined']
  'new-event': []
  'load-earlier': []
  retry: []
  'security-logout': [msg: Message]
  password: []
  'message-menu': [event: MouseEvent, msg: Message]
  'save-edit': []
  react: [msgId: string, emoji: string]
  translate: [msg: Message]
  reply: [msg: Message]
  'edit-start': [msg: Message]
  keep: [msg: Message]
  pin: [msgId: string]
  unsend: [msgId: string]
  forward: [msg: Message]
  hide: [msgId: string]
  decide: [msg: Message, decision: 'approved' | 'rejected']
  approvals: []
  'group-settings': []
  'scroll-bottom': []
  sticker: [stickerId: string]
  'file-change': [event: Event]
  'effect-close': []
  'effect-send': []
  'camera-close': []
  'camera-mode': [mode: 'photo' | 'video']
  photo: []
  'video-start': []
  'video-stop': []
  'camera-open': []
  attach: [kind: 'image' | 'file']
  'voice-toggle': []
  'poll-create': []
  location: []
  contact: []
  capture: []
  'send-money': []
  send: []
  'send-command': [text: string]
  'composer-enter': [event: KeyboardEvent]
}>()

const autoTranslateEnabled = defineModel<boolean>('autoTranslateEnabled', { required: true })
const targetTranslateLang = defineModel<LunoLocale>('targetTranslateLang', { required: true })
const activeDrawer = defineModel<'none' | DrawerTab>('activeDrawer', { required: true })
const chatSearchQuery = defineModel<string>('chatSearchQuery', { required: true })
const newNoteBody = defineModel<string>('newNoteBody', { required: true })
const newAlbumTitle = defineModel<string>('newAlbumTitle', { required: true })
const replyToMessage = defineModel<Message | null>('replyToMessage', { required: true })
const draftMessage = defineModel<string>('draftMessage', { required: true })
const showStickerPicker = defineModel<boolean>('showStickerPicker', { required: true })
const activeStickerCategory = defineModel<'All' | LunoSticker['character']>('activeStickerCategory', { required: true })
const stickerReplay = defineModel<Record<string, number>>('stickerReplay', { required: true })
const editingMessageId = defineModel<string>('editingMessageId', { required: true })
const editingMessageBody = defineModel<string>('editingMessageBody', { required: true })
const effectChoice = defineModel<'none' | 'gray' | 'sepia'>('effectChoice', { required: true })

const pinnedExpanded = ref(false)
// A15: voice AI — STT for voice bubbles, TTS read-aloud for text bubbles.
// 503/502 from ai/stt or ai/tts surfaces honest "engine getting ready"
// guidance; anything else is a conversion failure.
const voiceAiText = ref<Record<string, { loading: boolean; text: string; error: string }>>({})
const ttsPlaying = ref<Record<string, boolean>>({})
// The production server has no ai/tts yet (STT is live): keep the read-aloud
// button hidden until it ships, so it never answers with an error.
const TTS_ENABLED = false
function voiceAiLang(): string {
  const l = String(currentLocale.value || 'auto').toLowerCase()
  return ['ko', 'en', 'th', 'ja'].includes(l) ? l : 'auto'
}
async function transcribeVoice(msg: Message) {
  const id = String((msg.metadata as any)?.attachment_id || '')
  if (!id || !token.value || voiceAiText.value[msg.id]?.loading) return
  voiceAiText.value[msg.id] = { loading: true, text: '', error: '' }
  try {
    const dl = await fetch(`${API_URL}/api/v1/attachments/${encodeURIComponent(id)}/content`, {
      headers: { Authorization: `Bearer ${token.value}` },
      cache: 'no-store',
    })
    if (!dl.ok) throw new Error('voice download failed')
    const mime = (dl.headers.get('content-type') || 'audio/mp4').split(';')[0].trim().toLowerCase() || 'audio/mp4'
    const bytes = new Uint8Array(await dl.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
    const res = await fetch(`${API_URL}/api/v1/ai/stt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ audio_base64: btoa(bin), mime_type: mime, lang: voiceAiLang() }),
    })
    if (res.status === 503 || res.status === 502) {
      voiceAiText.value[msg.id] = { loading: false, text: '', error: t('mvVoiceAiPending') }
      return
    }
    if (!res.ok) throw new Error('stt failed')
    const data = await res.json()
    voiceAiText.value[msg.id] = { loading: false, text: String(data.text || ''), error: '' }
  } catch {
    voiceAiText.value[msg.id] = { loading: false, text: '', error: t('mvVoiceAiFailed') }
  }
}
async function readAloud(msg: Message) {
  if (!token.value || ttsPlaying.value[msg.id] || voiceAiText.value[msg.id]?.loading) return
  voiceAiText.value[msg.id] = { loading: true, text: '', error: '' }
  ttsPlaying.value[msg.id] = true
  try {
    const res = await fetch(`${API_URL}/api/v1/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ text: msg.body, lang: voiceAiLang() }),
    })
    if (res.status === 503) {
      voiceAiText.value[msg.id] = { loading: false, text: '', error: t('mvVoiceAiPending') }
      ttsPlaying.value[msg.id] = false
      return
    }
    if (!res.ok) throw new Error('tts failed')
    const data = await res.json()
    const raw = atob(String(data.audio_base64 || ''))
    const arr = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
    const blobUrl = URL.createObjectURL(new Blob([arr], { type: String(data.mime_type || 'audio/wav') }))
    const audio = new Audio(blobUrl)
    audio.onended = () => { URL.revokeObjectURL(blobUrl); ttsPlaying.value[msg.id] = false }
    audio.onerror = () => {
      URL.revokeObjectURL(blobUrl)
      ttsPlaying.value[msg.id] = false
      voiceAiText.value[msg.id] = { loading: false, text: '', error: t('mvVoiceAiFailed') }
    }
    voiceAiText.value[msg.id] = { loading: false, text: '', error: '' }
    await audio.play()
  } catch {
    ttsPlaying.value[msg.id] = false
    voiceAiText.value[msg.id] = { loading: false, text: '', error: t('mvVoiceAiFailed') }
  }
}
const stickerImgFailed = ref<Record<string, boolean>>({})
function stickerMsgId(msg: Message): string { return String((msg.metadata as any)?.sticker_id || msg.body || '') }
function isImgSticker(msg: Message): boolean { return isImageStickerId(stickerMsgId(msg)) }
function stickerImgSrc(msg: Message): string { return stickerImagePath(stickerMsgId(msg)) }
const imgStickerCats = ref<StickerCatalogCategory[]>([])
const activeImgCat = ref('')
let imgCatalogLoading = false
const imgCatItems = computed(() => imgStickerCats.value.find(c => c.id === activeImgCat.value)?.items || [])
function imgCatTitle(c: StickerCatalogCategory): string { return categoryTitle(c, currentLocale.value) }
watch(showStickerPicker, async (open) => {
  if (!open || imgStickerCats.value.length || imgCatalogLoading) return
  imgCatalogLoading = true
  try {
    const cat = await loadStickerCatalog()
    if (cat) {
      imgStickerCats.value = cat.categories || []
      activeImgCat.value = cat.categories[0]?.id || ''
    }
  } finally { imgCatalogLoading = false }
})
// C1: header ⋯ menu and composer + panel are pane-local UI state.
const showTopbarMenu = ref(false)
const showAttachPanel = ref(false)

// The composer grows with its text up to a cap, then scrolls.
const composerInput = ref<HTMLTextAreaElement | null>(null)
function fitComposer() {
  const el = composerInput.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`
}
watch(draftMessage, () => { void nextTick(fitComposer) })
onMounted(fitComposer)

// The search field lives in the room drawer: open it and put the cursor there.
function openRoomSearch() {
  if (activeDrawer.value === 'none') emit('drawer', 'notes')
  void nextTick(() => {
    const field = document.querySelector<HTMLInputElement>('.drawer-search-bar input')
    field?.focus()
  })
}

// Touch screens have no hover: a long press on a bubble opens the same menu
// a right click does.
let pressTimer: ReturnType<typeof setTimeout> | null = null
function pressStart(ev: TouchEvent, msg: Message) {
  pressCancel()
  const touch = ev.touches[0]
  if (!touch) return
  const { clientX, clientY } = touch
  pressTimer = setTimeout(() => {
    pressTimer = null
    emit('message-menu', new MouseEvent('contextmenu', { clientX, clientY, bubbles: false, cancelable: true }), msg)
  }, 480)
}
function pressCancel() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
}

// FX-21: the jump button only earns its pixels while scrolled up.
const showJumpBottom = ref(false)
function trackCanvasScroll(ev: Event) {
  const el = ev.target as HTMLElement | null
  if (!el) return
  showJumpBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight > 120
}

// FX-19: search hits scroll the canvas to the message and flash it.
const flashedMessageId = ref('')
let flashTimer: ReturnType<typeof setTimeout> | null = null
function jumpToSearchedMessage(id: string) {
  const canvas = props.messagesCanvasRef.value
  if (!canvas) return
  const row = canvas.querySelector(`[data-message-id="${CSS.escape(id)}"]`)
  if (!row) return
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  flashedMessageId.value = id
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashedMessageId.value = '' }, 1800)
}
// L-05: approvers mirror the server rule (owner, admin, or direct member).
const canDecide = computed(() => {
  const me = currentUser.value
  if (!me) return false
  if ((me as User).role === 'admin') return true
  if (props.selectedChat.kind === 'direct') return true
  return (props.selectedChat as Chat).owner_id === me.id
})
function proposalState(msg: Message): string {
  return props.proposalStates[msg.id] || 'pending'
}
// F25: screen-reader announcement of the newest visible message.
const latestLiveText = computed(() => {
  const list = props.messages || []
  const m = list[list.length - 1]
  if (!m || (m as any).unsent) return ''
  return String(m.body || '').slice(0, 200)
})
// The sender's photo for bubble avatars, the peer's / room's for the header.
function memberPhoto(userId: string | undefined): string {
  const m = (props.selectedChat.members || []).find((x: any) => x && x.id === userId) as any
  return (m && m.avatar_url) || ''
}
function senderPhoto(msg: Message): string { return memberPhoto(msg.sender_id) }
const roomPhoto = computed(() => {
  const chat = props.selectedChat as any
  if (chat.kind === 'group') return chat.avatar_url || ''
  const peer = (chat.members || []).find((x: any) => x && x.id !== currentUser.value?.id)
  return (peer && peer.avatar_url) || ''
})
function hideBrokenPhoto(ev: Event) {
  const img = ev.target as HTMLElement | null
  if (img) img.style.display = 'none'
}
// Links in text bubbles open in a new tab. Built as text/link parts (never
// v-html), so message text can never inject markup.
const URL_RE = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi
function linkParts(body: string | null | undefined): { text: string; href?: string }[] {
  const text = String(body || '')
  const out: { text: string; href?: string }[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0]
    // trailing punctuation belongs to the sentence, not the link
    const trail = /[.,!?;:)\]]+$/.exec(url)
    if (trail) url = url.slice(0, -trail[0].length)
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at) })
    out.push({ text: url, href: url.startsWith('www.') ? 'https://' + url : url })
    last = at + url.length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
// Group rooms show the sender; direct rooms keep the (nickname-aware) title.
function headerName(msg: Message): string {
  if (props.selectedChat.kind === 'group') return senderDisplayName(msg, props.selectedChat.members || [])
  return props.selectedChat.title || ''
}
// Twin of the view's preview map (the view twin feeds the canvas renderer).
const PHOTO_EFFECT_FILTER: Record<string, string> = { none: 'none', gray: 'grayscale(1)', sepia: 'sepia(1)' }
</script>

<template>
  <section class="lx-room">
    <!-- Room header -->
    <header class="lx-room-head">
      <button type="button" class="lx-icon-btn lx-back" :title="t('mvGoBack')" :aria-label="t('mvGoBack')" @click="emit('back')">
        <LunoIcon name="back" :size="20" />
      </button>
      <span class="lx-avatar s36" :style="{ background: selectedChat.kind === 'group' ? 'var(--ln-info)' : selectedChat.official ? '#4F7CFF' : 'var(--ln-accent)' }">
        <span>{{ selectedChat.official ? 'L' : initialOf(selectedChat.title, 'L') }}</span>
        <img v-if="!selectedChat.official && roomPhoto" :src="roomPhoto" alt="" class="ln-profile-photo" @error="hideBrokenPhoto" />
      </span>
      <div class="lx-room-title">
        <div class="lx-room-name">
          <span class="lx-room-name-text">{{ selectedChat.title }}</span>
          <span v-if="selectedChat.kind === 'group'" class="lx-row-count" :title="t('lxMembers')">{{ selectedChat.member_count || 2 }}</span>
          <span v-if="selectedChat.official" class="badge-verified">{{ t('mvOfficialChannel') }}</span>
        </div>
        <!-- Shown only while the live connection is not up; a healthy room needs no status line. -->
        <small v-if="realtimeState !== 'connected'" class="lx-room-state ln-connection-state" :data-state="realtimeState" role="status">
          {{ t('connection_' + realtimeState) }}
        </small>
      </div>

      <div class="lx-room-actions">
        <button type="button" class="lx-icon-btn lx-wide-only" :title="t('mvSearchInChatPh')" :aria-label="t('mvSearchInChatPh')" @click="openRoomSearch"><LunoIcon name="search" :size="19" /></button>
        <button v-if="!selectedChat?.official" type="button" class="lx-icon-btn" :title="t('callVoice')" :aria-label="t('callVoice')" :disabled="!selectedChatId && chats.length === 0" @click="emit('call', 'voice')"><LunoIcon name="call-voice" :size="19" /></button>
        <button v-if="!selectedChat?.official" type="button" class="lx-icon-btn" :title="t('callVideo')" :aria-label="t('callVideo')" :disabled="!selectedChatId && chats.length === 0" @click="emit('call', 'video')"><LunoIcon name="call-video" :size="19" /></button>
        <button type="button" class="lx-icon-btn" :class="{ active: activeDrawer !== 'none' }" :title="t('mvDrawerTitle')" :aria-label="t('mvDrawerTitle')" @click="emit('drawer', 'notes')"><LunoIcon name="drawer" :size="19" /></button>
        <!-- C1: translate/theme/calendar live in the ⋯ menu so the bar stays one line -->
        <div class="chat-topbar-menu-wrap">
          <button type="button" class="lx-icon-btn" :title="t('mvMoreActions')" :aria-label="t('mvMoreActions')" :aria-expanded="showTopbarMenu" @click="showTopbarMenu = !showTopbarMenu"><LunoIcon name="more" :size="19" /></button>
          <div v-if="showTopbarMenu" class="chat-topbar-menu-layer" @click="showTopbarMenu = false"></div>
          <div v-if="showTopbarMenu" class="chat-topbar-menu" role="menu">
            <!-- AI Translation Bar Controls (Article 10) -->
            <div class="ai-translate-tool-pill" role="menuitem">
              <button
                class="btn-translate-switch"
                :class="{ active: autoTranslateEnabled }"
                :title="translateConfigured ? t('translateToggle') : t('mvTranslatePending')"
                :disabled="!translateConfigured"
                @click="autoTranslateEnabled = !autoTranslateEnabled"
              >
                <LunoIcon name="translate" :size="16" />
                <span>{{ autoTranslateEnabled ? t('mvAiTranslateOn') : t('mvAiTranslate') }}</span>
              </button>
              <select v-model="targetTranslateLang" class="translate-lang-select" :aria-label="t('targetLangLabel')" :disabled="!translateConfigured" :title="translateConfigured ? '' : t('mvTranslatePending')">
                <option v-for="lang in translateLanguages" :key="lang" :value="lang">{{ lang.toUpperCase() }}</option>
              </select>
            </div>
            <button class="chat-topbar-menu-item" @click="openRoomSearch(); showTopbarMenu = false"><LunoIcon name="search" :size="18" /><span>{{ t('mvSearchInChatPh') }}</span></button>
            <button class="chat-topbar-menu-item" @click="emit('cycle-wallpaper'); showTopbarMenu = false"><LunoIcon name="photo" :size="18" /><span>{{ t('mvWallpaperTitle') }}</span></button>
            <button class="chat-topbar-menu-item" @click="emit('drawer', 'events'); showTopbarMenu = false"><LunoIcon name="calendar" :size="18" /><span>{{ t('mvEventsCalendar') }}</span></button>
            <button class="chat-topbar-menu-item" @click="emit('approvals'); showTopbarMenu = false"><LunoIcon name="check" :size="18" /><span>{{ t('apprTitle') }}</span></button>
            <button v-if="selectedChat?.kind === 'group'" class="chat-topbar-menu-item" @click="emit('group-settings'); showTopbarMenu = false"><LunoIcon name="friends" :size="18" /><span>{{ t('gsMenuSettings') }}</span></button>
          </div>
        </div>
      </div>
    </header>
    <h2 class="sr-only">{{ selectedChat.title }}</h2>
    <div class="sr-only" role="status" aria-live="polite">{{ latestLiveText }}</div>

    <!-- Pinned Announcement (공지사항) -->
    <div v-if="pinnedList.length" class="pinned-banner" :class="{ expanded: pinnedExpanded }">
      <div class="pinned-summary" @click="pinnedExpanded = !pinnedExpanded">
        <span class="pin-icon"><LunoIcon name="megaphone" :size="16" /></span>
        <span class="pin-text">{{ pinnedList[0].body || t('mvPinnedFallback') }}</span>
        <button class="btn-unpin-inline" :title="t('mvUnpinNotice')" :aria-label="t('mvUnpinNotice')" @click.stop="emit('unpin', pinnedList[0].message_id)">✕</button>
        <span class="pin-toggle">{{ pinnedExpanded ? '▲' : '▼' }}</span>
      </div>
    </div>

    <!-- Active Polls Banner -->
    <div v-if="activePolls.length" class="polls-banner-wrap">
      <div v-for="poll in activePolls.slice(0, 2)" :key="poll.id" class="poll-inline-card">
        <div class="poll-inline-head">
          <strong>📊 {{ poll.question }}</strong>
          <small>{{ poll.closed ? t('mvPollClosed') : t('mvPollOpen') }}</small>
        </div>
        <div class="poll-options-row">
          <button
            v-for="opt in poll.options"
            :key="opt.id"
            class="btn-poll-opt"
            :class="{ voted: opt.voted }"
            @click="emit('vote', poll.id, opt.id)"
          >
            <span>{{ opt.text || opt.label }}</span>
            <strong>{{ t('mvVotes').replace('{n}', String(opt.votes ?? opt.count ?? 0)) }}</strong>
          </button>
        </div>
      </div>
    </div>

    <!-- Slide-Over Conversation Drawer (Notes / Albums / Events / Media / Search) -->
    <div v-if="activeDrawer !== 'none'" class="pc-drawer-panel">
      <div class="drawer-tabs-bar">
        <button :class="{ active: activeDrawer === 'notes' }" @click="emit('drawer', 'notes')">{{ t('mvDrawerNotes') }}</button>
        <button :class="{ active: activeDrawer === 'albums' }" @click="emit('drawer', 'albums')">{{ t('mvDrawerAlbums') }}</button>
        <button :class="{ active: activeDrawer === 'events' }" @click="emit('drawer', 'events')">{{ t('mvDrawerEvents') }}</button>
        <button :class="{ active: activeDrawer === 'media' }" @click="emit('drawer', 'media')">{{ t('mvDrawerMedia') }}</button>
        <button class="btn-drawer-close" @click="activeDrawer = 'none'" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="drawer-search-bar">
        <input v-model="chatSearchQuery" :placeholder="t('mvSearchInChatPh')" :aria-label="t('mvSearchInChatPh')" @keydown.enter.prevent="emit('search')" />
        <button class="btn-secondary" @click="emit('search')">{{ t('mvSearch') }}</button>
      </div>
      <div v-if="chatSearchResults.length" class="drawer-search-results">
        <div v-for="sr in chatSearchResults" :key="sr.id" class="drawer-item-card drawer-hit" role="button" tabindex="0" :title="t('mvJumpToMessage')" @click="jumpToSearchedMessage(sr.id)" @keydown.enter="jumpToSearchedMessage(sr.id)">
          <strong>{{ sr.body }}</strong>
          <small>{{ formatTime(sr.created_at) }}</small>
        </div>
      </div>
      <div v-if="activeDrawer === 'notes'" class="drawer-body">
        <form class="flex-row" @submit.prevent="emit('create-note')">
          <input v-model="newNoteBody" :placeholder="t('mvNewNotePh')" />
          <button class="btn-primary" type="submit">{{ t('mvSubmit') }}</button>
        </form>
        <p v-if="!chatNotes.length" class="empty-muted">{{ t('mvNoNotes') }}</p>
        <div v-for="n in chatNotes" :key="n.id" class="drawer-item-card">
          <div class="flex-row" style="justify-content:space-between">
            <strong>{{ n.body }}</strong>
            <button class="btn-delete-keep" @click="emit('delete-note', n.id)">{{ t('mvDelete') }}</button>
          </div>
          <small class="muted">{{ formatTime(n.created_at) }}</small>
        </div>
      </div>
      <div v-else-if="activeDrawer === 'albums'" class="drawer-body">
        <form class="flex-row" @submit.prevent="emit('create-album')">
          <input v-model="newAlbumTitle" :placeholder="t('mvNewAlbumPh')" />
          <button class="btn-primary" type="submit">{{ t('mvCreate') }}</button>
        </form>
        <p v-if="!chatAlbums.length" class="empty-muted">{{ t('mvNoAlbums') }}</p>
        <div v-for="alb in chatAlbums" :key="alb.id" class="drawer-item-card">
          <strong>🖼️ {{ alb.title }}</strong>
          <small class="muted">{{ formatTime(alb.created_at) }}</small>
        </div>
      </div>
      <div v-else-if="activeDrawer === 'events'" class="drawer-body">
        <div class="flex-row" style="justify-content:space-between">
          <strong>{{ t('mvChatEvents').replace('{n}', String(chatEvents.length)) }}</strong>
          <button class="btn-primary" @click="emit('new-event')">{{ t('mvNewEvent') }}</button>
        </div>
        <p v-if="!chatEvents.length" class="empty-muted">{{ t('mvNoEvents') }}</p>
        <div v-for="ev in chatEvents" :key="ev.id" class="drawer-item-card">
          <strong>📅 {{ ev.title }}</strong>
          <small class="muted">{{ ev.starts_at }} · {{ ev.location || t('mvOnlineFallback') }}</small>
          <div class="flex-row" style="margin-top:6px">
            <button class="btn-secondary" @click="emit('rsvp', ev.id, 'going')">{{ t('mvAttend').replace('{n}', String(ev.going?.length || 0)) }}</button>
            <button class="btn-secondary" @click="emit('rsvp', ev.id, 'declined')">{{ t('mvDecline').replace('{n}', String(ev.declined?.length || 0)) }}</button>
          </div>
        </div>
      </div>
      <div v-else-if="activeDrawer === 'media'" class="drawer-body">
        <p v-if="!chatMediaList.length" class="empty-muted">{{ t('mvNoMedia') }}</p>
        <div v-for="m in chatMediaList" :key="m.id" class="drawer-item-card">
          <strong>📎 {{ m.body }}</strong>
          <small class="muted">{{ m.kind }} · {{ formatTime(m.created_at) }}</small>
        </div>
      </div>
    </div>

    <!-- Message History Canvas -->
    <div :ref="messagesCanvasRef" class="pc-chat-messages-canvas" :class="'wallpaper-' + chatWallpaper" @scroll="trackCanvasScroll">
      <div v-if="!isLoadingMessages && hasEarlierMessages" class="ln-history-control">
        <button type="button" class="btn-secondary" :disabled="earlierMessagesLoading" @click="emit('load-earlier')">{{ t(earlierMessagesLoading ? 'history_loading' : 'history_earlier') }}</button>
        <p v-if="earlierMessagesError" role="alert">{{ earlierMessagesError }}</p>
      </div>
      <!-- Loading State -->
      <div v-if="isLoadingMessages" class="chat-canvas-state">
        <p class="empty-muted">{{ t('mvLoadingChat') }}</p>
      </div>

      <!-- Scoped Error State with Retry -->
      <div v-else-if="conversationError" class="chat-canvas-state error-state">
        <p class="error-state-text">⚠️ {{ conversationError }}</p>
        <button class="btn-primary" @click="emit('retry')">{{ t('mvRetry') }}</button>
      </div>

      <!-- Empty Conversation State -->
      <div v-else-if="messages.length === 0" class="chat-canvas-state">
        <p class="empty-muted">{{ t('mvEmptyChat') }}</p>
      </div>

      <template v-else>
        <template v-for="(msg, index) in messages" :key="msg.id">
          <!-- Date Separator Divider (Screenshot 2: '10. 23. (금)') -->
          <div v-if="shouldShowDateDivider(msg, index)" class="pc-date-divider-pill">
            {{ formatDateDivider(msg.created_at) }}
          </div>

          <!-- Case 0: system line (member joined, group created, …) -->
          <div v-if="msg.kind === 'system'" class="lx-system-line" :data-message-id="msg.id">{{ msg.body }}</div>

          <!-- Case 1: Official Security Notice Card (Screenshot 6) -->
          <div
            v-else-if="msg.kind === 'security_notice'"
            class="pc-msg-row security-notice-row"
            :data-message-id="msg.id"
            :class="{ 'searched-flash': flashedMessageId === msg.id }"
          >
            <div class="pc-avatar circle-34 other-avatar luno-official-avatar" style="background: #4F7CFF; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px;">
              LUNO
            </div>
            <div class="pc-security-card-container">
              <div class="pc-security-notice-card">
                <div class="security-card-header">
                  <span class="security-title-green">{{ msg.body || t('mvLoginOk') }}</span>
                </div>
                <div class="security-card-divider"></div>
                <div class="security-card-body">
                  <p class="security-desc-bold">{{ msg.metadata?.device_name || t('security_login_notice') }}</p>
                  <p class="security-desc-sub">{{ t('mvSecNoticeDesc') }}</p>
                  <div class="security-specs-table">
                    <div class="spec-row">
                      <span class="spec-label">{{ t('mvIpLabel') }}</span>
                      <span class="spec-val">{{ (msg as any).client_ip || msg.metadata?.ip || '—' }}</span>
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">{{ t('mvLocationLabel') }}</span>
                      <span class="spec-val">{{ (msg as any).client_location || msg.metadata?.location || '—' }}</span>
                    </div>
                  </div>
                  <div class="security-card-actions">
                    <button class="btn-security-logout-green" @click="emit('security-logout', msg)">{{ t('mvLogout') }}</button>
                    <button class="btn-security-pwchange-link" @click="emit('password')">{{ t('mvPwChange') }}</button>
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
            :data-message-id="msg.id"
            :class="{ mine: msg.sender_id === currentUser?.id, other: msg.sender_id !== currentUser?.id, 'group-inner': !isGroupLead(msg, index), 'searched-flash': flashedMessageId === msg.id }"
          >
            <div v-if="msg.sender_id !== currentUser?.id && isGroupLead(msg, index)" class="pc-avatar circle-34 other-avatar is-group-lead" style="background:#315BCD">
              <span>{{ initialOf(headerName(msg), 'U') }}</span>
              <img v-if="senderPhoto(msg)" :src="senderPhoto(msg)" alt="" class="ln-profile-photo" @error="hideBrokenPhoto" />
            </div>
            <div v-else-if="msg.sender_id !== currentUser?.id" class="pc-continued-indent" aria-hidden="true"></div>
            <div class="pc-msg-bubble-group">
              <div v-if="msg.sender_id !== currentUser?.id && isGroupLead(msg, index)" class="pc-sender-header">
                {{ headerName(msg) }}
                <span v-if="(msg as any).sender_kind === 'bot'" class="badge-bot">BOT</span>
              </div>
              <div
                class="pc-call-status-bubble"
                :class="{
                  outgoing: msg.sender_id === currentUser?.id,
                  incoming: msg.sender_id !== currentUser?.id,
                  missed: (msg as any).status === 'cancelled' || msg.metadata?.status === 'cancelled' || msg.body.includes(t('mvMissed')) || msg.body.includes(t('mvCancel'))
                }"
                @click="emit('call', 'voice')"
              >
                <div class="call-bubble-icon-wrap">
                  <LunoIcon name="calls" :size="16" />
                </div>
                <div class="call-bubble-content">
                  <div class="call-bubble-title">{{ msg.body }}</div>
                  <div v-if="(msg as any).call_duration || msg.metadata?.duration" class="call-bubble-sub">
                    {{ (msg as any).call_duration || msg.metadata?.duration }}
                  </div>
                </div>
              </div>
              <div v-if="isGroupTail(msg, index)" class="pc-msg-meta">
                <span v-if="msg.sender_id === currentUser?.id && (msg.read_count || 0) > 0" class="pc-read-receipt">{{ t('readStatus') }}</span>
                <span class="pc-timestamp">{{ formatTime(msg.created_at) }}</span>
              </div>
            </div>
          </div>

          <!-- Case 3: Standard Speech Bubble -->
          <div
            v-else
            class="pc-msg-row"
            :data-message-id="msg.id"
            :class="{ mine: msg.sender_id === currentUser?.id, other: msg.sender_id !== currentUser?.id, 'group-inner': !isGroupLead(msg, index), 'searched-flash': flashedMessageId === msg.id }"
          >
            <!-- Other User Avatar (group lead only; continuations keep a 44px indent) -->
            <div v-if="msg.sender_id !== currentUser?.id && isGroupLead(msg, index)" class="pc-avatar circle-34 other-avatar is-group-lead" style="background:#315BCD">
              <span>{{ initialOf(headerName(msg), 'U') }}</span>
              <img v-if="senderPhoto(msg)" :src="senderPhoto(msg)" alt="" class="ln-profile-photo" @error="hideBrokenPhoto" />
            </div>
            <div v-else-if="msg.sender_id !== currentUser?.id" class="pc-continued-indent" aria-hidden="true"></div>

            <div class="pc-msg-bubble-group">
              <div v-if="msg.sender_id !== currentUser?.id && isGroupLead(msg, index)" class="pc-sender-header">
                {{ headerName(msg) }}
                <span v-if="(msg as any).sender_kind === 'bot'" class="badge-bot">BOT</span>
              </div>

              <!-- Speech Bubble -->
              <div
                class="pc-speech-bubble"
                :class="{ 'is-sticker': msg.kind === 'sticker' && !msg.unsent, 'is-media': (msg.kind === 'image' || msg.kind === 'video') && !!msg.metadata?.attachment_id && !msg.unsent }"
                @contextmenu.prevent="emit('message-menu', $event, msg)"
                @touchstart.passive="pressStart($event, msg)"
                @touchmove.passive="pressCancel"
                @touchend="pressCancel"
                @touchcancel="pressCancel"
              >
                <div v-if="msg.reply_to" class="bubble-reply-preview">
                  <LunoIcon name="reply" :size="12" /> {{ (msg.reply_preview as any)?.body || msg.reply_preview || t('mvRepliedMsg') }}
                </div>
                <div v-if="(msg.metadata as any)?.forwarded" class="bubble-forwarded-tag">➦ {{ t('mvForwardedTag') }}</div>

                <div v-if="msg.unsent" class="bubble-unsent">{{ t('mvMsgUnsent') }}</div>
                <div v-else-if="editingMessageId === msg.id" class="inline-edit-box">
                  <input v-model="editingMessageBody" class="inline-edit-input" @keydown.enter.prevent="emit('save-edit')" />
                  <div class="flex-row" style="margin-top:4px;gap:4px">
                    <button class="btn-primary" style="padding:2px 8px;font-size:11px" @click="emit('save-edit')">{{ t('mvSave') }}</button>
                    <button class="btn-secondary" style="padding:2px 8px;font-size:11px" @click="editingMessageId = ''">{{ t('mvCancel') }}</button>
                  </div>
                </div>
                <div v-else-if="msg.kind === 'sticker' && isImgSticker(msg) && !stickerImgFailed[msg.id]" class="bubble-sticker-img sticker-effect" :key="`stimg-${msg.id}`">
  <img :src="stickerImgSrc(msg)" alt="" loading="lazy" @error="stickerImgFailed[msg.id] = true" />
</div>
<div v-else-if="msg.kind === 'sticker' && getStickerSvg(String(msg.metadata?.sticker_id || msg.body))" class="bubble-sticker-svg sticker-effect" :key="`sticker-${msg.id}-${stickerReplay[msg.id] || 0}`" @click="stickerReplay[msg.id] = (stickerReplay[msg.id] || 0) + 1" v-html="getStickerSvg(String(msg.metadata?.sticker_id || msg.body))"></div>
                <div v-else-if="msg.kind === 'location'" class="bubble-location-card">
                  <div class="loc-card-top">{{ t('mvShareLocation') }}</div>
                  <strong class="loc-card-label">{{ msg.metadata?.label || msg.body }}</strong>
                  <small v-if="typeof msg.metadata?.lat === 'number' && typeof msg.metadata?.lng === 'number'" class="loc-card-coords">{{ msg.metadata.lat }}, {{ msg.metadata.lng }}</small>
                </div>
                <div v-else-if="msg.kind === 'contact'" class="bubble-contact-card">
                  <div class="contact-card-top">{{ t('mvContactCard') }}</div>
                  <strong class="contact-card-name">{{ msg.body }}</strong>
                  <small v-if="msg.metadata?.handle" class="contact-card-handle">@{{ msg.metadata.handle }}</small>
                </div>
                <MessageAttachment v-else-if="msg.metadata?.attachment_id" :message="msg" :token="token" :labels="{ download: t('attachment_download'), retry: t('attachment_retry'), loading: t('attachment_loading'), error: t('attachment_error') }" />
                <div v-else-if="msg.kind === 'proposal' || msg.kind === 'decision' || msg.kind === 'report'" class="bubble-text-content bubble-bot-kind">
                  <span class="badge-kind">{{ msg.kind === 'proposal' ? t('msgKindProposal') : msg.kind === 'decision' ? t('msgKindDecision') : t('msgKindReport') }}</span>
                  {{ msg.body }}
                </div>
                <div v-if="msg.kind === 'proposal' && canDecide && proposalState(msg) === 'pending'" class="bubble-decide-row">
                  <button class="btn-decide-approve" @click="emit('decide', msg, 'approved')">{{ t('apprApprove') }}</button>
                  <button class="btn-decide-reject" @click="emit('decide', msg, 'rejected')">{{ t('apprReject') }}</button>
                </div>
                <div v-else-if="msg.kind === 'proposal' && proposalState(msg) !== 'pending'" class="bubble-decided-mark">
                  {{ proposalState(msg) === 'approved' ? t('apprApprovedState') : t('apprRejectedState') }}
                </div>
                <div v-else class="bubble-text-content"><template v-if="msg._e2eeError">{{ t('mvE2eeUnreadable') }}</template><template v-else><template v-for="(part, pi) in linkParts(msg.body)" :key="pi"><a v-if="part.href" class="bubble-link" :href="part.href" target="_blank" rel="noopener noreferrer nofollow" @click.stop>{{ part.text }}</a><template v-else>{{ part.text }}</template></template></template></div>
                <LinkPreview v-if="msg.kind === 'text' && !msg.unsent" :text="msg.body" :enabled="linkPreviewsEnabled" />

                <!-- A15: voice-AI result box (STT transcript, TTS/STT guidance) -->
                <div v-if="voiceAiText[msg.id]" class="lx-voice-ai-box">
                  <div v-if="voiceAiText[msg.id].loading" class="lx-voice-ai-loading" role="status">✨ {{ t('mvVoiceAiWorking') }}</div>
                  <div v-else-if="voiceAiText[msg.id].error" class="lx-voice-ai-error" role="alert">⚠️ {{ voiceAiText[msg.id].error }}</div>
                  <div v-else-if="voiceAiText[msg.id].text" class="lx-voice-ai-result">{{ voiceAiText[msg.id].text }}</div>
                </div>

                <!-- Reactions Display -->
                <div v-if="msg.reactions && Object.keys(msg.reactions).length" class="bubble-reactions-row">
                  <span v-for="(cnt, emo) in msg.reactions" :key="emo" class="reaction-chip" @click="emit('react', msg.id, String(emo))">
                    {{ emo }} {{ cnt }}
                  </span>
                </div>

                <!-- AI Translation Display Box (Article 10) -->
                <div v-if="messageTranslations[msg.id]" class="luno-ai-translation-box">
                  <div class="translation-meta">
                    <span class="badge-engine">🌐 {{ messageTranslations[msg.id].engine }} ({{ messageTranslations[msg.id].sourceLang }} → {{ targetTranslateLang.toUpperCase() }})</span>
                    <button class="btn-retry-translate" :title="t('retranslateBtn')" :aria-label="t('retranslateBtn')" @click="emit('translate', msg)">↻</button>
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

              <!-- Status Info: Read receipt & Time (group tail only) -->
              <div v-if="isGroupTail(msg, index)" class="pc-msg-meta">
                <span v-if="msg.sender_id === currentUser?.id && (msg.read_count || 0) > 0" class="pc-read-receipt">{{ t('readStatus') }}</span>
                <span class="pc-timestamp">{{ formatTime(msg.created_at) }}</span>
              </div>
            </div>

            <!-- Bubble Hover Floating Action Bar -->
            <div class="pc-bubble-toolbar">
              <button :title="translateConfigured ? t('translateBtn') : t('mvTranslatePending')" :aria-label="translateConfigured ? t('translateBtn') : t('mvTranslatePending')" :disabled="!translateConfigured" @click="emit('translate', msg)"><LunoIcon name="translate" :size="14" /></button>
              <button v-if="msg.kind === 'voice' && !msg.unsent" :title="t('mvVoiceToText')" :aria-label="t('mvVoiceToText')" @click="transcribeVoice(msg)"><LunoIcon name="mic" :size="14" /></button>
              <button v-if="TTS_ENABLED && msg.kind === 'text' && !msg.unsent" :title="t('mvReadAloud')" :aria-label="t('mvReadAloud')" :disabled="ttsPlaying[msg.id]" @click="readAloud(msg)"><LunoIcon name="megaphone" :size="14" /></button>
              <button :title="t('mvReactHeart')" :aria-label="t('mvReactHeart')" @click="emit('react', msg.id, '❤️')"><LunoIcon name="heart" :size="14" /></button>
              <button :title="t('mvReactLike')" :aria-label="t('mvReactLike')" @click="emit('react', msg.id, '👍')"><LunoIcon name="thumbsup" :size="14" /></button>
              <button :title="t('mvReply')" :aria-label="t('mvReply')" @click="emit('reply', msg)"><LunoIcon name="reply" :size="14" /></button>
              <button v-if="msg.sender_id === currentUser?.id && !msg.unsent" :title="t('mvEdit')" :aria-label="t('mvEdit')" @click="emit('edit-start', msg)"><LunoIcon name="edit" :size="14" /></button>
              <button :title="t('mvCtxKeep')" :aria-label="t('mvCtxKeep')" @click="emit('keep', msg)"><LunoIcon name="keep" :size="14" /></button>
              <button :title="t('mvNoticeRegister')" :aria-label="t('mvNoticeRegister')" @click="emit('pin', msg.id)"><LunoIcon name="pin" :size="14" /></button>
              <button v-if="msg.sender_id === currentUser?.id && !msg.unsent" :title="t('mvCtxUnsend')" :aria-label="t('mvCtxUnsend')" @click="emit('unsend', msg.id)"><LunoIcon name="close" :size="14" /></button>
              <button v-if="!msg.unsent" :title="t('mvForward')" :aria-label="t('mvForward')" @click="emit('forward', msg)"><LunoIcon name="forward" :size="14" /></button>
              <button v-if="!msg.unsent" :title="t('mvHideMine')" :aria-label="t('mvHideMine')" @click="emit('hide', msg.id)"><LunoIcon name="trash" :size="14" /></button>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- Floating Scroll-to-Bottom Button (Matching Screenshot 7) -->
    <button class="btn-scroll-bottom" v-show="showJumpBottom" :title="t('mvJumpBottom')" :aria-label="t('mvJumpBottom')" @click="emit('scroll-bottom')">
      ↓
    </button>

    <!-- Chat Input Composer -->
    <!-- C2: official rooms are read-only (no composer, no calls) -->
    <footer v-if="!selectedChat?.official" class="lx-composer-dock">
      <!-- Reply Preview Banner -->
      <div v-if="replyToMessage" class="reply-composer-bar">
        <span>{{ t('mvReplyTo') }}<strong>{{ replyToMessage.body }}</strong></span>
        <button class="btn-clear-search" @click="replyToMessage = null" :aria-label="t('mvClose')">✕</button>
      </div>

      <!-- Sticker Picker Popover -->
      <div v-if="showStickerPicker" class="sticker-picker-popover">
        <div class="sticker-cat-tabs">
          <button :class="{ active: activeStickerCategory === 'All' }" @click="activeStickerCategory = 'All'">{{ t('tabAll') }}</button>
          <button :class="{ active: activeStickerCategory === 'Lumi' }" @click="activeStickerCategory = 'Lumi'">{{ t('mvBotLumi') }}</button>
          <button :class="{ active: activeStickerCategory === 'Nori' }" @click="activeStickerCategory = 'Nori'">{{ t('mvBotNori') }}</button>
          <button :class="{ active: activeStickerCategory === 'Poko' }" @click="activeStickerCategory = 'Poko'">{{ t('mvBotPoko') }}</button>
          <button class="btn-clear-search" style="margin-left:auto" @click="showStickerPicker = false" :aria-label="t('mvClose')">✕</button>
        </div>
        <div class="sticker-grid-items">
          <button
            v-for="st in filteredStickers"
            :key="st.id"
            class="btn-sticker-cell"
            :title="st.name"
            @click="emit('sticker', st.id)"
          >
            <div class="sticker-svg-mini" v-html="st.svg"></div>
            <small>{{ st.name }}</small>
          </button>
        </div>
        <div v-if="imgStickerCats.length" class="sticker-cat-tabs" style="margin-top:10px">
          <button v-for="c in imgStickerCats" :key="c.id" :class="{ active: activeImgCat === c.id }" @click="activeImgCat = c.id">{{ imgCatTitle(c) }}</button>
        </div>
        <div v-if="imgStickerCats.length" class="sticker-grid-items">
          <button
            v-for="st in imgCatItems"
            :key="st.id"
            class="btn-sticker-cell"
            :title="st.label"
            :aria-label="st.label"
            @click="emit('sticker', st.id)"
          >
            <img class="sticker-img-mini" :src="stickerImagePath(st.id)" :alt="st.label" loading="lazy" />
          </button>
        </div>
      </div>

      <input :ref="attachmentInput" type="file" class="file-input-hidden" tabindex="-1" aria-hidden="true" @change="emit('file-change', $event)" />
      <div v-if="effectFile" class="fx-modal-backdrop" @click.self="emit('effect-close')">
        <div class="fx-modal" role="dialog" :aria-label="t('fxTitle')">
          <h3>{{ t('fxTitle') }}</h3>
          <img :src="effectPreviewUrl" class="fx-preview" :style="{ filter: PHOTO_EFFECT_FILTER[effectChoice] }" alt="" />
          <div class="fx-options">
            <button :class="{ active: effectChoice === 'none' }" @click="effectChoice = 'none'">{{ t('fxOriginal') }}</button>
            <button :class="{ active: effectChoice === 'gray' }" @click="effectChoice = 'gray'">{{ t('fxGray') }}</button>
            <button :class="{ active: effectChoice === 'sepia' }" @click="effectChoice = 'sepia'">{{ t('fxSepia') }}</button>
          </div>
          <div class="fx-actions">
            <button class="btn-secondary" @click="emit('effect-close')">{{ t('mvCancel') }}</button>
            <button class="btn-primary" :disabled="uploading" @click="emit('effect-send')">{{ t('fxSend') }}</button>
          </div>
        </div>
      </div>
      <div v-if="showCameraModal" class="fx-modal-backdrop" @click.self="emit('camera-close')">
        <div class="fx-modal" role="dialog" :aria-label="t('camTitle')">
          <h3>{{ t('camTitle') }}</h3>
          <div class="cam-tabs">
            <button :class="{ active: cameraMode === 'photo' }" :disabled="videoRecording" @click="emit('camera-mode', 'photo')">{{ t('camPhoto') }}</button>
            <button :class="{ active: cameraMode === 'video' }" :disabled="videoRecording" @click="emit('camera-mode', 'video')">{{ t('camVideo') }}</button>
          </div>
          <video v-show="!cameraError" :ref="cameraVideoRef" class="fx-preview" autoplay muted playsinline></video>
          <p v-if="cameraError" class="cam-error">{{ cameraError }}</p>
          <p v-if="videoRecording" class="rec-indicator">🔴 {{ videoElapsed }}s / 8s</p>
          <div class="fx-actions">
            <button class="btn-secondary" @click="emit('camera-close')">{{ t('mvCancel') }}</button>
            <button v-if="cameraMode === 'photo'" class="btn-secondary" @click="emit('camera-close'); emit('attach', 'image')">{{ t('camChooseFile') }}</button>
            <button v-if="!cameraError && cameraMode === 'photo'" class="btn-primary" @click="emit('photo')">{{ t('camCapture') }}</button>
            <button v-if="!cameraError && cameraMode === 'video' && !videoRecording" class="btn-primary" @click="emit('video-start')" :aria-label="t('camVideo')">⏺️</button>
            <button v-if="!cameraError && cameraMode === 'video' && videoRecording" class="btn-primary" @click="emit('video-stop')" :aria-label="t('mvRecStop')">⏹️</button>
          </div>
        </div>
      </div>

      <!-- C1: attachments collapse into the + panel; voice stays out so a
           recording can always be stopped without reopening anything. -->
      <div v-if="showAttachPanel" class="lx-attach-layer" @click="showAttachPanel = false"></div>
      <div v-if="showAttachPanel" class="attach-panel-popover lx-attach" role="menu">
        <button class="attach-panel-item" @click="showStickerPicker = !showStickerPicker; showAttachPanel = false"><span class="lx-attach-icon"><LunoIcon name="smile" :size="22" /></span><small>{{ t('mvAttachSticker') }}</small></button>
        <button class="attach-panel-item" :disabled="uploading" @click="emit('camera-open'); showAttachPanel = false"><span class="lx-attach-icon"><LunoIcon name="camera" :size="22" /></span><small>{{ t('mvAttachPhoto') }}</small></button>
        <button class="attach-panel-item" :disabled="uploading" @click="emit('attach', 'file'); showAttachPanel = false"><span class="lx-attach-icon"><LunoIcon name="attach" :size="22" /></span><small>{{ t('mvAttachFile') }}</small></button>
        <button class="attach-panel-item" @click="emit('poll-create'); showAttachPanel = false"><span class="lx-attach-icon"><LunoIcon name="check-all" :size="22" /></span><small>{{ t('mvMakePoll') }}</small></button>
        <button class="attach-panel-item" @click="emit('new-event'); showAttachPanel = false"><span class="lx-attach-icon"><LunoIcon name="calendar" :size="22" /></span><small>{{ t('mvAddEvent') }}</small></button>
        <button class="attach-panel-item" @click="emit('location'); showAttachPanel = false"><span class="lx-attach-icon"><LunoIcon name="globe" :size="22" /></span><small>{{ t('mvLocationShare') }}</small></button>
        <button class="attach-panel-item" @click="emit('contact'); showAttachPanel = false"><span class="lx-attach-icon"><LunoIcon name="friends" :size="22" /></span><small>{{ t('mvShareContact') }}</small></button>
        <button class="attach-panel-item" @click="emit('capture'); showAttachPanel = false"><span class="lx-attach-icon"><LunoIcon name="scan" :size="22" /></span><small>{{ t('mvCapture') }}</small></button>
        <button class="attach-panel-item" @click="emit('send-money'); showAttachPanel = false"><span class="lx-attach-icon"><LunoIcon name="money" :size="22" /></span><small>{{ t('mvSend') }}</small></button>
      </div>

      <!-- A12: runner presence + command chips above the composer in bot rooms. -->
      <PcAgentBar
        :conversation-id="selectedChatId"
        :disabled="sendingConversations.has(selectedChatId)"
        @command="emit('send-command', $event)"
      />

      <!-- Composer: one box. Wide screens put the tools under the text; phones put them beside it. -->
      <form class="lx-composer" :aria-busy="sendingConversations.has(selectedChatId)" @submit.prevent="emit('send')">
        <div class="lx-composer-tools">
          <button type="button" class="lx-icon-btn" :class="{ active: showAttachPanel }" :title="t('mvMoreActions')" :aria-label="t('mvMoreActions')" :aria-expanded="showAttachPanel" @click="showAttachPanel = !showAttachPanel"><LunoIcon name="plus" :size="20" /></button>
          <button type="button" class="lx-icon-btn lx-wide-only" :class="{ active: showStickerPicker }" :title="t('mvAttachSticker')" :aria-label="t('mvAttachSticker')" @click="showStickerPicker = !showStickerPicker"><LunoIcon name="smile" :size="20" /></button>
          <button type="button" class="lx-icon-btn lx-wide-only" :title="t('mvAttachFile')" :aria-label="t('mvAttachFile')" :disabled="uploading" @click="emit('attach', 'file')"><LunoIcon name="attach" :size="20" /></button>
          <button type="button" class="lx-icon-btn" :class="{ recording: isRecordingVoice }" :title="isRecordingVoice ? t('mvRecStop') : t('mvRecStart')" :aria-label="isRecordingVoice ? t('mvRecStop') : t('mvRecStart')" @click="emit('voice-toggle')">
            <LunoIcon :name="isRecordingVoice ? 'stop' : 'mic'" :size="20" />
          </button>
        </div>
        <textarea
          ref="composerInput"
          v-model="draftMessage"
          class="lx-composer-input"
          :disabled="sendingConversations.has(selectedChatId)"
          :placeholder="t('lxMessagePh')"
          :aria-label="t('lxMessagePh')"
          :title="t('inputPlaceholder')"
          rows="1"
          @keydown.enter.exact="emit('composer-enter', $event)"
        ></textarea>
        <button class="lx-send" :title="t('sendBtn')" :aria-label="t('sendBtn')" :disabled="!draftMessage.trim() || sendingConversations.has(selectedChatId)">
          <LunoIcon name="send" :size="18" />
          <span class="lx-send-label">{{ sendingConversations.has(selectedChatId) ? t('message_sending') : t('sendBtn') }}</span>
        </button>
      </form>
    </footer>
  </section>
</template>
