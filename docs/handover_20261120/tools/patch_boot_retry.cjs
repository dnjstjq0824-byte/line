// usage: node patch_boot_retry.cjs <repoDir>
// Production 500 "internal_error" (2026-11-20): the isolate's cached boot /
// schema promise was created by a request that ended before it settled.
// Workers (handle_cross_request_promise_resolution) then rejects every later
// await of it, so the isolate answered 500 to everything until recycled.
// Fix: a failed await of a cached startup promise drops it and redoes the
// work once inside the current request.
const fs = require('fs');
const path = require('path');
const file = path.join(process.argv[2], 'scripts/cf_worker.js');
let s = fs.readFileSync(file, 'utf8');
const crlf = s.includes('\r\n');
if (crlf) s = s.replace(/\r\n/g, '\n');
function once(a, b, label) {
  const i = s.indexOf(a);
  if (i < 0) throw new Error('missing ' + label);
  if (s.indexOf(a, i + 1) >= 0) throw new Error('not unique ' + label);
  s = s.slice(0, i) + b + s.slice(i + a.length);
}
if (s.includes('bootInRequest')) throw new Error('already patched');

once(`async function ensureSchema() {
  const db = dbOf();
  if (!db) return false;
  if (!schemaReady) {
    schemaReady = (async () => {`,
`// A cached startup promise belongs to the request that created it. If that
// request ended before it settled (client went away), Workers rejects every
// later await of it ("created by a request that has since ended"), and the
// isolate used to answer 500 to everything until it was recycled. A failed
// await now drops the cache and redoes the work once in this request.
async function ensureSchema() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ensureSchemaOnce();
    } catch (err) {
      schemaReady = null;
      if (attempt >= 1) throw err;
    }
  }
}
async function ensureSchemaOnce() {
  const db = dbOf();
  if (!db) return false;
  if (!schemaReady) {
    schemaReady = (async () => {`, 'ensureSchema');

once(`function boot(env) {
  if (!booted) {
    booted = (async () => {
      ensureSeed(env);
      seedExtras();
      await hashPendingPasswords();
      if (env && env.DB) {
        await syncFromD1(env.DB);
        await ensureSchema();
        // D4: the demo openchat seed lives in D1 (DEMO_MODE isolates only).
        if (env.DEMO_MODE === 'true') await seedDemoRoom(env.DB);
      }
    })();
  }
  return booted;
}`,
`function boot(env) {
  if (!booted) {
    const run = (async () => {
      ensureSeed(env);
      seedExtras();
      await hashPendingPasswords();
      if (env && env.DB) {
        await syncFromD1(env.DB);
        await ensureSchema();
        // D4: the demo openchat seed lives in D1 (DEMO_MODE isolates only).
        if (env.DEMO_MODE === 'true') await seedDemoRoom(env.DB);
      }
    })();
    booted = run;
    // A failed boot is retried by the next request instead of poisoning the isolate.
    run.catch(() => { if (booted === run) booted = null; });
  }
  return booted;
}
// See ensureSchema: the boot promise may belong to a request that ended.
async function bootInRequest(env) {
  try {
    await boot(env);
  } catch {
    booted = null;
    await boot(env);
  }
}`, 'boot');

const before = s.split('await boot(env);').length - 1;
if (before < 1) throw new Error('no boot callers');
s = s.split('await boot(env);').join('await bootInRequest(env);');
// the definition itself must still call boot()
if (!s.includes('    await boot(env);\n  } catch {\n    booted = null;\n    await boot(env);')) {
  s = s.replace('  try {\n    await bootInRequest(env);\n  } catch {\n    booted = null;\n    await bootInRequest(env);', '  try {\n    await boot(env);\n  } catch {\n    booted = null;\n    await boot(env);');
}
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(file, s);
console.log('patched', file, 'boot callers:', before);
