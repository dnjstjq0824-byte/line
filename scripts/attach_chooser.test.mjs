import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Item 4: the file/photo chooser never opened because element refs forwarded
// as props were registered with static ref="name", which only matches a
// same-named setup binding — never a prop. The parent's ref stayed null and
// chooseAttachment silently no-oped (file button, album pick, and the voice
// fallback all funnel through it). Forwarded refs must use :ref="theProp".
const paneSource = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
const modalSource = await readFile(new URL('../apps/user-web/src/components/CallModal.vue', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');

test('MessagePane forwards element refs with dynamic :ref', () => {
  for (const name of ['attachmentInput', 'messagesCanvasRef', 'cameraVideoRef']) {
    assert.ok(paneSource.includes(`:ref="${name}"`), `:ref="${name}" missing`);
    assert.ok(!paneSource.includes(`ref="${name}"`) || paneSource.includes(`:ref="${name}"`));
  }
  // No static registration may shadow the forwarded objects.
  const statics = paneSource.match(/(^|[^:])ref="(attachmentInput|messagesCanvasRef|cameraVideoRef)"/g) || [];
  assert.equal(statics.length, 0);
});

test('CallModal forwards video refs with dynamic :ref', () => {
  for (const name of ['localVideoRef', 'remoteVideoRef']) {
    assert.ok(modalSource.includes(`:ref="${name}"`), `:ref="${name}" missing`);
  }
  const statics = modalSource.match(/(^|[^:])ref="(localVideoRef|remoteVideoRef)"/g) || [];
  assert.equal(statics.length, 0);
});

test('voice fallback explains itself before opening the audio picker', () => {
  const body = viewSource.match(/async function toggleVoiceRecording[\s\S]*?\n}\n/)?.[0] || '';
  assert.ok(body.length > 0);
  const notes = body.match(/note\.value = t\('mvVoiceRecordFailed'\)/g) || [];
  assert.equal(notes.length, 2);
});

test('mvVoiceRecordFailed is translated in all four locales', () => {
  const hits = i18nSource.match(/mvVoiceRecordFailed/g) || [];
  assert.equal(hits.length, 4);
});
