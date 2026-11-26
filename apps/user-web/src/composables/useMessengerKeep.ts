// Keep vault (P2 MessengerView split). Owns saved messages, filters and the
// modal flag; openKeepMemoChat stays in the view (it selects the keep room).
// Extracted verbatim from views/MessengerView.vue.
import { computed, ref } from 'vue'
import { api, note, t, token, wrap } from '../store/session'
import type { Message } from '../../../shared/api'

export type KeepItem = { id: string; body: string; kind: string; created_at: string; message_id?: string }

export function useMessengerKeep() {
  const keepItems = ref<Array<KeepItem>>([])
  const keepFilter = ref<'all' | 'text' | 'image' | 'link'>('all')
  const keepSearch = ref('')
  const showKeepModal = ref(false)

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

  // Save message to Keep
  async function saveToKeep(msg: Message) {
    await wrap(async () => {
      await api('/api/v1/saved-messages', 'POST', {
        body: msg.body,
        kind: msg.kind,
        message_id: msg.id
      })
      await loadKeep()
      note.value = t('mvKeepSaved')
    })
  }

  async function deleteFromKeep(item: any) {
    const sid = item.id || item.message_id
    if (!sid) return
    await wrap(async () => {
      await api(`/api/v1/saved-messages/${sid}`, 'DELETE')
      await loadKeep()
      note.value = t('mvKeepDeleted')
    })
  }

  return {
    keepItems,
    keepFilter,
    keepSearch,
    showKeepModal,
    loadKeep,
    filteredKeepItems,
    saveToKeep,
    deleteFromKeep,
  }
}
