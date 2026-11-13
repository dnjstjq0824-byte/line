#!/usr/bin/env node
// d1_backup.mjs — read-only remote export of luno-messenger-db into backups/.
// Usage: node scripts/d1_backup.mjs [out-dir]
// The dump contains production data (password hashes included): backups/ is
// gitignored and must never be committed. Restores target LOCAL D1 only —
// this script never writes to remote. See docs/BACKUP_RESTORE.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : path.join(root, 'backups');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const outFile = path.join(outDir, `luno-messenger-db-${stamp}.sql`);
console.log(`Exporting remote luno-messenger-db (read-only) to ${outFile} ...`);
execFileSync('npx', ['wrangler', 'd1', 'export', 'luno-messenger-db', '--remote', '--output', outFile], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
const size = fs.statSync(outFile).size;
console.log(`Export complete: ${outFile} (${size} bytes). Never commit backups/ (gitignored).`);
