// I-4: WebRTC calling state machine, extracted verbatim from MessengerView.vue.
// Owns the peer connection, media streams, call timer and recording. The view
// injects only the chat list a call starts from and the history it logs to.
import { ref, watch, type ComputedRef, type Ref } from 'vue'

import { api, currentUser, note, t, token, wrap } from '../store/session'
import type { Chat } from '../../../shared/api'
import { callRecordingName } from '../../../shared/call-fx'
import { CALL_NO_ANSWER_MS, decideIncomingRing, noAnswerState } from '../../../shared/call_policy'
import { drainEarlyIceCandidates, endWebRTCCall, fetchIceServers, startWebRTCCall } from '../messenger-utils'
import { maybeWebNotify } from '../web_notify'

const apiRequest = <T = any>(path: string, _tok?: string | null, method = 'GET', body?: unknown) =>
  api<T>(path, method, body)

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
  // F15: a live group call counts as busy for 1:1 rings and dials.
  isGroupCallActive?: () => boolean
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
  let noAnswerTimer: ReturnType<typeof setTimeout> | null = null
  let callRemoteStream: MediaStream | null = null
  let callLocalStream: MediaStream | null = null
  let screenShareStream: MediaStream | null = null
  let pendingIceCandidates: RTCIceCandidateInit[] = []
  let ringingSignals: any[] = []
  let appliedOffer = false

  function attachLocal(stream: MediaStream | null) {
    callLocalStream = stream
    const el = localVideoRef.value
    if (!el) return
    el.srcObject = stream
    if (stream) void el.play?.()?.catch(() => {})
  }
  watch(localVideoRef, (el) => {
    const activeLocal = screenShareStream || callLocalStream
    if (el && activeLocal && el.srcObject !== activeLocal) {
      el.srcObject = activeLocal
      void el.play?.()?.catch(() => {})
    }
  })
  // The remote track can land before the call screen mounts its player
  // (ontrack only assigns when the element exists): attach it on mount.
  watch(remoteVideoRef, (el) => {
    if (el) el.muted = !isCallSpeakerOn.value
    if (el && callRemoteStream && el.srcObject !== callRemoteStream) attachRemote(callRemoteStream)
  })
  watch(isCallSpeakerOn, (on) => {
    if (remoteVideoRef.value) remoteVideoRef.value.muted = !on
  })
  // iOS Safari does not always start a late-assigned stream on its own.
  function attachRemote(stream: MediaStream) {
    callRemoteStream = stream
    const el = remoteVideoRef.value
    if (!el) return
    el.muted = !isCallSpeakerOn.value
    el.srcObject = stream
    void el.play?.()?.catch(() => {})
  }
  function handleRemoteTrack(ev: RTCTrackEvent) {
    if (ev.streams && ev.streams[0]) {
      attachRemote(ev.streams[0])
    } else if (ev.track) {
      const stream = callRemoteStream || new MediaStream()
      if (!stream.getTracks().some(t => t.id === ev.track.id)) stream.addTrack(ev.track)
      attachRemote(stream)
    }
  }
  async function flushPendingIce(pc: RTCPeerConnection) {
    if (!pc.remoteDescription) return
    const queued = pendingIceCandidates
    pendingIceCandidates = []
    for (const c of queued) {
      try { await pc.addIceCandidate(c) } catch {}
    }
  }
  function parseCandidate(raw: unknown): RTCIceCandidateInit | null {
    if (!raw) return null
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return null }
    }
    if (typeof raw === 'object') return raw as RTCIceCandidateInit
    return null
  }
  let callRecorder: { mr: MediaRecorder; ctx: AudioContext; chunks: BlobPart[]; callId: string } | null = null

  // --- Calling (Voice & Video WebRTC) ---
  let rtcSession: { pc: RTCPeerConnection; stream: MediaStream | null } | null = null

  async function initPeerSession(callId: string, kind: 'voice' | 'video') {
    // N2-L: ICE from the server; mute-while-ringing applies to late media too.
    const iceServers = await fetchIceServers(apiRequest, token.value)
    const pc = new RTCPeerConnection({ iceServers })
    let stream: MediaStream | null = null
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' })
        stream.getAudioTracks().forEach(track => { track.enabled = !isCallMuted.value })
        stream.getVideoTracks().forEach(track => { track.enabled = !isCallVideoOff.value })
        stream.getTracks().forEach(track => pc.addTrack(track, stream!))
        attachLocal(stream)
      } catch {
        callMediaIssue.value = true
      }
    }
    pc.ontrack = handleRemoteTrack
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
    // F15: one call at a time — a live group call blocks 1:1 dials.
    if (deps.isGroupCallActive?.()) {
      note.value = t('mvCallBusy')
      return
    }
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
      pendingIceCandidates = []
      ringingSignals = []
      appliedOffer = false
      activeCall.value = { id: '', kind, state: 'ringing', title: convTitle, direction: 'outgoing' }
      callDuration.value = 0
      callMediaIssue.value = false
      // Single media acquisition: the util returns the live session, so the
      // microphone is opened once and endCallLocally owns its teardown.
      const webrtc = await startWebRTCCall(targetConvId, kind, token.value, apiRequest)
      if (!webrtc) {
        endCallLocally()
        note.value = t('mvCallStartFailed')
        return
      }
      if (!activeCall.value) {
        endWebRTCCall(webrtc.pc, webrtc.stream)
        return
      }
      activeCall.value.id = webrtc.id
      callMediaIssue.value = webrtc.mediaFailed
      if (webrtc.mediaFailed) note.value = t('callMediaFailed')
      rtcSession = { pc: webrtc.pc, stream: webrtc.stream }
      armNoAnswerTimer(webrtc.id, 'caller')
      attachLocal(webrtc.stream)
      webrtc.pc.ontrack = handleRemoteTrack
      const earlyIce = drainEarlyIceCandidates(webrtc.pc)
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
      for (const cand of earlyIce) {
        await api(`/api/v1/calls/${webrtc.id}/signal`, 'POST', {
          signal_type: 'ice-candidate',
          candidate: JSON.stringify(cand)
        }).catch(() => {})
      }
    })
  }

  function clearNoAnswerTimer() {
    if (noAnswerTimer) {
      clearTimeout(noAnswerTimer)
      noAnswerTimer = null
    }
  }

  function armNoAnswerTimer(callId: string, role: 'caller' | 'callee') {
    clearNoAnswerTimer()
    noAnswerTimer = setTimeout(() => {
      noAnswerTimer = null
      if (!activeCall.value || activeCall.value.id !== callId || activeCall.value.state !== 'ringing') return
      const state = noAnswerState(role)
      void api(`/api/v1/calls/${callId}/state`, 'POST', { state }).catch(() => {}).finally(() => endCallLocally())
    }, CALL_NO_ANSWER_MS)
  }

  async function handleIncomingRing(data: any) {
    const decision = decideIncomingRing({
      // F15: a live group call is a busy line for incoming 1:1 rings.
      activeCallId: activeCall.value?.id ?? (deps.isGroupCallActive?.() ? 'group-call' : null),
      incomingCallId: data.call_id,
      selfId: currentUser.value?.id,
      initiatedBy: data.initiated_by,
    })
    if (decision === 'ignore-own') return
    if (decision === 'busy-decline') {
      await api(`/api/v1/calls/${data.call_id}/state`, 'POST', { state: 'declined' }).catch(() => {})
      note.value = t('mvCallBusy')
      return
    }
    pendingIceCandidates = []
    ringingSignals = []
    appliedOffer = false
    activeCall.value = { id: data.call_id, kind: data.kind || 'voice', state: 'ringing', title: data.caller_name || data.caller_handle || t('mvIncomingTitle'), direction: 'incoming' }
    maybeWebNotify(
      data.caller_name || data.caller_handle || t('mvIncomingTitle'),
      (data.kind || 'voice') === 'video' ? t('mvIncomingVideo') : t('mvIncomingVoice'),
      `call-${data.call_id}`,
    )
    armNoAnswerTimer(data.call_id, 'callee')
  }

  async function handleIncomingCallSignal(data: any) {
    if (!activeCall.value || data.from_user_id === currentUser.value?.id) return
    if (data.call_id && activeCall.value.id && data.call_id !== activeCall.value.id) return
    // Hold incoming signals while the callee is still ringing so we never
    // open mic/camera or answer before the user accepts.
    if (activeCall.value.direction === 'incoming' && activeCall.value.state === 'ringing') {
      ringingSignals.push(data)
      return
    }
    try {
      if (!rtcSession) {
        rtcSession = await initPeerSession(activeCall.value.id, activeCall.value.kind)
      }
      const sess = rtcSession
      if (!sess) return
      if (data.signal_type === 'offer' && data.sdp) {
        if (appliedOffer && sess.pc.signalingState !== 'stable') return
        appliedOffer = true
        await sess.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
        await flushPendingIce(sess.pc)
        const answer = await sess.pc.createAnswer()
        await sess.pc.setLocalDescription(answer)
        await api(`/api/v1/calls/${activeCall.value.id}/signal`, 'POST', {
          signal_type: 'answer',
          sdp: answer.sdp || ''
        }).catch(() => {})
      } else if (data.signal_type === 'answer' && data.sdp) {
        await sess.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
        await flushPendingIce(sess.pc)
      } else if (data.signal_type === 'ice-candidate' && data.candidate) {
        const cand = parseCandidate(data.candidate)
        if (!cand) return
        if (!sess.pc.remoteDescription) {
          pendingIceCandidates.push(cand)
        } else {
          await sess.pc.addIceCandidate(cand)
        }
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

  async function stopScreenShare() {
    if (screenShareStream) {
      screenShareStream.getTracks().forEach(tr => tr.stop())
      screenShareStream = null
    }
    isScreenSharing.value = false
    const sess = rtcSession
    if (sess) {
      const camTrack = sess.stream?.getVideoTracks()[0] || null
      const sender = sess.pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender && camTrack) await sender.replaceTrack(camTrack).catch(() => {})
      attachLocal(sess.stream)
    }
  }

  async function toggleScreenShare() {
    if (isScreenSharing.value) {
      await stopScreenShare()
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia) return
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const screenTrack = screenStream.getVideoTracks()[0]
      if (!screenTrack) {
        screenStream.getTracks().forEach(tr => tr.stop())
        return
      }
      screenShareStream = screenStream
      isScreenSharing.value = true
      const sess = rtcSession
      if (sess) {
        const sender = sess.pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(screenTrack).catch(() => {})
      }
      if (localVideoRef.value) {
        localVideoRef.value.srcObject = screenStream
        void localVideoRef.value.play?.()?.catch(() => {})
      }
      screenTrack.onended = () => { void stopScreenShare() }
      if (activeCall.value) {
        await api(`/api/v1/calls/${activeCall.value.id}/signal`, 'POST', { signal_type: 'screen-share' }).catch(() => {})
      }
    } catch {}
  }

  async function updateCallState(state: 'connected' | 'ended' | 'declined') {
    if (!activeCall.value) return
    const cid = activeCall.value.id
    const prevCall = { ...activeCall.value }
    const durSec = callDuration.value
    await wrap(async () => {
      await api(`/api/v1/calls/${cid}/state`, 'POST', { state }).catch(() => {})
      if (state === 'ended' || state === 'declined') {
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
        clearNoAnswerTimer()
        startCallTimer()
        if (!rtcSession) {
          rtcSession = await initPeerSession(cid, activeCall.value.kind)
        }
        // Replay buffered WS signals plus any missed server-stored signals
        // (offer + ICE candidates) so cross-isolate / late-accept calls connect cleanly.
        const held = ringingSignals.splice(0, ringingSignals.length)
        let serverSignals: any[] = []
        try {
          const res = await api<{ signals?: any[] }>(`/api/v1/calls/${cid}/signals`)
          if (Array.isArray(res?.signals)) serverSignals = res.signals
        } catch {}
        const combined = [...held, ...serverSignals]
        const seenCand = new Set<string>()
        let sawOffer = false
        for (const sig of combined) {
          if (sig.signal_type === 'offer') {
            if (sawOffer) continue
            sawOffer = true
            await handleIncomingCallSignal(sig)
          }
        }
        for (const sig of combined) {
          if (sig.signal_type === 'ice-candidate') {
            const key = typeof sig.candidate === 'string' ? sig.candidate : JSON.stringify(sig.candidate || '')
            if (seenCand.has(key)) continue
            seenCand.add(key)
            await handleIncomingCallSignal(sig)
          }
        }
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

  async function cycleCallCamera() {
    const sess = rtcSession
    if (!sess?.stream || !navigator.mediaDevices?.getUserMedia) return
    const video = sess.stream.getVideoTracks()[0]
    if (!video) return
    const nextFacing = video.getSettings().facingMode === 'user' ? 'environment' : 'user'
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: nextFacing } })
      const freshTrack = fresh.getVideoTracks()[0]
      if (!freshTrack) {
        fresh.getTracks().forEach(t => t.stop())
        return
      }
      const sender = sess.pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender) await sender.replaceTrack(freshTrack)
      video.stop()
      sess.stream.removeTrack(video)
      sess.stream.addTrack(freshTrack)
      if (localVideoRef.value) localVideoRef.value.srcObject = sess.stream
    } catch {}
  }

  function endCallLocally() {
    stopCallRecording(true)
    clearNoAnswerTimer()
    callRemoteStream = null
    callLocalStream = null
    if (screenShareStream) {
      screenShareStream.getTracks().forEach(tr => tr.stop())
      screenShareStream = null
    }
    pendingIceCandidates = []
    ringingSignals = []
    appliedOffer = false
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
    handleIncomingRing,
    cycleCallCamera,
    handleIncomingCallSignal,
    toggleCallMute,
    toggleCallVideo,
    toggleScreenShare,
    updateCallState,
    startCallTimer,
    clearNoAnswerTimer,
    stopCallTimer,
    toggleCallRecording,
    endCallLocally,
  }
}
