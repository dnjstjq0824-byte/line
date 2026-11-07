import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('money-in endpoints fail closed without a verified provider', async () => {
  for (const path of ['/api/v1/store/orders', '/api/v1/wallet/charge']) {
    const res = await worker.fetch(new Request(`https://edge.example${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"amount":10000}',
    }), {});
    assert.equal(res.status, 503);
    assert.match(await res.text(), /verified provider integration required/);
  }
});
