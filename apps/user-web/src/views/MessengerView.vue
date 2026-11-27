<script setup lang="ts">
import lunoMark from '../../../shared/brand/luno-logo-appicon.svg'
import LunoIcon from '../components/LunoIcon.vue'
import LunoContextMenu, { type ContextMenuItem } from '../components/LunoContextMenu.vue'
import CallModal from '../components/CallModal.vue'
import GroupCallModal from '../components/GroupCallModal.vue'
import ChatList from '../components/ChatList.vue'
import FriendPanel from '../components/FriendPanel.vue'
import MessagePane from '../components/MessagePane.vue'
import SettingsModal from '../components/SettingsModal.vue'
import ApprovalBox from '../components/ApprovalBox.vue'
import GroupSettingsModal from '../components/GroupSettingsModal.vue'
import QrModal from '../components/QrModal.vue'
import PasswordModal from '../components/PasswordModal.vue'
import ReportModal from '../components/ReportModal.vue'
import KeepModal from '../components/KeepModal.vue'
import SendMoneyModal from '../components/SendMoneyModal.vue'
import ChargeModal from '../components/ChargeModal.vue'
import PollCreateModal from '../components/PollCreateModal.vue'
import EventCreateModal from '../components/EventCreateModal.vue'
import ContactPickerModal from '../components/ContactPickerModal.vue'
import StoryCreateModal from '../components/StoryCreateModal.vue'
import VoomCreateModal from '../components/VoomCreateModal.vue'
import OpenChatCreateModal from '../components/OpenChatCreateModal.vue'
import CreateGroupModal from '../components/CreateGroupModal.vue'
import ForwardPickerModal from '../components/ForwardPickerModal.vue'
import AddFriendModal from '../components/AddFriendModal.vue'
import NewCallModal from '../components/NewCallModal.vue'
import NewChatModal from '../components/NewChatModal.vue'
import NewsReaderModal from '../components/NewsReaderModal.vue'
import ProfileModal from '../components/ProfileModal.vue'
import SafetyModal from '../components/SafetyModal.vue'
import WalletPane from '../components/WalletPane.vue'
import ShopPane from '../components/ShopPane.vue'
import NewsPane from '../components/NewsPane.vue'
import CallsPane from '../components/CallsPane.vue'
import VoomPane from '../components/VoomPane.vue'
import OpenChatPane from '../components/OpenChatPane.vue'
import CallDetailPane from '../components/CallDetailPane.vue'
import OpenChatRoomPane from '../components/OpenChatRoomPane.vue'
import PhoneTabBar from '../components/PhoneTabBar.vue'
import FriendDetailPane from '../components/FriendDetailPane.vue'
import ShellNav from '../components/ShellNav.vue'
import { makeFriendQrSvg } from '../../../shared/friend_qr'
import { playSendSound } from '../sound-effects'
import { syncWebPushSubscription } from '../web_notify'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  api,
  currentUser,
  error,
  fetchAppVersion,
  note,
  paymentsEnabled,
  ensureSession,
  readStoredDeviceId,
  t,
  token,
  wrap,
} from '../store/session'
import { NAV_PATHS, type NavItem } from '../router'
import {
  ApiError,
  newClientID,
  type Chat,
  type Message,
  type NewsArticle,
  type User,
} from '../../../shared/api'
import {
  queueOfflineMessage,
} from '../messenger-utils'
import { useChatSocket } from '../composables/useChatSocket'

import { useAuth } from '../composables/useAuth'
import { useWebRTC, type CallRecord, type WebRTCDeps } from '../composables/useWebRTC'
import { useGroupCall } from '../composables/useGroupCall'
import { useBurstGroups } from '../composables/useBurstGroups'
import { useMessengerNews } from '../composables/useMessengerNews'
import { useMessengerWallet } from '../composables/useMessengerWallet'
import { useMessengerTranslate } from '../composables/useMessengerTranslate'
import { usePasswordChange } from '../composables/usePasswordChange'
import { useMessengerReport } from '../composables/useMessengerReport'
import { useMessengerKeep } from '../composables/useMessengerKeep'
import { useMessengerSocial } from '../composables/useMessengerSocial'
import { useProfilePhotos } from '../composables/useProfilePhotos'
import { useRoomDrawers } from '../composables/useRoomDrawers'
import { useMessengerE2ee } from '../composables/useMessengerE2ee'
import { useMessengerCamera } from '../composables/useMessengerCamera'
import { useVoiceRecording } from '../composables/useVoiceRecording'
import { useAccountDanger } from '../composables/useAccountDanger'
import { useStoreStickers } from '../composables/useStoreStickers'
import { useFriendsGroups } from '../composables/useFriendsGroups'
import { useCallHistory } from '../composables/useCallHistory'
import { useRowActions } from '../composables/useRowActions'
import { useChatListFilters } from '../composables/useChatListFilters'
import { useMessageActions } from '../composables/useMessageActions'
import { useAttachments } from '../composables/useAttachments'
import { useRoomScroll } from '../composables/useRoomScroll'
import { useMessageSenders } from '../composables/useMessageSenders'
import { useShellPrefs } from '../composables/useShellPrefs'
import { useShellMore } from '../composables/useShellMore'
import { useGlobalKeys } from '../composables/useGlobalKeys'
import { useApprovalBox } from '../composables/useApprovalBox'
import { useChatLoader } from '../composables/useChatLoader'
import {
  formatDateDivider,
  formatDuration,
  formatListTime,
  formatTime,
} from '../messenger-format'

// --- LUNO Multilingual & Accessibility & Theme State ---


// P2 split: translation + link-preview preference live in useMessengerTranslate.
const {
  autoTranslateEnabled,
  targetTranslateLang,
  messageTranslations,
  translateConfigured,
  linkPreviewsEnabled,
  ensureLinkPreviewPref,
  translateLanguages,
  ensureTranslateLanguages,
  handleTranslateMessage,
} = useMessengerTranslate()


// --- Auth & Session State ---

// --- Navigation Tabs (Open Messenger 14 Global Nav Rail) ---
const activeNav = ref<NavItem>('chats')

// --- LUNO Mobile 4-Tab & PC Workstation State (PO Master Directive) ---
// P2 split: room canvas scroll lives in useRoomScroll (no bindings).
const {
  messagesCanvasRef,
  scrollToBottom,
} = useRoomScroll()
// --- Shell navigation: four primary destinations + a named "More" panel ---
// P2 split: More-panel config lives in useShellMore (store only).
const {
  showMorePanel,
  MORE_ITEMS,
  visibleMoreItems,
  consoleLinks,
} = useShellMore()
const PRIMARY_NAV: { nav: NavItem; icon: string; label: string }[] = [
  { nav: 'home', icon: 'friends', label: 'navFriends' },
  { nav: 'chats', icon: 'chats', label: 'navChats' },
  { nav: 'calls', icon: 'calls', label: 'lxCalls' },
  { nav: 'news', icon: 'news', label: 'lxNews' },
]
const MORE_NAVS: NavItem[] = ['wallet', 'shop', 'voom', 'openchat']
// Content tabs are whole pages: no list/detail split, so they use both columns.
const PAGE_NAVS: NavItem[] = ['news', 'wallet', 'voom', 'shop']
// The main pane's empty state names what the list on its left is for.
const emptyMain = computed(() => {
  if (activeNav.value === 'home') return { icon: 'friends', title: t('lxPickFriend'), desc: t('lxPickFriendDesc') }
  if (activeNav.value === 'openchat') return { icon: 'openchat', title: t('lxPickOpenChat'), desc: t('lxPickOpenChatDesc') }
  return null
})
// Add-friend "share invite link": the public /@handle page (worker SSR deep
// link) opens LUNO or the store for whoever taps it. Phones get the system
// share sheet; desktops copy the link.
async function shareInviteLink() {
  const handle = currentUser.value?.handle
  if (!handle) return
  const url = `${window.location.origin}/@${encodeURIComponent(handle)}`
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'LUNO', url })
      return
    } catch (e) {
      // The person closed the share sheet: nothing to do. Anything else
      // falls through to copying the link.
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    note.value = t('gsLinkCopied')
  } catch {
    // Clipboard blocked (insecure context or denied): show the link so it can be copied by hand.
    note.value = url
  }
}
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
// Phone widths show one pane at a time: the list, or whatever was opened.
const mobileDetailOpen = computed(() => !!selectedChat.value || !!selectedFriendProfile.value
  || (activeNav.value === 'openchat' && !!selectedOpenChatRoom.value)
  || (activeNav.value === 'calls' && !!selectedCallRecord.value))
const showNewChatModal = ref(false)
const showNewCallModal = ref(false)
// P2 split: shell prefs live in useShellPrefs (store only). Same names, same call sites.
const {
  notificationsEnabled,
  toggleNotifications,
  chatWallpaper,
  cycleWallpaper,
} = useShellPrefs()

// --- News Tab State (Section 10 & Screenshot 5) ---
const showQrModal = ref(false)
const myQrSvg = computed(() => makeFriendQrSvg(currentUser.value?.handle || ''))

// P2 split: news tab owns its state in useMessengerNews (share-to-chat stays:
// it drives the chat composer). Same names, same call sites.
const {
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
} = useMessengerNews()

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




// P2 split: password dialog lives in usePasswordChange. Same names, same call sites.
const {
  showPasswordModal,
  currentPasswordInput,
  newPasswordInput,
  confirmPasswordInput,
  passwordChangeError,
  submitPasswordChange,
} = usePasswordChange()

// --- Phone Auth State (Article 3.C) ---

// --- Messenger Domain Data ---
const chats = ref<Chat[]>([])
// P2 split: list loading lives in useChatLoader (room list injected).
const {
  channelSlot,
  loadChats,
} = useChatLoader({ chats })
const selectedChatId = ref('')
const selectedChat = computed(() => chats.value.find(c => c.id === selectedChatId.value) || null)
const messages = ref<Message[]>([])
// P2 split: burst grouping reads this list (same names, same call sites).
const { shouldShowDateDivider, isGroupLead, isGroupTail } = useBurstGroups(messages)
// P2 split: E2EE session moved up (attachment sender needs the client early).
const {
  e2eeClient,
  e2eeBackupBusy,
  restoredHistory,
  backupE2eeNow,
  restoreE2eeNow,
  showSafetyModal,
  safetyRows,
  safetyLoading,
  safetyMyCode,
  openSafetyModal,
  verifySafetyDevice,
  exportDeviceChat,
} = useMessengerE2ee({ chats, selectedChatId, messages, selectChat })
// P2 split: attachment picker + sender live in useAttachments (chat refs injected).
const {
  attachmentInput,
  uploading,
  chooseAttachment,
  sendAttachmentFile,
} = useAttachments({ chats, selectedChatId, messages, e2eeClient, loadChats })
// P2 split: call history lives in useCallHistory (redial bridge below dials via useWebRTC).
const {
  callFilter,
  callHistoryList,
  selectedCallRecord,
  filteredCallHistory,
  loadCalls,
  resolvePeerConversationId,
  openChatFromCallRecord,
  normalizeCallKind,
  removeCallRecord,
} = useCallHistory({ chats, selectedChatId, switchNav, selectChat })
async function startCallFromHistory(record: CallRecord, kind: 'voice' | 'video' = 'voice') {
  selectedCallRecord.value = record
  const cid = await resolvePeerConversationId(record)
  selectedChatId.value = cid
  await startCall(normalizeCallKind(kind), record.peer_name)
}
const hasEarlierMessages = ref(false)
const earlierMessagesLoading = ref(false)
const earlierMessagesError = ref('')
const draftMessage = ref('')
const replyToMessage = ref<Message | null>(null)
const conversationDrafts = new Map<string, { body: string; reply: Message | null }>()
const sendingConversations = ref(new Set<string>())
const pendingSends = new Map<string, AbortController>()
watch(selectedChatId, (next, previous) => {
  if (previous) conversationDrafts.set(previous, { body: draftMessage.value, reply: replyToMessage.value })
  draftMessage.value = conversationDrafts.get(next)?.body || ''
  replyToMessage.value = conversationDrafts.get(next)?.reply || null
}, { flush: 'sync' })
// P2 split: room drawers live in useRoomDrawers (chat refs injected). Same names, same call sites.
const {
  activeDrawer,
  pinnedList,
  activePolls,
  chatNotes,
  chatAlbums,
  chatEvents,
  chatMediaList,
  chatSearchQuery,
  chatSearchResults,
  newNoteBody,
  newAlbumTitle,
  showPollCreateModal,
  newPollQuestion,
  newPollOption1,
  newPollOption2,
  newPollOption3,
  showEventCreateModal,
  newEventTitle,
  newEventDate,
  newEventLocation,
  loadPolls,
  toggleDrawer,
  createAlbum,
  createNote,
  deleteNoteItem,
  rsvpEvent,
  runConversationSearch,
  pinMessage,
  unpinMessage,
  createPoll,
  votePoll,
  createEvent,
} = useRoomDrawers({ selectedChatId, chats, messages })
const stickerReplay = ref<Record<string, number>>({})
// P2 split: stories/voom/openchat live in useMessengerSocial. Same names, same call sites.
const {
  openChatRooms,
  selectedOpenChatRoom,
  openChatPosts,
  newOpenChatRoomName,
  newOpenChatRoomDesc,
  newOpenChatPostBody,
  showCreateOpenChatModal,
  showVoomCreateModal,
  newVoomBody,
  stories,
  voomVideos,
  newStoryText,
  showNewStoryModal,
  loadTimelineStories,
  loadOpenChatRooms,
  publishStory,
  createVoomPost,
  likeVoomPost,
  createOpenChatRoom,
  selectOpenChatRoom,
  submitOpenChatPost,
} = useMessengerSocial()

// P2 split: photo upload lives in useProfilePhotos (called after activeProfileUser).
// P2 split: voice recording lives in useVoiceRecording (chat/upload/sender injected).
const {
  isRecordingVoice,
  toggleVoiceRecording,
  discardVoiceRecording,
} = useVoiceRecording({ selectedChatId, uploading, chooseAttachment, sendAttachment: sendAttachmentFile })

// P2 split: Keep vault lives in useMessengerKeep. Same names, same call sites.
const {
  keepItems,
  keepFilter,
  keepSearch,
  showKeepModal,
  loadKeep,
  filteredKeepItems,
  saveToKeep,
  deleteFromKeep,
} = useMessengerKeep()

// --- Wallet & Pay ---
// P2 split: wallet state lives in useMessengerWallet (called after loadChats:
// the send flow refreshes the chat list through injected deps).

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
    // Audit P0-7: money actions stay out of menus while payments are off.
    ...(paymentsEnabled.value ? [{
      label: t('mvSendMoneyAction'),
      separator: true,
      action: () => openSendMoneyModal(friend)
    }] : []),
    {
      label: isBlk ? t('mvUnblock') : t('mvBlock'),
      separator: !paymentsEnabled.value,
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

// P2 split: store/stickers/devices live in useStoreStickers. Same names, same call sites.
const {
  activeStickerCategory,
  filteredStickers,
  getStickerSvg,
  showStickerPicker,
  devicesList,
  storePacks,
  storeLoading,
  loadStorePacks,
  loadStoreCatalog,
  loadDevices,
} = useStoreStickers()


// --- Modals & Popups ---
const activeProfileUser = ref<User | null>(null)
const {
  photoSaving,
  photoError,
  changeProfilePhoto,
  removeProfilePhoto,
  changeCoverPhoto,
  removeCoverPhoto,
} = useProfilePhotos({ activeProfileUser })
const showSettingsModal = ref(false)
// P2 split: report state lives in useMessengerReport (called with its actions below).
// P2 split: approval box lives in useApprovalBox (chat refs injected). Same names, same call sites.
const {
  showApprovalBox,
  showGroupSettings,
  approvalProposals,
  proposalStates,
  loadProposalStates,
  onGroupChanged,
  onGroupLeft,
  openApprovalBox,
  approvalCanDecide,
  decideProposal,
} = useApprovalBox({ chats, selectedChat, selectedChatId, selectChat, loadChats })
const showContactPicker = ref(false)

// --- QR Login ---


// --- Helper Functions ---

// P2 split: list filters/badges live in useChatListFilters (called after friends).

// --- Auth Actions ---


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
// FX-15: stale-while-revalidate. List snapshots survive reloads so the
// lists paint instantly; room messages cache in memory per room.
const roomMessageCache = new Map<string, Message[]>()

const {
  walletBalance,
  walletPoints,
  walletTx,
  showSendMoneyModal,
  showChargeModal,
  sendTargetFriend,
  sendAmountInput,
  sendMemoInput,
  loadWallet,
  openSendMoneyModal,
  executeSendMoney,
  executeChargeMoney,
} = useMessengerWallet({ loadChats })

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
  const convId = selectedChatId.value, ownerId = currentUser.value?.id, version = chatSelectVersion
  const cursor = messages.value.reduce((lowest, message) => Math.min(lowest, message.sequence), Infinity)
  if (!Number.isFinite(cursor)) return
  const canvas = messagesCanvasRef.value, oldHeight = canvas?.scrollHeight || 0, oldTop = canvas?.scrollTop || 0
  earlierMessagesLoading.value = true; earlierMessagesError.value = ''
  try {
    const result = await api<{ messages: Message[] }>(`/api/v1/conversations/${convId}/messages?limit=50&before=${cursor}&before_sequence=${cursor}`)
    if (currentUser.value?.id !== ownerId || convId !== selectedChatId.value || version !== chatSelectVersion) return
    const earlier = (result.messages || []).filter(message => message.sequence < cursor)
    const combined = new Map([...earlier, ...messages.value].map(message => [message.id, message]))
    messages.value = [...combined.values()].sort((a, b) => a.sequence - b.sequence)
    hasEarlierMessages.value = earlier.length === 50
    await nextTick()
    if (canvas && convId === selectedChatId.value && currentUser.value?.id === ownerId && version === chatSelectVersion) canvas.scrollTop = oldTop + canvas.scrollHeight - oldHeight
  } catch (error) {
    if (currentUser.value?.id === ownerId && convId === selectedChatId.value && version === chatSelectVersion) earlierMessagesError.value = error instanceof Error ? error.message : t('history_error')
  } finally {
    if (currentUser.value?.id === ownerId && convId === selectedChatId.value && version === chatSelectVersion) earlierMessagesLoading.value = false
  }
}

// --- Messaging ---
// A12: runner chips fill the draft and ride the normal send path.
function sendCommand(text: string) {
  draftMessage.value = text
  void sendMessage()
}

async function sendMessage() {
  if (!selectedChatId.value || !draftMessage.value.trim() || sendingConversations.value.has(selectedChatId.value)) return
  const body = draftMessage.value.trim()
  const reply = replyToMessage.value
  const replyId = reply?.id
  const convId = selectedChatId.value
  const clientId = newClientID()
  const senderId = currentUser.value?.id
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
    const res = await api<{ message: Message }>(`/api/v1/conversations/${convId}/messages`, 'POST', {
      client_id: clientId,
      kind,
      body: wireBody,
      ...(replyId ? { reply_to: replyId } : {})
    }, controller.signal)
    if (currentUser.value?.id !== senderId) return
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
    if (currentUser.value?.id !== senderId) return
    if (e instanceof ApiError && e.status === 401) {
      error.value = t('session_expired')
      void router.push('/login')
    } else if (!(e instanceof ApiError)) {
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





// P2 split: enriched senders live in useMessageSenders (chat refs injected).
const {
  sendSticker,
  sendLocationMessage,
  sendContactMessage,
  shareContact,
  captureScreenToChat,
} = useMessageSenders({ selectedChatId, chats, messages, uploading, showStickerPicker, showContactPicker, e2eeClient, scrollToBottom, loadChats, sendAttachment: sendAttachmentFile })



// P2 split: effect + camera live in useMessengerCamera (upload/selection/sender injected).
const {
  effectFile,
  effectChoice,
  effectPreviewUrl,
  closeEffectModal,
  sendEffectPhoto,
  openEffectModal,
  showCameraModal,
  cameraVideoRef,
  cameraError,
  cameraMode,
  videoRecording,
  videoElapsed,
  openCamera,
  switchCameraMode,
  closeCamera,
  startVideoCapture,
  stopVideoCapture,
  capturePhoto,
} = useMessengerCamera({ selectedChatId, uploading, sendAttachment: sendAttachmentFile })
// Element-ref holder for MessagePane (see callVideoRefs above).
const paneRefs = { canvas: messagesCanvasRef, file: attachmentInput, camera: cameraVideoRef }
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


// Pin message as Announcement
// L-05: approval box data + decide actions.

// P2 split: E2EE session moved up (attachment sender needs the client early).
// P2 split: message item actions live in useMessageActions (chat refs injected).
const {
  editingMessageId,
  editingMessageBody,
  startEditMessage,
  saveEditMessage,
  reactToMessage,
  unsendMessage,
  startReply,
  showForwardModal,
  forwardTargetMsg,
  openForwardPicker,
  hideMessage,
} = useMessageActions({ selectedChatId, chats, messages, replyToMessage, e2eeClient })
// P2 split: report dialog + history live in useMessengerReport. Same names, same call sites.
const {
  showReportModal,
  reportCategory,
  reportDetails,
  reportMessage,
  reportE2eeConsent,
  myReports,
  openReportModal,
  openReportForMessage,
  submitReport,
  loadMyReports,
} = useMessengerReport()
watch(showSettingsModal, (open) => { if (open) void loadMyReports(); else void ensureLinkPreviewPref() })

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

// --- Wallet & Pay (state in useMessengerWallet; this bridge resolves the friend) ---
function openSendMoneyFromChat() {
  const f = friends.value.find(fr => fr.display_name === selectedChat.value?.title) || friends.value[0];
  if (f) openSendMoneyModal(f);
}

// P2 split: friends/groups live in useFriendsGroups (chat refs injected). Same names, same call sites.
const {
  friends,
  officialAccounts,
  selectedFriendProfile,
  selectFriend,
  onStartChatFromProfile,
  showCreateGroupModal,
  groupTitleInput,
  selectedFriendsForGroup,
  joinLinkInput,
  showAddFriendModal,
  addFriendHandleInput,
  addFriendResults,
  addFriendSearched,
  loadFriends,
  loadOfficialAccounts,
  startDirectChat,
  joinByLink,
  createGroupChat,
  addFriendByHandle,
  searchUsersForAdd,
  addFriendById,
} = useFriendsGroups({ chats, activeNav, selectedChatId, selectChat, loadChats })
// P2 split: global keys live in useGlobalKeys (dialog flags injected).
const {
  handleGlobalKeydown,
  syncKeyboardOpen,
} = useGlobalKeys({ selectedFriendProfile })
// P2 split: list-row actions live in useRowActions (loaders/selection injected).
const {
  toggleFriendFavorite,
  toggleFriendBlock,
  followOrOpenOfficialAccount,
  openKeepMemoChat,
  toggleChatPin,
  toggleChatMute,
  markChatAsRead,
  markAllChatsRead,
  leaveOrHideChat,
} = useRowActions({ selectedChatId, selectChat, loadChats, loadFriends, loadOfficialAccounts })
// P2 split: list filters/badges live in useChatListFilters (lists injected). Same names, same call sites.
const {
  searchKeyword,
  friendSearchQuery,
  chatFilter,
  chatSortAsc,
  filteredChats,
  totalUnreadCount,
  groupChats,
  filteredFriends,
  favoriteFriends,
} = useChatListFilters({ chats, friends })

// --- Profile & Device Management ---





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


// P2 split: data export + account deletion live in useAccountDanger (logout injected).
const {
  exportUserDataArchive,
  deletePasswordInput,
  deleteReasonInput,
  deleteConfirmInput,
  deleteUserAccount,
} = useAccountDanger({ logout })




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
})

</script>

<template>


    <!-- Messenger shell: rail (PC/tablet) · list pane · main pane · tab bar (phone) -->
    <main id="lx-main" class="lx-shell" :class="{ 'is-detail': mobileDetailOpen, 'is-page': PAGE_NAVS.includes(activeNav) }">
      <a class="lx-skip-link" href="#lx-list">{{ t('lxSkipToMain') }}</a>
      <ShellNav
        :current-user="currentUser"
        :realtime-state="realtimeState"
        :primary-nav="PRIMARY_NAV"
        :active-nav="activeNav"
        :total-unread="totalUnreadCount"
        :more-navs="MORE_NAVS"
        v-model:show-more="showMorePanel"
        :more-items="visibleMoreItems"
        :console-links="consoleLinks"
        :notifications-on="notificationsEnabled"
        @switch-nav="switchNav"
        @open-profile="activeProfileUser = currentUser"
        @open-keep="showKeepModal = true"
        @toggle-notifications="toggleNotifications"
        @open-settings="showSettingsModal = true"
        @run-item="runMoreItem"
        @logout="logout()"
      />

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
        <NewsPane
          v-else-if="activeNav === 'news'"
          v-model:category="selectedNewsCategory"
          v-model:slide-index="activeHeroSlideIndex"
          v-model:hovered="isHeroHovered"
          :hero="heroNews"
          :slides="heroNewsSlides"
          :popular="popularNewsList"
          :filtered="filteredPopularNews"
          :is-sample="newsIsSample"
          @open-article="openNewsArticle"
          @prev-slide="prevHeroSlide"
          @next-slide="nextHeroSlide"
        />

        <!-- CALLS: history list (detail opens in the main pane) -->
        <CallsPane
          v-else-if="activeNav === 'calls'"
          v-model:filter="callFilter"
          v-model:selected="selectedCallRecord"
          :history="callHistoryList"
          :filtered="filteredCallHistory"
          @new-call="showNewCallModal = true"
          @redial="startCallFromHistory($event, normalizeCallKind($event.call_type))"
        />

        <!-- VOOM: full-width feed -->
        <VoomPane
          v-else-if="activeNav === 'voom'"
          :stories="stories"
          :videos="voomVideos"
          @new-story="showNewStoryModal = true"
          @like="likeVoomPost"
        />

        <!-- OPEN CHAT: room list (the room opens in the main pane) -->
        <OpenChatPane
          v-else-if="activeNav === 'openchat'"
          :rooms="openChatRooms"
          :selected-id="selectedOpenChatRoom?.id || ''"
          @create="showCreateOpenChatModal = true"
          @select="selectOpenChatRoom"
        />

        <!-- WALLET: full-width page -->
        <WalletPane
          v-else-if="activeNav === 'wallet'"
          :points="walletPoints"
          :balance="walletBalance"
          :txs="walletTx"
          @charge="showChargeModal = true"
          @send="showSendMoneyModal = true"
          @go-shop="switchNav('shop')"
          @go-voom="switchNav('voom')"
          @open-settings="showSettingsModal = true"
        />

        <!-- STICKER SHOP: full-width page -->
        <ShopPane
          v-else-if="activeNav === 'shop'"
          :loading="storeLoading"
          :packs="storePacks"
        />
      </aside>

      <!-- Main pane: room / profile / call detail / empty state -->
      <section class="lx-main">
      <CallDetailPane
        v-if="activeNav === 'calls'"
        v-model:record="selectedCallRecord"
        @voice-call="startCallFromHistory($event, 'voice')"
        @video-call="startCallFromHistory($event, 'video')"
        @open-chat="openChatFromCallRecord"
        @delete-history="removeCallRecord($event); selectedCallRecord = callHistoryList[0] || null"
      />

      <OpenChatRoomPane
        v-else-if="activeNav === 'openchat' && selectedOpenChatRoom"
        :room="selectedOpenChatRoom"
        :posts="openChatPosts"
        v-model:draft="newOpenChatPostBody"
        @close="selectedOpenChatRoom = null"
        @submit="submitOpenChatPost"
      />


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
      <FriendDetailPane
        v-else-if="selectedFriendProfile"
        :profile="selectedFriendProfile"
        @close="selectedFriendProfile = null"
        @start-chat="onStartChatFromProfile"
        @voice-call="startCallWithUser($event, 'voice')"
        @video-call="startCallWithUser($event, 'video')"
        @send-money="openSendMoneyModal"
        @toggle-favorite="toggleFriendFavorite"
      />

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
      <PhoneTabBar
        :primary-nav="PRIMARY_NAV"
        :active-nav="activeNav"
        :more-navs="MORE_NAVS"
        :total-unread="totalUnreadCount"
        v-model:show-more="showMorePanel"
        @switch-nav="showMorePanel = false; switchNav($event)"
      />
    </main>

    <!-- QR SCANNER & MY QR CODE MODAL -->
    <Transition name="ln-modal">
      <QrModal
        v-if="showQrModal"
        :qr-svg="myQrSvg"
        :handle="currentUser?.handle || ''"
        @close="showQrModal = false"
        @search-by-id="showQrModal = false; showAddFriendModal = true"
      />
    </Transition>

    <!-- ARTICLE READER MODAL (News Details from Screenshot 5) -->
    <Transition name="ln-modal">
      <NewsReaderModal
        v-if="activeNewsArticle"
        :article="activeNewsArticle"
        :bookmarked="newsBookmarks.has(activeNewsArticle?.id || '')"
        :comments="newsArticleComments[activeNewsArticle?.id || ''] || []"
        v-model:new-comment="newCommentInput"
        @close="activeNewsArticle = null"
        @toggle-bookmark="toggleNewsBookmark"
        @share="shareNewsToChat"
        @submit-comment="addNewsComment"
      />
    </Transition>

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
    <Transition name="ln-modal">
      <ProfileModal
        v-if="activeProfileUser"
        :user="activeProfileUser"
        :current-user="currentUser"
        :photo-saving="photoSaving"
        :photo-error="photoError"
        @close="activeProfileUser = null"
        @open-password="showPasswordModal = true; activeProfileUser = null"
        @direct-chat="startDirectChat($event); activeProfileUser = null"
        @voice-call="startCallWithUser($event, 'voice'); activeProfileUser = null"
        @video-call="startCallWithUser($event, 'video'); activeProfileUser = null"
        @send-money="openSendMoneyModal($event); activeProfileUser = null"
        @photo-change="changeProfilePhoto"
        @photo-remove="removeProfilePhoto"
        @cover-change="changeCoverPhoto"
        @cover-remove="removeCoverPhoto"
      />
    </Transition>

    <!-- KEEP VAULT MODAL -->
    <Transition name="ln-modal">
      <KeepModal
        v-if="showKeepModal"
        v-model:keep-filter="keepFilter"
        v-model:keep-search="keepSearch"
        :keep-items="keepItems"
        :filtered-items="filteredKeepItems"
        @close="showKeepModal = false"
        @delete-item="deleteFromKeep"
      />
    </Transition>

    <!-- SEND MONEY MODAL -->
    <Transition name="ln-modal">
      <SendMoneyModal
        v-if="showSendMoneyModal"
        v-model:send-amount="sendAmountInput"
        v-model:send-memo="sendMemoInput"
        :target-friend="sendTargetFriend"
        @close="showSendMoneyModal = false"
        @submit="executeSendMoney"
      />
    </Transition>

    <!-- CHARGE MONEY MODAL -->
    <Transition name="ln-modal">
      <ChargeModal
        v-if="showChargeModal"
        @close="showChargeModal = false"
        @charge="executeChargeMoney"
      />
    </Transition>

    <!-- CREATE POLL MODAL -->
    <Transition name="ln-modal">
      <PollCreateModal
        v-if="showPollCreateModal"
        v-model:question="newPollQuestion"
        v-model:option1="newPollOption1"
        v-model:option2="newPollOption2"
        v-model:option3="newPollOption3"
        @close="showPollCreateModal = false"
        @submit="createPoll"
      />
    </Transition>

    <!-- CREATE EVENT MODAL -->
    <Transition name="ln-modal">
      <EventCreateModal
        v-if="showEventCreateModal"
        v-model:event-title="newEventTitle"
        v-model:event-date="newEventDate"
        v-model:event-location="newEventLocation"
        @close="showEventCreateModal = false"
        @submit="createEvent"
      />
    </Transition>

    <!-- SETTINGS & THEMES MODAL -->

    <Transition name="ln-modal">
      <ReportModal
        v-if="showReportModal"
        v-model:report-category="reportCategory"
        v-model:report-details="reportDetails"
        v-model:report-e2ee-consent="reportE2eeConsent"
        :report-message="reportMessage"
        @close="showReportModal = false"
        @submit="submitReport"
      />
    </Transition>
    <Transition name="ln-modal">
      <SafetyModal
        v-if="showSafetyModal"
        :rows="safetyRows"
        :loading="safetyLoading"
        :my-code="safetyMyCode"
        @close="showSafetyModal = false"
        @verify="verifySafetyDevice"
      />
    </Transition>
    <Transition name="ln-modal">
      <ApprovalBox
        v-if="showApprovalBox && selectedChat"
        :proposals="approvalProposals"
        :can-decide="approvalCanDecide()"
        :room-title="selectedChat.title"
        @close="showApprovalBox = false"
        @decide="decideProposal"
      />
    </Transition>
    <Transition name="ln-modal">
      <GroupSettingsModal
        v-if="showGroupSettings && selectedChat && selectedChat.kind === 'group'"
        :chat="selectedChat"
        :friends="friends"
        :my-id="currentUser?.id || ''"
        @close="showGroupSettings = false"
        @changed="onGroupChanged"
        @left="onGroupLeft"
      />
    </Transition>
    <Transition name="ln-modal">
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
    </Transition>

    <Transition name="ln-modal">
      <ContactPickerModal
        v-if="showContactPicker"
        :friends="friends"
        @close="showContactPicker = false"
        @share="shareContact"
      />
    </Transition>
    <!-- PASSWORD CHANGE MODAL -->
    <Transition name="ln-modal">
      <PasswordModal
        v-if="showPasswordModal"
        v-model:current-password="currentPasswordInput"
        v-model:new-password="newPasswordInput"
        v-model:confirm-password="confirmPasswordInput"
        :error="passwordChangeError"
        @close="showPasswordModal = false"
        @submit="submitPasswordChange"
      />
    </Transition>

    <!-- NEW STORY MODAL -->
    <Transition name="ln-modal">
      <StoryCreateModal
        v-if="showNewStoryModal"
        v-model:story-text="newStoryText"
        @close="showNewStoryModal = false"
        @submit="publishStory"
      />
    </Transition>

    <!-- NEW VOOM POST MODAL -->
    <Transition name="ln-modal">
      <VoomCreateModal
        v-if="showVoomCreateModal"
        v-model:body="newVoomBody"
        @close="showVoomCreateModal = false"
        @submit="createVoomPost"
      />
    </Transition>

    <!-- CREATE OPENCHAT MODAL -->
    <Transition name="ln-modal">
      <OpenChatCreateModal
        v-if="showCreateOpenChatModal"
        v-model:room-name="newOpenChatRoomName"
        v-model:room-desc="newOpenChatRoomDesc"
        @close="showCreateOpenChatModal = false"
        @submit="createOpenChatRoom"
      />
    </Transition>

    <!-- CREATE GROUP MODAL -->
    <Transition name="ln-modal">
      <CreateGroupModal
        v-if="showCreateGroupModal"
        v-model:group-title="groupTitleInput"
        v-model:selected-friend-ids="selectedFriendsForGroup"
        v-model:join-link="joinLinkInput"
        :friends="friends"
        @close="showCreateGroupModal = false"
        @submit="createGroupChat"
        @join="joinByLink"
      />
    </Transition>

    <!-- F7: FORWARD PICKER MODAL -->
    <Transition name="ln-modal">
      <ForwardPickerModal
        v-if="showForwardModal"
        :chats="chats"
        @close="showForwardModal = false"
        @forward="doForward"
      />
    </Transition>

    <!-- ADD FRIEND MODAL (Article 2.C) -->
    <Transition name="ln-modal">
      <AddFriendModal
        v-if="showAddFriendModal"
        v-model:handle-input="addFriendHandleInput"
        :results="addFriendResults"
        :searched="addFriendSearched"
        @close="showAddFriendModal = false"
        @search="searchUsersForAdd"
        @add-by-handle="addFriendByHandle"
        @add-by-id="addFriendById"
        @open-qr="showAddFriendModal = false; showQrModal = true"
        @share-invite="shareInviteLink"
      />
    </Transition>

    <!-- FX-17: NEW CALL contact picker (never dials blind) -->
    <Transition name="ln-modal">
      <NewCallModal
        v-if="showNewCallModal"
        :friends="friends"
        @close="showNewCallModal = false"
        @voice-call="showNewCallModal = false; startCallWithUser($event, 'voice')"
        @video-call="showNewCallModal = false; startCallWithUser($event, 'video')"
      />
    </Transition>

    <!-- NEW CHAT MODAL (Floating Action Button 💬+) -->
    <Transition name="ln-modal">
      <NewChatModal
        v-if="showNewChatModal"
        :friends="friends"
        @close="showNewChatModal = false"
        @make-group="showNewChatModal = false; showCreateGroupModal = true"
        @join-open-chat="showNewChatModal = false; activeNav = 'openchat'"
        @direct-chat="startDirectChat($event); showNewChatModal = false"
      />
    </Transition>


    <!-- Global LUNO PC Context Menu -->
    <LunoContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @close="contextMenu.visible = false"
    />
</template>
