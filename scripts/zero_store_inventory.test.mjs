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
  'MESSAGE_KINDS', 'FORGED_CLIENT_KINDS', 'REVOKED_LEGACY_PASSWORDS',
  'STICKER_CATALOG', 'THEME_CATALOG',
  'LUNO_SCHEMA', 'LUNO_SCHEMA_BASE', 'LUNO_SCHEMA_PHASE1', 'LUNO_SCHEMA_PHASE1_COLS',
  'NEWS_SAMPLE', 'GRANTABLE_ROLES', 'REACTIONS', 'PEER_USERS', 'READY_TABLES',
]);
const EPHEMERAL = new Set([
  'activeSockets', 'AUTH_CTX', 'callSessions', 'groupCallRooms',
  'qrChallenges', 'phoneVerificationCodes', 'passkeyChallenges',
]);
const CACHE = new Set([
  'users', 'usersById', 'sessions', 'revokedTokens', 'wsTickets',
  'friendships', 'friendMeta', 'conversations', 'messages', 'readCursors',
  'reactionStore', 'noteStore', 'eventStore', 'polls', 'pollVotes',
  'attachmentStore', 'pushTokens', 'deviceKeys', 'userKeys',
]);
const UNBACKED = new Set([
  'passkeyCreds', 'storeOrders', 'pinnedMessages', 'albums', 'savedMessages',
  'communityRooms', 'communityPosts', 'partnerOrgs', 'partnerAccounts',
  'partnerTickets', 'partnerCampaigns', 'oaBotRules', 'devOrgs', 'devApps',
  'devWebhooks', 'devMiniApps', 'creatorProfiles', 'creatorPacks', 'creatorItems',
  'adsAdvertisers', 'adsCampaigns', 'adsGroups', 'userPrefs', 'chatMeta',
  'hiddenMsgs', 'roomMembers', 'wallets', 'ownedPacks', 'ownedThemes',
  'officialAccounts', 'followedOfficial', 'richMenus', 'creatorSettlements',
  'timelinePosts', 'voomPosts', 'storyStore', 'auditLogs', 'adminReports',
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
