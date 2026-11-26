// Chat/friend list filters and badges (P2 MessengerView split). Owns search
// inputs, filters and derived lists; the room and friend lists are injected.
// Extracted verbatim from views/MessengerView.vue.
import { computed, ref, type Ref } from 'vue'
import type { Chat, User } from '../../../shared/api'

export interface ChatListFiltersDeps {
  chats: Ref<Chat[]>
  friends: Ref<User[]>
}

export function useChatListFilters(deps: ChatListFiltersDeps) {
  const searchKeyword = ref('')
  const friendSearchQuery = ref('')
  const chatFilter = ref<'all' | 'direct' | 'group' | 'unread'>('all')
  const chatSortAsc = ref(false)

  // Chat search / filter
  const filteredChats = computed(() => {
    let list = deps.chats.value.filter(c => {
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

  // Compute total unread count (Numeric badge invariant: exclude non-numeric 'N' badges)
  const totalUnreadCount = computed(() => deps.chats.value.reduce((sum, c) => sum + (c.badge_n ? 0 : (c.unread_count || 0)), 0))

  const groupChats = computed(() => deps.chats.value.filter(c => c.kind === 'group'))

  const filteredFriends = computed(() => {
    if (!friendSearchQuery.value.trim()) return deps.friends.value
    const q = friendSearchQuery.value.toLowerCase().trim()
    return deps.friends.value.filter(f =>
      (f.display_name || '').toLowerCase().includes(q) ||
      (f.status_message || '').toLowerCase().includes(q) ||
      (f.handle || '').toLowerCase().includes(q)
    )
  })
  const favoriteFriends = computed(() => filteredFriends.value.filter(f => (f as any).is_favorite))

  return {
    searchKeyword,
    friendSearchQuery,
    chatFilter,
    chatSortAsc,
    filteredChats,
    totalUnreadCount,
    groupChats,
    filteredFriends,
    favoriteFriends,
  }
}
