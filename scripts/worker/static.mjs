// Worker module: frozen static data (P2 monolith split).
// Every export is read-only after load, so sharing one copy across
// query-fresh test imports is safe. Mutable per-isolate state must NOT
// move here (see cold_start_journey.test.mjs).

const STICKER_CATALOG = [
  { id: 'basic', title: '기본 이모티콘', price_minor: 0, stickers: ['😀', '😂', '😍', '😭', '😡', '👍', '🙏', '🎉', '😴', '🤔', '🥳', '😎'] },
  { id: 'pack-1', title: '포근한 동물 친구들', price_minor: 2500, stickers: ['🐻', '🐰', '🐥', '🐱', '🐶', '🦊', '🐼', '🐨', '🐸', '🦁', '🐯', '🐷'] },
  { id: 'pack-2', title: '맛있는 하루', price_minor: 2500, stickers: ['🍕', '🍔', '🍣', '🍜', '🍰', '☕', '🍺', '🍓', '🍙', '🌮', '🍩', '🥐'] },
  { id: 'pack-3', title: '우주 탐험대', price_minor: 3500, stickers: ['🚀', '🌙', '⭐', '🪐', '👽', '🛸', '☄️', '🌍', '🔭', '🌌', '🌠', '🧑‍🚀'] }
];
// Free built-in "Orbit Crew" chips of the Android app (lunoOrbitCrewStickers in
// mobile/flutter_app/lib/legacy_tokens.dart). Shipped APKs (build <= 13) send
// them as kind=sticker with body "<emoji> [<Character>]" and no metadata, so
// the worker must accept exactly these bodies or every tap fails with 400.
const ORBIT_CREW_STICKERS = new Map([
  ['\u{1f6f8}\u{1f44b} [Lumi]', 'lumi_hi'],
  ['\u{1fa90}\u{2764}\u{fe0f} [Nori]', 'nori_warm'],
  ['\u{1f4ab}\u{2728} [Poko]', 'poko_love'],
  ['\u{1f680}\u{1f525} [Luno]', 'luno_cheer'],
  ['\u{2604}\u{fe0f}\u{1f602} [Comet]', 'comet_laugh'],
  ['\u{1f468}\u{200d}\u{1f680}\u{1f647} [Astro]', 'astro_bow']
]);
const THEME_CATALOG = [
  { id: 'mint', title: '민트 브리즈', price_minor: 0 },
  { id: 'ocean', title: '오션 블루', price_minor: 0 },
  { id: 'sunset', title: '선셋 글로우', price_minor: 1500 },
  { id: 'sakura', title: '사쿠라 핑크', price_minor: 1500 },
  { id: 'midnight', title: '미드나잇', price_minor: 0 }
];
const DEFAULT_PREFS = {
  theme: 'mint', dark_mode: false, language: 'ko', font_size: 'medium',
  show_read_receipts: true, searchable_by_id: true, searchable_by_email: false, discoverable_by_phone: true,
  allow_friend_requests: true, notifications: true, notification_preview: true,
  letter_sealing: false, wallpaper: 'default', link_previews: true
};
// F13: plan vocabulary for future tiers (no billing code lives here).
const ACCOUNT_PLANS = ['personal', 'developer', 'business'];
const PLAN_GRANTS = { personal: [], developer: [], business: [] };

function now() { return new Date().toISOString(); }
function uid() { return crypto.randomUUID(); }

const SESSION_TTL_MS = 15 * 60 * 1000; // A-15: access tokens live 15 minutes.
const REFRESH_TTL_MS = 30 * 86400 * 1000; // Refresh tokens live 30 days, single-use (rotation).

export {
  STICKER_CATALOG, ORBIT_CREW_STICKERS, THEME_CATALOG, DEFAULT_PREFS,
  ACCOUNT_PLANS, PLAN_GRANTS,
  SESSION_TTL_MS, REFRESH_TTL_MS,
  now, uid,
};
