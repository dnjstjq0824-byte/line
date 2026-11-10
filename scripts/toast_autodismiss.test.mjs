import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Item 5: info toasts must dismiss themselves (they lingered for minutes and
// covered buttons). The session store watches `note` and clears it after
// NOTE_TTL_MS; a newer note arms a fresh timer instead of being cut short.
// Error toasts stay until acknowledged and are pinned untouched below.
const sessionSource = await readFile(new URL('../apps/user-web/src/store/session.ts', import.meta.url), 'utf8');

test('info toast auto-dismisses after its TTL', () => {
  assert.match(sessionSource, /export const NOTE_TTL_MS = \d+/);
  assert.match(sessionSource, /watch\(note,[\s\S]{0,600}?setTimeout\(\(\) => \{[\s\S]{0,300}?if \(note\.value === text\) note\.value = ''[\s\S]{0,100}?\}, NOTE_TTL_MS\)/);
});

test('a newer toast re-arms the timer instead of being cut short', () => {
  const body = sessionSource.match(/watch\(note,[\s\S]*?\n\}\)/)?.[0] || '';
  assert.ok(body.includes('clearTimeout(noteTimer)'));
});

test('error toasts stay until acknowledged', () => {
  assert.ok(!sessionSource.includes('watch(error'));
});
