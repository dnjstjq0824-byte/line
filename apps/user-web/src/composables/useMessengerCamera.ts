// Photo effect + camera capture (P2 MessengerView split). Owns effect drafts,
// camera streams and capture flows; selection, upload flag and the attachment
// sender are injected (deps precedent). paneRefs stays in the view (it also
// holds the canvas and file inputs).
// Extracted verbatim from views/MessengerView.vue.
import { nextTick, ref, type Ref } from 'vue'
import { note, t, token, wrap } from '../store/session'

export interface MessengerCameraDeps {
  selectedChatId: Ref<string>
  uploading: Ref<boolean>
  sendAttachment: (file: File, conversation: string, sessionToken: string) => Promise<void>
}

export function useMessengerCamera(deps: MessengerCameraDeps) {
  const effectFile = ref<File | null>(null)
  const effectConversation = ref('')
  const effectChoice = ref<'none' | 'gray' | 'sepia'>('none')
  const effectPreviewUrl = ref('')
  const PHOTO_EFFECT_FILTER: Record<string, string> = { none: 'none', gray: 'grayscale(1)', sepia: 'sepia(1)' }
  function closeEffectModal() {
    if (effectPreviewUrl.value) URL.revokeObjectURL(effectPreviewUrl.value)
    effectFile.value = null
    effectConversation.value = ''
    effectChoice.value = 'none'
    effectPreviewUrl.value = ''
  }
  async function sendEffectPhoto() {
    const file = effectFile.value
    const conversation = effectConversation.value
    if (!file || !conversation || deps.uploading.value) { closeEffectModal(); return }
    const choice = effectChoice.value
    const sessionToken = token.value
    deps.uploading.value = true
    try {
      let out = file
      if (choice !== 'none') {
        const bmp = await createImageBitmap(file)
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width
        canvas.height = bmp.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas unavailable')
        ctx.filter = PHOTO_EFFECT_FILTER[choice]
        ctx.drawImage(bmp, 0, 0)
        bmp.close()
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
        if (!blob) throw new Error('encode failed')
        const base = file.name.includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name
        out = new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
      }
      await wrap(() => deps.sendAttachment(out, conversation, sessionToken))
    } finally { deps.uploading.value = false; closeEffectModal() }
  }
  function openEffectModal(file: File, conversation: string) {
    closeEffectModal()
    effectFile.value = file
    effectConversation.value = conversation
    effectPreviewUrl.value = URL.createObjectURL(file)
  }
  const showCameraModal = ref(false)
  const cameraVideoRef = ref<HTMLVideoElement | null>(null)
  const cameraStream = ref<MediaStream | null>(null)
  const cameraError = ref('')
  const cameraMode = ref<'photo' | 'video'>('photo')
  const videoRecording = ref(false)
  const videoElapsed = ref(0)
  let videoRecorder: MediaRecorder | null = null
  let videoChunks: BlobPart[] = []
  let videoTimer: ReturnType<typeof setInterval> | null = null
  async function openCamera() {
    if (!deps.selectedChatId.value || deps.uploading.value) return
    showCameraModal.value = true
    cameraError.value = ''
    await nextTick()
    await acquireCamera(cameraMode.value)
  }
  async function acquireCamera(mode: 'photo' | 'video') {
    cameraStream.value?.getTracks().forEach(tr => tr.stop())
    cameraStream.value = null
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera')
      const stream = await navigator.mediaDevices.getUserMedia(mode === 'video' ? { video: true, audio: true } : { video: true })
      if (!showCameraModal.value) { stream.getTracks().forEach(tr => tr.stop()); return }
      cameraStream.value = stream
      if (cameraVideoRef.value) {
        cameraVideoRef.value.srcObject = stream
        void cameraVideoRef.value.play?.()?.catch(() => {})
      }
    } catch {
      cameraError.value = t('camFailed')
    }
  }
  async function switchCameraMode(mode: 'photo' | 'video') {
    if (cameraMode.value === mode || videoRecording.value) return
    cameraMode.value = mode
    cameraError.value = ''
    await nextTick()
    await acquireCamera(mode)
  }
  function closeCamera() {
    if (videoTimer) { clearInterval(videoTimer); videoTimer = null }
    if (videoRecorder && videoRecorder.state !== 'inactive') {
      videoRecorder.onstop = null
      videoRecorder.stop()
    }
    videoRecorder = null
    videoRecording.value = false
    cameraStream.value?.getTracks().forEach(tr => tr.stop())
    cameraStream.value = null
    cameraError.value = ''
    showCameraModal.value = false
  }
  async function startVideoCapture() {
    const stream = cameraStream.value
    const conversation = deps.selectedChatId.value
    if (!stream || !conversation || videoRecording.value || deps.uploading.value) return
    videoChunks = []
    videoElapsed.value = 0
    try {
      videoRecorder = new MediaRecorder(stream, { videoBitsPerSecond: 400000 })
    } catch {
      videoRecorder = new MediaRecorder(stream)
    }
    const rec = videoRecorder
    const sessionToken = token.value
    rec.ondataavailable = (e) => { if (e.data.size > 0) videoChunks.push(e.data) }
    rec.onstop = async () => {
      if (videoTimer) { clearInterval(videoTimer); videoTimer = null }
      videoRecording.value = false
      videoRecorder = null
      const rawMime = rec.mimeType || 'video/webm'
      const cleanMime = rawMime.split(';')[0].trim().toLowerCase() || 'video/webm'
      const ext = cleanMime.includes('mp4') ? 'mp4' : 'webm'
      const file = new File(videoChunks, `video-${Date.now()}.${ext}`, { type: cleanMime === 'video/ogg' ? 'video/webm' : cleanMime })
      videoChunks = []
      closeCamera()
      if (file.size === 0) return
      deps.uploading.value = true
      try { await wrap(() => deps.sendAttachment(file, conversation, sessionToken)) }
      finally { deps.uploading.value = false }
    }
    rec.start()
    videoRecording.value = true
    videoTimer = setInterval(() => {
      videoElapsed.value++
      if (videoElapsed.value >= 8 && videoRecorder) stopVideoCapture()
    }, 1000)
  }
  function stopVideoCapture() {
    if (videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop()
  }
  async function capturePhoto() {
    const video = cameraVideoRef.value
    const stream = cameraStream.value
    const conversation = deps.selectedChatId.value
    if (!video || !stream || !conversation || video.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    closeCamera()
    if (!blob) { note.value = t('camFailed'); return }
    openEffectModal(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }), conversation)
  }

  return {
    effectFile,
    effectConversation,
    effectChoice,
    effectPreviewUrl,
    PHOTO_EFFECT_FILTER,
    closeEffectModal,
    sendEffectPhoto,
    openEffectModal,
    showCameraModal,
    cameraVideoRef,
    cameraStream,
    cameraError,
    cameraMode,
    videoRecording,
    videoElapsed,
    openCamera,
    acquireCamera,
    switchCameraMode,
    closeCamera,
    startVideoCapture,
    stopVideoCapture,
    capturePhoto,
  }
}
