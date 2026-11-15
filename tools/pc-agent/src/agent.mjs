// The runner core: claims bot jobs, turns chat commands into local tasks,
// runs them one at a time, reports back and applies the owner's decisions.
import { writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LunoClient } from './luno.mjs';
import { TaskQueue, stopRequested } from './queue.mjs';
import { parseCommand, QUEUED, HELP } from './commands.mjs';
import { museExec, museUsage } from './muse.mjs';
import { createWorktree, removeWorktree, changedFiles, commitAll, diffSummary, mergeToMain, repoStatus } from './git.mjs';
import { checkDiff, mask } from './guards.mjs';
import { fmt, reportBody, failureBody, splitBody, stripPaths, testDetail, minutes } from './report.mjs';
import { devPrompt, mktPrompt, askPrompt } from './prompts.mjs';
import { runCommand, killTree } from './proc.mjs';

export const VERSION = '1.0.0';
const WORK_CMDS = new Set(['dev', 'mkt', 'continue', 'retry']);

export class Agent {
  constructor({ cfg, secrets, dir, clientFactory, log = () => {} }) {
    this.cfg = cfg;
    this.dir = dir;
    this.log = log;
    this.queue = new TaskQueue(dir);
    this.clients = new Map();
    for (const project of cfg.projects) {
      const token = secrets.tokens[project.tokenRef];
      this.clients.set(project.id, clientFactory ? clientFactory(project, token) : new LunoClient({ baseUrl: cfg.baseUrl, token }));
    }
    this.current = null; // { task, startedAt, steps, control }
    this.execution = null;
    this.lastProjectId = '';
    this.lastActivity = 0;
    this.startedAt = Date.now();
    this.replySeq = 0;
  }

  project(id) { return this.cfg.projects.find((p) => p.id === id); }
  client(projectId) { return this.clients.get(projectId); }
  taskLog(task, line) {
    try { appendFileSync(join(this.dir, 'logs', `${task.id}.log`), `${new Date().toISOString()} ${line}\n`); } catch { /* best-effort */ }
  }

  presence() {
    const queued = this.queue.queued().length;
    if (this.current) return { state: 'busy', detail: `${this.current.task.id} /${this.current.task.cmd}`, queue: queued, version: VERSION };
    return { state: 'ready', detail: '', queue: queued, version: VERSION };
  }

  // Posts one logical message (split when long). Never throws.
  async say(projectId, roomId, { kind = 'text', body, replyTo, task }) {
    const client = this.client(projectId);
    const owner = this.project(projectId);
    const parts = splitBody(mask(stripPaths(body, [task && task.worktree, owner && owner.repoPath])));
    let firstId = '';
    for (let i = 0; i < parts.length; i++) {
      let clientId;
      if (task) {
        task.postSeq = (task.postSeq || 0) + 1;
        clientId = `pca-${task.id}-${task.postSeq}`;
      } else clientId = `pca-r-${this.startedAt}-${++this.replySeq}`;
      try {
        // Only the first part carries the special kind; continuations are plain text.
        const id = await client.post(roomId, { kind: i === 0 ? kind : 'text', body: parts[i], replyTo: i === 0 ? replyTo : undefined, clientId });
        if (!firstId) firstId = id;
        if (task && id) task.postedMessageIds = [...(task.postedMessageIds || []), id].slice(-40);
      } catch (error) {
        this.log(`post failed (${projectId}): ${error.message}`);
      }
    }
    if (task) this.queue.save(task);
    return firstId;
  }

  async announceOnline(recovered) {
    for (const project of this.cfg.projects) {
      const mine = recovered.filter((t) => t.projectId === project.id);
      await this.say(project.id, project.roomIds[0], { body: fmt.online({ version: VERSION, projects: project.name, recovered: mine.length }) });
    }
  }

  // One poll over every project. Returns true when any job arrived.
  async pollOnce() {
    let got = false;
    for (const project of this.cfg.projects) {
      const job = await this.client(project.id).claim(this.presence());
      if (!job) continue;
      got = true;
      this.lastActivity = Date.now();
      try { await this.handleJob(project, job); } catch (error) { this.log(`job ${job.id} failed: ${error.stack || error.message}`); }
    }
    this.startNext();
    return got;
  }

  async handleJob(project, job) {
    const client = this.client(project.id);
    const p = job.payload || {};
    const actor = job.kind === 'decision' ? p.decided_by : p.author_id;
    // Re-check what the server already checked: right room, right person.
    if (!project.roomIds.includes(job.room_id) || !this.cfg.ownerUserIds.includes(actor)) {
      await client.complete(job.id, 'failed', { error: 'not allowed' }).catch(() => {});
      return;
    }
    // Release the 120 s server lock at once; the work continues in the local queue.
    await client.complete(job.id, 'done', { result: { accepted: true } }).catch(() => {});
    if (job.kind === 'decision') return this.handleDecision(project, job.room_id, p);
    if (job.kind !== 'command' && job.kind !== 'mention') return;
    if (p.message_id) {
      if (this.queue.seen(p.message_id)) return; // a shared room delivers one job per bot
      this.queue.markSeen(p.message_id);
    }
    const reply = (body, extra = {}) => this.say(project.id, job.room_id, { body, replyTo: p.message_id, ...extra });
    const ageMin = p.created_at ? (Date.now() - Date.parse(p.created_at)) / 60000 : 0;
    if (ageMin > this.cfg.staleMinutes) return reply(fmt.stale(this.cfg.staleMinutes));

    let body = String(p.body || '').trim();
    let command;
    if (job.kind === 'mention') command = { cmd: 'ask', text: body, urgent: false, taskId: '' };
    else if (body.startsWith('/')) command = parseCommand(body);
    else if (p.reply_to) {
      // A reply to one of this runner's messages continues that task.
      const parent = this.queue.byMessage(p.reply_to);
      command = parent && parent.branch ? { cmd: 'retry', taskId: parent.id, text: body, urgent: false } : { cmd: 'ask', text: body, urgent: false, taskId: '' };
    }
    if (!command) return;
    if (command.cmd === 'unknown') return reply(fmt.unknown(command.name));

    // In a shared room "/dev shop fix the cart" picks the project by name.
    let target = project;
    const first = (command.text || '').split(/\s+/)[0].toLowerCase();
    const named = first && this.cfg.projects.find((x) => x.id !== project.id && (x.id === first || x.name.toLowerCase() === first));
    if (named && named.roomIds.includes(job.room_id)) {
      target = named;
      command.text = command.text.slice(first.length).trim();
    }
    if (QUEUED.has(command.cmd)) return this.enqueue(target, job.room_id, p.message_id, command, reply);
    return this.instant(target, job.room_id, command, reply);
  }

  async enqueue(project, roomId, messageId, command, reply) {
    if (stopRequested(this.dir)) return reply(fmt.held('STOP 파일이 있어 새 작업을 받지 않습니다'));
    if (this.queue.queued().length >= this.cfg.maxQueued) return reply(fmt.held(`대기 작업이 ${this.cfg.maxQueued}건으로 가득 찼습니다`));
    if (this.queue.countToday() >= this.cfg.maxPerDay) return reply(fmt.held(`오늘 작업 한도 ${this.cfg.maxPerDay}건에 도달했습니다`));
    let { cmd, text } = command;
    let parentId = '';
    if (cmd === 'retry') {
      const parent = this.queue.get(command.taskId);
      if (!parent || !parent.branch) return reply(`이어서 할 작업을 찾을 수 없습니다. 예: /retry ${project.prefix}-0001 버튼 색을 파랗게`);
      if (!text) return reply('추가 지시를 함께 적어 주세요.');
      if (parent.state === 'running' || parent.state === 'queued') return reply(`#${parent.id} 는 아직 진행 중입니다.`);
      parentId = parent.id;
    } else if (cmd === 'continue') {
      if (!project.continuePrompt && !text) return reply('이 프로젝트에는 이어서 진행할 기본 지시(continuePrompt)가 없습니다. /dev <지시> 를 쓰세요.');
      text = [project.continuePrompt, text].filter(Boolean).join('\n\n추가 지시: ');
    } else if (cmd !== 'check' && !text) {
      return reply(`내용을 함께 적어 주세요. 예: /${cmd} 로그인 버튼 버그 고쳐줘`);
    }
    const task = this.queue.create({ project, cmd, text, urgent: command.urgent, roomId, messageId, parentId });
    this.taskLog(task, `accepted /${cmd} ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
    const waiting = this.queue.queued().length - 1 + (this.current ? 1 : 0);
    await this.say(project.id, roomId, { body: fmt.accepted(task, waiting), replyTo: messageId, task });
  }

  async instant(project, roomId, command, reply) {
    const { cmd } = command;
    if (cmd === 'help') return reply(HELP);
    if (cmd === 'usage') return reply((await museUsage(this.cfg)).raw || 'Muse 사용량을 읽지 못했습니다.');
    if (cmd === 'status') return reply(await this.statusText());
    if (cmd === 'git') {
      const s = await repoStatus(project);
      const sync = s.ahead === null ? '원격 추적 없음' : `원격보다 +${s.ahead} / −${s.behind}`;
      return reply([`${project.name} · 브랜치 ${s.branch} · ${sync}`,
        s.changed.length ? `커밋 안 된 변경 ${s.changed.length}개\n${s.changed.slice(0, 25).join('\n')}${s.changed.length > 25 ? '\n…' : ''}` : '작업폴더 깨끗함',
        '최근 커밋', s.log].join('\n'));
    }
    if (cmd === 'stop') {
      if (!this.current) return reply('실행 중인 작업이 없습니다.');
      this.current.control.stopped = true;
      killTree(this.current.control.pid);
      return reply(`🛑 #${this.current.task.id} 중단 요청을 보냈습니다.`);
    }
    const task = command.taskId ? this.queue.get(command.taskId) : null;
    if (cmd === 'cancel') {
      if (!task || task.state !== 'queued') return reply('취소할 대기 작업을 찾을 수 없습니다. 실행 중이면 /stop 을 쓰세요.');
      task.state = 'cancelled';
      this.queue.save(task);
      return reply(`🚫 #${task.id} 취소했습니다.`);
    }
    if (cmd === 'merge') return this.retryMerge(task, reply);
    if (cmd === 'log') {
      if (!task) return reply('작업 번호를 적어 주세요. 예: /log T-0001');
      const path = join(this.dir, 'logs', `${task.id}.log`);
      const tail = existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').slice(-40).join('\n') : '(로그 없음)';
      return reply(`#${task.id} 로그 (${task.state})\n${tail}`);
    }
    if (cmd === 'diff') {
      if (!task || !task.worktree || !existsSync(task.worktree)) return reply('diff를 볼 수 있는 작업이 없습니다(병합·정리된 작업은 저장소에서 확인).');
      const d = await diffSummary(task.worktree, this.project(task.projectId).mainBranch, 200);
      return reply(`#${task.id} diff (파일 ${d.files.length}개, 커밋 ${d.commits})\n${d.excerpt}`);
    }
  }

  async statusText() {
    const lines = [];
    if (this.current) {
      const c = this.current;
      lines.push(`실행 중 #${c.task.id} /${c.task.cmd} · ${minutes(Date.now() - c.startedAt)}분 · 단계 ${c.steps}`);
    } else lines.push('실행 중인 작업 없음');
    const queued = this.queue.queued();
    lines.push(queued.length ? `대기 ${queued.length}건: ${queued.map((t) => `#${t.id}`).join(', ')}` : '대기 0건');
    const pending = this.queue.all().filter((t) => t.state === 'reported' && t.proposalMessageId);
    if (pending.length) lines.push(`승인 대기: ${pending.map((t) => `#${t.id}`).join(', ')}`);
    const { usage } = await museUsage(this.cfg);
    if (usage) lines.push(`Muse 사용량: 주간 ${usage.weekly ?? '?'}% · 현재 창 ${usage.window ?? '?'}%`);
    lines.push(`러너 v${VERSION} · 가동 ${minutes(Date.now() - this.startedAt)}분 · 오늘 ${this.queue.countToday()}/${this.cfg.maxPerDay}건`);
    if (stopRequested(this.dir)) lines.push('⚠️ STOP 파일이 있어 새 작업을 시작하지 않습니다');
    return lines.join('\n');
  }

  startNext() {
    if (this.execution || stopRequested(this.dir)) return;
    const task = this.queue.next(this.lastProjectId);
    if (!task) return;
    this.execution = this.execute(task)
      .catch((error) => this.log(`execute ${task.id} crashed: ${error.stack || error.message}`))
      .finally(() => { this.execution = null; this.current = null; this.lastProjectId = task.projectId; this.lastActivity = Date.now(); });
  }

  async execute(task) {
    const project = this.project(task.projectId);
    const startedAt = Date.now();
    const control = { pid: 0, stopped: false };
    this.current = { task, startedAt, steps: 0, control };
    task.state = 'running';
    task.startedAt = new Date().toISOString();
    this.queue.save(task);
    this.taskLog(task, 'started');
    const fail = async (reason) => {
      task.state = control.stopped ? 'stopped' : 'failed';
      task.error = reason;
      this.taskLog(task, `failed: ${reason}`);
      await this.say(project.id, task.roomId, { kind: 'report', body: failureBody({ task, ms: Date.now() - startedAt, reason }), task });
    };
    try {
      if (task.cmd === 'check') return await this.runCheck(project, task, startedAt);
      if (task.cmd === 'ask') return await this.runAsk(project, task, startedAt, control, fail);
      return await this.runWork(project, task, startedAt, control, fail);
    } catch (error) {
      await fail(String(error.message || error));
    }
  }

  async runCheck(project, task, startedAt) {
    await this.say(project.id, task.roomId, { body: fmt.started(task), task });
    const tests = [];
    for (const check of project.checkCommands) {
      const res = await runCommand(check.cmd, { cwd: join(project.repoPath, check.cwd || '.'), timeoutMs: project.timeoutsMin.check * 60000 });
      const out = `${res.stdout}\n${res.stderr}`;
      tests.push({ label: check.label, ok: res.code === 0 && !res.timedOut, detail: res.timedOut ? '시간 초과' : testDetail(out) });
      this.taskLog(task, `check ${check.label}: exit ${res.code}`);
    }
    const s = await repoStatus(project);
    const ok = tests.length > 0 && tests.every((t) => t.ok);
    task.state = 'done';
    const note = tests.length ? `브랜치 ${s.branch} · 커밋 안 된 변경 ${s.changed.length}개` : '이 프로젝트에는 점검 명령(checkCommands)이 설정돼 있지 않습니다.';
    await this.say(project.id, task.roomId, { kind: 'report', body: reportBody({ task, title: '정적 분석·테스트 점검', ok, ms: Date.now() - startedAt, tests, note }), task });
  }

  writePrompt(task, text) {
    const path = join(this.dir, 'prompts', `${task.id}.md`);
    writeFileSync(path, text);
    return path;
  }

  watchProgress(project, task, startedAt) {
    return (state) => {
      const c = this.current;
      if (!c) return;
      c.steps = state.steps;
      const now = Date.now();
      if (now - (c.lastProgressAt || startedAt) < this.cfg.progressEveryMs) return;
      c.lastProgressAt = now;
      this.taskLog(task, `progress steps=${state.steps}`);
      this.say(project.id, task.roomId, { body: fmt.progress(task, now - startedAt, state.steps), task });
    };
  }

  async runAsk(project, task, startedAt, control, fail) {
    const promptFile = this.writePrompt(task, askPrompt({ project, text: task.text }));
    const res = await museExec({
      cfg: this.cfg, mode: 'ask', promptFile, workspace: project.repoPath, timeoutMs: project.timeoutsMin.ask * 60000,
      logFile: join(this.dir, 'logs', `${task.id}.jsonl`), onProgress: this.watchProgress(project, task, startedAt), control,
    });
    task.sessionId = res.sessionId;
    if (!res.ok) return fail(res.reason);
    task.state = 'done';
    this.taskLog(task, 'answered');
    await this.say(project.id, task.roomId, { body: `#${task.id} 답변\n${res.text}`, replyTo: task.messageId, task });
  }

  async runWork(project, task, startedAt, control, fail) {
    const mode = task.cmd === 'mkt' ? 'mkt' : 'dev';
    const { usage } = await museUsage(this.cfg);
    if (usage && usage.weekly !== null && usage.weekly >= this.cfg.usageHoldPercent) {
      return fail(`Muse 주간 사용량 ${usage.weekly}% — ${this.cfg.usageHoldPercent}% 이상이라 코드 작업을 보류했습니다`);
    }
    let previous = '';
    const parent = task.parentId ? this.queue.get(task.parentId) : null;
    if (parent) {
      // Continue on the parent's branch, in its worktree.
      if (!parent.worktree || !existsSync(parent.worktree)) return fail(`#${parent.id} 의 작업 폴더가 이미 정리돼 이어서 할 수 없습니다. /dev 로 새로 지시하세요.`);
      task.worktree = parent.worktree;
      task.branch = parent.branch;
      task.mode = parent.mode || mode;
      previous = parent.summary || '';
      parent.state = 'superseded';
      this.queue.save(parent);
    } else {
      const wt = await createWorktree({ project, worktreeRoot: this.cfg.worktreeRoot, task });
      task.worktree = wt.path;
      task.branch = wt.branch;
      task.mode = mode;
    }
    this.queue.save(task);
    await this.say(project.id, task.roomId, { body: fmt.started(task, task.branch), task });
    const promptText = (task.mode === 'mkt' ? mktPrompt : devPrompt)({ project, text: task.text, previous });
    const res = await museExec({
      cfg: this.cfg, mode: task.mode, promptFile: this.writePrompt(task, promptText), workspace: task.worktree,
      timeoutMs: project.timeoutsMin[task.mode] * 60000, logFile: join(this.dir, 'logs', `${task.id}.jsonl`),
      onProgress: this.watchProgress(project, task, startedAt), control,
    });
    task.sessionId = res.sessionId;
    task.summary = res.text.slice(0, 6000);
    if (!res.ok) return fail(`${res.reason}${task.branch ? ` (브랜치 ${task.branch} 보존, /retry ${task.id} 로 이어서 가능)` : ''}`);
    const title = (res.text.split('\n').find((l) => l.trim()) || task.text).replace(/^#+\s*/, '').trim().slice(0, 70);

    // From here on the runner does the bookkeeping itself, not the model.
    if ((await changedFiles(task.worktree)).length) {
      await commitAll(task.worktree, `luno-auto(${task.id}): ${title}\n\nLuno-Task: ${task.id}`);
    }
    const diff = await diffSummary(task.worktree, project.mainBranch);
    if (!diff.files.length) {
      task.state = 'done';
      await removeWorktree({ project, path: task.worktree });
      return this.say(project.id, task.roomId, { kind: 'report', body: reportBody({ task, title, ok: true, ms: Date.now() - startedAt, summary: res.text, note: '코드 변경 없음', usage }), task });
    }
    const guard = checkDiff({ files: diff.files, addedText: diff.addedText, forbiddenPaths: project.forbiddenPaths, allowedPaths: task.mode === 'mkt' ? project.mktAllowedPaths : null });
    if (guard.violations.length) return fail(`안전 규칙 위반으로 병합 제안을 하지 않습니다:\n- ${guard.violations.slice(0, 10).join('\n- ')}\n브랜치 ${task.branch} 는 보존했습니다.`);
    const tests = [];
    for (const cmd of project.testCommands) {
      const t = await runCommand(cmd, { cwd: task.worktree, timeoutMs: 15 * 60000 });
      tests.push({ label: cmd.join(' '), ok: t.code === 0 && !t.timedOut, detail: t.timedOut ? '시간 초과' : testDetail(`${t.stdout}\n${t.stderr}`) });
      this.taskLog(task, `test ${cmd.join(' ')}: exit ${t.code}`);
    }
    const testsOk = tests.every((t) => t.ok);
    const stats = { ...diff, added: guard.added, deleted: guard.deleted };
    task.state = 'reported';
    task.testsOk = testsOk;
    const note = !testsOk ? '테스트 실패 — 병합 제안을 하지 않았습니다. 답장으로 수정 지시를 보내면 이어서 합니다.'
      : guard.large ? '대형 변경 — 병합 제안을 하지 않았습니다. 집에서 검토 후 직접 병합하세요.' : '';
    task.reportMessageId = await this.say(project.id, task.roomId, {
      kind: 'report', task,
      body: reportBody({ task, title, ok: testsOk, ms: Date.now() - startedAt, summary: res.text, tests, diff: stats, large: guard.large, usage, note }),
    });
    if (testsOk && !guard.large) {
      task.proposalMessageId = await this.say(project.id, task.roomId, { kind: 'proposal', body: fmt.proposal(task, stats), task });
    }
    this.queue.save(task);
    this.taskLog(task, `reported tests=${testsOk} files=${diff.files.length}`);
  }

  async handleDecision(project, roomId, p) {
    const task = this.queue.all().find((t) => t.proposalMessageId && t.proposalMessageId === p.proposal_message_id);
    if (!task || task.state !== 'reported') return;
    const owner = this.project(task.projectId);
    if (p.decision === 'approved') {
      const res = await mergeToMain({ project: owner, wt: task.worktree, branch: task.branch });
      if (!res.merged) {
        task.state = 'approved';
        task.mergeHeld = res.reason;
        this.queue.save(task);
        this.taskLog(task, `merge held: ${res.reason}`);
        return this.say(owner.id, roomId, { body: fmt.mergeHeld(task, res.reason), task });
      }
      task.state = 'merged';
      task.mergedSha = res.sha;
      await removeWorktree({ project: owner, path: task.worktree });
      this.taskLog(task, `merged ${res.sha}`);
      return this.say(owner.id, roomId, { body: fmt.merged(task, res.sha), task });
    }
    // The worktree stays for /retry; cleanupOld() removes it after a week.
    task.state = 'rejected';
    this.queue.save(task);
    this.taskLog(task, 'rejected');
    return this.say(owner.id, roomId, { body: fmt.rejected(task), task });
  }

  // Approved earlier but main was busy: "/merge T-0001" tries again.
  async retryMerge(task, reply) {
    if (!task || task.state !== 'approved') return reply('병합을 다시 시도할 수 있는 작업이 아닙니다(승인됐지만 보류된 작업만 가능).');
    const owner = this.project(task.projectId);
    const res = await mergeToMain({ project: owner, wt: task.worktree, branch: task.branch });
    if (!res.merged) return reply(fmt.mergeHeld(task, res.reason));
    task.state = 'merged';
    task.mergedSha = res.sha;
    await removeWorktree({ project: owner, path: task.worktree });
    this.queue.save(task);
    this.taskLog(task, `merged ${res.sha}`);
    return reply(fmt.merged(task, res.sha));
  }

  // Finished-but-unmerged work keeps its worktree for a week, then only the branch.
  async cleanupOld(maxAgeMs = 7 * 86400000) {
    const closed = new Set(['rejected', 'failed', 'stopped', 'superseded', 'done', 'cancelled']);
    for (const task of this.queue.all()) {
      if (!task.worktree || !closed.has(task.state) || !existsSync(task.worktree)) continue;
      if (Date.now() - Date.parse(task.updatedAt || task.createdAt) < maxAgeMs) continue;
      // A retry may still be using this folder.
      if (this.queue.all().some((t) => t.id !== task.id && t.worktree === task.worktree && !closed.has(t.state))) continue;
      await removeWorktree({ project: this.project(task.projectId), path: task.worktree });
      this.taskLog(task, 'worktree removed (expired)');
    }
  }
}

export { WORK_CMDS };
