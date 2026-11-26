// Central locale, Geo-IP country mapping, strict routing whitelist, and
// subdomain topology configuration for LUNO Global Messenger.
// Shared across Edge routing (Cloudflare Worker / proxy) and web clients.

export const PRIMARY_LANDING_LANGS = ['ko', 'en', 'ja', 'zh-tw'] as const;
export type PrimaryLandingLang = (typeof PRIMARY_LANDING_LANGS)[number];

// Full landing language catalog (kept synchronized with site-i18n.ts & cf_worker.js).
export const SITE_LANGS = [
  'ko', 'en', 'ja', 'zh', 'zh-tw', 'th', 'vi', 'id', 'ms', 'hi',
  'ar', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'tr',
] as const;
export type SiteLang = (typeof SITE_LANGS)[number];

export const SUPPORTED_LANGS: ReadonlySet<string> = new Set(SITE_LANGS);

export const LANDING_PAGE_SLUGS = [
  '',
  'features',
  'download',
  'privacy',
  'terms',
  'support',
  'account-deletion',
] as const;
export type LandingPageSlug = (typeof LANDING_PAGE_SLUGS)[number];

export const PREF_LANG_COOKIE = 'pref_lang';
export const LEGACY_LANG_COOKIE = 'luno_lang';
export const PREF_LANG_MAX_AGE = 31536000; // 1 year

// Country ISO 3166-1 alpha-2 -> default landing language.
// Required core mappings: KR -> ko, JP -> ja, TW/HK -> zh-tw, US & fallback -> en.
export const COUNTRY_TO_LANG: Readonly<Record<string, SiteLang>> = {
  KR: 'ko',
  JP: 'ja',
  TW: 'zh-tw',
  HK: 'zh-tw',
  MO: 'zh-tw',
  CN: 'zh',
  TH: 'th',
  VN: 'vi',
  ID: 'id',
  MY: 'ms',
  BN: 'ms',
  SA: 'ar', AE: 'ar', EG: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar',
  LB: 'ar', IQ: 'ar', SY: 'ar', YE: 'ar', PS: 'ar', LY: 'ar', TN: 'ar', DZ: 'ar',
  MA: 'ar', SD: 'ar', MR: 'ar',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es',
  GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es',
  CR: 'es', PA: 'es', UY: 'es', PR: 'es', GQ: 'es',
  BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt', CV: 'pt', GW: 'pt', ST: 'pt', TL: 'pt',
  FR: 'fr', MC: 'fr', SN: 'fr', CI: 'fr', CM: 'fr', ML: 'fr', BF: 'fr', NE: 'fr',
  TG: 'fr', BJ: 'fr', GA: 'fr', CG: 'fr', CD: 'fr', MG: 'fr', HT: 'fr', GN: 'fr',
  TD: 'fr', CF: 'fr', DJ: 'fr', KM: 'fr',
  DE: 'de', AT: 'de', LI: 'de',
  IT: 'it', SM: 'it', VA: 'it',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru', TJ: 'ru',
  TR: 'tr',
  US: 'en', GB: 'en', AU: 'en', NZ: 'en', IE: 'en', ZA: 'en', NG: 'en', KE: 'en',
  GH: 'en', UG: 'en', TZ: 'en', ZW: 'en', ZM: 'en', JM: 'en', TT: 'en',
};

// Strict whitelist: paths that must NEVER receive a /{lang} prefix or Geo-IP redirect.
export const WHITELIST_PREFIXES = [
  '/.well-known/',
  '/invite/',
  '/@',
  '/join/',
  '/assets/',
  '/static/',
  '/_nuxt/',
  '/_next/',
  '/images/',
  '/cdn-cgi/',
  '/sitemaps/',
  '/brand/',
  '/legal/',
  '/stickers/',
  '/api/',
  '/v1/',
] as const;

export const WHITELIST_EXACT: ReadonlySet<string> = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/manifest.webmanifest',
  '/sw.js',
  '/version.json',
  '/healthz',
  '/readyz',
  '/metrics',
  '/download',
  '/download/',
  '/download.html',
  '/app',
  '/mobile',
  '/apk',
]);

export type HostRole = 'apex' | 'www' | 'web' | 'api' | 'ws' | 'cdn' | 'standalone';

export function isLocalHostname(hostname: string): boolean {
  const h = String(hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

export function classifyHost(hostname: string): { role: HostRole; apexDomain: string } {
  const h = String(hostname || '').toLowerCase();
  if (!h || isLocalHostname(h) || h.endsWith('.workers.dev') || /^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    return { role: 'standalone', apexDomain: h };
  }
  const parts = h.split('.');
  if (parts.length >= 3) {
    const sub = parts[0];
    const apex = parts.slice(1).join('.');
    if (sub === 'www') return { role: 'www', apexDomain: apex };
    if (sub === 'web') return { role: 'web', apexDomain: apex };
    if (sub === 'api') return { role: 'api', apexDomain: apex };
    if (sub === 'ws') return { role: 'ws', apexDomain: apex };
    if (sub === 'cdn') return { role: 'cdn', apexDomain: apex };
  }
  return { role: 'apex', apexDomain: h };
}

/**
 * Returns the parent cookie domain (e.g. `.lunotalk.com`) so `pref_lang` is
 * shared across `{domain}` and `web.{domain}`. Returns `''` on localhost,
 * IPs, and `*.workers.dev` where Domain-wide cookies are invalid or unsafe.
 */
export function rootDomainForCookie(hostname: string): string {
  const { role, apexDomain } = classifyHost(hostname);
  if (role === 'standalone' || !apexDomain || !apexDomain.includes('.')) return '';
  return `.${apexDomain}`;
}

export function buildPrefLangCookie(
  lang: string,
  hostname: string,
  secure = true,
  cookieName = PREF_LANG_COOKIE,
): string {
  const domain = rootDomainForCookie(hostname);
  const parts = [
    `${cookieName}=${encodeURIComponent(lang)}`,
    ...(domain ? [`Domain=${domain}`] : []),
    'Path=/',
    `Max-Age=${PREF_LANG_MAX_AGE}`,
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ];
  return parts.join('; ');
}

export function parseCookieValue(cookieHeader: string | null | undefined, name: string): string {
  const header = String(cookieHeader || '');
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return '';
}

export function readPrefLangFromCookie(cookieHeader: string | null | undefined): SiteLang | null {
  const primary = parseCookieValue(cookieHeader, PREF_LANG_COOKIE).toLowerCase();
  if (primary && SUPPORTED_LANGS.has(primary)) return primary as SiteLang;
  const legacy = parseCookieValue(cookieHeader, LEGACY_LANG_COOKIE).toLowerCase();
  if (legacy && SUPPORTED_LANGS.has(legacy)) return legacy as SiteLang;
  return null;
}

export function matchLangTag(tag: string): SiteLang | null {
  const t = String(tag || '').toLowerCase().trim();
  if (!t) return null;
  if (t.startsWith('zh')) return /(tw|hk|mo|hant)/.test(t) ? 'zh-tw' : 'zh';
  if (SUPPORTED_LANGS.has(t)) return t as SiteLang;
  const primary = t.split('-')[0];
  if (primary === 'fil' || primary === 'tl') return 'en';
  return SUPPORTED_LANGS.has(primary) ? (primary as SiteLang) : null;
}

export function matchAcceptLanguage(header: string | null | undefined): SiteLang | null {
  const raw = String(header || '');
  if (!raw) return null;
  const parsed = raw
    .split(',')
    .map((part) => {
      const [tag, qPart] = part.trim().split(';q=');
      return { tag: tag.trim(), q: qPart === undefined ? 1 : Number(qPart) || 0 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const entry of parsed) {
    const matched = matchLangTag(entry.tag);
    if (matched) return matched;
  }
  return null;
}

export function hreflangCode(lang: string): string {
  if (lang === 'zh') return 'zh-Hans';
  if (lang === 'zh-tw') return 'zh-Hant';
  return lang;
}
