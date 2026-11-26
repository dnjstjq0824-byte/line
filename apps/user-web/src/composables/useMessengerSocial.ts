// Stories / VOOM / OpenChat (P2 MessengerView split). Owns timelines,
// drafts, likes, comments and community rooms; server state only.
// Extracted verbatim from views/MessengerView.vue.
import { ref } from 'vue'
import { api, currentUser, note, t, wrap } from '../store/session'
import type { User } from '../../../shared/api'

export type OpenChatRoom = { id: string; name: string; description: string; visibility: string }
export type OpenChatPost = { id: string; author_id: string; body: string; created_at: string }
export type StoryItem = { id: string; author?: User; author_name?: string; body?: string; text?: string; bg: string; created_at: string; viewed?: boolean }
export type VoomItem = { id: string; title?: string; body?: string; emoji?: string; media_emoji?: string; bg?: string; media_bg?: string; author?: User; author_name?: string; like_count?: number; likes?: number; liked?: boolean; comments: Array<{ id: string; author?: User; author_name?: string; body?: string; text?: string }> }

export function useMessengerSocial() {
  const openChatRooms = ref<Array<OpenChatRoom>>([])
  const selectedOpenChatRoom = ref<{ id: string; name: string; description: string } | null>(null)
  const openChatPosts = ref<Array<OpenChatPost>>([])
  const newOpenChatRoomName = ref('')
  const newOpenChatRoomDesc = ref('')
  const newOpenChatPostBody = ref('')
  const showCreateOpenChatModal = ref(false)
  const showVoomCreateModal = ref(false)
  const newVoomBody = ref('')
  const newVoomComment = ref<Record<string, string>>({})

  const stories = ref<Array<StoryItem>>([])
  const voomVideos = ref<Array<VoomItem>>([])
  const newStoryText = ref('')
  const showNewStoryModal = ref(false)

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

  async function loadOpenChatRooms() {
    try {
      const res = await api<{ rooms: any[] }>('/api/v1/community/rooms')
      openChatRooms.value = res.rooms || []
    } catch {}
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
      note.value = t('mvStoryPosted')
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
      note.value = t('mvVoomPosted')
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
      note.value = t('mvOpenChatCreated')
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

  return {
    openChatRooms,
    selectedOpenChatRoom,
    openChatPosts,
    newOpenChatRoomName,
    newOpenChatRoomDesc,
    newOpenChatPostBody,
    showCreateOpenChatModal,
    showVoomCreateModal,
    newVoomBody,
    newVoomComment,
    stories,
    voomVideos,
    newStoryText,
    showNewStoryModal,
    loadTimelineStories,
    loadOpenChatRooms,
    publishStory,
    createVoomPost,
    likeVoomPost,
    submitVoomComment,
    createOpenChatRoom,
    selectOpenChatRoom,
    submitOpenChatPost,
  }
}
