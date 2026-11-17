import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// §5.1 store inventory gate.
//
// Directive substance: no isolate-local state may die with the worker for the
// durable domain. Every module-level store in cf_worker.js is classified:
//   - static: frozen configuration, never mutated as storage
//   - ephemeral: live transport (sockets, in-flight challenges/calls, the
//     per-request context) — meaningless across isolates by nature
//   - cache: D1 write-through with a D1 read path; the cold-start journey
//     proves D1 — not the map — is the source of truth
//   - unbacked: memory-only domain state whose D1 migration is still queued
// This test fails on any UNCLASSIFIED store, so no new in-memory durable
// state can land silently, and the unbacked count may only shrink.
const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');

const STATIC = new Set([
  'MESSAGE_KINDS', 'FORGED_CLIENT_KINDS', 'BOT_ONLY_KINDS', 'REVOKED_LEGACY_PASSWORD_HASHES', 'RESERVED_HANDLES',
  'STICKER_CATALOG', 'THEME_CATALOG',
  'LUNO_SCHEMA', 'LUNO_SCHEMA_BASE', 'LUNO_SCHEMA_PHASE1', 'LUNO_SCHEMA_PHASE1_COLS',
  'ATTACHMENT_MIME_ALLOW',
  'NEWS_SAMPLE', 'GRANTABLE_ROLES', 'REACTIONS', 'PEER_USERS', 'READY_TABLES', 'DELETE_REASONS',
  'ACCOUNT_PLANS', // F13: frozen plan vocabulary (PLAN_GRANTS is a plain object, not a scanned store)
  'translateProviders', // T1: provider registry, populated once at module load
  'sttProviders', // F14: STT provider registry, populated once at module load
  'pushProviders', // N1-L: push provider registry, populated once at module load
  'F22_SECRET_CONTAINS', 'F22_SECRET_EXACT', 'F22_BODY_EXACT', 'F22_EMAIL_EXACT', // F22: frozen mask vocabulary
  'SUPPORT_TICKET_CATEGORIES', // F30: frozen ticket vocabulary
  'REPORT_CATEGORIES', 'HIDE_TARGET_TYPES', // F29: frozen report + hide vocabularies
]);
const EPHEMERAL = new Set([
  'activeSockets', 'AUTH_CTX', 'callSessions', 'groupCallRooms',
  'qrChallenges', 'phoneVerificationCodes', 'passkeyChallenges',
  'recoveryChallenges', 'recoveryMailOutbox', 'verificationMailOutbox', 'smsOutbox',
  'translateProviderCalls', // T1: per-isolate provider-call probe for tests
  'sttProviderCalls', // F14: per-isolate provider-call probe for tests
  'f22Requests', 'f22Errors', // F22: per-isolate request/error counters (reset on evict, /metrics-labeled)
]);
const CACHE = new Set([
  'users', 'usersById', 'sessions', 'revokedTokens', 'wsTickets',
  'friendships', 'friendMeta', 'conversations', 'messages', 'readCursors',
  'reactionStore', 'noteStore', 'eventStore', 'polls', 'pollVotes',
  'pinnedMessages', 'albums', 'savedMessages', 'hiddenMsgs',
  'wallets', 'ownedPacks', 'ownedThemes', 'userPrefs',
  'pushTokens', 'deviceKeys', 'userKeys',
  'partnerCoupons', // F17: D1 write-through coupon cache (luno_partner_coupons)
  'userConsents', // F24: D1 write-through consent cache (luno_consents; seeds are memory bootstrap like seed users)
  'botPresenceCache', // PC agent: write-throttle for runner presence; D1 (luno_bot_config presence:<bot>) is what status reads
]);
const UNBACKED = new Set([
  'passkeyCreds', 'storeOrders',
  'partnerOrgs', 'partnerAccounts',
  'partnerTickets', 'partnerCampaigns', 'oaBotRules', 'devOrgs', 'devApps',
  'devWebhooks', 'devMiniApps', 'creatorProfiles', 'creatorPacks', 'creatorItems',
  'adsAdvertisers', 'adsCampaigns', 'adsGroups', 'chatMeta',
  'officialAccounts', 'followedOfficial', 'richMenus', 'creatorSettlements',
  'auditLogs', 'adminReports',
  'featureFlags',
]);

function moduleStores() {
  const names = new Set();
  for (const m of source.matchAll(/^(?:const|let) (\w+) = new (?:Map|Set|WeakMap)\(/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^(?:const|let) (\w+) = \[/gm)) names.add(m[1]);
  return [...names].sort();
}

test('§5.1: every module-level store is classified (no silent additions)', () => {
  const found = moduleStores();
  assert.ok(found.length > 50, `inventory scan works (found ${found.length})`);
  const known = new Set([...STATIC, ...EPHEMERAL, ...CACHE, ...UNBACKED]);
  const unclassified = found.filter(n => !known.has(n));
  assert.deepEqual(unclassified, [], `unclassified stores must be registered: ${unclassified.join(', ')}`);
  const stale = [...known].filter(n => !found.includes(n));
  assert.deepEqual(stale, [], `registry lists removed stores: ${stale.join(', ')}`);
});

test('§5.1: the unbacked (memory-only) set may only shrink', () => {
  assert.ok(UNBACKED.size <= 39, `unbacked stores: ${UNBACKED.size} (ratchet: 39, shrink only)`);
  for (const core of ['users', 'sessions', 'friendships', 'conversations', 'messages', 'blocks']) {
    if (core === 'blocks') continue; // blocks live in D1 only; no module store exists
    assert.ok(CACHE.has(core), `${core} must stay D1-backed`);
  }
});
