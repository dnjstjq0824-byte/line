// Per-message actions: edit, react, unsend, copy, reply, hide, forward-picker
// state (P2 MessengerView split). Owns edit/forward state and item mutations;
// chat refs, reply target and the E2EE client are injected (deps precedent).
// doForward stays in the view (room re-encryption + list refresh).
// Extracted verbatim from views/MessengerView.vue.
import { ref, type Ref } from 'vue'
import { api, note, t, wrap } from '../store/session'
import type { getE2ee } from '../e2ee/client'
import type { Chat, Message } from '../../../shared/api'

export interface MessageActionsDeps {
  selectedChatId: Ref<string>
  chats: Ref<Chat[]>
  messages: Ref<Message[]>
  replyToMessage: Ref<Message | null>
  e2eeClient: () => ReturnType<typeof getE2ee> | null
}

export function useMessageActions(deps: MessageActionsDeps) {
  const editingMessageId = ref('')
  const editingMessageBody = ref('')

  function startEditMessage(msg: Message) {
    editingMessageId.value = msg.id
    editingMessageBody.value = msg.body
  }

  async function saveEditMessage() {
    if (!deps.selectedChatId.value || !editingMessageId.value || !editingMessageBody.value.trim()) return
    const mid = editingMessageId.value
    const newBody = editingMessageBody.value.trim()
    await wrap(async () => {
      const target = deps.messages.value.find(m => m.id === mid)
      let wireBody = newBody
      // E5: edits in E2EE rooms replace the envelope.
      if (target?._e2ee) {
        const room = deps.chats.value.find((c) => c.id === deps.selectedChatId.value)
        const c = deps.e2eeClient()
        if (!room || !c) return
        wireBody = (await c.encryptOutbound(room, target.kind, newBody)).body
      }
      await api(`/api/v1/conversations/${deps.selectedChatId.value}/messages/${mid}`, 'PATCH', { body: wireBody })
      if (target) {
        target.body = newBody
        target.edited_at = new Date().toISOString()
      }
      editingMessageId.value = ''
      editingMessageBody.value = ''
      note.value = t('mvMsgEdited')
    })
  }

  // React to a message
  async function reactToMessage(msgId: string, emoji: string) {
    if (!deps.selectedChatId.value) return
    await wrap(async () => {
      const res = await api<{ reactions: Record<string, number> }>(`/api/v1/conversations/${deps.selectedChatId.value}/messages/${msgId}/reactions`, 'POST', { reaction: emoji })
      const target = deps.messages.value.find(m => m.id === msgId)
      if (target) target.reactions = res.reactions
    })
  }

  // Unsend message within 24h
  async function unsendMessage(msgId: string) {
    if (!deps.selectedChatId.value) return
    await wrap(async () => {
      await api(`/api/v1/conversations/${deps.selectedChatId.value}/messages/${msgId}`, 'DELETE')
      const target = deps.messages.value.find(m => m.id === msgId)
      if (target) {
        // Mirror the server: flag set, body and metadata cleared. The renderers
        // show the marker from msg.unsent; stale metadata would re-render art.
        target.unsent = true
        target.body = ''
        target.metadata = undefined
      }
      note.value = t('mvUnsendOk')
    })
  }

  // Copy text helper
  function copyMessageText(text: string) {
    navigator.clipboard.writeText(text)
    note.value = t('mvCopied')
  }

  // Reply message helper
  function startReply(msg: Message) {
    deps.replyToMessage.value = msg
  }

  // F7: delete-for-me hides one side; forward copies into another room.
  const showForwardModal = ref(false)
  const forwardTargetMsg = ref<Message | null>(null)
  function openForwardPicker(msg: Message) {
    forwardTargetMsg.value = msg
    showForwardModal.value = true
  }
  async function hideMessage(msgId: string) {
    if (!deps.selectedChatId.value) return
    await wrap(async () => {
      await api(`/api/v1/conversations/${deps.selectedChatId.value}/messages/${msgId}/hide`, 'POST')
      deps.messages.value = deps.messages.value.filter((m) => m.id !== msgId)
      note.value = t('mvHideDone')
    })
  }

  return {
    editingMessageId,
    editingMessageBody,
    startEditMessage,
    saveEditMessage,
    reactToMessage,
    unsendMessage,
    copyMessageText,
    startReply,
    showForwardModal,
    forwardTargetMsg,
    openForwardPicker,
    hideMessage,
  }
}
