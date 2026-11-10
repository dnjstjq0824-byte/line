// I-4: session lifecycle (logout, local wipe, device revoke), extracted verbatim
// from MessengerView.vue. Owns the current device id; the view injects the
// chat/composer state a logout clears.
import { ref, type Ref } from 'vue'
import type { Router } from 'vue-router'

import { api, currentUser, error, note, t, token, wrap } from '../store/session'
import type { Chat, Message } from '../../../shared/api'

export interface AuthDeps {
  pendingSends: Map<string, AbortController>
  sendingConversations: Ref<Set<string>>
  discardVoiceRecording: () => void
  stopRealtime: () => void
  resetReconnect: () => void
  chats: Ref<Chat[]>
  selectedChatId: Ref<string>
  conversationDrafts: Map<string, { body: string; reply: Message | null }>
  draftMessage: Ref<string>
  replyToMessage: Ref<Message | null>
  messages: Ref<Message[]>
  stopCallTimer: () => void
  invalidateChatSelection: () => void
  loadDevices: () => Promise<void>
  router: Router
}

export function useAuth(deps: AuthDeps) {
  const {
    pendingSends, sendingConversations, discardVoiceRecording, stopRealtime,
    resetReconnect, chats, selectedChatId, conversationDrafts, draftMessage,
    replyToMessage, messages, stopCallTimer, invalidateChatSelection,
    loadDevices, router,
  } = deps

  const currentDeviceId = ref('')

  async function handleSecurityNoticeLogout(msg: any) {
    const sessionId = msg.metadata?.session_id
    if (!sessionId) {
      error.value = t('mvNoSessionInNotice')
      return
    }
    try {
      const res = await api<{ status: string; self?: boolean }>('/api/v1/auth/sessions/revoke', 'POST', { session_id: sessionId })
      if (res.self) {
        clearLocalSession()
        void router.push('/login')
        return
      }
      note.value = t('mvSessionRevoked')
      await loadDevices()
    } catch (e) {
      // Never claim success when the server did not revoke anything.
      error.value = e instanceof Error ? e.message : t('mvSessionRevokeFailed')
    }
  }

  async function revokeDevice(deviceId: string) {
    await wrap(async () => {
      const res = await api<{ self?: boolean }>(`/api/v1/devices/${deviceId}`, 'DELETE')
      if (res.self) {
        clearLocalSession()
        void router.push('/login')
        return
      }
      await loadDevices()
      note.value = t('mvDeviceRevoked')
    })
  }

  // --- Logout ---
  async function logout() {
    try {
      if (currentDeviceId.value) await api(`/api/v1/devices/${currentDeviceId.value}`, 'DELETE')
      else throw new Error('Current device unavailable')
    } catch { error.value = t('logout_unconfirmed') }
    clearLocalSession()
    void router.push('/login')
  }

  function clearLocalSession() {
    for (const controller of pendingSends.values()) controller.abort()
    pendingSends.clear()
    sendingConversations.value = new Set()
    invalidateChatSelection()
    discardVoiceRecording()
    stopRealtime()
    resetReconnect()
    localStorage.removeItem('luno.auth_token')
    sessionStorage.removeItem('luno.auth_token')
    localStorage.removeItem('luno.device_id')
    sessionStorage.removeItem('luno.device_id')
    currentDeviceId.value = ''
    token.value = ''
    currentUser.value = null
    chats.value = []
    selectedChatId.value = ''
    conversationDrafts.clear()
    draftMessage.value = ''
    replyToMessage.value = null
    messages.value = []
    stopCallTimer()
  }

  return {
    currentDeviceId,
    handleSecurityNoticeLogout,
    revokeDevice,
    logout,
    clearLocalSession,
  }
}
