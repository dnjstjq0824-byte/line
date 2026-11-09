import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(new URL('../apps/shared/call-fx.ts', import.meta.url), 'utf8');
const fx = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('call video filters cover the four shipped ids', () => {
  assert.deepEqual(Object.keys(fx.CALL_VIDEO_FILTERS).sort(), ['cool', 'mono', 'none', 'warm']);
  assert.equal(fx.CALL_VIDEO_FILTERS.none, 'none');
  for (const css of Object.values(fx.CALL_VIDEO_FILTERS)) {
    assert.equal(typeof css, 'string');
    assert.ok(css.length > 0);
  }
});

test('recording names stay filesystem-safe', () => {
  assert.equal(fx.callRecordingName('abc-123_X'), 'luno-call-abc-123_X.webm');
  assert.equal(fx.callRecordingName('../../x'), 'luno-call-x.webm');
  assert.equal(fx.callRecordingName(''), 'luno-call-call.webm');
});
