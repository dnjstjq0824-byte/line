// Production 500s (2026-11-20): an isolate whose cached boot / schema promise
// belonged to a request that had ended answered "internal_error" to every
// request. Workers rejects such awaits with "This promise was created by a
// request that has since ended"; here the D1 schema batch throws that once
// (boot -> ensureSchema), and the
// request that hits it must recover inside the same request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './test_helpers.mjs';

const ENDED = 'This promise was created by a request that has since ended, so it can never settle.';

function flakyD1(failures) {
  const db = makeD1();
  let left = failures;
  const wrap = (stmt) => new Proxy(stmt, {
    get(target, prop) {
      if (prop === 'bind') return (...args) => wrap(target.bind(...args));
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql) => wrap(target.prepare(sql));
      if (prop === 'batch') return (stmts) => {
        if (left > 0) { left--; return Promise.reject(new Error(ENDED)); }
        return target.batch(stmts);
      };
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

let serial = 0;
async function call(db, path = '/api/v1/legal') {
  const mod = await import(`./cf_worker.js?bootretry=${++serial}`);
  return mod.default.fetch(new Request(`https://localhost${path}`), { DB: db, DURABLE_CONVERSATIONS: 'true' });
}

test('a boot that dies with its request is redone by the next request', async () => {
  const db = flakyD1(2);
  try {
    const r = await call(db);
    assert.equal(r.status, 200, await r.clone().text());
  } finally { db.raw.close(); }
});

test('the same isolate keeps serving after a failed boot', async () => {
  const db = flakyD1(2);
  try {
    const mod = await import(`./cf_worker.js?bootretry=${++serial}`);
    const env = { DB: db, DURABLE_CONVERSATIONS: 'true' };
    for (let i = 0; i < 3; i++) {
      const r = await mod.default.fetch(new Request('https://localhost/api/v1/version'), env);
      assert.equal(r.status, 200, `request ${i}: ${await r.clone().text()}`);
    }
  } finally { db.raw.close(); }
});
