// Voice-note recording (P2 MessengerView split). Owns the recorder and its
// chunks; selection, upload flag, attachment picker and sender are injected.
// Extracted verbatim from views/MessengerView.vue.
import { ref, type Ref } from 'vue'
import { note, t, token, wrap } from '../store/session'

export interface VoiceRecordingDeps {
  selectedChatId: Ref<string>
  uploading: Ref<boolean>
  chooseAttachment: (kind: 'image' | 'voice' | 'file') => void
  sendAttachment: (file: File, conversation: string, sessionToken: string, voiceDurationSec?: number) => Promise<void>
}

export function useVoiceRecording(deps: VoiceRecordingDeps) {
  const isRecordingVoice = ref(false)
  let mediaRecorderInstance: MediaRecorder | null = null
  let recordedChunks: BlobPart[] = []
  let voiceRecordStartedAt = 0

  async function toggleVoiceRecording() {
    if (isRecordingVoice.value && mediaRecorderInstance) {
      mediaRecorderInstance.stop()
      isRecordingVoice.value = false
      return
    }
    if (deps.uploading.value || !deps.selectedChatId.value) return
    if (!navigator.mediaDevices?.getUserMedia) {
      note.value = t('mvVoiceRecordFailed')
      deps.chooseAttachment('voice')
      return
    }
    try {
      const conversation = deps.selectedChatId.value
      const sessionToken = token.value
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (sessionToken !== token.value) { stream.getTracks().forEach(track => track.stop()); return }
      recordedChunks = []
      mediaRecorderInstance = new MediaRecorder(stream)
      mediaRecorderInstance.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data)
      }
      mediaRecorderInstance.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const mime = mediaRecorderInstance?.mimeType || 'audio/webm'
        const blob = new Blob(recordedChunks, { type: mime })
        const durationSec = Math.max(1, Math.min(300, Math.round((Date.now() - voiceRecordStartedAt) / 1000)))
        deps.uploading.value = true
        try { await wrap(() => deps.sendAttachment(new File([blob], `voice-${Date.now()}.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime }), conversation, sessionToken, durationSec)) }
        finally { deps.uploading.value = false; isRecordingVoice.value = false }
      }
      voiceRecordStartedAt = Date.now()
      mediaRecorderInstance.start()
      isRecordingVoice.value = true
      note.value = t('mvRecordingVoice')
    } catch {
      note.value = t('mvVoiceRecordFailed')
      deps.chooseAttachment('voice')
    }
  }

  function discardVoiceRecording() {
    if (mediaRecorderInstance) {
      mediaRecorderInstance.onstop = null
      if (mediaRecorderInstance.state !== 'inactive') mediaRecorderInstance.stop()
      mediaRecorderInstance.stream.getTracks().forEach(track => track.stop())
    }
    recordedChunks = []
    isRecordingVoice.value = false
  }

  return {
    isRecordingVoice,
    toggleVoiceRecording,
    discardVoiceRecording,
  }
}
