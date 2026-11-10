import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Item 10: avatar initials must never render as tofu. `.slice(0, 1)` splits
// UTF-16 code units, so an emoji-leading name like '😸care😸' produced a lone
// surrogate ('�'). initialOf splits by code point instead.
const helperSource = await readFile(new URL('../apps/shared/avatar_initial.ts', import.meta.url), 'utf8');
const { initialOf } = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`);

test('initialOf keeps emoji initials intact', () => {
  assert.equal(initialOf('😸care😸'), '😸');
  assert.equal(initialOf('도천재'), '도');
  assert.equal(initialOf('Alice'), 'A');
  assert.equal(initialOf(''), '');
  assert.equal(initialOf('', 'L'), 'L');
  assert.equal(initialOf(null, 'U'), 'U');
  assert.equal(initialOf('K 🙏'), 'K');
});

test('no UTF-16 initial slicing remains in web sources', async () => {
  const run = promisify(execFile);
  let stdout = '';
  try {
    ({ stdout } = await run('git', ['grep', '-n', 'slice(0, 1)', '--', 'apps/user-web/src'], { cwd: new URL('..', import.meta.url) }));
  } catch (e) {
    stdout = e.stdout || '';
    if (e.code !== 1) throw e;
  }
  assert.equal(stdout.trim(), '', `stray slice(0, 1):\n${stdout}`);
});

test('profanity audit: no seeded chat copy contains profanity markers', async () => {
  const workerSource = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  for (const marker of ['좆', '씨발', '시발', '병신', '개새', 'fuck', 'shit']) {
    assert.ok(!workerSource.toLowerCase().includes(marker), `seed marker found: ${marker}`);
  }
});
