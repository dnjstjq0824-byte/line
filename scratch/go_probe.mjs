import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const DB = join(tmpdir(), 'capture_probe.db').replace(/\\/g, '/');
const go = spawn('go', ['run', './cmd/server'], {
  cwd: 'backend',
  env: { ...process.env, DATABASE_URL: 'sqlite://' + DB, JWT_SECRET: 'capture-only-secret-0123456789abcdef', PORT: '18081', ALLOWED_ORIGINS: 'http://127.0.0.1:8902' },
});
go.stdout.on('data', (d) => console.log('[OUT] ' + d.toString().slice(0, 300)));
go.stderr.on('data', (d) => console.log('[ERR] ' + d.toString().slice(0, 500)));
await new Promise((r) => setTimeout(r, 45000));
try {
  const res = await fetch('http://127.0.0.1:18081/healthz');
  console.log('healthz=' + res.status);
} catch (e) {
  console.log('healthz FAIL ' + e.message);
}
go.kill();
process.exit(0);
