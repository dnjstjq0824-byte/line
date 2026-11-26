// Call history tab (P2 MessengerView split). Owns the server-side call
// ledger, redial helpers and the missed filter; chat refs, navigation,
// selection and dialing are injected (deps precedent).
// Extracted verbatim from views/MessengerView.vue.
import { computed, ref, type Ref } from 'vue'
import { api } from '../store/session'
import type { Chat } from '../../../shared/api'
import type { CallRecord } from './useWebRTC'
import type { NavItem } from '../router'
import { readSnapshot, writeSnapshot } from '../messenger-utils'
import { callDateText, formatDuration } from '../messenger-format'

export interface CallHistoryDeps {
  chats: Ref<Chat[]>
  selectedChatId: Ref<string>
  switchNav: (nav: NavItem) => void
  selectChat: (convId: string) => Promise<void>
}

const CALLS_SNAPSHOT_KEY = 'luno-calls-snapshot'

export function useCallHistory(deps: CallHistoryDeps) {
  const callFilter = ref<'all' | 'missed'>('all')
  const callHistoryList = ref<CallRecord[]>([])
  const selectedCallRecord = ref<CallRecord | null>(null)

  const filteredCallHistory = computed(() => {
    if (callFilter.value === 'missed') {
      return callHistoryList.value.filter(c => c.direction === 'missed')
    }
    return callHistoryList.value
  })

  // The call list is the server-side call ledger (GET /api/v1/calls), consistent with call_status chat bubbles.
  async function loadCalls() {
    if (!callHistoryList.value.length) {
      const snap = readSnapshot<CallRecord>(CALLS_SNAPSHOT_KEY)
      if (snap && snap.length) callHistoryList.value = snap
    }
    try {
      const res = await api<{ calls: any[] }>('/api/v1/calls')
      callHistoryList.value = (res.calls || []).map((c: any): CallRecord => ({
        id: c.id,
        peer_id: c.peer_id || '',
        peer_name: c.title || '',
        peer_avatar_color: c.peer_color || '#315BCD',
        call_type: normalizeCallKind(c.kind),
        direction: c.result === 'missed' ? 'missed' : (c.outgoing ? 'outgoing' : 'incoming'),
        timestamp_text: callDateText(c.started_at),
        duration_text: c.duration > 0 ? formatDuration(c.duration) : undefined
      }))
      writeSnapshot(CALLS_SNAPSHOT_KEY, callHistoryList.value)
    } catch {
      if (!callHistoryList.value.length) callHistoryList.value = []
    }
  }

  async function resolvePeerConversationId(record: CallRecord): Promise<string> {
    const match = deps.chats.value.find(c =>
      c.title === record.peer_name ||
      (record.peer_id === 'peer-k' && (c.id.includes('conv-k') || c.title?.includes('K'))) ||
      (record.peer_id === 'peer-tuk' && (c.id.includes('conv-tuk') || c.title === 'tuk'))
    )
    if (match) return match.id
    if (record.peer_id === 'peer-k') return 'chat-k-01'
    if (record.peer_id === 'peer-tuk') return 'chat-tuk-01'
    return deps.chats.value[0]?.id || 'chat-k-01'
  }

  async function openChatFromCallRecord(record: CallRecord) {
    const cid = await resolvePeerConversationId(record)
    deps.switchNav('chats')
    await deps.selectChat(cid)
  }

  // FX-18: history kinds come from server data; anything but an explicit
  // 'video' redials as voice so a voice record can never start video.
  function normalizeCallKind(kind: unknown): 'voice' | 'video' {
    return kind === 'video' ? 'video' : 'voice'
  }

  function removeCallRecord(id: string) {
    callHistoryList.value = callHistoryList.value.filter(c => c.id !== id)
  }

  return {
    callFilter,
    callHistoryList,
    selectedCallRecord,
    filteredCallHistory,
    loadCalls,
    resolvePeerConversationId,
    openChatFromCallRecord,
    normalizeCallKind,
    removeCallRecord,
  }
}
