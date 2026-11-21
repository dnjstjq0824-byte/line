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
  'STICKER_CATALOG', 'THEME_CATALOG', 'ORBIT_CREW_STICKERS', 'GOOGLE_TTS_VOICES', 'VISION_UNSAFE',
  'LUNO_SCHEMA', 'LUNO_SCHEMA_BASE', 'LUNO_SCHEMA_PHASE1', 'LUNO_SCHEMA_PHASE1_COLS',
  'ATTACHMENT_MIME_ALLOW',
  'NEWS_SAMPLE', 'GRANTABLE_ROLES', 'REACTIONS', 'PEER_USERS', 'READY_TABLES', 'DELETE_REASONS',
  'ACCOUNT_PLANS', // F13: frozen plan vocabulary (PLAN_GRANTS is a plain object, not a scanned store)
  'translateProviders', // T1: provider registry, populated once at module load
  'sttProviders', // F14: STT provider registry, populated once at module load
  'ttsProviders', // A14: TTS provider registry, populated once at module load
  'pushProviders', // N1-L: push provider registry, populated once at module load
  'F22_SECRET_CONTAINS', 'F22_SECRET_EXACT', 'F22_BODY_EXACT', 'F22_EMAIL_EXACT', // F22: frozen mask vocabulary
  'SUPPORT_TICKET_CATEGORIES', // F30: frozen ticket vocabulary
  'REPORT_CATEGORIES', 'HIDE_TARGET_TYPES', // F29: frozen report + hide vocabularies
  'SITE_LANGS', // build 17: frozen front-page language list (mirrors apps/user-web/src/site-i18n.ts)
]);
const EPHEMERAL = new Set([
  'activeSockets', 'AUTH_CTX', 'groupCallRooms',
  'qrChallenges', 'phoneVerificationCodes', 'passkeyChallenges',
  'recoveryChallenges', 'recoveryMailOutbox', 'verificationMailOutbox', 'smsOutbox',
  'translateProviderCalls', // T1: per-isolate provider-call probe for tests
  'sttProviderCalls', // F14: per-isolate provider-call probe for tests
  'ttsProviderCalls', // A14: per-isolate provider-call probe for tests
  'f22Requests', 'f22Errors', // F22: per-isolate request/error counters (reset on evict, /metrics-labeled)
  'storeOrders', // 6-8: write-only purchase counter for /metrics (like f22 counters, not domain state)
]);
const CACHE = new Set([
  'callSessions', // build 16: D1 write-through (luno_call_sessions); every /calls/:id request re-reads it
  'profileFreshAt', // build 16: per-isolate TTL stamps for re-reading peers' public profile from D1
  'users', 'usersById', 'sessions', 'revokedTokens', 'wsTickets',
  'friendships', 'friendMeta', 'conversations', 'messages', 'readCursors',
  'reactionStore', 'noteStore', 'eventStore', 'polls', 'pollVotes',
  'pinnedMessages', 'albums', 'savedMessages', 'hiddenMsgs',
  'wallets', 'ownedPacks', 'ownedThemes', 'userPrefs',
  'pushTokens', 'deviceKeys', 'userKeys',
  'partnerCoupons', // F17: D1 write-through coupon cache (luno_partner_coupons)
  'userConsents', // F24: D1 write-through consent cache (luno_consents; seeds are memory bootstrap like seed users)
  'botPresenceCache', // PC agent: write-throttle for runner presence; D1 (luno_bot_config presence:<bot>) is what status reads
  'seenCache', // S1: write-throttle for the claim heartbeat; D1 (luno_bot_config seen:<bot>) is what the cron reads
  // 6-8: D1-primary with a no-DB map fallback (verified read+write paths)
  'passkeyCreds', // luno_passkey_credentials
  'adminReports', // reports
  'auditLogs', // luno_audit (live writes all via persistAudit)
  'featureFlags', // luno_feature_flags
  'officialAccounts', 'followedOfficial', // luno_official_accounts, luno_official_follows
  'chatMeta', // 6-8: migrated to luno_chat_meta (was memory-only)
  'skParcels', // E6: no-DB fallback; luno_sk_parcels is the store
  'e2eeBackupBlobs', // E9: no-DB fallback; e2ee_backups/R2 is the store
  // 6-8: D1-primary behind DURABLE_BUSINESS=true (wrangler.jsonc; F17 tests)
  'richMenus', // luno_rich_menus
  'oaBotRules', // luno_oa_bot_rules
  'partnerOrgs', 'partnerAccounts', 'partnerTickets', 'partnerCampaigns', // luno_partner_*
  'devOrgs', 'devApps', 'devWebhooks', 'devMiniApps', // luno_dev_*
  'creatorProfiles', 'creatorPacks', 'creatorItems', // luno_creator_* + luno_owned_resources
  'adsAdvertisers', 'adsCampaigns', 'adsGroups', // luno_ads_* + luno_owned_resources
]);
// 6-8: empty. Every module store is now static, ephemeral or D1-backed;
// the ratchet below fails on any regression to memory-only durable state.
const UNBACKED = new Set([]);

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
  assert.ok(UNBACKED.size <= 0, `unbacked stores: ${UNBACKED.size} (ratchet: 0 since 6-8, shrink only)`);
  for (const core of ['users', 'sessions', 'friendships', 'conversations', 'messages', 'blocks']) {
    if (core === 'blocks') continue; // blocks live in D1 only; no module store exists
    assert.ok(CACHE.has(core), `${core} must stay D1-backed`);
  }
});
