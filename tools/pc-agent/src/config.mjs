// Config + secrets live OUTSIDE the repository, in the state folder
// (%USERPROFILE%\.luno-agent by default), so the model never sees them.
// Loading fails closed: a missing or malformed field stops the runner.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';

export function stateDir() {
  return process.env.LUNO_AGENT_HOME || join(homedir(), '.luno-agent');
}

const PROJECT_DEFAULTS = {
  prefix: 'T', mainBranch: 'main', testCommands: [], checkCommands: [], continuePrompt: '', autopilotWorkOrder: '', autopilotMaxCards: 20,
  forbiddenPaths: ['wrangler.jsonc', '.github/**', '**/*.jks', '**/key.properties', '.env*', '**/.env*', 'scripts/migrations/**'],
  mktAllowedPaths: ['marketing/**'],
  timeoutsMin: { dev: 40, mkt: 20, ask: 8, check: 20 },
  allowPush: false, allowDeploy: false,
  screenshots: [],
};
const DEFAULTS = {
  model: 'muse-spark-1.3', worktreeRoot: 'C:\\luno-wt', staleMinutes: 30, maxQueued: 10, maxPerDay: 30,
  usageHoldPercent: 90, pollMs: { active: 5000, idle: 10000, night: 20000 }, progressEveryMs: 120000,
  maxModelSteps: 150,
  briefing: { time: '07:30', quietStart: '01:00', quietEnd: '07:00', remindAfterHours: 6 },
  notify: { ntfyTopic: '' },
};

function need(cond, message) {
  if (!cond) throw new Error(`config: ${message}`);
}

// Finds the Muse launcher next to muse.cmd on PATH (Windows install layout).
export function findMuseLauncher() {
  for (const dir of (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean)) {
    const launcher = join(dir, '.muse-launcher.ps1');
    if (existsSync(join(dir, 'muse.cmd')) && existsSync(launcher)) return launcher;
  }
  return '';
}

export function validateConfig(raw, secrets) {
  need(raw && typeof raw === 'object', 'must be an object');
  const cfg = { ...DEFAULTS, ...raw, pollMs: { ...DEFAULTS.pollMs, ...(raw.pollMs || {}) }, briefing: { ...DEFAULTS.briefing, ...(raw.briefing || {}) }, notify: { ...DEFAULTS.notify, ...(raw.notify || {}) } };
  need(/^https:\/\/[^\s]+\/api\/v1$/.test(cfg.baseUrl || '') || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/api\/v1$/.test(cfg.baseUrl || ''),
    'baseUrl must be https://…/api/v1');
  need(typeof cfg.ownerUserId === 'string' && cfg.ownerUserId.length >= 8, 'ownerUserId is required');
  // More accounts of the same person (e.g. the everyday account next to the
  // one provision created) may command the runner; each must also be on the
  // server allowlist. The list always includes ownerUserId.
  const extra = cfg.ownerUserIds === undefined ? [] : cfg.ownerUserIds;
  need(Array.isArray(extra) && extra.every((id) => typeof id === 'string' && id.length >= 8), 'ownerUserIds must be a list of user ids');
  cfg.ownerUserIds = [...new Set([cfg.ownerUserId, ...extra])];
  need(Array.isArray(cfg.projects) && cfg.projects.length > 0, 'at least one project is required');
  const ids = new Set();
  cfg.projects = cfg.projects.map((p) => {
    const project = { ...PROJECT_DEFAULTS, ...p, timeoutsMin: { ...PROJECT_DEFAULTS.timeoutsMin, ...(p.timeoutsMin || {}) } };
    need(/^[a-z][a-z0-9_-]{0,23}$/.test(project.id || ''), `project id "${project.id}" must be lowercase letters/digits`);
    need(!ids.has(project.id), `duplicate project id ${project.id}`);
    ids.add(project.id);
    need(/^[A-Z][A-Z0-9]{0,7}$/.test(project.prefix), `project ${project.id}: prefix must be 1-8 uppercase letters/digits`);
    need(Array.isArray(project.roomIds) && project.roomIds.length > 0 && project.roomIds.every((r) => typeof r === 'string' && r),
      `project ${project.id}: roomIds is required`);
    need(typeof project.repoPath === 'string' && isAbsolute(project.repoPath), `project ${project.id}: repoPath must be absolute`);
    need(existsSync(join(project.repoPath, '.git')), `project ${project.id}: repoPath is not a git repository`);
    need(Array.isArray(project.screenshots), `project ${project.id}: screenshots must be an array`);
    need(project.screenshots.every((s) => typeof s === 'string' && s.startsWith('/') && s.length <= 200), `project ${project.id}: screenshots must be root paths`);
    project.tokenRef = project.tokenRef || project.id;    project.tokenRef = project.tokenRef || project.id;
    const token = secrets && secrets.tokens && secrets.tokens[project.tokenRef];
    need(typeof token === 'string' && token.startsWith('cf-bot-'), `project ${project.id}: bot token "${project.tokenRef}" missing in secrets.json`);
    project.name = project.name || project.id;
    return project;
  });
  if (!cfg.museCommand) {
    cfg.museLauncher = cfg.museLauncher || findMuseLauncher();
    need(cfg.museLauncher && existsSync(cfg.museLauncher), 'Muse launcher not found (set museLauncher)');
  }
  need(typeof cfg.worktreeRoot === 'string' && isAbsolute(cfg.worktreeRoot), 'worktreeRoot must be absolute');
  for (const p of cfg.projects) {
    const wt = cfg.worktreeRoot.toLowerCase();
    need(!wt.startsWith(p.repoPath.toLowerCase()), 'worktreeRoot must be outside the repository');
  }
  const hhmm = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  need(hhmm(cfg.briefing.time), 'briefing.time must be HH:MM');
  need(hhmm(cfg.briefing.quietStart), 'briefing.quietStart must be HH:MM');
  need(hhmm(cfg.briefing.quietEnd), 'briefing.quietEnd must be HH:MM');
  need(Number.isFinite(cfg.briefing.remindAfterHours) && cfg.briefing.remindAfterHours > 0, 'briefing.remindAfterHours must be positive');
  need(cfg.notify && typeof cfg.notify.ntfyTopic === 'string', 'notify.ntfyTopic must be a string');
  return cfg;
}

export function loadConfig(dir = stateDir()) {
  const configPath = join(dir, 'config.json');
  const secretsPath = join(dir, 'secrets.json');
  need(existsSync(configPath), `${configPath} not found — run setup/provision.mjs first`);
  need(existsSync(secretsPath), `${secretsPath} not found — run setup/provision.mjs first`);
  const raw = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  const secrets = JSON.parse(readFileSync(secretsPath, 'utf8').replace(/^\uFEFF/, ''));
  const cfg = validateConfig(raw, secrets);
  return { cfg, secrets, dir, configDir: dirname(configPath) };
}
