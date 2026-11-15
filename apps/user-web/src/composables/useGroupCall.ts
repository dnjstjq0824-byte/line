// F15: group call mesh state, mirroring the 1:1 useWebRTC shape.
// One RTCPeerConnection per remote peer (max 8 seats, server-enforced).
// Mesh rule (shared with the app): the JOINER offers. The join response
// participant list drives offers from the newcomer to each existing peer;
// recipients of call.group.user_joined only add the tile and wait for the
// offer, so no offer glare is possible. Signals for an unknown peer build
// the answer-side PC lazily to survive event reordering across isolates.
import { ref, type Ref } from 'vue'

import { api, currentUser, note, t, token } from '../store/session'
import { request } from '../../../shared/api'
import { fetchIceServers, endWebRTCCall } from '../messenger-utils'

export interface GroupPeer {
  id: string
  name: string
  avatar_color: string
  stream: MediaStream | null
}

export interface GroupCallState {
  roomId: string
  title: string
  kind: 'voice' | 'video'
  mediaFailed: boolean
}

export interface GroupCallDeps {
  activeCallId: Ref<string | null>
}

export function useGroupCall(deps: GroupCallDeps) {
  const groupCall = ref<GroupCallState | null>(null)
  const groupPeers = ref<GroupPeer[]>([])
  const groupCallDuration = ref(0)
  const isGroupMuted = ref(false)
  const isGroupVideoOff = ref(false)
  const localStream = ref<MediaStream | null>(null)

  let peerSessions = new Map<string, RTCPeerConnection>()
  let groupTimer: ReturnType<typeof setInterval> | null = null

  function upsertPeer(id: string, name: string, avatarColor: string): GroupPeer {
    let peer = groupPeers.value.find(p => p.id === id)
    if (!peer) {
      peer = { id, name, avatar_color: avatarColor, stream: null }
      groupPeers.value = [...groupPeers.value, peer]
    }
    return peer
  }

  function removePeer(id: string) {
    const pc = peerSessions.get(id)
    if (pc) {
      try { pc.close() } catch {}
      peerSessions.delete(id)
    }
    groupPeers.value = groupPeers.value.filter(p => p.id !== id)
  }

  async function makePeerConnection(peerId: string): Promise<RTCPeerConnection | null> {
    const call = groupCall.value
    if (!call) return null
    const iceServers = await fetchIceServers(request, token.value)
    const pc = new RTCPeerConnection({ iceServers })
    if (localStream.value) {
      localStream.value.getTracks().forEach(track => pc.addTrack(track, localStream.value!))
    }
    pc.ontrack = (ev) => {
      if (ev.streams[0]) {
        const peer = upsertPeer(peerId, peerId, '#315BCD')
        peer.stream = ev.streams[0]
        groupPeers.value = [...groupPeers.value]
      }
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate && groupCall.value?.roomId === call.roomId) {
        void api('/api/v1/calls/group/signal', 'POST', {
          room_id: call.roomId,
          target_user_id: peerId,
          signal: { type: 'ice-candidate', candidate: ev.candidate.toJSON() }
        }).catch(() => {})
      }
    }
    peerSessions.set(peerId, pc)
    return pc
  }

  async function offerToPeer(peerId: string) {
    const call = groupCall.value
    if (!call) return
    try {
      let pc: RTCPeerConnection | null | undefined = peerSessions.get(peerId)
      if (!pc) {
        pc = await makePeerConnection(peerId)
        if (!pc) return
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await api('/api/v1/calls/group/signal', 'POST', {
        room_id: call.roomId,
        target_user_id: peerId,
        signal: { type: 'offer', sdp: offer.sdp || '' }
      }).catch(() => {})
    } catch {}
  }

  async function startGroupCall(roomId: string, title: string, kind: 'voice' | 'video') {
    if (groupCall.value) return
    if (deps.activeCallId.value) {
      note.value = t('mvCallBusy')
      return
    }
    groupCall.value = { roomId, title, kind, mediaFailed: false }
    groupPeers.value = []
    groupCallDuration.value = 0
    // Media is opportunistic (N2-L precedent): signaling survives without it.
    let stream: MediaStream | null = null
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' })
        stream.getAudioTracks().forEach(track => { track.enabled = !isGroupMuted.value })
        stream.getVideoTracks().forEach(track => { track.enabled = !isGroupVideoOff.value })
      } catch {
        groupCall.value.mediaFailed = true
        note.value = t('callMediaFailed')
      }
    } else {
      groupCall.value.mediaFailed = true
    }
    localStream.value = stream
    try {
      const res = await api<{ participants: Array<{ id: string; display_name: string; avatar_color: string }> }>(
        '/api/v1/calls/group/join', 'POST', { room_id: roomId })
      if (!groupCall.value || groupCall.value.roomId !== roomId) return
      for (const p of res.participants || []) {
        if (p.id === currentUser.value?.id) continue
        upsertPeer(p.id, p.display_name || p.id, p.avatar_color || '#315BCD')
      }
      // Joiner offers to every existing participant (mesh rule).
      for (const peer of groupPeers.value) {
        await offerToPeer(peer.id)
      }
      if (groupTimer) clearInterval(groupTimer)
      groupTimer = setInterval(() => { groupCallDuration.value++ }, 1000)
    } catch (e: any) {
      const full = e?.status === 409
      leaveGroupCallLocal()
      note.value = t(full ? 'mvGroupCallFull' : 'mvGroupCallFailed')
    }
  }

  function handleGroupUserJoined(data: any) {
    const call = groupCall.value
    if (!call || data.room_id !== call.roomId) return
    if (data.user_id === currentUser.value?.id) return
    upsertPeer(data.user_id, data.user_name || data.user_id, '#315BCD')
  }

  function handleGroupUserLeft(data: any) {
    const call = groupCall.value
    if (!call || data.room_id !== call.roomId) return
    removePeer(data.user_id)
  }

  async function handleGroupSignal(data: any) {
    const call = groupCall.value
    if (!call || data.room_id !== call.roomId) return
    const fromId = data.from_user_id
    if (!fromId || fromId === currentUser.value?.id) return
    const signal = data.signal || {}
    try {
      let pc: RTCPeerConnection | null | undefined = peerSessions.get(fromId)
      if (!pc) {
        pc = await makePeerConnection(fromId)
        if (!pc) return
      }
      if (signal.type === 'offer' && signal.sdp) {
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await api('/api/v1/calls/group/signal', 'POST', {
          room_id: call.roomId,
          target_user_id: fromId,
          signal: { type: 'answer', sdp: answer.sdp || '' }
        }).catch(() => {})
      } else if (signal.type === 'answer' && signal.sdp) {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
      } else if (signal.type === 'ice-candidate' && signal.candidate) {
        await pc.addIceCandidate(signal.candidate)
      }
    } catch {}
  }

  function toggleGroupMute() {
    isGroupMuted.value = !isGroupMuted.value
    localStream.value?.getAudioTracks().forEach(t => { t.enabled = !isGroupMuted.value })
  }

  function toggleGroupVideo() {
    isGroupVideoOff.value = !isGroupVideoOff.value
    localStream.value?.getVideoTracks().forEach(t => { t.enabled = !isGroupVideoOff.value })
  }

  async function cycleGroupCamera() {
    const stream = localStream.value
    if (!stream || !navigator.mediaDevices?.getUserMedia) return
    const video = stream.getVideoTracks()[0]
    if (!video) return
    const nextFacing = video.getSettings().facingMode === 'user' ? 'environment' : 'user'
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: nextFacing } })
      const freshTrack = fresh.getVideoTracks()[0]
      if (!freshTrack) {
        fresh.getTracks().forEach(t => t.stop())
        return
      }
      for (const pc of peerSessions.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(freshTrack).catch(() => {})
      }
      video.stop()
      stream.removeTrack(video)
      stream.addTrack(freshTrack)
      localStream.value = stream
    } catch {}
  }

  function leaveGroupCallLocal() {
    if (groupTimer) {
      clearInterval(groupTimer)
      groupTimer = null
    }
    for (const pc of peerSessions.values()) {
      try { pc.close() } catch {}
    }
    peerSessions = new Map()
    endWebRTCCall(null, localStream.value)
    localStream.value = null
    groupPeers.value = []
    groupCall.value = null
    groupCallDuration.value = 0
  }

  async function leaveGroupCall() {
    const call = groupCall.value
    leaveGroupCallLocal()
    if (call) {
      await api('/api/v1/calls/group/leave', 'POST', { room_id: call.roomId }).catch(() => {})
    }
  }

  return {
    groupCall,
    groupPeers,
    groupCallDuration,
    isGroupMuted,
    isGroupVideoOff,
    localStream,
    startGroupCall,
    handleGroupUserJoined,
    handleGroupUserLeft,
    handleGroupSignal,
    toggleGroupMute,
    toggleGroupVideo,
    cycleGroupCamera,
    leaveGroupCall,
    leaveGroupCallLocal,
  }
}
