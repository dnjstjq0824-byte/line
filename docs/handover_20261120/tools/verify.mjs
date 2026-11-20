const out = {};
const bump = (k) => (out[k] = (out[k] || 0) + 1);
for (const h of ['https://luno-messenger.dnjstjqppk.workers.dev', 'https://lunotalk.com']) {
  for (let i = 0; i < 15; i++) {
    for (const p of ['/api/v1/version', '/api/v1/me', '/api/v1/calls/incoming', '/readyz']) {
      const r = await fetch(h + p, { headers: { Origin: 'https://lunotalk.com' } });
      bump(`${h.replace('https://', '').slice(0, 14)} ${p} ${r.status}`);
    }
  }
}
console.log(out);
const v = await (await fetch('https://luno-messenger.dnjstjqppk.workers.dev/api/v1/version')).json();
console.log('worker_source_sha256', v.worker_source_sha256);
const a = await (await fetch('https://lunotalk.com/api/v1/app/latest')).json();
console.log('app/latest build', a.build, a.assets.map((x) => x.size_bytes).join(','));
const root = await fetch('https://lunotalk.com/', { redirect: 'manual', headers: { 'Accept-Language': 'ko-KR' } });
console.log('/ ->', root.status, root.headers.get('location'));
const ko = await fetch('https://lunotalk.com/ko');
console.log('/ko', ko.status, (await ko.text()).includes('<div id="app">') ? 'spa ok' : 'no app div');
const d = await fetch('https://luno-messenger.dnjstjqppk.workers.dev/download', { redirect: 'manual' });
console.log('/download', d.status, d.headers.get('content-length') || d.headers.get('location'));
