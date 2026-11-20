// lunotalk.com front page: "/" goes to /<lang> by cookie > Geo-IP country >
// Accept-Language > English, and the server's language list matches the web's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await import(`./cf_worker.js?sitelang=${Date.now()}`);
const env = {};
const root = (headers = {}, search = '') => worker.default.fetch(new Request(`https://lunotalk.com/${search}`, { headers }), env);
const where = async (headers, search) => {
  const r = await root(headers, search);
  assert.equal(r.status, 302);
  return r.headers.get('location');
};

test('server and web share one language list', async () => {
  const web = await readFile(new URL('../apps/user-web/src/site-i18n.ts', import.meta.url), 'utf8');
  const srv = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const list = (src) => JSON.parse(src.match(/SITE_LANGS = \[([^\]]+)\]/)[1].replace(/'/g, '"').replace(/\s+/g, '').replace(/,$/, '').replace(/^/, '[').replace(/$/, ']'));
  assert.deepEqual(list(srv), list(web));
});

test('Geo-IP country decides when it has one clear language', async () => {
  assert.equal(await where({ 'X-Luno-Country': 'KR' }), '/ko');
  assert.equal(await where({ 'X-Luno-Country': 'JP' }), '/ja');
  assert.equal(await where({ 'X-Luno-Country': 'TW' }), '/zh-tw');
  assert.equal(await where({ 'X-Luno-Country': 'CN' }), '/zh');
  assert.equal(await where({ 'X-Luno-Country': 'MX' }), '/es');
  assert.equal(await where({ 'X-Luno-Country': 'BR' }), '/pt');
  assert.equal(await where({ 'X-Luno-Country': 'EG' }), '/ar');
  assert.equal(await where({ 'CF-IPCountry': 'VN' }), '/vi');
});

test('multilingual countries and unknowns fall back to the browser language', async () => {
  assert.equal(await where({ 'X-Luno-Country': 'IN', 'Accept-Language': 'hi-IN,hi;q=0.9,en;q=0.8' }), '/hi');
  assert.equal(await where({ 'X-Luno-Country': 'CH', 'Accept-Language': 'fr-CH,fr;q=0.9' }), '/fr');
  assert.equal(await where({ 'Accept-Language': 'zh-Hant-TW,zh;q=0.8' }), '/zh-tw');
  assert.equal(await where({ 'Accept-Language': 'xx,yy;q=0.5' }), '/en');
  assert.equal(await where({}), '/en');
});

test('a chosen language (cookie) wins over country, and the query survives', async () => {
  assert.equal(await where({ 'X-Luno-Country': 'KR', Cookie: 'a=1; luno_lang=ja' }), '/ja');
  assert.equal(await where({ 'X-Luno-Country': 'KR', Cookie: 'luno_lang=klingon' }), '/ko');
  assert.equal(await where({ 'X-Luno-Country': 'JP' }, '?ref=ad'), '/ja?ref=ad');
});

test('the redirect is never cached across visitors', async () => {
  const r = await root({ 'X-Luno-Country': 'KR' });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.headers.get('vary') || '', /Cookie/);
});
