// Daily scheduled commands (/every). Entries live in the state folder and
// each runs at most once a day; numbering is the list position (1-based).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from './queue.mjs';

export const EVERY_MAX = 5;
export const EVERY_FILE = 'every.json';

function toMin(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export class Every {
  constructor(dir) { this.path = join(dir, EVERY_FILE); }
  list() {
    if (!existsSync(this.path)) return [];
    try {
      const v = JSON.parse(readFileSync(this.path, 'utf8'));
      return Array.isArray(v) ? v.filter((e) => e && typeof e.time === 'string' && typeof e.command === 'string') : [];
    } catch { return []; }
  }
  save(entries) { atomicWrite(this.path, JSON.stringify(entries, null, 1)); }
  add({ time, command, roomId, projectId }) {
    const entries = this.list();
    const entry = { time, command, roomId, projectId, createdAt: new Date().toISOString(), lastRunDay: '' };
    entries.push(entry);
    this.save(entries);
    return { index: entries.length - 1, entry };
  }
  remove(n) {
    const entries = this.list();
    const i = Number(n) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= entries.length) return null;
    const [gone] = entries.splice(i, 1);
    this.save(entries);
    return gone;
  }
  stampRun(index, day) {
    const entries = this.list();
    if (entries[index]) { entries[index].lastRunDay = day; this.save(entries); }
  }
  due(day, mins) {
    return this.list()
      .map((entry, index) => ({ index, entry }))
      .filter(({ entry }) => entry.lastRunDay !== day && toMin(entry.time) <= mins);
  }
}
