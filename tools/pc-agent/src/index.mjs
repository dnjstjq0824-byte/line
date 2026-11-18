// Entry point: single instance, heartbeat, adaptive polling, backoff.
// Usage: node src/index.mjs   (state folder: %USERPROFILE%\.luno-agent or LUNO_AGENT_HOME)
import { writeFileSync, readFileSync, existsSync, unlinkSync, appendFileSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, stateDir } from './config.mjs';
import { Agent, VERSION } from './agent.mjs';
import { LunoError } from './luno.mjs';

const dir = stateDir();
mkdirSync(join(dir, 'logs'), { recursive: true });
const logPath = join(dir, 'logs', 'agent.log');
function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  try {
    if (existsSync(logPath) && statSync(logPath).size > 5_000_000) renameSync(logPath, `${logPath}.1`);
    appendFileSync(logPath, text);
  } catch { /* logging never stops the runner */ }
  if (process.stdout.isTTY) process.stdout.write(text);
}

// Single instance: the lock holds our pid; a lock whose pid is gone is stale.
const lockPath = join(dir, 'agent.lock');
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
if (existsSync(lockPath)) {
  const pid = Number(readFileSync(lockPath, 'utf8').trim());
  if (pid && pid !== process.pid && alive(pid)) {
    log(`another runner is already running (pid ${pid}); exiting`);
    process.exit(0);
  }
}
writeFileSync(lockPath, String(process.pid));
const release = () => { try { if (readFileSync(lockPath, 'utf8').trim() === String(process.pid)) unlinkSync(lockPath); } catch { /* gone */ } };
process.on('exit', release);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { log(`${sig} received; exiting`); process.exit(0); });
process.on('uncaughtException', (error) => { log(`uncaught: ${error.stack || error}`); });
process.on('unhandledRejection', (error) => { log(`unhandled: ${(error && error.stack) || error}`); });

let loaded;
try {
  loaded = loadConfig(dir);
} catch (error) {
  log(`cannot start: ${error.message}`);
  process.exit(2);
}
const { cfg, secrets } = loaded;
const agent = new Agent({ cfg, secrets, dir, log });
const heartbeat = () => { try { writeFileSync(join(dir, 'heartbeat'), String(Date.now())); } catch { /* next beat */ } };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

log(`pc-agent v${VERSION} starting (pid ${process.pid}, projects: ${cfg.projects.map((p) => p.id).join(', ')})`);
heartbeat();
const recovered = agent.queue.recover();
await agent.cleanupOld().catch((error) => log(`cleanup failed: ${error.message}`));
await agent.announceOnline(recovered);

let backoff = 0;
let lastCleanup = Date.now();
for (;;) {
  heartbeat();
  let wait;
  try {
    await agent.pollOnce();
    try { await agent.notePollOk(); } catch (error) { log(`recovery note failed: ${error.message}`); }
    backoff = 0;
    const active = agent.current || Date.now() - agent.lastActivity < 120000;
    const hour = new Date().getHours();
    wait = active ? cfg.pollMs.active : (hour >= 1 && hour < 7 ? cfg.pollMs.night : cfg.pollMs.idle);
  } catch (error) {
    if (error instanceof LunoError && error.code === 'LLM_KILLED') { wait = 30000; log('killswitch is on; waiting'); }
    else if (error instanceof LunoError && error.status === 429) { wait = 60000; log(`rate/quota limited (${error.code}); waiting`); }
    else if (error instanceof LunoError && (error.status === 401 || error.status === 403)) { wait = 60000; log(`token rejected (${error.status}); check secrets.json / re-run provision`); }
    else {
      backoff = Math.min(backoff ? backoff * 2 : 5000, 300000);
      wait = backoff;
      log(`poll failed: ${error.message}; retrying in ${Math.round(wait / 1000)}s`);
    }
    agent.startNext();
  }
  if (Date.now() - lastCleanup > 86400000) {
    lastCleanup = Date.now();
    agent.cleanupOld().catch((error) => log(`cleanup failed: ${error.message}`));
  }
  await sleep(wait);
}
