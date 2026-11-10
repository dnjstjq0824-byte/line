// I-4: WebRTC calling state machine, extracted verbatim from MessengerView.vue.
// Owns the peer connection, media streams, call timer and recording. The view
// injects only the chat list a call starts from and the history it logs to.
import { ref, type ComputedRef, type Ref } from 'vue'

import { api, currentUser, note, t, token, wrap } from '../store/session'
import { request, type Chat } from '../../../shared/api'
import { callRecordingName } from '../../../shared/call-fx'
import { endWebRTCCall, startWebRTCCall } from '../messenger-utils'

export interface CallRecord {
  id: string
  peer_id: string
  peer_name: string
  peer_avatar_color: string
  call_type: 'voice' | 'video'
  direction: 'incoming' | 'outgoing' | 'missed'
  timestamp_text: string
  duration_text?: string
  count?: number
}

export interface ActiveCallState {
  id: string
  kind: 'voice' | 'video'
  state: 'ringing' | 'connected' | 'ended'
  title: string
  direction: 'outgoing' | 'incoming'
}

export interface WebRTCDeps {
  selectedChatId: Ref<string>
  chats: Ref<Chat[]>
  selectedChat: ComputedRef<Chat | undefined | null>
  callHistoryList: Ref<CallRecord[]>
  loadChats: () => Promise<void>
  formatDuration: (sec: number) => string
}

export function useWebRTC(deps: WebRTCDeps) {
  const { selectedChatId, chats, selectedChat, callHistoryList, loadChats, formatDuration } = deps

  const localVideoRef = ref<HTMLVideoElement | null>(null)
  const remoteVideoRef = ref<HTMLVideoElement | null>(null)
  const isScreenSharing = ref(false)

  // --- Calling Simulation ---
  const activeCall = ref<ActiveCallState | null>(null)
  const callMediaIssue = ref(false)
  const callDuration = ref(0)
  const isCallMuted = ref(false)
  const isCallVideoOff = ref(false)
  const isCallSpeakerOn = ref(true)
  const callRecording = ref(false)
  const callVideoFilter = ref<'none' | 'warm' | 'cool' | 'mono'>('none')
  let callTimer: ReturnType<typeof setInterval> | null = null
  let callRemoteStream: MediaStream | null = null
  let callRecorder: { mr: MediaRecorder; ctx: AudioContext; chunks: BlobPart[]; callId: string } | null = null

  // --- Calling (Voice & Video WebRTC) ---
  let rtcSession: { pc: RTCPeerConnection; stream: MediaStream | null } | null = null

  async function initPeerSession(callId: string, kind: 'voice' | 'video') {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    let stream: MediaStream | null = null
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' })
        stream.getTracks().forEach(track => pc.addTrack(track, stream!))
        if (localVideoRef.value) localVideoRef.value.srcObject = stream
      } catch {}
    }
    pc.ontrack = (ev) => {
      if (ev.streams[0]) {
        callRemoteStream = ev.streams[0]
        if (remoteVideoRef.value) remoteVideoRef.value.srcObject = ev.streams[0]
      }
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        void api(`/api/v1/calls/${callId}/signal`, 'POST', {
          signal_type: 'ice-candidate',
          candidate: JSON.stringify(ev.candidate)
        }).catch(() => {})
      }
    }
    return { pc, stream }
  }

  async function startCall(kind: 'voice' | 'video', overrideTitle?: string) {
    // A-14: no hardcoded room fallback. Without a real conversation the call
    // buttons are disabled and this guards the programmatic paths too.
    const targetConvId = selectedChatId.value || chats.value[0]?.id
    if (!targetConvId) {
      note.value = t('mvCallNoRoom')
      return
    }
    selectedChatId.value = targetConvId
    const convTitle = overrideTitle || selectedChat.value?.title || t('mvCall')
    await wrap(async () => {
      // Outgoing screen first: a mic/camera failure must never strand the
      // caller on a bare toast with no call UI. Media is opportunistic; only
      // a server session failure aborts the call.
      activeCall.value = { id: '', kind, state: 'ringing', title: convTitle, direction: 'outgoing' }
      callDuration.value = 0
      callMediaIssue.value = false
      // Single media acquisition: the util returns the live session, so the
      // microphone is opened once and endCallLocally owns its teardown.
      const webrtc = await startWebRTCCall(targetConvId, kind, token.value, request)
      if (!webrtc) {
        endCallLocally()
        note.value = t('mvCallStartFailed')
        return
      }
      activeCall.value!.id = webrtc.id
      callMediaIssue.value = webrtc.mediaFailed
      if (webrtc.mediaFailed) note.value = t('callMediaFailed')
      rtcSession = { pc: webrtc.pc, stream: webrtc.stream }
      if (localVideoRef.value) localVideoRef.value.srcObject = webrtc.stream
      webrtc.pc.ontrack = (ev) => {
        if (ev.streams[0]) {
          callRemoteStream = ev.streams[0]
          if (remoteVideoRef.value) remoteVideoRef.value.srcObject = ev.streams[0]
        }
      }
      webrtc.pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          void api(`/api/v1/calls/${webrtc.id}/signal`, 'POST', {
            signal_type: 'ice-candidate',
            candidate: JSON.stringify(ev.candidate)
          }).catch(() => {})
        }
      }
      await api(`/api/v1/calls/${webrtc.id}/signal`, 'POST', {
        signal_type: 'offer',
        sdp: webrtc.pc.localDescription?.sdp || ''
      }).catch(() => {})
    })
  }

  async function handleIncomingCallSignal(data: any) {
    if (!activeCall.value || data.from_user_id === currentUser.value?.id) return
    try {
      if (!rtcSession) {
        rtcSession = await initPeerSession(activeCall.value.id, activeCall.value.kind)
      }
      const sess = rtcSession
      if (!sess) return
      if (data.signal_type === 'offer' && data.sdp) {
        await sess.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
        const answer = await sess.pc.createAnswer()
        await sess.pc.setLocalDescription(answer)
        await api(`/api/v1/calls/${activeCall.value.id}/signal`, 'POST', {
          signal_type: 'answer',
          sdp: answer.sdp || ''
        }).catch(() => {})
      } else if (data.signal_type === 'answer' && data.sdp) {
        await sess.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
      } else if (data.signal_type === 'ice-candidate' && data.candidate) {
        await sess.pc.addIceCandidate(JSON.parse(data.candidate))
      }
    } catch {}
  }

  function toggleCallMute() {
    isCallMuted.value = !isCallMuted.value
    rtcSession?.stream?.getAudioTracks().forEach(t => { t.enabled = !isCallMuted.value })
  }

  function toggleCallVideo() {
    isCallVideoOff.value = !isCallVideoOff.value
    rtcSession?.stream?.getVideoTracks().forEach(t => { t.enabled = !isCallVideoOff.value })
  }

  async function toggleScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) return
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      isScreenSharing.value = true
      if (localVideoRef.value) localVideoRef.value.srcObject = screenStream
      if (activeCall.value) {
        await api(`/api/v1/calls/${activeCall.value.id}/signal`, 'POST', { signal_type: 'screen-share' }).catch(() => {})
      }
    } catch {}
  }

  async function updateCallState(state: 'connected' | 'ended') {
    if (!activeCall.value) return
    const cid = activeCall.value.id
    const prevCall = { ...activeCall.value }
    const durSec = callDuration.value
    await wrap(async () => {
      await api(`/api/v1/calls/${cid}/state`, 'POST', { state }).catch(() => {})
      if (state === 'ended') {
        const targetConvId = selectedChatId.value
        const durText = durSec > 0 ? formatDuration(durSec) : undefined
        const wasConnected = prevCall.state === 'connected' && durSec > 0
        endCallLocally()
        callHistoryList.value.unshift({
          id: 'call-' + Date.now(),
          peer_id: targetConvId || 'peer-k',
          peer_name: prevCall.title,
          peer_avatar_color: '#315BCD',
          call_type: prevCall.kind,
          direction: prevCall.direction === 'incoming' && !wasConnected ? 'missed' : 'outgoing',
          timestamp_text: t('mvJustNow'),
          duration_text: durText
        })
        // A-5: the call_status bubble is minted by the server on call end;
        // clients must not forge system kinds. Refresh the list instead.
        if (targetConvId) {
          try {
            await loadChats()
          } catch {}
        }
      } else if (activeCall.value) {
        activeCall.value.state = 'connected'
        startCallTimer()
      }
    })
  }

  function startCallTimer() {
    if (callTimer) clearInterval(callTimer)
    callDuration.value = 0
    callTimer = setInterval(() => { callDuration.value++ }, 1000)
  }

  function stopCallRecording(download: boolean) {
    const rec = callRecorder
    callRecorder = null
    callRecording.value = false
    if (!rec) return
    try {
      rec.mr.onstop = () => {
        try { void rec.ctx.close().catch(() => {}) } catch {}
        if (download && rec.chunks.length > 0) {
          const url = URL.createObjectURL(new Blob(rec.chunks, { type: rec.mr.mimeType || 'video/webm' }))
          const link = document.createElement('a')
          link.href = url
          link.download = callRecordingName(rec.callId)
          link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
      }
      if (rec.mr.state !== 'inactive') rec.mr.stop()
      else { try { void rec.ctx.close().catch(() => {}) } catch {} }
    } catch { try { void rec.ctx.close().catch(() => {}) } catch {} }
  }

  async function toggleCallRecording() {
    if (callRecorder) { stopCallRecording(true); return }
    const call = activeCall.value
    const local = rtcSession?.stream
    const remote = callRemoteStream
    if (!call || call.state !== 'connected' || !local || !remote) { note.value = t('callRecordFailed'); return }
    const hasAudio = local.getAudioTracks().length > 0 || remote.getAudioTracks().length > 0
    const hasVideo = call.kind === 'video' && remote.getVideoTracks().length > 0
    if (!hasAudio && !hasVideo) { note.value = t('callRecordFailed'); return }
    let ctx: AudioContext | null = null
    try {
      ctx = new AudioContext()
      if (ctx.state === 'suspended') await ctx.resume()
      const dest = ctx.createMediaStreamDestination()
      for (const s of [local, remote]) {
        if (s.getAudioTracks().length === 0) continue
        ctx.createMediaStreamSource(s).connect(dest)
      }
      const tracks: MediaStreamTrack[] = [...dest.stream.getAudioTracks()]
      if (call.kind === 'video') tracks.push(...remote.getVideoTracks())
      if (tracks.length === 0) throw new Error('no tracks')
      const rec = new MediaRecorder(new MediaStream(tracks))
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      callRecorder = { mr: rec, ctx, chunks, callId: call.id }
      rec.start()
      callRecording.value = true
    } catch {
      if (ctx) { try { void ctx.close().catch(() => {}) } catch {} }
      callRecorder = null
      callRecording.value = false
      note.value = t('callRecordFailed')
    }
  }

  function endCallLocally() {
    stopCallRecording(true)
    callRemoteStream = null
    if (callTimer) {
      clearInterval(callTimer)
      callTimer = null
    }
    if (localVideoRef.value) localVideoRef.value.srcObject = null
    if (remoteVideoRef.value) remoteVideoRef.value.srcObject = null
    endWebRTCCall(rtcSession?.pc || null, rtcSession?.stream || null)
    rtcSession = null
    isScreenSharing.value = false
    activeCall.value = null
    callMediaIssue.value = false
    callDuration.value = 0
  }

  function stopCallTimer() {
    if (callTimer) clearInterval(callTimer)
  }

  return {
    activeCall,
    callMediaIssue,
    callDuration,
    isCallMuted,
    isCallVideoOff,
    isCallSpeakerOn,
    callRecording,
    callVideoFilter,
    localVideoRef,
    remoteVideoRef,
    isScreenSharing,
    startCall,
    handleIncomingCallSignal,
    toggleCallMute,
    toggleCallVideo,
    toggleScreenShare,
    updateCallState,
    startCallTimer,
    stopCallTimer,
    toggleCallRecording,
    endCallLocally,
  }
}
