// S8: the admin console manages bots through the existing admin APIs only.
// Tripwires pin the endpoints, payload fields and the show-once token rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../apps/admin-console/src/App.vue', import.meta.url), 'utf8');

test('console bots: issue, mint, revoke, kill and allowlist calls', () => {
  assert.ok(app.includes("/api/v1/admin/bots', token.value, 'POST'"), 'issue-a-bot call');
  assert.ok(app.includes('/api/v1/admin/bots/${'), 'per-bot token routes');
  assert.ok(app.includes("/tokens`, token.value, 'POST'"), 'mint posts a token');
  assert.ok(app.includes("}`, token.value, 'DELETE')"), 'revoke deletes a token');
  for (const field of ['rooms:', 'ops,', 'ttl_sec:']) assert.ok(app.includes(field), `mint payload ${field}`);
  assert.ok(app.includes("/api/v1/admin/llm/kill', token.value, 'PUT', { stopped }"), 'killswitch toggle');
  assert.ok(app.includes("/api/v1/admin/llm/allowlist', token.value)"), 'allowlist read');
});

test('console bots: list filters bot accounts; token plaintext shows once', () => {
  assert.ok(app.includes('@bots.invalid'), 'bot list filters the users feed');
  assert.ok(app.includes('revealedToken'), 'one-time token display');
  assert.ok(app.includes("revealedToken.value = ''"), 'cleared after display');
  assert.ok(app.includes('expires_at'), 'expiry shown with the token');
});
