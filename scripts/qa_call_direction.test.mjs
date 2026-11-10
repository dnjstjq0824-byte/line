import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// QA-P0-1: outbound calls must show an outgoing UI; only incoming calls show Answer.
// I-4: call state lives in useWebRTC, socket fan-out in useChatSocket, and the
// overlay template in CallModal — each assertion reads its owning file.
const vue = readFileSync('apps/user-web/src/views/MessengerView.vue', 'utf8')
const webrtc = readFileSync('apps/user-web/src/composables/useWebRTC.ts', 'utf8')
const socket = readFileSync('apps/user-web/src/composables/useChatSocket.ts', 'utf8')
const callModal = readFileSync('apps/user-web/src/components/CallModal.vue', 'utf8')
const i18n = readFileSync('apps/user-web/src/luno-i18n.ts', 'utf8')

test('activeCall tracks call direction', () => {
  assert.match(webrtc, /direction: 'outgoing' \| 'incoming'/)
})

test('outgoing call sets direction outgoing, incoming sets incoming', () => {
  assert.match(webrtc, /direction: 'outgoing'/)
  assert.match(socket, /direction: 'incoming'/)
})

test('Answer button only renders for incoming ringing calls', () => {
  assert.match(callModal, /v-if="activeCall\.state === 'ringing' && activeCall\.direction === 'incoming'"[^>]*btn-call-answer/)
})

test('ringing label distinguishes outgoing (mvCalling) from incoming', () => {
  assert.match(callModal, /direction === 'outgoing' \? t\('mvCalling'\) : t\('mvConnecting'\)/)
  assert.equal((i18n.match(/mvCalling:/g) || []).length, 4)
})

test('own outbound call.ringing echo does not flip UI to incoming', () => {
  assert.match(socket, /data\.initiated_by && data\.initiated_by === currentUser\.value\?\.id/)
  assert.match(socket, /activeCall\.value\?\.id === data\.call_id/)
})

test('call aborts honestly when mic/camera unavailable', () => {
  assert.match(webrtc, /t\('callMediaFailed'\)/)
  assert.equal((i18n.match(/callMediaFailed:/g) || []).length, 4)
})

test('call teardown clears stale video elements', () => {
  assert.match(webrtc, /localVideoRef\.value\.srcObject = null/)
  assert.match(webrtc, /remoteVideoRef\.value\.srcObject = null/)
})
