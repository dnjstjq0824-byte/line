// I-4: realtime transport (socket + backoff + offline reconcile), extracted
// verbatim from MessengerView.vue. Owns the connection lifecycle; the view
// injects the message/chat state each socket event fans out to.
import { ref, type Ref } from 'vue'

import { api, currentUser, error, t, token } from '../store/session'
import { ApiError, request, wsURL, type Message } from '../../../shared/api'
import { flushOfflineQueue } from '../messenger-utils'
import { playReceiveSound } from '../sound-effects'
import type { ActiveCallState } from './useWebRTC'

export interface ChatSocketDeps {
  selectedChatId: Ref<string>
  messages: Ref<Message[]>
  messagesCanvasRef: Ref<HTMLElement | null>
  scrollToBottom: () => void
  autoTranslateEnabled: Ref<boolean>
  handleTranslateMessage: (msg: Message) => Promise<void>
  loadChats: () => Promise<void>
  loadPolls: (convId: string) => Promise<void>
  loadKeep: () => Promise<void>
  onAuthExpired: () => void
  activeCall: Ref<ActiveCallState | null>
  handleIncomingCallSignal: (data: any) => Promise<void>
  endCallLocally: () => void
  startCallTimer: () => void
}

export function useChatSocket(deps: ChatSocketDeps) {
  const {
    selectedChatId, messages, messagesCanvasRef, scrollToBottom,
    autoTranslateEnabled, handleTranslateMessage, loadChats, loadPolls,
    loadKeep, onAuthExpired, activeCall, handleIncomingCallSignal,
    endCallLocally, startCallTimer,
  } = deps

  // --- Realtime WebSocket ---
  let socket: WebSocket | null = null
  const realtimeState = ref<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting')
  let realtimeGeneration = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let messageSyncTimer: ReturnType<typeof setInterval> | null = null
  let messageSyncInFlight: Promise<void> | null = null
  // Each reconcile costs four API calls (sync, messages, read, conversations). While the
  // realtime socket is open the Durable Object hub already delivers every event, so the
  // poll only runs as a slow safety net; it falls back to every tick when the socket is
  // down or the last reconcile failed (for example an offline message still queued).
  const MESSAGE_SYNC_TICK_MS = 10000
  const MESSAGE_SYNC_CONNECTED_MS = 60000
  let lastMessageSyncAt = 0
  let lastMessageSyncOk = false
  const reportedReadSequence = new Map<string, number>()
  function stopRealtime() {
    realtimeGeneration++
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    socket?.close()
    socket = null
  }
  function scheduleReconnect(generation: number) {
    if (generation !== realtimeGeneration || !token.value || reconnectTimer) return
    realtimeState.value = navigator.onLine ? 'reconnecting' : 'offline'
    if (!navigator.onLine) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connectRealtime()
    }, Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts++, 5)))
  }

  // --- Realtime WebSocket Connection ---
  async function connectRealtime() {
    stopRealtime()
    if (!token.value) return
    const generation = realtimeGeneration
    const sessionToken = token.value
    realtimeState.value = navigator.onLine ? 'connecting' : 'offline'
    if (!navigator.onLine) return
    try {
      const { ticket } = await api<{ ticket: string }>('/api/v1/ws-ticket', 'POST')
      if (generation !== realtimeGeneration || sessionToken !== token.value) return
      const connection = new WebSocket(wsURL(ticket))
      socket = connection
      connection.onclose = () => scheduleReconnect(generation)
      connection.onerror = () => connection.close()
      connection.onopen = () => {
        if (generation !== realtimeGeneration) return
        realtimeState.value = 'connected'
        reconnectAttempts = 0
        void processOfflineQueue()
      }
      connection.onmessage = (event) => {
        if (generation !== realtimeGeneration) return
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'message.created') {
            const msg = data.message as Message
            if (msg.conversation_id === selectedChatId.value && !messages.value.some(m => m.id === msg.id)) {
              const canvas = messagesCanvasRef.value
              const followLatest = !canvas || canvas.scrollHeight - canvas.scrollTop - canvas.clientHeight < 100
              messages.value.push(msg)
              if (currentUser.value && msg.sender_id !== currentUser.value.id) {
                if (document.visibilityState === 'visible') {
                  void api(`/api/v1/conversations/${msg.conversation_id}/read`, 'POST', { sequence: msg.sequence }).catch(() => {})
                }
                if (followLatest) scrollToBottom()
                playReceiveSound()
                if (autoTranslateEnabled.value && msg.kind === 'text') {
                  void handleTranslateMessage(msg)
                }
              }
            }
            void loadChats()
          } else if (data.type === 'message.updated') {
            const mid = data.message_id || data.message?.id
            const target = messages.value.find(m => m.id === mid)
            if (target) {
              target.body = data.body || data.message?.body || target.body
              target.edited_at = data.message?.edited_at || new Date().toISOString()
            }
          } else if (data.type === 'message.unsent' || data.type === 'message.deleted') {
            const target = messages.value.find(m => m.id === data.message_id)
            if (target) {
              target.unsent = true
              target.body = t('mvMsgUnsent')
            }
          } else if (data.type === 'message.reaction') {
            const target = messages.value.find(m => m.id === data.message_id)
            if (target) target.reactions = data.reactions
          } else if (data.type === 'conversation.read') {
            void loadChats()
            if (data.conversation_id === selectedChatId.value) {
              messages.value.forEach(m => {
                if (data.user_id !== currentUser.value?.id && m.sequence <= (data.sequence || 0)) m.read_count = Math.max(m.read_count || 0, 1)
              })
            }
          } else if (data.type === 'call.ringing') {
            const ownEcho = (data.initiated_by && data.initiated_by === currentUser.value?.id) || activeCall.value?.id === data.call_id
            if (!ownEcho) {
              activeCall.value = { id: data.call_id, kind: data.kind || 'voice', state: 'ringing', title: data.caller_name || data.caller_handle || t('mvIncomingTitle'), direction: 'incoming' }
            }
          } else if (data.type === 'call.signal') {
            void handleIncomingCallSignal(data)
          } else if (data.type === 'call.state') {
            if (data.state === 'ended') {
              endCallLocally()
            } else if (activeCall.value && activeCall.value.id === data.call_id) {
              activeCall.value.state = 'connected'
              startCallTimer()
            }
          } else if (data.type === 'poll.updated' || data.type === 'poll.created' || data.type === 'poll.closed') {
            if (data.conversation_id === selectedChatId.value) void loadPolls(selectedChatId.value)
          } else if (data.type === 'saved-messages.updated') {
            void loadKeep()
          }
        } catch {
          // ignore malformed ws message
        }
      }
    } catch (err) {
      if (generation !== realtimeGeneration) return
      if (err instanceof ApiError && err.status === 401) {
        onAuthExpired()
        error.value = t('session_expired')
        return
      }
      scheduleReconnect(generation)
    }
  }

  async function processOfflineQueue() {
    if (messageSyncInFlight) return messageSyncInFlight
    messageSyncInFlight = synchronizeMessages()
    try { await messageSyncInFlight } finally { messageSyncInFlight = null }
  }

  async function synchronizeMessages() {
    if (!token.value || !currentUser.value) return
    const sessionToken = token.value
    const ownerId = currentUser.value.id
    const recoveryConvId = selectedChatId.value
    const recoveryAfter = messages.value.reduce((highest, msg) => Math.max(highest, msg.sequence), 0)
    lastMessageSyncAt = Date.now()
    lastMessageSyncOk = false
    try {
      await flushOfflineQueue(ownerId, async (msg) => {
        if (sessionToken !== token.value) throw new Error('Session changed')
        await request(`/api/v1/conversations/${msg.conversation_id}/messages`, sessionToken, 'POST', {
          client_id: msg.client_id,
          kind: msg.kind,
          body: msg.body,
          ...(msg.reply_to ? { reply_to: msg.reply_to } : {})
        })
      })
      if (sessionToken !== token.value) return
      if (selectedChatId.value) {
        const convId = selectedChatId.value
        // Replay every missed sequence, including gaps larger than the latest-page size.
        const missed: Message[] = []
        let after = convId === recoveryConvId ? recoveryAfter : 0
        while (sessionToken === token.value && selectedChatId.value === convId) {
          const delta = await api<{ messages?: Message[]; delta_messages?: Message[] }>(`/api/v1/conversations/${convId}/sync?after_sequence=${after}&since_sequence=${after}&limit=500`)
          const batch = delta.messages || delta.delta_messages || []
          missed.push(...batch)
          const next = batch.reduce((highest, msg) => Math.max(highest, msg.sequence), after)
          if (batch.length < 500 || next <= after) break
          after = next
        }
        const { messages: recovered } = await api<{ messages: Message[] }>(`/api/v1/conversations/${convId}/messages?limit=50`)
        if (sessionToken === token.value && selectedChatId.value === convId) {
          const byId = new Map(messages.value.map(m => [m.id, m]))
          for (const message of [...missed, ...(recovered || [])]) byId.set(message.id, message)
          messages.value = [...byId.values()].sort((a, b) => a.sequence - b.sequence)
          const last = messages.value[messages.value.length - 1]
          // Report a read position only when it moved; the server keeps the maximum anyway.
          if (last && document.visibilityState === 'visible' && last.sequence > (reportedReadSequence.get(`${ownerId}:${convId}`) || 0)) {
            await api(`/api/v1/conversations/${convId}/read`, 'POST', { sequence: last.sequence })
              .then(() => reportedReadSequence.set(`${ownerId}:${convId}`, last.sequence)).catch(() => {})
          }
        }
        await loadChats()
      } else {
        await loadChats()
      }
      lastMessageSyncOk = true
    } catch {}
  }

  function handleNetworkOnline() {
    void connectRealtime()
  }

  function handleNetworkOffline() {
    realtimeState.value = 'offline'
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible' || !token.value) return
    if (socket?.readyState === WebSocket.OPEN) void processOfflineQueue()
    else void connectRealtime()
  }

  function startMessageSyncLoop() {
    // Reconcile durable messages when an edge isolate cannot fan out to another one.
    messageSyncTimer = setInterval(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || !token.value) return
      const due = realtimeState.value !== 'connected' || !lastMessageSyncOk || Date.now() - lastMessageSyncAt >= MESSAGE_SYNC_CONNECTED_MS
      if (due) void processOfflineQueue()
    }, MESSAGE_SYNC_TICK_MS)
  }

  function stopMessageSyncLoop() {
    if (messageSyncTimer) clearInterval(messageSyncTimer)
  }

  function resetReconnect() {
    reconnectAttempts = 0
  }

  return {
    realtimeState,
    connectRealtime,
    stopRealtime,
    processOfflineQueue,
    handleNetworkOnline,
    handleNetworkOffline,
    handleVisibilityChange,
    startMessageSyncLoop,
    stopMessageSyncLoop,
    resetReconnect,
  }
}
