// One-time setup of the remote-work pipeline against a LUNO server.
//
//   node setup/provision.mjs register   create the owner account (public signup), remember its id
//   node setup/provision.mjs setup      as that owner (must be admin): bot, work room, allowlist, token, config
//   node setup/provision.mjs add-owner --email <email>   let another of your accounts command the bot from a 1:1 chat
//   node setup/provision.mjs rotate     mint a fresh 30-day bot token (the old one is revoked)
//   node setup/provision.mjs status     show what is configured (never prints secrets)
//
// Secrets (owner password, bot token) are written only to the state folder
// (%USERPROFILE%\.luno-agent), never to the repository or the screen.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';
import { stateDir, findMuseLauncher } from '../src/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const dir = stateDir();
const paths = {
  owner: join(dir, 'owner-login.json'),
  secrets: join(dir, 'secrets.json'),
  config: join(dir, 'config.json'),
  provision: join(dir, 'provision-state.json'),
};
const args = process.argv.slice(2);
const step = args[0] || 'status';
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const BASE = opt('base', 'https://luno-messenger.dnjstjqppk.workers.dev/api/v1').replace(/\/$/, '');

const read = (path, fallback) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; } };
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));

function lockDown() {
  if (process.platform !== 'win32') return;
  try {
    execFileSync('icacls', [dir, '/inheritance:r', '/grant:r', `${userInfo().username}:(OI)(CI)F`], { stdio: 'ignore' });
  } catch { console.log('warning: could not restrict the state folder ACL'); }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
function must(res, what, ...ok) {
  if (!ok.includes(res.status)) throw new Error(`${what} failed: HTTP ${res.status} ${JSON.stringify(res.data || {}).slice(0, 300)}`);
  return res.data;
}

// 18 characters from an alphabet without look-alikes, grouped for typing on a phone.
function makePassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `Luno-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

async function loginOwner() {
  const owner = read(paths.owner, null);
  if (!owner) throw new Error(`no owner account yet — run "provision.mjs register" first`);
  const data = must(await api('auth/login', { method: 'POST', body: { email: owner.email, password: owner.password } }), 'owner login', 200);
  return { owner, token: data.access_token, role: data.role };
}

async function register() {
  mkdirSync(dir, { recursive: true });
  lockDown();
  if (existsSync(paths.owner)) {
    const owner = read(paths.owner, {});
    console.log(`owner account already registered: ${owner.email} (id ${owner.userId})`);
    return;
  }
  const email = opt('email', 'ceo@luno.invalid');
  const password = makePassword();
  const body = { email, password, display_name: opt('name', 'LUNO CEO'), handle: opt('handle', 'luno_ceo') };
  let res = await api('auth/register', { method: 'POST', body });
  if (res.status === 400 && res.data && res.data.code === 'CONSENT_REQUIRED') {
    // The server names the current terms/privacy versions. Passing
    // --birthdate is the account owner's consent to them (and the 14+ check).
    const birthdate = opt('birthdate', '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
      throw new Error('this server requires consent to the terms and privacy policy: re-run with --birthdate YYYY-MM-DD (the account owner\'s birthdate) to agree');
    }
    res = await api('auth/register', { method: 'POST', body: { ...body, birthdate, consent: res.data.current } });
  }
  const data = must(res, 'register', 201);
  write(paths.owner, { email, password, userId: data.id, createdAt: new Date().toISOString(), base: BASE });
  console.log(`owner account registered: ${email} (id ${data.id})`);
  console.log(`password saved to ${paths.owner}`);
}

async function mintToken(token, botId, rooms) {
  const data = must(await api(`admin/bots/${botId}/tokens`, {
    method: 'POST', token, body: { rooms, ops: ['read', 'post', 'propose'], ttl_sec: 2592000 },
  }), 'bot token', 201);
  const secrets = read(paths.secrets, { tokens: {}, expires: {} });
  secrets.tokens = { ...(secrets.tokens || {}), line: data.token };
  secrets.expires = { ...(secrets.expires || {}), line: data.expires_at };
  secrets.tokenIds = { ...(secrets.tokenIds || {}), line: data.id };
  write(paths.secrets, secrets);
  return data.expires_at;
}

async function setup() {
  const { owner, token, role } = await loginOwner();
  if (role !== 'admin') throw new Error(`owner ${owner.email} is not an admin on ${BASE} — add its id (${owner.userId}) to ADMIN_USER_IDS and deploy`);
  const state = read(paths.provision, {});
  if (!state.botId) {
    const bot = must(await api('admin/bots', { method: 'POST', token, body: { display_name: opt('bot-name', 'PC 작업봇'), handle: opt('bot-handle', 'luno_pc') } }), 'bot issue', 201);
    state.botId = bot.id;
    write(paths.provision, state);
    console.log(`bot issued: ${bot.handle} (id ${bot.id})`);
  }
  if (!state.roomId) {
    const room = must(await api('conversations', { method: 'POST', token, body: { kind: 'group', title: opt('room', 'PC 작업실'), member_ids: [state.botId] } }), 'work room', 201);
    state.roomId = room.id;
    write(paths.provision, state);
    console.log(`work room created: ${state.roomId}`);
  }
  must(await api('admin/llm/allowlist', { method: 'POST', token, body: { kind: 'room', ref_id: state.roomId } }), 'allowlist room', 200, 201);
  must(await api('admin/llm/allowlist', { method: 'POST', token, body: { kind: 'user', ref_id: owner.userId } }), 'allowlist user', 200, 201);
  const list = must(await api('admin/llm/allowlist', { token }), 'allowlist read', 200);
  console.log(`allowlist: rooms ${list.rooms.length}, users ${list.users.length}, enabled ${list.enabled}, killed ${list.killed}`);
  const expires = await mintToken(token, state.botId, [state.roomId]);
  console.log(`bot token minted (expires ${new Date(expires).toISOString()})`);

  const example = read(join(here, '..', 'config.example.json'), {});
  const existing = read(paths.config, null);
  const config = existing || { ...example };
  config.baseUrl = BASE;
  config.ownerUserId = owner.userId;
  config.museLauncher = config.museLauncher || findMuseLauncher();
  const project = { ...(example.projects[0]), ...((existing && existing.projects && existing.projects[0]) || {}) };
  project.roomIds = [state.roomId];
  project.repoPath = opt('repo', repoRoot);
  config.projects = [project, ...((existing && existing.projects) || []).slice(1)];
  write(paths.config, config);
  lockDown();
  console.log(`config written: ${paths.config}`);
}

// Every room the bot token must cover: the work room plus the 1:1 rooms of
// the extra owner accounts.
function allRooms(state) {
  return [...new Set([state.roomId, ...(state.dmRooms || [])].filter(Boolean))];
}

// The server derives a 1:1 room id from its two members, so the room between
// an account and the bot can be authorised before the first message exists.
function directRoomId(a, b) {
  return `dm-${createHash('sha256').update([a, b].sort().join(':')).digest('hex')}`;
}

async function revokeToken(token, botId, tokenId) {
  if (!tokenId) return;
  await api(`admin/bots/${botId}/tokens/${tokenId}`, { method: 'DELETE', token });
}

// Lets another account of the same person (found by its email) command the
// bot from a 1:1 chat: add the bot as a friend by its ID, open the chat, type.
async function addOwner() {
  const email = opt('email', '').toLowerCase();
  if (!email.includes('@')) throw new Error('usage: provision.mjs add-owner --email <account email>');
  const { token, role } = await loginOwner();
  if (role !== 'admin') throw new Error('the provisioning account is not an admin on this server');
  const state = read(paths.provision, {});
  if (!state.botId || !state.roomId) throw new Error('nothing provisioned yet — run "provision.mjs setup"');
  const users = must(await api('admin/users', { token }), 'user list', 200).users || [];
  const user = users.find((u) => String(u.email || '').toLowerCase() === email);
  if (!user) throw new Error(`no account with the email ${email} on ${BASE} — sign up with it in the app first, then run this again`);
  const dm = directRoomId(user.id, state.botId);
  must(await api('admin/llm/allowlist', { method: 'POST', token, body: { kind: 'user', ref_id: user.id } }), 'allowlist user', 200, 201);
  must(await api('admin/llm/allowlist', { method: 'POST', token, body: { kind: 'room', ref_id: dm } }), 'allowlist room', 200, 201);
  state.owners = [...(state.owners || []).filter((o) => o.id !== user.id), { email, id: user.id }];
  state.dmRooms = [...new Set([...(state.dmRooms || []), dm])];
  write(paths.provision, state);
  const previous = (read(paths.secrets, {}).tokenIds || {}).line;
  const expires = await mintToken(token, state.botId, allRooms(state));
  await revokeToken(token, state.botId, previous);
  const config = read(paths.config, null);
  if (!config) throw new Error(`${paths.config} missing — run "provision.mjs setup"`);
  config.ownerUserIds = [...new Set([...(config.ownerUserIds || []), user.id])];
  config.projects[0].roomIds = allRooms(state);
  write(paths.config, config);
  console.log(`owner added: ${email} (id ${user.id})`);
  console.log(`1:1 room with the bot authorised: ${dm}`);
  console.log(`bot token re-issued for ${allRooms(state).length} rooms (expires ${new Date(expires).toISOString()}); restart the runner`);
}

async function rotate() {
  const { token } = await loginOwner();
  const state = read(paths.provision, {});
  if (!state.botId || !state.roomId) throw new Error('nothing provisioned yet — run "provision.mjs setup"');
  const previous = (read(paths.secrets, {}).tokenIds || {}).line;
  const expires = await mintToken(token, state.botId, allRooms(state));
  await revokeToken(token, state.botId, previous);
  console.log(`bot token rotated (expires ${new Date(expires).toISOString()}); restart the runner`);
}

function status() {
  const owner = read(paths.owner, null);
  const state = read(paths.provision, {});
  const secrets = read(paths.secrets, {});
  console.log(JSON.stringify({
    stateDir: dir, base: BASE,
    owner: owner ? { email: owner.email, userId: owner.userId } : null,
    botId: state.botId || null, roomId: state.roomId || null,
    token: secrets.tokens && secrets.tokens.line ? { present: true, expires: secrets.expires && secrets.expires.line ? new Date(secrets.expires.line).toISOString() : null } : { present: false },
    config: existsSync(paths.config),
  }, null, 2));
}

const steps = { register, setup, rotate, status, 'add-owner': addOwner };
if (!steps[step]) { console.error(`unknown step "${step}" (register | setup | add-owner | rotate | status)`); process.exit(2); }
try { await steps[step](); } catch (error) { console.error(String(error.message || error)); process.exit(1); }
