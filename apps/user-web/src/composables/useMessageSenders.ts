// Enriched message senders: sticker, location, contact, screen capture
// (P2 MessengerView split). Each builds its kind/body/meta, seals in E2EE
// rooms, posts and appends; chat refs, picker flags, upload flag, E2EE
// client, scroller, list refresh and the file sender are injected.
// Extracted verbatim from views/MessengerView.vue.
import type { Ref } from 'vue'
import { api, currentUser, error, note, t, token, wrap } from '../store/session'
import { newClientID } from '../../../shared/api'
import type { getE2ee } from '../e2ee/client'
import { LUNO_STICKERS } from '../luno-stickers'
import { imageStickerChar } from '../../../shared/sticker_catalog'
import { playSendSound } from '../sound-effects'
import type { Chat, Message, User } from '../../../shared/api'

export interface MessageSendersDeps {
  selectedChatId: Ref<string>
  chats: Ref<Chat[]>
  messages: Ref<Message[]>
  uploading: Ref<boolean>
  showStickerPicker: Ref<boolean>
  showContactPicker: Ref<boolean>
  e2eeClient: () => ReturnType<typeof getE2ee> | null
  scrollToBottom: () => void
  loadChats: () => Promise<void>
  sendAttachment: (file: File, conversation: string, sessionToken: string, voiceDurationSec?: number) => Promise<void>
}

export function useMessageSenders(deps: MessageSendersDeps) {
  async function sendSticker(stickerId: string) {
    if (!deps.selectedChatId.value) return
    deps.showStickerPicker.value = false
    const found = LUNO_STICKERS.find(s => s.id === stickerId)
    await wrap(async () => {
      // E5: stickers ride inside the ciphertext envelope in E2EE rooms.
      let kind = 'sticker'
      let wireBody = stickerId
      let meta: Record<string, unknown> = {
        sticker_id: stickerId,
        character: found?.character || imageStickerChar(stickerId) || 'Lumi',
        label: found?.name || stickerId
      }
      const room = deps.chats.value.find((c) => c.id === deps.selectedChatId.value)
      if (room?.e2ee) {
        const c = deps.e2eeClient()
        if (!c) return
        try {
          const out = await c.encryptOutbound(room, 'sticker', stickerId, meta)
          kind = out.kind
          wireBody = out.body
          meta = {}
        } catch (e) {
          error.value = t('message_queue_failed')
          return
        }
      }
      const res = await api<{ message: Message }>(`/api/v1/conversations/${deps.selectedChatId.value}/messages`, 'POST', {
        client_id: newClientID(),
        kind,
        body: wireBody,
        metadata: meta
      })
      if (!deps.messages.value.some(m => m.id === res.message.id)) {
        if (kind === 'ciphertext') {
          res.message.kind = 'sticker'
          res.message.body = stickerId
          res.message.metadata = {
            sticker_id: stickerId,
            character: found?.character || imageStickerChar(stickerId) || 'Lumi',
            label: found?.name || stickerId
          }
          res.message._e2ee = true
        }
        deps.messages.value.push(res.message)
      }
      playSendSound()
      deps.scrollToBottom()
      await deps.loadChats()
    })
  }

  async function sendLocationMessage() {
    if (!deps.selectedChatId.value) return
    const convId = deps.selectedChatId.value
    const ownerId = currentUser.value?.id
    if (!ownerId) return
    await wrap(async () => {
      if (!navigator.geolocation) throw new Error(t('location_unavailable'))
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }))
      if (currentUser.value?.id !== ownerId) return
      let kind = 'location'
      let wireBody = t('location_shared')
      let meta: Record<string, unknown> = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy_m: position.coords.accuracy
      }
      const room = deps.chats.value.find((c) => c.id === convId)
      if (room?.e2ee) {
        const c = deps.e2eeClient()
        if (!c) return
        try {
          const out = await c.encryptOutbound(room, 'location', wireBody, meta)
          kind = out.kind
          wireBody = out.body
          meta = {}
        } catch (e) {
          error.value = t('message_queue_failed')
          return
        }
      }
      const res = await api<{ message: Message }>(`/api/v1/conversations/${convId}/messages`, 'POST', {
        client_id: newClientID(),
        kind,
        body: wireBody,
        metadata: meta
      })
      if (currentUser.value?.id === ownerId && deps.selectedChatId.value === convId && !deps.messages.value.some(m => m.id === res.message.id)) {
        if (kind === 'ciphertext') {
          res.message.kind = 'location'
          res.message.body = t('location_shared')
          res.message.metadata = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy_m: position.coords.accuracy
          }
          res.message._e2ee = true
        }
        deps.messages.value.push(res.message)
      }
      playSendSound()
      deps.scrollToBottom()
      await deps.loadChats()
      note.value = t('mvLocationSent')
    })
  }

  function sendContactMessage() { deps.showContactPicker.value = true }
  async function shareContact(f: User) {
    if (!deps.selectedChatId.value) return
    const convId = deps.selectedChatId.value
    const ownerId = currentUser.value?.id
    if (!ownerId) return
    await wrap(async () => {
      let kind = 'contact'
      let wireBody = f.display_name
      let meta: Record<string, unknown> = {
        user_id: f.id,
        ...(f.handle ? { handle: f.handle } : {}),
        display_name: f.display_name
      }
      const room = deps.chats.value.find((c) => c.id === convId)
      if (room?.e2ee) {
        const c = deps.e2eeClient()
        if (!c) return
        try {
          const out = await c.encryptOutbound(room, 'contact', wireBody, meta)
          kind = out.kind
          wireBody = out.body
          meta = {}
        } catch (e) {
          error.value = t('message_queue_failed')
          return
        }
      }
      const res = await api<{ message: Message }>(`/api/v1/conversations/${convId}/messages`, 'POST', {
        client_id: newClientID(),
        kind,
        body: wireBody,
        metadata: meta
      })
      if (currentUser.value?.id === ownerId && deps.selectedChatId.value === convId && !deps.messages.value.some(m => m.id === res.message.id)) {
        if (kind === 'ciphertext') {
          res.message.kind = 'contact'
          res.message.body = f.display_name
          res.message.metadata = {
            user_id: f.id,
            ...(f.handle ? { handle: f.handle } : {}),
            display_name: f.display_name
          }
          res.message._e2ee = true
        }
        deps.messages.value.push(res.message)
      }
      playSendSound()
      deps.scrollToBottom()
      await deps.loadChats()
      deps.showContactPicker.value = false
      note.value = t('contact_shared')
    })
  }

  async function captureScreenToChat() {
    if (!deps.selectedChatId.value || deps.uploading.value) return
    const convId = deps.selectedChatId.value
    const sessionToken = token.value
    if (!navigator.mediaDevices?.getDisplayMedia) { error.value = t('capture_unavailable'); return }
    deps.uploading.value = true
    try { await wrap(async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      try {
        const video = document.createElement('video'); video.srcObject = stream; video.muted = true
        await video.play()
        const canvas = document.createElement('canvas')
        const ratio = Math.min(1, 1280 / video.videoWidth)
        canvas.width = Math.max(1, Math.round(video.videoWidth * ratio)); canvas.height = Math.max(1, Math.round(video.videoHeight * ratio))
        const context = canvas.getContext('2d')
        if (!context) throw new Error(t('capture_unavailable'))
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(t('capture_unavailable'))), 'image/jpeg', .8))
        stream.getTracks().forEach(track => track.stop())
        await deps.sendAttachment(new File([blob], `LUNO-${Date.now()}.jpg`, { type: 'image/jpeg' }), convId, sessionToken)
      } finally { stream.getTracks().forEach(track => track.stop()) }
    }) } finally { deps.uploading.value = false }
  }

  return {
    sendSticker,
    sendLocationMessage,
    sendContactMessage,
    shareContact,
    captureScreenToChat,
  }
}
