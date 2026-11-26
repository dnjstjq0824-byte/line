// Chat list loader (P2 MessengerView split). Owns list fetch, snapshot,
// Keep localization and the channel slot; the room list is injected.
// Extracted verbatim from views/MessengerView.vue.
import { ref, type Ref } from 'vue'
import { api, t, token } from '../store/session'
import { isKeepRoomId, readSnapshot, writeSnapshot } from '../messenger-utils'
import type { Chat } from '../../../shared/api'

export interface ChatLoaderDeps {
  chats: Ref<Chat[]>
}

const CHATS_SNAPSHOT_KEY = 'luno-chats-snapshot'

export function useChatLoader(deps: ChatLoaderDeps) {
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

  // The server names the Keep room in Korean; show it in the app language.
  function localizeKeepRoom(c: Chat): Chat {
    return isKeepRoomId(c.id) ? { ...c, title: t('keepMemo') } : c
  }

  async function loadChats() {
    const sessionToken = token.value
    if (!deps.chats.value.length) {
      const snap = readSnapshot<Chat>(CHATS_SNAPSHOT_KEY)
      if (snap && snap.length) deps.chats.value = snap.map(localizeKeepRoom)
    }
    try {
      const res = await api<{ conversations: Chat[] }>('/api/v1/conversations')
      if (sessionToken === token.value) {
        deps.chats.value = (res.conversations || []).map(localizeKeepRoom)
        writeSnapshot(CHATS_SNAPSHOT_KEY, deps.chats.value)
      }
    } catch {}
    void loadChannelSlot()
  }

  return {
    channelSlot,
    loadChannelSlot,
    localizeKeepRoom,
    loadChats,
  }
}
