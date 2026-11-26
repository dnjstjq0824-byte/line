// List-row actions for friends and chats (P2 MessengerView split). Owns
// favorite/block/follow and pin/mute/read/leave flows; roster and chat
// loaders plus selection are injected (deps precedent).
// Extracted verbatim from views/MessengerView.vue.
import type { Ref } from 'vue'
import { api, note, t, wrap } from '../store/session'
import type { Chat, User } from '../../../shared/api'

export interface RowActionsDeps {
  selectedChatId: Ref<string>
  selectChat: (convId: string) => Promise<void>
  loadChats: () => Promise<void>
  loadFriends: () => Promise<void>
  loadOfficialAccounts: () => Promise<void>
}

export function useRowActions(deps: RowActionsDeps) {
  async function toggleFriendFavorite(friend: User) {
    await wrap(async () => {
      const next = !(friend as any).is_favorite
      await api(`/api/v1/friends/${friend.id}`, 'PATCH', { favorite: next })
      ;(friend as any).is_favorite = next
      await deps.loadFriends()
      note.value = next ? t('mvFavAdded').replace('{name}', friend.display_name) : t('mvFavRemoved').replace('{name}', friend.display_name)
    })
  }

  async function toggleFriendBlock(friend: User) {
    await wrap(async () => {
      const next = !(friend as any).is_blocked
      await api(`/api/v1/friends/${friend.id}`, 'PATCH', { blocked: next })
      ;(friend as any).is_blocked = next
      await deps.loadFriends()
      note.value = next ? t('mvBlocked').replace('{name}', friend.display_name) : t('mvUnblocked').replace('{name}', friend.display_name)
    })
  }

  async function followOrOpenOfficialAccount(oa: { id: string; name: string; followed: boolean }) {
    await wrap(async () => {
      const res = await api<{ conversation_id?: string }>(`/api/v1/official-accounts/${oa.id}/follow`, 'POST', {})
      await Promise.all([deps.loadOfficialAccounts(), deps.loadChats()])
      if (res.conversation_id) {
        await deps.selectChat(res.conversation_id)
      }
    })
  }

  async function openKeepMemoChat() {
    await deps.selectChat('keep-memo')
  }

  async function toggleChatPin(chat: Chat) {
    await wrap(async () => {
      const next = !(chat as any).pinned
      await api(`/api/v1/conversations/${chat.id}/meta`, 'PATCH', { pinned: next })
      ;(chat as any).pinned = next
      await deps.loadChats()
      note.value = next ? t('mvChatPinned') : t('mvChatUnpinned')
    })
  }

  async function toggleChatMute(chat: Chat) {
    await wrap(async () => {
      const next = !(chat as any).muted
      await api(`/api/v1/conversations/${chat.id}/meta`, 'PATCH', { muted: next })
      ;(chat as any).muted = next
      await deps.loadChats()
      note.value = next ? t('mvChatMuted') : t('mvChatUnmuted')
    })
  }

  async function markChatAsRead(chat: Chat) {
    await wrap(async () => {
      await api(`/api/v1/conversations/${chat.id}/read`, 'POST', { sequence: chat.last_sequence || 999999 })
      await deps.loadChats()
      note.value = t('mvMarkedRead')
    })
  }

  async function markAllChatsRead() {
    await wrap(async () => {
      await api('/api/v1/conversations/read-all', 'POST', {})
      await deps.loadChats()
      note.value = t('mvAllMarkedRead')
    })
  }

  async function leaveOrHideChat(chat: Chat) {
    await wrap(async () => {
      await api(`/api/v1/conversations/${chat.id}`, 'DELETE')
      if (deps.selectedChatId.value === chat.id) deps.selectedChatId.value = ''
      await deps.loadChats()
      note.value = t('mvLeftChat')
    })
  }

  return {
    toggleFriendFavorite,
    toggleFriendBlock,
    followOrOpenOfficialAccount,
    openKeepMemoChat,
    toggleChatPin,
    toggleChatMute,
    markChatAsRead,
    markAllChatsRead,
    leaveOrHideChat,
  }
}
