// Friends, groups and direct chats (P2 MessengerView split). Owns the roster,
// group/add-friend drafts and their actions; chat list, selection, navigation
// and loaders are injected (deps precedent).
// Extracted verbatim from views/MessengerView.vue.
import { ref, type Ref } from 'vue'
import { api, currentUser, error, note, t, wrap } from '../store/session'
import type { Chat, User } from '../../../shared/api'
import { findDirectChatId } from '../../../shared/direct_chat'
import type { NavItem } from '../router'

export interface FriendsGroupsDeps {
  chats: Ref<Chat[]>
  activeNav: Ref<NavItem>
  selectedChatId: Ref<string>
  selectChat: (convId: string) => Promise<void>
  loadChats: () => Promise<void>
}

export function useFriendsGroups(deps: FriendsGroupsDeps) {
  const friends = ref<User[]>([])
  const officialAccounts = ref<Array<{ id: string; name: string; handle: string; description: string; color: string; followed: boolean }>>([])
  const selectedFriendProfile = ref<User | null>(null)
  const showCreateGroupModal = ref(false)
  const groupTitleInput = ref('')
  const selectedFriendsForGroup = ref<string[]>([])
  // F6: paste an invite link or raw token to join.
  const joinLinkInput = ref('')
  const showAddFriendModal = ref(false)
  const addFriendHandleInput = ref('')
  const addFriendResults = ref<User[]>([])
  const addFriendSearched = ref(false)

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

  // --- Friends & Direct Chat ---
  async function startDirectChat(friend: User) {
    await wrap(async () => {
      const existingId = findDirectChatId(deps.chats.value, currentUser.value?.id || '', friend.id)
      if (existingId) {
        deps.activeNav.value = 'chats'
        await deps.selectChat(existingId)
        return
      }
      const c = await api<{ id: string }>('/api/v1/conversations', 'POST', {
        kind: 'direct',
        member_ids: [friend.id],
        title: friend.display_name
      })
      await deps.loadChats()
      if (!deps.chats.value.some(chat => chat.id === c.id)) {
        error.value = t('mvDirectOpenFailed')
        return
      }
      deps.activeNav.value = 'chats'
      await deps.selectChat(c.id)
    })
  }

  // F6: join a group from a pasted invite link or raw token.
  async function joinByLink() {
    const raw = joinLinkInput.value.trim()
    if (!raw) return
    const token = raw.includes('/invite/') ? raw.slice(raw.lastIndexOf('/invite/') + 8).split(/[?#\s]/)[0] : raw.split(/[?#\s]/)[0]
    if (!token) return
    await wrap(async () => {
      const c = await api<Chat>('/api/v1/conversations/join', 'POST', { token })
      joinLinkInput.value = ''
      showCreateGroupModal.value = false
      await deps.loadChats()
      note.value = t('gsJoined')
      await deps.selectChat(c.id)
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
      await deps.loadChats()
      deps.activeNav.value = 'chats'
      await deps.selectChat(c.id)
      note.value = t('mvGroupCreated')
    })
  }

  async function addFriendByHandle() {
    if (!addFriendHandleInput.value.trim()) return
    await wrap(async () => {
      await api('/api/v1/friends', 'POST', { handle: addFriendHandleInput.value.trim() })
      addFriendHandleInput.value = ''
      showAddFriendModal.value = false
      await loadFriends()
      note.value = t('mvFriendAdded')
    })
  }

  async function searchUsersForAdd() {
    // Search is by exact ID only (3-20 chars, the server's handle shape).
    const q = addFriendHandleInput.value.trim().replace(/^@/, '')
    if (q.length < 3) return
    await wrap(async () => {
      const res = await api<{ users: User[] }>(`/api/v1/users?q=${encodeURIComponent(q)}`)
      addFriendResults.value = res.users || []
      addFriendSearched.value = true
      if (addFriendResults.value.length === 0) error.value = t('mvAddFriendNoMatch')
    })
  }

  async function addFriendById(id: string) {
    await wrap(async () => {
      await api('/api/v1/friends', 'POST', { friend_id: id })
      addFriendHandleInput.value = ''
      addFriendResults.value = []
      addFriendSearched.value = false
      showAddFriendModal.value = false
      await loadFriends()
      note.value = t('mvFriendAdded')
    })
  }

  function selectFriend(f: User) {
    selectedFriendProfile.value = f
    deps.selectedChatId.value = ''
  }

  function onStartChatFromProfile(f: User) {
    selectedFriendProfile.value = null
    startDirectChat(f)
  }

  return {
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
  }
}
