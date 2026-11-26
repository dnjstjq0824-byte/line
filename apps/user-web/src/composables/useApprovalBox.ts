// Room approval box + group-settings sync (P2 MessengerView split). Owns
// proposals, group modal flags and decision actions; chat refs, selection
// and loaders are injected (deps precedent).
// Extracted verbatim from views/MessengerView.vue.
import { ref, type Ref } from 'vue'
import { api, currentUser, note, t, wrap } from '../store/session'
import type { Chat, User } from '../../../shared/api'

export interface ApprovalBoxDeps {
  chats: Ref<Chat[]>
  selectedChat: Ref<Chat | null>
  selectedChatId: Ref<string>
  selectChat: (convId: string) => Promise<void>
  loadChats: () => Promise<void>
}

export function useApprovalBox(deps: ApprovalBoxDeps) {
  // L-05: approval box state (room proposals + per-message decision states).
  const showApprovalBox = ref(false)
  // F6: group settings modal state.
  const showGroupSettings = ref(false)
  const approvalProposals = ref<Array<{ message_id: string; body: string; author_id: string; author_name: string; created_at: string; state: string; decided_by: string | null }>>([])
  const proposalStates = ref<Record<string, string>>({})

  async function loadProposalStates(convId: string) {
    try {
      const res = await api<{ proposals: Array<{ message_id: string; state: string }> }>(`/api/v1/conversations/${convId}/proposals`)
      const map: Record<string, string> = {}
      for (const p of res.proposals || []) map[p.message_id] = p.state
      proposalStates.value = map
    } catch {
      proposalStates.value = {}
    }
  }
  // F6: keep the chat list in sync with group settings changes.
  function onGroupChanged(updated: Chat) {
    const i = deps.chats.value.findIndex((c) => c.id === updated.id)
    if (i >= 0) deps.chats.value[i] = { ...deps.chats.value[i], ...updated }
  }
  async function onGroupLeft() {
    showGroupSettings.value = false
    deps.selectedChatId.value = ''
    await deps.loadChats()
  }
  async function openApprovalBox() {
    if (!deps.selectedChatId.value) return
    await wrap(async () => {
      const res = await api<{ proposals: typeof approvalProposals.value }>(`/api/v1/conversations/${deps.selectedChatId.value}/proposals`)
      approvalProposals.value = res.proposals || []
      showApprovalBox.value = true
    })
  }
  function approvalCanDecide(): boolean {
    const me = currentUser.value
    const chat = deps.selectedChat.value
    if (!me || !chat) return false
    if ((me as User).role === 'admin') return true
    if (chat.kind === 'direct') return true
    if ((chat as Chat).my_role === 'admin') return true
    return (chat as Chat).owner_id === me.id
  }
  async function decideProposal(msgOrId: { id: string } | string, decision: 'approved' | 'rejected') {
    if (!deps.selectedChatId.value) return
    const messageId = typeof msgOrId === 'string' ? msgOrId : msgOrId.id
    await wrap(async () => {
      await api(`/api/v1/conversations/${deps.selectedChatId.value}/messages/${messageId}/decide`, 'POST', { decision })
      note.value = decision === 'approved' ? t('apprApprovedState') : t('apprRejectedState')
      await deps.selectChat(deps.selectedChatId.value)
      await loadProposalStates(deps.selectedChatId.value)
      if (showApprovalBox.value) {
        const res = await api<{ proposals: typeof approvalProposals.value }>(`/api/v1/conversations/${deps.selectedChatId.value}/proposals`).catch(() => ({ proposals: [] }))
        approvalProposals.value = res.proposals || []
      }
    })
  }

  return {
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
  }
}
