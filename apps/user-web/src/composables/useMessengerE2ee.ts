// E2EE backup/restore/safety/device-export (P2 MessengerView split). Owns the
// session-bound E2EE client plus backup, safety numbers and device export;
// the chat refs and room selection are injected (deps precedent).
// Extracted verbatim from views/MessengerView.vue.
import { ref, watch, type Ref } from 'vue'
import { api, currentUser, note, readStoredDeviceId, t, token } from '../store/session'
import { getE2ee, resetE2ee } from '../e2ee/client'
import type { Chat, Message } from '../../../shared/api'

export interface MessengerE2eeDeps {
  chats: Ref<Chat[]>
  selectedChatId: Ref<string>
  messages: Ref<Message[]>
  selectChat: (convId: string) => Promise<void>
}

export function useMessengerE2ee(deps: MessengerE2eeDeps) {
  function e2eeClient() {
    const uid = currentUser.value?.id
    const did = readStoredDeviceId()
    if (!uid || !did) return null
    // The store passes paths without the /api/v1 prefix.
    return getE2ee(<T>(p: string, m?: string, b?: unknown) => api<T>(`/api/v1/${p}`, m, b), uid, did)
  }

  // E5: decrypt newly arrived ciphertext in place (socket, sync, cache, sends).
  let e2eeDecrypting = false
  watch(deps.messages, async () => {
    if (e2eeDecrypting || !deps.selectedChatId.value) return
    const c = e2eeClient()
    if (!c) return
    e2eeDecrypting = true
    try {
      if (await c.decryptInto(deps.selectedChatId.value, deps.messages.value)) deps.messages.value = [...deps.messages.value]
    } finally {
      e2eeDecrypting = false
    }
  })
  watch(deps.chats, async () => {
    const c = e2eeClient()
    if (!c) return
    if (await c.decryptPreviews(deps.chats.value)) deps.chats.value = [...deps.chats.value]
  })
  watch(token, (v, old) => {
    if (!v && old) void resetE2ee()
  })

  // E9: passphrase backup + restore. Keys come from the store export;
  // history is a fresh decrypt of each sealed room (latest 200 per room,
  // 8 MB total). Restored rows merge under live server messages.
  const e2eeBackupBusy = ref(false)
  const restoredHistory = ref<Record<string, Message[]>>({})
  async function backupE2eeNow(passphrase: string) {
    const c = e2eeClient()
    if (!c) return
    e2eeBackupBusy.value = true
    try {
      const state = await c.store.exportState()
      const history: Record<string, Array<Record<string, unknown>>> = {}
      let total = 0
      for (const room of deps.chats.value) {
        if (!room.e2ee) continue
        try {
          const res = await api<{ messages: Message[] }>(`/api/v1/conversations/${room.id}/messages?limit=200`)
          const list = res.messages || []
          await c.decryptInto(room.id, list)
          const rows = list
            .filter((m) => m.kind !== 'ciphertext' && !m._e2eeError && !m.unsent && typeof m.body === 'string')
            .map((m) => ({
              id: m.id,
              sender_id: m.sender_id,
              created_at: m.created_at,
              sequence: m.sequence || 0,
              kind: m.kind,
              body: m.body.slice(0, 4000),
              sealed: true,
              _restored: true,
            }))
          const size = JSON.stringify(rows).length
          if (total + size > 8 * 1024 * 1024) break
          total += size
          history[room.id] = rows
        } catch { /* one room must not block the rest */ }
      }
      const { encryptBackup } = await import('../../../shared/e2ee/backup.ts')
      const blob = await encryptBackup(passphrase, JSON.stringify({ v: 1, state, history }))
      await api('/api/v1/e2ee/backup', 'PUT', { blob })
      note.value = t('e2eeBkDone')
    } catch {
      note.value = t('e2eeBkFail')
    } finally {
      e2eeBackupBusy.value = false
    }
  }
  async function restoreE2eeNow(passphrase: string) {
    const c = e2eeClient()
    if (!c) return
    e2eeBackupBusy.value = true
    try {
      const res = await api<{ backup: { v: number; salt: string; iv: string; ct: string } | null }>('/api/v1/e2ee/backup')
      if (!res.backup) throw new Error('empty')
      const { decryptBackup } = await import('../../../shared/e2ee/backup.ts')
      const payload = JSON.parse(await decryptBackup(passphrase, res.backup))
      if (!payload || payload.v !== 1 || !payload.state) throw new Error('shape')
      await c.store.importState(payload.state)
      restoredHistory.value = (payload.history || {}) as Record<string, Message[]>
      note.value = t('e2eeBkRestored')
      if (deps.selectedChatId.value) await deps.selectChat(deps.selectedChatId.value)
    } catch {
      // Restore failures never distinguish wrong passphrase from corruption.
      note.value = t('e2eeBkRestoreFail')
    } finally {
      e2eeBackupBusy.value = false
    }
  }
  // E9: safety-number modal for 1:1 sealed rooms.
  const showSafetyModal = ref(false)
  const safetyRows = ref<Array<{ device: string; edPub: string; number: string; lines: string[]; verified: boolean; changed: boolean }>>([])
  const safetyLoading = ref(false)
  const safetyPeerId = ref('')
  const safetyMyCode = ref('')
  async function openSafetyModal() {
    const room = deps.chats.value.find((c) => c.id === deps.selectedChatId.value)
    const peer = (room?.members || []).map((m: any) => m.id).find((id: string) => id && id !== currentUser.value?.id)
    const c = e2eeClient()
    if (!peer || !c) return
    safetyPeerId.value = peer
    safetyRows.value = []
    safetyMyCode.value = ''
    safetyLoading.value = true
    showSafetyModal.value = true
    try {
      safetyRows.value = await c.store.safetyNumbers(peer)
      safetyMyCode.value = c.store.myIdentity() || ''
    } catch {
      safetyRows.value = []
    } finally {
      safetyLoading.value = false
    }
  }
  async function verifySafetyDevice(device: string, edPub: string) {
    const c = e2eeClient()
    if (!c || !safetyPeerId.value) return
    await c.store.setVerified(safetyPeerId.value, device, edPub)
    await openSafetyModalRefresh()
  }
  async function openSafetyModalRefresh() {
    const c = e2eeClient()
    if (!c || !safetyPeerId.value) return
    safetyLoading.value = true
    try {
      safetyRows.value = await c.store.safetyNumbers(safetyPeerId.value)
    } catch { /* keep old rows */ } finally {
      safetyLoading.value = false
    }
  }
  // E8: "export this device's chats" — decrypted on-device cache to a
  // JSON file. Sealed-but-unreadable rows export as a marker, never raw
  // envelope bytes.
  function exportDeviceChat() {
    if (!deps.selectedChatId.value || !deps.messages.value.length) {
      note.value = t('mvExportDeviceEmpty')
      return
    }
    const room = deps.chats.value.find((c) => c.id === deps.selectedChatId.value)
    const rows = deps.messages.value
      .filter((m) => !m.unsent)
      .map((m) => {
        if (m.kind === 'ciphertext' || m._e2eeError) {
          return { id: m.id, sender_id: m.sender_id, created_at: m.created_at, sealed: true, unreadable: true, body: '' }
        }
        return { id: m.id, sender_id: m.sender_id, created_at: m.created_at, kind: m.kind, sealed: m._e2ee === true, body: typeof m.body === 'string' ? m.body : '' }
      })
    const doc = {
      export_version: 'device-1',
      room: { id: deps.selectedChatId.value, title: room?.title || '', kind: (room as any)?.kind || '' },
      exported_at: new Date().toISOString(),
      exported_by: currentUser.value?.id || '',
      messages: rows
    }
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `luno-chat-${deps.selectedChatId.value}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    note.value = t('mvExportDeviceDone')
  }

  return {
    e2eeClient,
    e2eeBackupBusy,
    restoredHistory,
    backupE2eeNow,
    restoreE2eeNow,
    showSafetyModal,
    safetyRows,
    safetyLoading,
    safetyPeerId,
    safetyMyCode,
    openSafetyModal,
    verifySafetyDevice,
    openSafetyModalRefresh,
    exportDeviceChat,
  }
}
