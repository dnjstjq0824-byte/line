// Local file queue. One JSON file per task, written atomically (temp file +
// rename) so a power cut never leaves a half-written task. Survives reboots.
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const OPEN_STATES = new Set(['queued', 'running', 'reported']);

function atomicWrite(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}
function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

export class TaskQueue {
  constructor(dir) {
    this.dir = dir;
    this.tasksDir = join(dir, 'tasks');
    for (const d of [dir, this.tasksDir, join(dir, 'logs'), join(dir, 'prompts')]) mkdirSync(d, { recursive: true });
    this.metaPath = join(dir, 'queue-meta.json');
    this.meta = readJson(this.metaPath, { counters: {}, seen: [], day: '', dayCount: 0 });
    this.tasks = new Map();
    for (const name of readdirSync(this.tasksDir)) {
      if (!name.endsWith('.json')) continue;
      const task = readJson(join(this.tasksDir, name), null);
      if (task && task.id) this.tasks.set(task.id, task);
    }
  }

  saveMeta() { atomicWrite(this.metaPath, JSON.stringify(this.meta)); }

  save(task) {
    task.updatedAt = new Date().toISOString();
    this.tasks.set(task.id, task);
    atomicWrite(join(this.tasksDir, `${task.id}.json`), JSON.stringify(task, null, 1));
    this.writeBoard();
    return task;
  }

  // message ids already handled (a group room delivers one job per bot).
  seen(messageId) { return this.meta.seen.includes(messageId); }
  markSeen(messageId) {
    this.meta.seen.push(messageId);
    if (this.meta.seen.length > 500) this.meta.seen = this.meta.seen.slice(-500);
    this.saveMeta();
  }

  countToday() {
    const day = new Date().toISOString().slice(0, 10);
    if (this.meta.day !== day) { this.meta.day = day; this.meta.dayCount = 0; }
    return this.meta.dayCount;
  }

  create({ project, cmd, text, urgent = false, roomId, messageId, parentId = '' }) {
    const n = (this.meta.counters[project.id] || 0) + 1;
    this.meta.counters[project.id] = n;
    this.countToday();
    this.meta.dayCount += 1;
    this.saveMeta();
    const task = {
      id: `${project.prefix}-${String(n).padStart(4, '0')}`, projectId: project.id, cmd, text, urgent,
      roomId, messageId, parentId, state: 'queued', createdAt: new Date().toISOString(),
    };
    return this.save(task);
  }

  get(id) { return this.tasks.get(id) || null; }
  all() { return [...this.tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  queued() {
    const list = this.all().filter((t) => t.state === 'queued');
    return [...list.filter((t) => t.urgent), ...list.filter((t) => !t.urgent)];
  }
  running() { return this.all().find((t) => t.state === 'running') || null; }
  byMessage(messageId) {
    return this.all().reverse().find((t) => t.reportMessageId === messageId || t.proposalMessageId === messageId
      || (t.postedMessageIds || []).includes(messageId)) || null;
  }

  // Next task, alternating between projects so one never starves the rest.
  next(lastProjectId) {
    const list = this.queued();
    if (!list.length) return null;
    if (list[0].urgent) return list[0];
    return list.find((t) => t.projectId !== lastProjectId) || list[0];
  }

  // After a crash or reboot nothing is really running any more.
  recover() {
    const interrupted = [];
    for (const task of this.all()) {
      if (task.state !== 'running') continue;
      task.state = 'failed';
      task.error = '러너 재시작으로 중단됨';
      this.save(task);
      interrupted.push(task);
    }
    return interrupted;
  }

  writeBoard() {
    const rows = this.all().slice(-40).map((t) =>
      `| ${t.id} | ${t.projectId} | /${t.cmd} | ${t.state} | ${(t.text || '').replace(/\s+/g, ' ').slice(0, 60)} | ${t.updatedAt || ''} |`);
    const text = ['# LUNO PC agent — task queue', '', `updated: ${new Date().toISOString()}`, '',
      '| id | project | cmd | state | text | updated |', '|---|---|---|---|---|---|', ...rows, ''].join('\n');
    try { atomicWrite(join(this.dir, 'TASK_QUEUE.md'), text); } catch { /* board is best-effort */ }
  }
}

export function stopRequested(dir) { return existsSync(join(dir, 'STOP')); }
