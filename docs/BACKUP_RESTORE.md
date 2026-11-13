# LUNO D1 Backup & Restore

Database: `luno-messenger-db` (remote), binding `DB`.
Backups live in `backups/` (gitignored — production data, never commit).

## 1. Take a backup (read-only, safe anytime)

```powershell
node scripts/d1_backup.mjs
```

Runs `npx wrangler d1 export luno-messenger-db --remote --output
backups/luno-messenger-db-<stamp>.sql`. The script only reads remote state.

## 2. Restore rehearsal (LOCAL ONLY — never restore to remote from here)

Rehearsals prove a dump restores with identical row counts. They run against
an isolated local file or a wiped `--local` database, never `--remote`.

Isolated-file rehearsal (no existing state touched):

```powershell
node -e "const fs=require('fs');const{DatabaseSync}=require('node:sqlite');const f=fs.readdirSync('backups').filter(x=>x.endsWith('.sql')).sort().at(-1);const db=new DatabaseSync('restore_check.sqlite');db.exec(fs.readFileSync('backups/'+f,'utf8'));console.log(db.prepare('SELECT COUNT(*) n FROM users').get());db.close()"
npx wrangler d1 execute luno-messenger-db --remote --command "SELECT COUNT(*) AS n FROM users"
```

The two `users` counts must match. Last rehearsed: 2026-11-13
(13 users remote == 13 users restored, 41 tables).

`--local` rehearsal (wipes the existing local dev database first):

```powershell
# WARNING: deletes local dev state under .wrangler/state
Remove-Item -Recurse -Force .wrangler/state/v3/d1
npx wrangler d1 execute luno-messenger-db --local --file backups/<dump>.sql
npx wrangler d1 execute luno-messenger-db --local --command "SELECT COUNT(*) AS n FROM users"
```

## 3. Point-in-time recovery (Cloudflare Time Travel)

Check available restore points (read-only):

```powershell
npx wrangler d1 time-travel info luno-messenger-db
```

Restoring production from a point in time is a CEO-approved,
scheduled operation — never run it as part of a rehearsal.

## 4. Rules

- `backups/` is gitignored. If a dump ever lands in git history, rotate
  credentials (hashes are in the dump) — history itself is not rewritten.
- No `DELETE`/`DROP`/mass-`UPDATE`, no `--remote` writes from automation.
- Remote restores need explicit CEO approval with a rollback plan.
