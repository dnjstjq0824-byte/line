// A15: web voice AI — voice bubbles offer "view as text" (ai/stt over the
// attachment bytes), text bubbles offer "read aloud" (ai/tts playback).
// Unconfigured engines surface honest "getting ready" guidance in 4 locales.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const paneSource = (await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const i18nSource = (await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const cssSource = (await readFile(new URL('../apps/user-web/src/styles/luno-v2.css', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

test('A15: voice bubbles transcribe through ai/stt', () => {
  assert.ok(paneSource.includes(`msg.kind === 'voice' && !msg.unsent`), 'voice-only toolbar button');
  assert.ok(paneSource.includes('@click="transcribeVoice(msg)"'), 'transcribe handler wired');
  assert.ok(paneSource.includes('/api/v1/ai/stt'), 'ai/stt endpoint called');
  assert.ok(paneSource.includes('/content'), 'transcription reads attachment bytes');
});

test('A15: text bubbles read aloud through ai/tts', () => {
  assert.ok(paneSource.includes(`msg.kind === 'text' && !msg.unsent`), 'text-only toolbar button');
  assert.ok(paneSource.includes('@click="readAloud(msg)"'), 'read-aloud handler wired');
  assert.ok(paneSource.includes('/api/v1/ai/tts'), 'ai/tts endpoint called');
  assert.ok(paneSource.includes('new Audio('), 'tts audio plays back');
});

test('A15: unconfigured engines show guidance, failures show failure', () => {
  assert.ok(paneSource.includes('mvVoiceAiPending'), 'pending guidance key used');
  assert.ok(paneSource.includes('mvVoiceAiFailed'), 'failure key used');
  assert.ok(paneSource.includes('res.status === 503'), '503 maps to guidance');
  assert.ok(paneSource.includes('lx-voice-ai-box'), 'result box rendered');
});

test('A15: voice-AI keys translated in all four locales', () => {
  for (const key of ['mvVoiceToText', 'mvReadAloud', 'mvVoiceAiPending', 'mvVoiceAiFailed', 'mvVoiceAiWorking']) {
    const hits = i18nSource.match(new RegExp(key, 'g')) || [];
    assert.equal(hits.length, 4, `${key} must appear once per locale`);
  }
});

test('A15: voice-AI styles live in the luno-v2 shell', () => {
  for (const cls of ['.lx-voice-ai-box', '.lx-voice-ai-loading', '.lx-voice-ai-error', '.lx-voice-ai-result']) {
    assert.ok(cssSource.includes(cls), `${cls} missing from luno-v2.css`);
  }
});
