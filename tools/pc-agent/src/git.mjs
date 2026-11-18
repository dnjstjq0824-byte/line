// Git plumbing. Each task works in its own worktree on its own branch; main
// only ever moves by a fast-forward merge after the owner approves.
import { existsSync, mkdirSync, symlinkSync, lstatSync, rmdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './proc.mjs';

async function git(cwd, args, timeoutMs = 120000) {
  const res = await run('git', args, { cwd, timeoutMs });
  return { ok: res.code === 0, out: res.stdout.trim(), err: res.stderr.trim() };
}

export function branchName(task, when = new Date()) {
  const day = when.toISOString().slice(0, 10).replace(/-/g, '');
  const kind = task.cmd === 'mkt' ? 'mkt' : 'task';
  return `luno-auto/${kind}-${day}-${task.id.toLowerCase()}`;
}

// node_modules folders to share with every worktree: the root one plus each
// workspace app's own (apps/<name>/node_modules), relative to the repo root.
export function sharedModuleDirs(repoPath) {
  const dirs = ['node_modules'];
  const apps = join(repoPath, 'apps');
  if (existsSync(apps)) {
    for (const name of readdirSync(apps)) {
      if (existsSync(join(apps, name, 'node_modules'))) dirs.push(join('apps', name, 'node_modules'));
    }
  }
  return dirs.filter((d) => existsSync(join(repoPath, d)));
}

function removeModuleLinks(repoPath, path) {
  for (const d of sharedModuleDirs(repoPath)) removeJunction(join(path, d));
}

function anyModuleLinkLeft(repoPath, path) {
  return sharedModuleDirs(repoPath).some((d) => {
    try { lstatSync(join(path, d)); return true; } catch { return false; }
  });
}

export async function createWorktree({ project, worktreeRoot, task }) {
  mkdirSync(worktreeRoot, { recursive: true });
  const path = join(worktreeRoot, task.id);
  const branch = branchName(task);
  if (existsSync(path)) {
    removeModuleLinks(project.repoPath, path);
    await git(project.repoPath, ['worktree', 'remove', '--force', path]);
  }
  const added = await git(project.repoPath, ['worktree', 'add', '-b', branch, path, project.mainBranch]);
  if (!added.ok) throw new Error(`worktree 생성 실패: ${added.err.slice(0, 300)}`);
  // Share installed packages through junctions so tests and type checks run
  // without a reinstall (root and each workspace app's own node_modules).
  for (const d of sharedModuleDirs(project.repoPath)) {
    const link = join(path, d);
    if (existsSync(link) || !existsSync(join(link, '..'))) continue;
    try { symlinkSync(join(project.repoPath, d), link, 'junction'); } catch { /* tests that need it will say so */ }
  }
  return { path, branch };
}

// Removes the link only — never the directory it points at.
export function removeJunction(link) {
  try {
    const st = lstatSync(link);
    if (st.isSymbolicLink()) rmdirSync(link);
  } catch { /* not there */ }
}

export async function removeWorktree({ project, path }) {
  // Links first: deleting a folder through a junction would empty the real one.
  removeModuleLinks(project.repoPath, path);
  const res = await git(project.repoPath, ['worktree', 'remove', '--force', path]);
  if (!res.ok && existsSync(path) && !anyModuleLinkLeft(project.repoPath, path)) {
    try { rmSync(path, { recursive: true, force: true }); } catch { /* left for the next prune */ }
  }
  await git(project.repoPath, ['worktree', 'prune']);
}

export async function changedFiles(wt) {
  const res = await git(wt, ['status', '--porcelain']);
  return res.out ? res.out.split('\n').filter((l) => l && !/^\?\? node_modules\/?$/.test(l)) : [];
}

export async function commitAll(wt, message) {
  await git(wt, ['add', '-A', '--', '.', ':(exclude)node_modules']);
  const res = await git(wt, ['commit', '-m', message]);
  if (!res.ok) throw new Error(`커밋 실패: ${(res.err || res.out).slice(0, 300)}`);
  const head = await git(wt, ['rev-parse', '--short', 'HEAD']);
  return head.out;
}

// Reverts one merged commit into the worktree without committing, so the
// caller keeps its own commit message shape.
export async function revertCommit(wt, sha) {
  const res = await git(wt, ['revert', '--no-commit', sha]);
  if (!res.ok) {
    await git(wt, ['revert', '--abort']);
    return { ok: false, reason: (res.err || res.out || 'revert failed').slice(0, 300) };
  }
  if (!(await changedFiles(wt)).length) {
    await git(wt, ['revert', '--quit']);
    return { ok: true, empty: true };
  }
  return { ok: true, empty: false };
}

// Diff of the task branch against main: per-file numbers, added text, a head excerpt.
export async function diffSummary(wt, mainBranch, headLines = 120) {
  const range = `${mainBranch}...HEAD`;
  const numstat = await git(wt, ['diff', '--numstat', range]);
  const files = numstat.out ? numstat.out.split('\n').filter(Boolean).map((line) => {
    const [a, d, ...rest] = line.split('\t');
    return { path: rest.join('\t'), added: a === '-' ? 0 : Number(a), deleted: d === '-' ? 0 : Number(d), binary: a === '-' };
  }) : [];
  const full = await git(wt, ['diff', range]);
  const lines = full.out.split('\n');
  const addedText = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  const commits = await git(wt, ['rev-list', '--count', `${mainBranch}..HEAD`]);
  return { files, addedText, excerpt: lines.slice(0, headLines).join('\n'), truncated: lines.length > headLines, commits: Number(commits.out) || 0 };
}

// Fast-forward only, and only when the main working folder is clean and on
// main: work in progress there (another session) is never mixed in.
export async function mergeToMain({ project, wt, branch }) {
  const repo = project.repoPath;
  const head = await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (head.out !== project.mainBranch) return { merged: false, reason: `main 작업폴더가 ${head.out} 브랜치에 있음` };
  const status = await git(repo, ['status', '--porcelain']);
  if (status.out) return { merged: false, reason: 'main 작업폴더에 커밋 안 된 변경이 있음' };
  let merge = await git(repo, ['merge', '--ff-only', branch]);
  if (!merge.ok && wt && existsSync(wt)) {
    const rebase = await git(wt, ['rebase', project.mainBranch]);
    if (!rebase.ok) {
      await git(wt, ['rebase', '--abort']);
      return { merged: false, reason: 'main과 충돌해서 자동 병합 불가' };
    }
    merge = await git(repo, ['merge', '--ff-only', branch]);
  }
  if (!merge.ok) return { merged: false, reason: `fast-forward 병합 실패: ${merge.err.slice(0, 200)}` };
  const sha = await git(repo, ['rev-parse', '--short', 'HEAD']);
  return { merged: true, sha: sha.out };
}

export async function repoStatus(project) {
  const repo = project.repoPath;
  const [branch, status, log, ahead] = await Promise.all([
    git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(repo, ['status', '--porcelain']),
    git(repo, ['log', '-5', '--format=%h %s']),
    git(repo, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']),
  ]);
  const changed = status.out ? status.out.split('\n').filter(Boolean) : [];
  const [aheadN, behindN] = ahead.ok ? ahead.out.split(/\s+/).map(Number) : [null, null];
  return { branch: branch.out, changed, log: log.out, ahead: aheadN, behind: behindN };
}
