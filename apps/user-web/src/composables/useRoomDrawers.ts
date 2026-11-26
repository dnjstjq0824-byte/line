// Room drawers: pins, polls, notes, albums, events, media, search
// (P2 MessengerView split). Owns drawer state, loaders and mutations; the
// selected chat, room list and message list are injected (deps precedent).
// Extracted verbatim from views/MessengerView.vue.
import { ref, type Ref } from 'vue'
import { api, note, t, wrap } from '../store/session'
import type { Chat, Message, User } from '../../../shared/api'

export interface RoomDrawersDeps {
  selectedChatId: Ref<string>
  chats: Ref<Chat[]>
  messages: Ref<Message[]>
}

export function useRoomDrawers(deps: RoomDrawersDeps) {
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
  const showPollCreateModal = ref(false)
  const newPollQuestion = ref('')
  const newPollOption1 = ref('')
  const newPollOption2 = ref('')
  const newPollOption3 = ref('')
  const showEventCreateModal = ref(false)
  const newEventTitle = ref('')
  const newEventDate = ref('')
  const newEventLocation = ref('')

  let pollLoadVersion = 0
  async function loadPolls(convId: string) {
    const version = ++pollLoadVersion
    try {
      const res = await api<{ polls: any[] }>(`/api/v1/conversations/${convId}/polls`)
      if (deps.selectedChatId.value === convId && version === pollLoadVersion) {
        activePolls.value = res.polls || []
      }
    } catch {}
  }

  let noteLoadVersion = 0
  async function loadNotes(convId: string) {
    const version = ++noteLoadVersion
    try {
      const res = await api<{ notes: any[] }>(`/api/v1/conversations/${convId}/notes`)
      if (deps.selectedChatId.value === convId && version === noteLoadVersion) {
        chatNotes.value = res.notes || []
      }
    } catch {}
  }

  let eventLoadVersion = 0
  async function loadEvents(convId: string) {
    const version = ++eventLoadVersion
    try {
      const res = await api<{ events: any[] }>(`/api/v1/conversations/${convId}/events`)
      if (deps.selectedChatId.value === convId && version === eventLoadVersion) {
        chatEvents.value = res.events || []
      }
    } catch {}
  }

  function toggleDrawer(tab: 'notes' | 'albums' | 'events' | 'media') {
    if (!deps.selectedChatId.value) { note.value = t('mvDrawerNeedChat'); return }
    if (activeDrawer.value === tab) {
      activeDrawer.value = 'none'
    } else {
      activeDrawer.value = tab
      if (tab === 'notes' && deps.selectedChatId.value) loadNotes(deps.selectedChatId.value)
      if (tab === 'albums' && deps.selectedChatId.value) loadAlbums(deps.selectedChatId.value)
      if (tab === 'events' && deps.selectedChatId.value) loadEvents(deps.selectedChatId.value)
      if (tab === 'media' && deps.selectedChatId.value) loadConversationMedia(deps.selectedChatId.value)
    }
  }

  async function loadAlbums(convId: string) {
    try {
      const res = await api<{ albums: any[] }>(`/api/v1/conversations/${convId}/albums`)
      if (deps.selectedChatId.value === convId) chatAlbums.value = res.albums || []
    } catch {}
  }

  async function createAlbum() {
    if (!deps.selectedChatId.value || !newAlbumTitle.value.trim()) return
    const cid = deps.selectedChatId.value
    await wrap(async () => {
      await api(`/api/v1/conversations/${cid}/albums`, 'POST', { title: newAlbumTitle.value.trim() })
      newAlbumTitle.value = ''
      await loadAlbums(cid)
      note.value = t('mvAlbumCreated')
    })
  }

  async function createNote() {
    if (!deps.selectedChatId.value || !newNoteBody.value.trim()) return
    const cid = deps.selectedChatId.value
    await wrap(async () => {
      await api(`/api/v1/conversations/${cid}/notes`, 'POST', { body: newNoteBody.value.trim() })
      newNoteBody.value = ''
      await loadNotes(cid)
      note.value = t('mvNoteCreated')
    })
  }

  async function deleteNoteItem(noteId: string) {
    if (!deps.selectedChatId.value) return
    const cid = deps.selectedChatId.value
    await wrap(async () => {
      await api(`/api/v1/conversations/${cid}/notes/${noteId}`, 'DELETE')
      await loadNotes(cid)
    })
  }

  async function rsvpEvent(eventId: string, status: 'going' | 'maybe' | 'declined') {
    await wrap(async () => {
      await api(`/api/v1/events/${eventId}/rsvp`, 'POST', { status })
      if (deps.selectedChatId.value) await loadEvents(deps.selectedChatId.value)
      note.value = t('mvRsvpSaved')
    })
  }

  async function loadConversationMedia(convId: string) {
    try {
      const res = await api<{ media: any[] }>(`/api/v1/conversations/${convId}/media`)
      if (deps.selectedChatId.value === convId) chatMediaList.value = res.media || []
    } catch {}
  }

  async function runConversationSearch() {
    if (!deps.selectedChatId.value) return
    const q = chatSearchQuery.value.trim()
    if (!q) {
      chatSearchResults.value = []
      return
    }
    // E8: sealed rooms search the on-device decrypted cache — the server
    // never sees the query matched against sealed bodies.
    const sealedRoom = deps.chats.value.find((c) => c.id === deps.selectedChatId.value)?.e2ee === true
    if (sealedRoom) {
      const ql = q.toLowerCase()
      chatSearchResults.value = deps.messages.value
        .filter((m) => !m.unsent && !m._e2eeError && m.kind !== 'ciphertext' && typeof m.body === 'string' && m.body.toLowerCase().includes(ql))
        .slice(-50)
        .reverse()
      return
    }
    try {
      const res = await api<{ results?: any[]; messages?: any[] }>(`/api/v1/conversations/${deps.selectedChatId.value}/search?q=${encodeURIComponent(q)}`)
      chatSearchResults.value = res.results || res.messages || []
    } catch {}
  }

  async function pinMessage(msgId: string) {
    if (!deps.selectedChatId.value) return
    await wrap(async () => {
      await api(`/api/v1/conversations/${deps.selectedChatId.value}/pins`, 'POST', { message_id: msgId })
      const res = await api<{ pins: any[] }>(`/api/v1/conversations/${deps.selectedChatId.value}/pins`)
      pinnedList.value = res.pins || []
      note.value = t('mvNoticePinned')
    })
  }

  async function unpinMessage(msgId: string) {
    if (!deps.selectedChatId.value) return
    await wrap(async () => {
      await api(`/api/v1/conversations/${deps.selectedChatId.value}/pins/${msgId}`, 'DELETE')
      pinnedList.value = pinnedList.value.filter(p => p.message_id !== msgId)
      note.value = t('mvNoticeUnpinned')
    })
  }

  // --- Polls & Events ---
  async function createPoll() {
    if (!deps.selectedChatId.value || !newPollQuestion.value.trim() || !newPollOption1.value.trim() || !newPollOption2.value.trim()) return
    const convId = deps.selectedChatId.value
    await wrap(async () => {
      const opts = [newPollOption1.value.trim(), newPollOption2.value.trim()]
      if (newPollOption3.value.trim()) opts.push(newPollOption3.value.trim())
      await api<any>(`/api/v1/conversations/${convId}/polls`, 'POST', {
        question: newPollQuestion.value.trim(),
        options: opts
      })
      if (deps.selectedChatId.value === convId) await loadPolls(convId)
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
    if (!deps.selectedChatId.value || !newEventTitle.value.trim() || !newEventDate.value) return
    await wrap(async () => {
      const ev = await api<any>(`/api/v1/conversations/${deps.selectedChatId.value}/events`, 'POST', {
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

  return {
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
    loadNotes,
    loadEvents,
    toggleDrawer,
    loadAlbums,
    createAlbum,
    createNote,
    deleteNoteItem,
    rsvpEvent,
    loadConversationMedia,
    runConversationSearch,
    pinMessage,
    unpinMessage,
    createPoll,
    votePoll,
    createEvent,
  }
}
