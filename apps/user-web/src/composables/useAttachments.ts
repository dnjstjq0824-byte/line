// Attachment picker + file sender (P2 MessengerView split). Owns the hidden
// file input, the upload flag and the R2 upload flow; chat refs, the E2EE
// client and the list refresh are injected (deps precedent).
// Extracted verbatim from views/MessengerView.vue.
import { ref, type Ref } from 'vue'
import { api, currentUser, error, t } from '../store/session'
import type { getE2ee } from '../e2ee/client'
import { shrinkPhotoForUpload } from '../messenger-utils'
import { newClientID } from '../../../shared/api'
import { b64uDecode } from '../../../shared/e2ee/codec'
import type { Chat, Message } from '../../../shared/api'

export interface AttachmentsDeps {
  chats: Ref<Chat[]>
  selectedChatId: Ref<string>
  messages: Ref<Message[]>
  e2eeClient: () => ReturnType<typeof getE2ee> | null
  loadChats: () => Promise<void>
}

export function useAttachments(deps: AttachmentsDeps) {
  const attachmentInput = ref<HTMLInputElement | null>(null)
  const uploading = ref(false)

  function chooseAttachment(kind: 'image' | 'voice' | 'file') {
    if (attachmentInput.value) {
      attachmentInput.value.accept = kind === 'image' ? 'image/*' : kind === 'voice' ? 'audio/*' : '*/*'
      attachmentInput.value.click()
    }
  }

  async function sendAttachmentFile(file: File, conversation: string, _sessionToken: string, voiceDurationSec?: number) {
    const ownerId = currentUser.value?.id
    if (!ownerId) return
    if (voiceDurationSec === undefined) file = await shrinkPhotoForUpload(file)
    const maxBytes = 10 * 1024 * 1024
    if (file.size === 0 || file.size > maxBytes) throw new Error(t('attachment_size_limit'))
    const normalizedMime = (file.type || 'application/octet-stream').split(';')[0].trim().toLowerCase() || 'application/octet-stream'
    const room = deps.chats.value.find((c) => c.id === conversation)
    // E7: seal bytes first in E2EE rooms; R2 only ever sees ciphertext.
    let uploadBytes = new Uint8Array(await file.arrayBuffer())
    let sealed: { key: string; iv: string; hash: string } | null = null
    if (room?.e2ee) {
      const { sealFile } = await import('../../../shared/e2ee/files.ts')
      const s = await sealFile(uploadBytes)
      uploadBytes = b64uDecode(s.ct)
      sealed = { key: s.key, iv: s.iv, hash: s.hash }
    }
    const bytes = uploadBytes
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    const checksum = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
    const kind = voiceDurationSec !== undefined ? 'voice' : normalizedMime.startsWith('image/') ? 'image' : normalizedMime.startsWith('audio/') ? 'audio' : normalizedMime.startsWith('video/') ? 'video' : 'file'
    if (currentUser.value?.id !== ownerId) return
    const att = await api<{ id: string; original_name: string }>('/api/v1/attachments', 'POST', {
      conversation_id: conversation,
      original_name: file.name,
      mime_type: normalizedMime,
      size_bytes: file.size,
      checksum_sha256: checksum,
      content_base64: btoa(binary),
      ...(sealed ? { encrypted: true } : {})
    })
    if (currentUser.value?.id !== ownerId) return
    let wireKind = kind
    let wireBody = att.original_name
    let meta: Record<string, unknown> = { attachment_id: att.id, mime_type: normalizedMime, size_bytes: file.size, ...(voiceDurationSec !== undefined ? { duration: voiceDurationSec } : {}) }
    if (sealed && room) {
      const c = deps.e2eeClient()
      if (!c) return
      try {
        const out = await c.encryptOutbound(room, kind, att.original_name, {
          attachment_id: att.id, fileKey: sealed.key, fileIv: sealed.iv, fileHash: sealed.hash,
          mime_type: normalizedMime, size_bytes: file.size, ...(voiceDurationSec !== undefined ? { duration: voiceDurationSec } : {}),
        })
        wireKind = out.kind
        wireBody = out.body
        meta = {}
      } catch (e) {
        error.value = t('message_queue_failed')
        return
      }
    }
    const res = await api<{ message: Message }>(`/api/v1/conversations/${conversation}/messages`, 'POST', {
      client_id: newClientID(),
      kind: wireKind,
      body: wireBody,
      metadata: meta
    })
    if (currentUser.value?.id === ownerId && deps.selectedChatId.value === conversation && !deps.messages.value.some(m => m.id === res.message.id)) {
      if (wireKind === 'ciphertext') {
        res.message.kind = kind
        res.message.body = att.original_name
        res.message.metadata = { attachment_id: att.id, mime_type: normalizedMime, size_bytes: file.size, ...(voiceDurationSec !== undefined ? { duration: voiceDurationSec } : {}), ...(sealed ? { fileKey: sealed.key, fileIv: sealed.iv, fileHash: sealed.hash } : {}) }
        res.message._e2ee = true
      }
      deps.messages.value.push(res.message)
    }
    await deps.loadChats()
  }

  return {
    attachmentInput,
    uploading,
    chooseAttachment,
    sendAttachmentFile,
  }
}
