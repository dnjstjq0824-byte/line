// Hybrid capture server: serves local dist_cf, proxies /api/* to PROD worker.
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
const PORT = Number(process.env.HYBRID_PORT || 8899);
const DIST = 'dist_cf';
const PROD = 'line-messenger.dnjstjqppk.workers.dev';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const proxy = httpsRequest({ hostname: PROD, port: 443, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: PROD } }, (pres) => {
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    });
    proxy.on('error', (e) => { res.writeHead(502); res.end('proxy err ' + String(e).slice(0, 100)); });
    req.pipe(proxy);
    return;
  }
  const path = normalize(decodeURIComponent(u.pathname));
  const file = join(DIST, path);
  const send = (p) => { res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p)); };
  try {
    if (existsSync(file) && statSync(file).isFile()) return send(file);
    const idx = join(file, 'index.html');
    if (existsSync(idx)) return send(idx);
    if (!extname(path)) return send(join(DIST, 'index.html'));
  } catch {}
  res.writeHead(404); res.end('nf');
});
server.listen(PORT, '127.0.0.1', () => console.log('hybrid up on ' + PORT));
