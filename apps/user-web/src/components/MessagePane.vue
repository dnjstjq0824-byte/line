<script setup lang="ts">
// I-4: chat viewport (message stream + drawer + composer), extracted verbatim
// from MessengerView.vue. Presentational: data and loaders stay in the view,
// the pane owns only the pin-banner expand flag. Element refs arrive through
// a holder (template expressions would unwrap the bare bindings).
import { ref, type Ref } from 'vue'

import type { Chat, Message, User } from '../../../shared/api'
import type { LunoSticker } from '../luno-stickers'
import type { LunoLocale } from '../luno-i18n'
import { currentUser, t, token } from '../store/session'
import LunoIcon from './LunoIcon.vue'
import MessageAttachment from './MessageAttachment.vue'
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

defineProps<{
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
  isLoadingMessages: boolean
  hasEarlierMessages: boolean
  earlierMessagesLoading: boolean
  earlierMessagesError: string
  conversationError: string
  messageTranslations: Record<string, { translated: string; sourceLang: string; engine: string; loading?: boolean; error?: string }>
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
// Twin of the view's preview map (the view twin feeds the canvas renderer).
const PHOTO_EFFECT_FILTER: Record<string, string> = { none: 'none', gray: 'grayscale(1)', sepia: 'sepia(1)' }
</script>

<template>
  <section class="pc-chat-viewport">
    <!-- Chat Header -->
    <header class="pc-chat-topbar">
      <div class="chat-topbar-left">
        <button class="btn-mobile-back" @click="emit('back')" :title="t('mvGoBack')">
          <LunoIcon name="back" :size="18" />
        </button>
        <div class="pc-avatar circle-36" :style="{ background: selectedChat.kind === 'group' ? '#0ea5e9' : selectedChat.official ? '#4F7CFF' : '#315BCD' }">
          {{ selectedChat.official ? 'L' : selectedChat.title ? selectedChat.title.slice(0, 1) : 'L' }}
        </div>
        <div class="chat-topbar-info">
          <div class="title-row">
            <span class="chat-header-title">{{ selectedChat.title }}</span>
            <span v-if="selectedChat.kind === 'group'" class="member-tag">👥 {{ selectedChat.member_count || 2 }}</span>
            <span v-if="selectedChat.official" class="badge-verified">{{ t('mvOfficialChannel') }}</span>
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
            <LunoIcon name="translate" :size="16" />
            <span>{{ autoTranslateEnabled ? t('mvAiTranslateOn') : t('mvAiTranslate') }}</span>
          </button>
          <select v-model="targetTranslateLang" class="translate-lang-select" aria-label="Target language">
            <option value="ko">KR</option>
            <option value="en">EN</option>
            <option value="th">TH</option>
            <option value="ja">JA</option>
          </select>
        </div>

        <button class="btn-chat-action" :title="t('mvWallpaperTitle')" @click="emit('cycle-wallpaper')">🎨</button>
        <button class="btn-chat-action" :title="t('callVoice')" :disabled="!selectedChatId && chats.length === 0" @click="emit('call', 'voice')"><LunoIcon name="call-voice" :size="18" /></button>
        <button class="btn-chat-action" :title="t('callVideo')" :disabled="!selectedChatId && chats.length === 0" @click="emit('call', 'video')"><LunoIcon name="call-video" :size="18" /></button>
        <button class="btn-chat-action" :class="{ active: activeDrawer === 'events' }" :title="t('mvEventsCalendar')" @click="emit('drawer', 'events')"><LunoIcon name="calendar" :size="18" /></button>
        <button class="btn-chat-action" :class="{ active: activeDrawer !== 'none' }" :title="t('mvDrawerTitle')" @click="emit('drawer', 'notes')"><LunoIcon name="drawer" :size="18" /></button>
      </div>
    </header>

    <!-- Pinned Announcement (공지사항) -->
    <div v-if="pinnedList.length" class="pinned-banner" :class="{ expanded: pinnedExpanded }">
      <div class="pinned-summary" @click="pinnedExpanded = !pinnedExpanded">
        <span class="pin-icon">📢</span>
        <span class="pin-text">{{ pinnedList[0].body || t('mvPinnedFallback') }}</span>
        <button class="btn-unpin-inline" :title="t('mvUnpinNotice')" @click.stop="emit('unpin', pinnedList[0].message_id)">✕</button>
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
        <button class="btn-drawer-close" @click="activeDrawer = 'none'">✕</button>
      </div>
      <div class="drawer-search-bar">
        <input v-model="chatSearchQuery" :placeholder="t('mvSearchInChatPh')" @keydown.enter.prevent="emit('search')" />
        <button class="btn-secondary" @click="emit('search')">{{ t('mvSearch') }}</button>
      </div>
      <div v-if="chatSearchResults.length" class="drawer-search-results">
        <div v-for="sr in chatSearchResults" :key="sr.id" class="drawer-item-card">
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
    <div ref="messagesCanvasRef" class="pc-chat-messages-canvas" :class="'wallpaper-' + chatWallpaper">
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

          <!-- Case 1: Official Security Notice Card (Screenshot 6) -->
          <div
            v-if="msg.kind === 'security_notice'"
            class="pc-msg-row security-notice-row"
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
            :class="{ mine: msg.sender_id === currentUser?.id, other: msg.sender_id !== currentUser?.id, 'group-inner': !isGroupLead(msg, index) }"
          >
            <div v-if="msg.sender_id !== currentUser?.id && isGroupLead(msg, index)" class="pc-avatar circle-34 other-avatar is-group-lead" style="background:#315BCD">
              {{ selectedChat.title ? selectedChat.title.slice(0, 1) : 'U' }}
            </div>
            <div v-else-if="msg.sender_id !== currentUser?.id" class="pc-continued-indent" aria-hidden="true"></div>
            <div class="pc-msg-bubble-group">
              <div v-if="msg.sender_id !== currentUser?.id && isGroupLead(msg, index)" class="pc-sender-header">
                {{ selectedChat.title }}
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
            :class="{ mine: msg.sender_id === currentUser?.id, other: msg.sender_id !== currentUser?.id, 'group-inner': !isGroupLead(msg, index) }"
          >
            <!-- Other User Avatar (group lead only; continuations keep a 44px indent) -->
            <div v-if="msg.sender_id !== currentUser?.id && isGroupLead(msg, index)" class="pc-avatar circle-34 other-avatar is-group-lead" style="background:#315BCD">
              {{ selectedChat.title ? selectedChat.title.slice(0, 1) : 'U' }}
            </div>
            <div v-else-if="msg.sender_id !== currentUser?.id" class="pc-continued-indent" aria-hidden="true"></div>

            <div class="pc-msg-bubble-group">
              <div v-if="msg.sender_id !== currentUser?.id && isGroupLead(msg, index)" class="pc-sender-header">
                {{ selectedChat.title }}
              </div>

              <!-- Speech Bubble -->
              <div
                class="pc-speech-bubble"
                :class="{ 'is-sticker': msg.kind === 'sticker' }"
                @contextmenu.prevent="emit('message-menu', $event, msg)"
              >
                <div v-if="msg.reply_to" class="bubble-reply-preview">
                  <LunoIcon name="reply" :size="12" /> {{ (msg.reply_preview as any)?.body || msg.reply_preview || t('mvRepliedMsg') }}
                </div>

                <div v-if="editingMessageId === msg.id" class="inline-edit-box">
                  <input v-model="editingMessageBody" class="inline-edit-input" @keydown.enter.prevent="emit('save-edit')" />
                  <div class="flex-row" style="margin-top:4px;gap:4px">
                    <button class="btn-primary" style="padding:2px 8px;font-size:11px" @click="emit('save-edit')">{{ t('mvSave') }}</button>
                    <button class="btn-secondary" style="padding:2px 8px;font-size:11px" @click="editingMessageId = ''">{{ t('mvCancel') }}</button>
                  </div>
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
                <div v-else class="bubble-text-content">{{ msg.body }}</div>

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
                    <button class="btn-retry-translate" :title="t('retranslateBtn')" @click="emit('translate', msg)">↻</button>
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
              <button :title="t('translateBtn')" @click="emit('translate', msg)"><LunoIcon name="translate" :size="14" /></button>
              <button :title="t('mvReactHeart')" @click="emit('react', msg.id, '❤️')"><LunoIcon name="heart" :size="14" /></button>
              <button :title="t('mvReactLike')" @click="emit('react', msg.id, '👍')"><LunoIcon name="thumbsup" :size="14" /></button>
              <button :title="t('mvReply')" @click="emit('reply', msg)"><LunoIcon name="reply" :size="14" /></button>
              <button v-if="msg.sender_id === currentUser?.id" :title="t('mvEdit')" @click="emit('edit-start', msg)">✎</button>
              <button :title="t('mvCtxKeep')" @click="emit('keep', msg)"><LunoIcon name="keep" :size="14" /></button>
              <button :title="t('mvNoticeRegister')" @click="emit('pin', msg.id)"><LunoIcon name="pin" :size="14" /></button>
              <button v-if="msg.sender_id === currentUser?.id" :title="t('mvCtxUnsend')" @click="emit('unsend', msg.id)"><LunoIcon name="close" :size="14" /></button>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- Floating Scroll-to-Bottom Button (Matching Screenshot 7) -->
    <button class="btn-scroll-bottom" :title="t('mvJumpBottom')" @click="emit('scroll-bottom')">
      ↓
    </button>

    <!-- Chat Input Composer -->
    <footer class="pc-chat-input-dock">
      <!-- Reply Preview Banner -->
      <div v-if="replyToMessage" class="reply-composer-bar">
        <span>{{ t('mvReplyTo') }}<strong>{{ replyToMessage.body }}</strong></span>
        <button class="btn-clear-search" @click="replyToMessage = null">✕</button>
      </div>

      <!-- Sticker Picker Popover -->
      <div v-if="showStickerPicker" class="sticker-picker-popover">
        <div class="sticker-cat-tabs">
          <button :class="{ active: activeStickerCategory === 'All' }" @click="activeStickerCategory = 'All'">{{ t('tabAll') }}</button>
          <button :class="{ active: activeStickerCategory === 'Lumi' }" @click="activeStickerCategory = 'Lumi'">{{ t('mvBotLumi') }}</button>
          <button :class="{ active: activeStickerCategory === 'Nori' }" @click="activeStickerCategory = 'Nori'">{{ t('mvBotNori') }}</button>
          <button :class="{ active: activeStickerCategory === 'Poko' }" @click="activeStickerCategory = 'Poko'">{{ t('mvBotPoko') }}</button>
          <button class="btn-clear-search" style="margin-left:auto" @click="showStickerPicker = false">✕</button>
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
      </div>

      <!-- Attachment Bar Icons -->
      <div class="pc-input-toolbar">
        <input ref="attachmentInput" type="file" class="file-input-hidden" tabindex="-1" aria-hidden="true" @change="emit('file-change', $event)" />
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
        <button class="btn-tool-icon" :title="t('mvAttachSticker')" @click="showStickerPicker = !showStickerPicker">😊</button>
        <div v-if="showCameraModal" class="fx-modal-backdrop" @click.self="emit('camera-close')">
          <div class="fx-modal" role="dialog" :aria-label="t('camTitle')">
            <h3>{{ t('camTitle') }}</h3>
            <div class="cam-tabs">
              <button :class="{ active: cameraMode === 'photo' }" :disabled="videoRecording" @click="emit('camera-mode', 'photo')">{{ t('camPhoto') }}</button>
              <button :class="{ active: cameraMode === 'video' }" :disabled="videoRecording" @click="emit('camera-mode', 'video')">{{ t('camVideo') }}</button>
            </div>
            <video v-show="!cameraError" ref="cameraVideoRef" class="fx-preview" autoplay muted playsinline></video>
            <p v-if="cameraError" class="cam-error">{{ cameraError }}</p>
            <p v-if="videoRecording" class="rec-indicator">🔴 {{ videoElapsed }}s / 8s</p>
            <div class="fx-actions">
              <button class="btn-secondary" @click="emit('camera-close')">{{ t('mvCancel') }}</button>
              <button v-if="cameraMode === 'photo'" class="btn-secondary" @click="emit('camera-close'); emit('attach', 'image')">{{ t('camChooseFile') }}</button>
              <button v-if="!cameraError && cameraMode === 'photo'" class="btn-primary" @click="emit('photo')">{{ t('camCapture') }}</button>
              <button v-if="!cameraError && cameraMode === 'video' && !videoRecording" class="btn-primary" @click="emit('video-start')">⏺️</button>
              <button v-if="!cameraError && cameraMode === 'video' && videoRecording" class="btn-primary" @click="emit('video-stop')">⏹️</button>
            </div>
          </div>
        </div>
        <button class="btn-tool-icon" :title="t('mvAttachPhoto')" :disabled="uploading" @click="emit('camera-open')">📷</button>
        <button class="btn-tool-icon" :title="t('mvAttachFile')" :disabled="uploading" @click="emit('attach', 'file')">📎</button>
        <button class="btn-tool-icon" :title="isRecordingVoice ? t('mvRecStop') : t('mvRecStart')" @click="emit('voice-toggle')">
          {{ isRecordingVoice ? '⏹️' : '🎙️' }}
        </button>
        <button class="btn-tool-icon" :title="t('mvMakePoll')" @click="emit('poll-create')">📊</button>
        <button class="btn-tool-icon" :title="t('mvAddEvent')" @click="emit('new-event')">📅</button>
        <button class="btn-tool-icon" :title="t('mvLocationShare')" @click="emit('location')">📍</button>
        <button class="btn-tool-icon" :title="t('mvShareContact')" @click="emit('contact')">👤</button>
        <button class="btn-tool-icon" :title="t('mvCapture')" @click="emit('capture')">✂️</button>
        <button class="btn-tool-icon" :title="t('mvSend')" @click="emit('send-money')">₩</button>
      </div>

      <!-- Textarea Form Area -->
      <form class="pc-textarea-form" :aria-busy="sendingConversations.has(selectedChatId)" @submit.prevent="emit('send')">
        <textarea
          v-model="draftMessage"
          :disabled="sendingConversations.has(selectedChatId)"
          :placeholder="t('inputPlaceholder')"
          rows="3"
          @keydown.enter.exact="emit('composer-enter', $event)"
        ></textarea>
        <div class="pc-textarea-bottom">
          <span class="char-count">{{ draftMessage.length }}</span>
          <button class="btn-green-send" :disabled="!draftMessage.trim() || sendingConversations.has(selectedChatId)">{{ sendingConversations.has(selectedChatId) ? t('message_sending') : t('sendBtn') }}</button>
        </div>
      </form>
    </footer>
  </section>
</template>
