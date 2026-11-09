import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// QA-P0-1: outbound calls must show an outgoing UI; only incoming calls show Answer.
const vue = readFileSync('apps/user-web/src/views/MessengerView.vue', 'utf8')
const i18n = readFileSync('apps/user-web/src/luno-i18n.ts', 'utf8')

test('activeCall tracks call direction', () => {
  assert.match(vue, /direction: 'outgoing' \| 'incoming'/)
})

test('outgoing call sets direction outgoing, incoming sets incoming', () => {
  assert.match(vue, /direction: 'outgoing'/)
  assert.match(vue, /direction: 'incoming'/)
})

test('Answer button only renders for incoming ringing calls', () => {
  assert.match(vue, /v-if="activeCall\.state === 'ringing' && activeCall\.direction === 'incoming'"[^>]*btn-call-answer/)
})

test('ringing label distinguishes outgoing (mvCalling) from incoming', () => {
  assert.match(vue, /direction === 'outgoing' \? t\('mvCalling'\) : t\('mvConnecting'\)/)
  assert.equal((i18n.match(/mvCalling:/g) || []).length, 4)
})

test('own outbound call.ringing echo does not flip UI to incoming', () => {
  assert.match(vue, /data\.initiated_by && data\.initiated_by === currentUser\.value\?\.id/)
  assert.match(vue, /activeCall\.value\?\.id === data\.call_id/)
})

test('call aborts honestly when mic/camera unavailable', () => {
  assert.match(vue, /t\('callMediaFailed'\)/)
  assert.equal((i18n.match(/callMediaFailed:/g) || []).length, 4)
})

test('call teardown clears stale video elements', () => {
  assert.match(vue, /localVideoRef\.value\.srcObject = null/)
  assert.match(vue, /remoteVideoRef\.value\.srcObject = null/)
})
