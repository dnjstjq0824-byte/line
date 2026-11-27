// Edge routing middleware for LUNO Global Messenger:
// - Apex / subdomain topology (apex, www 301, web, api, ws, cdn)
// - Strict whitelist bypass (/.well-known/*, /invite/*, /@*, /join/*, assets, SEO files)
// - Geo-IP / pref_lang cookie / Accept-Language 302 routing & uppercase 301 normalization
// - Direct 200 OK .well-known JSON (apple-app-site-association, assetlinks.json)
// - SSR deep-link fallback pages (/invite/:code, /join/:code, /@:handle) with dynamic OG + X-Robots-Tag: noindex, nofollow
// - Store-review fixed localized pages (/{lang}/privacy, /terms, /support, /account-deletion) with canonical + hreflang

export const PRIMARY_LANDING_LANGS = ['ko', 'en', 'ja', 'zh-tw'];
export const EDGE_SITE_LANGS = [
  'ko', 'en', 'ja', 'zh', 'zh-tw', 'th', 'vi', 'id', 'ms', 'hi',
  'ar', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'tr',
];
export const SUPPORTED_LANGS = new Set(EDGE_SITE_LANGS);

export const COUNTRY_TO_LANG = (() => {
  const map = {};
  const put = (lang, codes) => { for (const c of codes.split(' ')) map[c] = lang; };
  put('ko', 'KR');
  put('ja', 'JP');
  put('zh', 'CN');
  put('zh-tw', 'TW HK MO');
  put('th', 'TH');
  put('vi', 'VN');
  put('id', 'ID');
  put('ms', 'MY BN');
  put('ar', 'SA AE EG QA KW BH OM JO LB IQ SY YE PS LY TN DZ MA SD MR');
  put('es', 'ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR GQ');
  put('pt', 'BR PT AO MZ CV GW ST TL');
  put('fr', 'FR MC SN CI CM ML BF NE TG BJ GA CG CD MG HT GN TD CF DJ KM');
  put('de', 'DE AT LI');
  put('it', 'IT SM VA');
  put('ru', 'RU BY KZ KG TJ');
  put('tr', 'TR');
  put('en', 'US GB AU NZ IE ZA NG KE GH UG TZ ZW ZM JM TT');
  return map;
})();

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
];

export const WHITELIST_EXACT = new Set([
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

// Paths without a /{lang} prefix that belong to the marketing/store surface and
// should 302 to /{targetLang}{pathname} while preserving subpath & query string.
export const GEO_REDIRECT_PATHS = new Set([
  '/',
  '/features',
  '/privacy',
  '/terms',
  '/support',
  '/account-deletion',
]);

export const SSR_STORE_PAGES = new Set(['privacy', 'terms', 'support', 'account-deletion']);

export const PREF_LANG_COOKIE = 'pref_lang';
export const LEGACY_LANG_COOKIE = 'luno_lang';

export function isLocalHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

export function effectiveHostname(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (host.endsWith('.workers.dev')) {
    const fwd = String(request.headers.get('X-Forwarded-Host') || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
    if (fwd && /^[a-z0-9.-]+$/.test(fwd)) return fwd;
  }
  return host;
}

export function classifyHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || isLocalHost(h) || h.endsWith('.workers.dev') || /^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    return { role: 'standalone', apexDomain: h };
  }
  const parts = h.split('.');
  if (parts.length >= 3) {
    const sub = parts[0];
    const apex = parts.slice(1).join('.');
    if (sub === 'www' || sub === 'web' || sub === 'api' || sub === 'ws' || sub === 'cdn') {
      return { role: sub, apexDomain: apex };
    }
  }
  return { role: 'apex', apexDomain: h };
}

export function rootDomainForCookie(hostname) {
  const { role, apexDomain } = classifyHost(hostname);
  if (role === 'standalone' || !apexDomain || !apexDomain.includes('.')) return '';
  return `.${apexDomain}`;
}

export function parseCookie(cookieHeader, name) {
  const header = String(cookieHeader || '');
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
  }
  return '';
}

export function buildPrefLangCookie(lang, hostname, secure = true, name = PREF_LANG_COOKIE) {
  const domain = rootDomainForCookie(hostname);
  const parts = [
    `${name}=${encodeURIComponent(lang)}`,
    ...(domain ? [`Domain=${domain}`] : []),
    'Path=/',
    'Max-Age=31536000',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ];
  return parts.join('; ');
}

export function matchLangTag(tag) {
  const t = String(tag || '').toLowerCase().trim();
  if (!t) return null;
  if (t.startsWith('zh')) return /(tw|hk|mo|hant)/.test(t) ? 'zh-tw' : 'zh';
  if (SUPPORTED_LANGS.has(t)) return t;
  const primary = t.split('-')[0];
  if (primary === 'fil' || primary === 'tl') return 'en';
  return SUPPORTED_LANGS.has(primary) ? primary : null;
}

export function matchAcceptLanguage(header) {
  const accept = String(header || '');
  if (!accept) return null;
  const tags = accept
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q) || 0 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const entry of tags) {
    const lang = matchLangTag(entry.tag);
    if (lang) return lang;
  }
  return null;
}

/**
 * Resolves the visitor's target language following the strict priority:
 * 1) User cookie (`pref_lang`, then legacy `luno_lang`)
 * 2) Geo-IP (`MOCK_GEO_COUNTRY` on localhost, else `X-Luno-Country` -> `request.cf.country` -> `CF-IPCountry`; XX/T1 ignored)
 * 3) `Accept-Language` header matching
 * 4) Fallback `'en'`
 */
export function resolveTargetLang(request, env = {}) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const pref = parseCookie(cookieHeader, PREF_LANG_COOKIE).toLowerCase();
  if (pref && SUPPORTED_LANGS.has(pref)) return pref;
  const legacy = parseCookie(cookieHeader, LEGACY_LANG_COOKIE).toLowerCase();
  if (legacy && SUPPORTED_LANGS.has(legacy)) return legacy;

  const url = new URL(request.url);
  let country = '';
  if (isLocalHost(url.hostname) && env && env.MOCK_GEO_COUNTRY) {
    country = String(env.MOCK_GEO_COUNTRY).trim().toUpperCase();
  } else {
    country = String(
      request.headers.get('X-Luno-Country') ||
      (request.cf && request.cf.country) ||
      request.headers.get('CF-IPCountry') ||
      '',
    ).trim().toUpperCase();
  }
  if (country && country !== 'XX' && country !== 'T1' && COUNTRY_TO_LANG[country]) {
    return COUNTRY_TO_LANG[country];
  }

  return matchAcceptLanguage(request.headers.get('Accept-Language')) || 'en';
}

/** Resolves UI language for SSR deep-link / store pages (4-language core copy). */
function resolveCoreUiLang(lang) {
  const l = String(lang || '').toLowerCase();
  if (l === 'ko' || l === 'ja' || l === 'zh-tw' || l === 'en') return l;
  if (l === 'zh') return 'zh-tw';
  return 'en';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hreflangOf(lang) {
  if (lang === 'zh') return 'zh-Hans';
  if (lang === 'zh-tw') return 'zh-Hant';
  return lang;
}

function detectClientPlatform(ua) {
  const s = String(ua || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return 'ios';
  if (/android/.test(s)) return 'android';
  return 'desktop';
}

function webOriginFor(url, env) {
  const { role, apexDomain } = classifyHost(url.hostname);
  if (env && env.WEB_APP_ORIGIN) return String(env.WEB_APP_ORIGIN).replace(/\/+$/, '');
  if (role === 'apex' || role === 'www' || role === 'api' || role === 'ws' || role === 'cdn') {
    return `https://web.${apexDomain}`;
  }
  return url.origin;
}

function canonicalOriginFor(url, env) {
  const { role, apexDomain } = classifyHost(url.hostname);
  if (role === 'apex' || role === 'www') return `https://${apexDomain}`;
  if (env && env.PUBLIC_BASE_URL) return String(env.PUBLIC_BASE_URL).replace(/\/+$/, '');
  return url.origin;
}

// ---------- .well-known handlers (strict 200 OK JSON, zero redirect) ----------

export function appleAppSiteAssociationResponse(env = {}) {
  const teamId = String((env && env.APPLE_TEAM_ID) || 'LUNO_TEAM_ID').trim();
  const bundleId = String((env && env.APPLE_BUNDLE_ID) || 'com.lunotalk.messenger').trim();
  const payload = {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${bundleId}`],
          components: [
            { '/': '/invite/*', comment: '채팅방 초대 딥링크' },
            { '/': '/join/*', comment: '초대 코드 딥링크' },
            { '/': '/@*', comment: '사용자 프로필 딥링크' },
            ...EDGE_SITE_LANGS.map((lang) => ({ '/': `/${lang}/*`, exclude: true })),
            ...EDGE_SITE_LANGS.map((lang) => ({ '/': `/${lang}`, exclude: true })),
          ],
        },
      ],
    },
  };
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export function assetLinksResponse(env = {}) {
  const pkg = String((env && env.ANDROID_PACKAGE_NAME) || 'com.lunotalk.messenger').trim();
  const customFps = env && env.ANDROID_SHA256_FINGERPRINTS
    ? String(env.ANDROID_SHA256_FINGERPRINTS).split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  const fingerprints = (customFps && customFps.length > 0) ? customFps : [
    'F2:D7:2C:CC:80:54:A2:FA:EB:42:3F:18:5F:5F:F7:7B:A3:1D:EF:4B:90:2C:31:5E:07:1B:A8:D7:0B:4C:97:7C',
    '6D:CD:CD:38:DB:6A:48:5C:E9:99:FE:EC:9D:B5:8F:E5:CD:C7:80:63:16:AA:63:6A:56:90:8B:FD:F0:BA:64:F0',
    '15:09:C9:EE:A6:53:6E:9C:F4:9C:53:61:47:E0:66:27:0A:A9:B2:EC:93:C3:35:43:65:CF:2F:BD:D9:6C:BE:A9',
  ];
  return new Response(JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: pkg,
      sha256_cert_fingerprints: fingerprints,
    },
  }]), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// ---------- Crawler metadata (robots.txt, sitemap.xml, llms.txt) ----------

export function robotsTxtResponse(request, env = {}) {
  const url = new URL(request.url);
  const { role } = classifyHost(url.hostname);
  if (role === 'web' || role === 'api' || role === 'ws' || role === 'cdn') {
    return new Response('User-agent: *\nDisallow: /\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }
  const base = canonicalOriginFor(url, env);
  const body = [
    'User-agent: *',
    ...PRIMARY_LANDING_LANGS.map((l) => `Allow: /${l}/`),
    'Disallow: /invite/',
    'Disallow: /join/',
    'Disallow: /api/',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export function sitemapXmlResponse(request, env = {}) {
  const url = new URL(request.url);
  const base = canonicalOriginFor(url, env);
  const slugs = ['', 'features', 'download', 'privacy', 'terms', 'support', 'account-deletion'];
  const urls = [];
  for (const slug of slugs) {
    const suffix = slug ? `/${slug}` : '/';
    const altLinks = PRIMARY_LANDING_LANGS
      .map((l) => `    <xhtml:link rel="alternate" hreflang="${hreflangOf(l)}" href="${escapeHtml(`${base}/${l}${suffix}`)}" />`)
      .join('\n');
    const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(`${base}/en${suffix}`)}" />`;
    for (const lang of PRIMARY_LANDING_LANGS) {
      urls.push([
        '  <url>',
        `    <loc>${escapeHtml(`${base}/${lang}${suffix}`)}</loc>`,
        altLinks,
        xDefault,
        '  </url>',
      ].join('\n'));
    }
  }
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export function llmsTxtResponse(request, env = {}) {
  const url = new URL(request.url);
  const base = canonicalOriginFor(url, env);
  const text = [
    '# LUNO Global Messenger',
    '',
    '> Multilingual real-time messenger with E2EE, voice/video calls, and live translation.',
    '',
    '## Localized Landing & Store Policy Pages',
    ...PRIMARY_LANDING_LANGS.flatMap((lang) => [
      `- ${base}/${lang}/`,
      `- ${base}/${lang}/privacy`,
      `- ${base}/${lang}/terms`,
      `- ${base}/${lang}/support`,
      `- ${base}/${lang}/account-deletion`,
    ]),
    '',
  ].join('\n');
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// ---------- Deep-link SSR fallback pages (/invite/:code, /@:handle) ----------

const DEEPLINK_COPY = {
  ko: {
    inviteBadge: 'LUNO 대화방 초대',
    inviteDefaultTitle: 'LUNO 그룹 대화 초대',
    inviteDesc: (title, members) => members ? `${title} · 참여자 ${members}명 — LUNO에서 대화를 이어가세요.` : `${title} — LUNO에서 바로 참여하세요.`,
    profileBadge: 'LUNO 사용자 프로필',
    profileDesc: (name, bio) => bio || `${name}님과 LUNO에서 1:1 대화와 무료 통화를 시작하세요.`,
    openApp: 'LUNO 앱에서 열기',
    openWeb: '웹 메신저에서 열기',
    getAndroid: 'Android 앱 설치',
    getIos: 'App Store (준비 중)',
    qrHint: '모바일 카메라로 아래 QR 코드를 스캔해 앱에서 바로 열 수 있습니다.',
    codeLabel: '초대 코드',
    handleLabel: '사용자 ID',
    privacyNote: '이 초대 링크는 검색 엔진에 노출되지 않습니다.',
  },
  en: {
    inviteBadge: 'LUNO Chat Invite',
    inviteDefaultTitle: 'LUNO Group Chat Invitation',
    inviteDesc: (title, members) => members ? `${title} · ${members} members — Join the conversation on LUNO.` : `${title} — Join right away on LUNO.`,
    profileBadge: 'LUNO Profile',
    profileDesc: (name, bio) => bio || `Start a direct chat or free call with ${name} on LUNO.`,
    openApp: 'Open in LUNO App',
    openWeb: 'Continue on LUNO Web',
    getAndroid: 'Get Android App',
    getIos: 'App Store (Coming Soon)',
    qrHint: 'Scan on mobile or open directly in the LUNO web messenger.',
    codeLabel: 'Invite Code',
    handleLabel: 'Handle',
    privacyNote: 'This private link is excluded from search engine indexing.',
  },
  ja: {
    inviteBadge: 'LUNO トーク招待',
    inviteDefaultTitle: 'LUNO グループトーク招待',
    inviteDesc: (title, members) => members ? `${title} · 参加者 ${members}人 — LUNOで会話に参加しましょう。` : `${title} — LUNOですぐに参加できます。`,
    profileBadge: 'LUNO プロフィール',
    profileDesc: (name, bio) => bio || `${name}さんとLUNOで1対1トークや無料通話を始めましょう。`,
    openApp: 'LUNOアプリで開く',
    openWeb: 'Web版で開く',
    getAndroid: 'Androidアプリを入手',
    getIos: 'App Store（準備中）',
    qrHint: 'スマホで開くか、PCのWebメッセンジャーからそのまま参加できます。',
    codeLabel: '招待コード',
    handleLabel: 'ユーザーID',
    privacyNote: 'この招待リンクは検索エンジンにインデックスされません。',
  },
  'zh-tw': {
    inviteBadge: 'LUNO 聊天室邀請',
    inviteDefaultTitle: 'LUNO 群組聊天邀請',
    inviteDesc: (title, members) => members ? `${title} · ${members} 位成員 — 在 LUNO 加入對話。` : `${title} — 立即在 LUNO 加入聊天。`,
    profileBadge: 'LUNO 個人檔案',
    profileDesc: (name, bio) => bio || `在 LUNO 與 ${name} 開始一對一聊天與免費通話。`,
    openApp: '在 LUNO App 中開啟',
    openWeb: '在網頁版開啟',
    getAndroid: '下載 Android App',
    getIos: 'App Store（準備中）',
    qrHint: '使用手機開啟，或直接前往 LUNO 網頁版加入對話。',
    codeLabel: '邀請代碼',
    handleLabel: '使用者 ID',
    privacyNote: '此私人邀請連結不會被搜尋引擎收錄。',
  },
};

function renderDeepLinkHtml({
  lang,
  platform,
  badge,
  title,
  description,
  ogImage,
  pageUrl,
  appSchemeUrl,
  webFallbackUrl,
  androidUrl,
  iosUrl,
  metaLabel,
  metaValue,
}) {
  const c = DEEPLINK_COPY[resolveCoreUiLang(lang)];
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeUrl = escapeHtml(pageUrl);
  const safeImg = escapeHtml(ogImage);
  const primaryBtn = platform === 'ios'
    ? `<a class="btn primary" href="${escapeHtml(appSchemeUrl)}">${escapeHtml(c.openApp)}</a>
       <a class="btn secondary" href="${escapeHtml(iosUrl)}">${escapeHtml(c.getIos)}</a>`
    : platform === 'android'
      ? `<a class="btn primary" href="${escapeHtml(appSchemeUrl)}">${escapeHtml(c.openApp)}</a>
         <a class="btn secondary" href="${escapeHtml(androidUrl)}">${escapeHtml(c.getAndroid)}</a>`
      : `<a class="btn primary" href="${escapeHtml(webFallbackUrl)}">${escapeHtml(c.openWeb)}</a>
         <a class="btn secondary" href="${escapeHtml(androidUrl)}">${escapeHtml(c.getAndroid)}</a>`;

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${safeTitle} — LUNO</title>
  <meta name="description" content="${safeDesc}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="LUNO Global Messenger" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${safeImg}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImg}" />
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", sans-serif; background: #f5f7f6; color: #0f172a; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    @media (prefers-color-scheme: dark) { body { background: #0f1419; color: #f8fafc; } .card { background: #171f26; border-color: #1e293b; } .meta-box { background: #0f1419; } }
    .card { width: 100%; max-width: 440px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px 24px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08); text-align: center; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: rgba(6,199,85,0.14); color: #058237; font-size: 12px; font-weight: 700; margin-bottom: 12px; }
    h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.3; }
    p { margin: 0 0 18px; font-size: 14px; color: #64748b; line-height: 1.6; }
    .meta-box { background: #f8fafc; border-radius: 12px; padding: 10px 14px; margin-bottom: 20px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
    .meta-box code { font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 700; color: #058237; }
    .actions { display: flex; flex-direction: column; gap: 10px; }
    .btn { display: block; padding: 12px 16px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px; }
    .btn.primary { background: #058237; color: #ffffff; }
    .btn.secondary { background: rgba(6,199,85,0.12); color: #058237; }
    .btn.ghost { color: #64748b; font-size: 13px; font-weight: 600; }
    .note { margin-top: 16px; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <main class="card" data-platform="${escapeHtml(platform)}">
    <div class="badge">${escapeHtml(badge)}</div>
    <h1>${safeTitle}</h1>
    <p>${safeDesc}</p>
    <div class="meta-box"><span>${escapeHtml(metaLabel)}</span><code>${escapeHtml(metaValue)}</code></div>
    <div class="actions">
      ${primaryBtn}
      ${platform !== 'desktop' ? `<a class="btn ghost" href="${escapeHtml(webFallbackUrl)}">${escapeHtml(c.openWeb)}</a>` : `<a class="btn ghost" href="${escapeHtml(appSchemeUrl)}">${escapeHtml(c.openApp)}</a>`}
    </div>
    <p class="note">${escapeHtml(c.privacyNote)}</p>
  </main>
</body>
</html>`;
}

export function renderInviteDeepLinkResponse(request, env, code, inviteMeta = null) {
  const url = new URL(request.url);
  const lang = resolveTargetLang(request, env);
  const ui = DEEPLINK_COPY[resolveCoreUiLang(lang)];
  const platform = detectClientPlatform(request.headers.get('User-Agent'));
  const base = canonicalOriginFor(url, env);
  const webOrigin = webOriginFor(url, env);
  const roomTitle = (inviteMeta && inviteMeta.title) ? inviteMeta.title : ui.inviteDefaultTitle;
  const memberCount = (inviteMeta && Number(inviteMeta.memberCount) > 0) ? Number(inviteMeta.memberCount) : 0;
  const ogImage = (inviteMeta && inviteMeta.avatarUrl) ? inviteMeta.avatarUrl : `${base}/brand/luno-og-share.png`;
  const html = renderDeepLinkHtml({
    lang,
    platform,
    badge: ui.inviteBadge,
    title: roomTitle,
    description: ui.inviteDesc(roomTitle, memberCount),
    ogImage,
    pageUrl: `${url.origin}${url.pathname}`,
    appSchemeUrl: `luno://app/invite/${encodeURIComponent(code)}`,
    webFallbackUrl: `${webOrigin}/invite/${encodeURIComponent(code)}`,
    androidUrl: `${base}/download`,
    iosUrl: `${base}/${resolveCoreUiLang(lang)}/download`,
    metaLabel: ui.codeLabel,
    metaValue: code,
  });
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Language': lang,
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      Vary: 'Accept-Language, CF-IPCountry, Cookie',
    },
  });
}

export function renderProfileDeepLinkResponse(request, env, handle, profileMeta = null) {
  const url = new URL(request.url);
  const lang = resolveTargetLang(request, env);
  const ui = DEEPLINK_COPY[resolveCoreUiLang(lang)];
  const platform = detectClientPlatform(request.headers.get('User-Agent'));
  const base = canonicalOriginFor(url, env);
  const webOrigin = webOriginFor(url, env);
  const displayName = (profileMeta && profileMeta.displayName) ? profileMeta.displayName : `@${handle}`;
  const bio = (profileMeta && profileMeta.bio) ? profileMeta.bio : '';
  const ogImage = (profileMeta && profileMeta.avatarUrl) ? profileMeta.avatarUrl : `${base}/brand/luno-og-share.png`;
  const html = renderDeepLinkHtml({
    lang,
    platform,
    badge: ui.profileBadge,
    title: displayName,
    description: ui.profileDesc(displayName, bio),
    ogImage,
    pageUrl: `${url.origin}${url.pathname}`,
    appSchemeUrl: `luno://app/@${encodeURIComponent(handle)}`,
    webFallbackUrl: `${webOrigin}/@${encodeURIComponent(handle)}`,
    androidUrl: `${base}/download`,
    iosUrl: `${base}/${resolveCoreUiLang(lang)}/download`,
    metaLabel: ui.handleLabel,
    metaValue: `@${handle}`,
  });
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Language': lang,
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      Vary: 'Accept-Language, CF-IPCountry, Cookie',
    },
  });
}

// ---------- Store-review fixed localized SSR pages (/{lang}/privacy, /terms, /support, /account-deletion) ----------

const STORE_PAGE_COPY = {
  ko: {
    brand: 'LUNO Global Messenger',
    privacyTitle: '개인정보처리방침',
    privacyBody: '<p>LUNO는 서비스 제공에 필요한 최소한의 개인정보만 처리하며, 1:1·그룹·Keep 대화방 메시지와 첨부파일은 종단간 암호화(E2EE)로 보호됩니다.</p><ul><li>수집 항목: 이메일, 비밀번호(PBKDF2 해시), 표시 이름, 기기·세션 보안 기록, 푸시 토큰</li><li>이용자 권리: 설정 화면에서 대화 내보내기(JSON), 기기 해제, 계정 삭제를 직접 요청할 수 있습니다.</li></ul>',
    termsTitle: '이용약관',
    termsBody: '<p>본 약관은 LUNO Global Messenger의 이용 조건과 이용자·운영자의 권리·의무를 규정합니다.</p><ul><li>만 14세 이상만 가입할 수 있으며, 불법 콘텐츠 유포·스팸·계정 도용을 금지합니다.</li><li>종단간 암호화 백업의 복원 문구는 이용자만 보관하며 분실 시 복구할 수 없습니다.</li></ul>',
    supportTitle: '고객 지원',
    supportBody: '<p>LUNO 이용 중 문제가 발생하거나 신고·문의가 필요한 경우 아래 채널로 접수해 주세요.</p><ul><li>앱/웹 내 고객센터: 설정 → 고객 지원 → 문의 접수</li><li>보안·개인정보·계정 문의: <a href="mailto:support@lunotalk.com">support@lunotalk.com</a></li><li>운영 시간: 평일 09:00 ~ 18:00 (KST)</li></ul>',
    deletionTitle: '계정 삭제 안내 및 요청',
    deletionBody: '<p>LUNO 계정과 연결된 개인정보는 언제든지 영구 삭제를 요청할 수 있습니다 (Google Play 데이터 삭제 정책 준수).</p><ol><li><strong>앱 또는 웹에서 즉시 삭제 요청</strong>: 로그인 → 설정 → 계정 관리 → <em>계정 삭제</em> 선택</li><li><strong>앱 접근이 불가한 경우</strong>: 가입 이메일 주소로 <a href="mailto:support@lunotalk.com?subject=Account%20Deletion%20Request">support@lunotalk.com</a>에 삭제 요청</li></ol><p>삭제 요청 시 모든 활성 세션과 자격증명이 즉시 무효화되며, 유예 기간 경과 후 계정·프로필·대화방 참여 기록·첨부·암호화 키 백업이 일괄 파기됩니다. 단, 관련 법령상 보존 의무가 있는 보안·신고 감사 로그는 법정 기간 보관 후 파기됩니다.</p>',
    fullDoc: '전체 원문 보기',
    backHome: '홈으로 돌아가기',
  },
  en: {
    brand: 'LUNO Global Messenger',
    privacyTitle: 'Privacy Policy',
    privacyBody: '<p>LUNO processes only the minimum data needed to deliver messaging, and protects 1:1, group, and Keep conversations with end-to-end encryption (E2EE).</p><ul><li>Data processed: email, PBKDF2 password hash, display profile, session/security logs, and push tokens.</li><li>Your rights: export chat data (JSON), revoke devices, or request account deletion directly in Settings.</li></ul>',
    termsTitle: 'Terms of Service',
    termsBody: '<p>These Terms govern your use of LUNO Global Messenger and define user and operator responsibilities.</p><ul><li>Users must be at least 14 years old. Abuse, spam, and account impersonation are prohibited.</li><li>Encrypted backup recovery phrases are held solely by you and cannot be recovered if lost.</li></ul>',
    supportTitle: 'Support',
    supportBody: '<p>Need help with LUNO, account access, or safety reports? Reach our team through the channels below.</p><ul><li>In-app support: Settings → Support → Submit a ticket</li><li>Email support: <a href="mailto:support@lunotalk.com">support@lunotalk.com</a></li><li>Hours: Mon–Fri 09:00–18:00 KST</li></ul>',
    deletionTitle: 'Account Deletion Guide & Request',
    deletionBody: '<p>You may request permanent deletion of your LUNO account and associated data at any time.</p><ol><li><strong>In-app or web</strong>: Sign in → Settings → Account → <em>Delete Account</em>.</li><li><strong>Without app access</strong>: Email <a href="mailto:support@lunotalk.com?subject=Account%20Deletion%20Request">support@lunotalk.com</a> from your registered email address.</li></ol><p>Active sessions and credentials are revoked immediately. After the grace window, your profile, memberships, attachments, and encrypted key backups are purged. Security and abuse audit records required by law are retained only for the statutory period.</p>',
    fullDoc: 'Read full legal document',
    backHome: 'Back to Home',
  },
  ja: {
    brand: 'LUNO Global Messenger',
    privacyTitle: 'プライバシーポリシー',
    privacyBody: '<p>LUNOはサービス提供に必要な最小限の情報のみを取り扱い、1対1・グループ・Keepのメッセージおよび添付ファイルをエンドツーエンド暗号化（E2EE）で保護します。</p><ul><li>取得項目：メールアドレス、PBKDF2ハッシュ化パスワード、プロフィール、セッション履歴、プッシュトークン</li><li>利用者の権利：設定画面からデータエクスポート、端末解除、アカウント削除を行えます。</li></ul>',
    termsTitle: '利用規約',
    termsBody: '<p>本規約はLUNO Global Messengerの利用条件および利用者と運営者の権利義務を定めます。</p><ul><li>14歳以上の方が登録でき、不正利用・スパム・なりすましを禁止します。</li><li>暗号化バックアップの復元フレーズは利用者のみが管理し、紛失時の復旧はできません。</li></ul>',
    supportTitle: 'サポート',
    supportBody: '<p>LUNOのご利用に関するご質問や不具合報告は以下の窓口よりお問い合わせください。</p><ul><li>アプリ／Web内サポート：設定 → サポート → お問い合わせ</li><li>メール：<a href="mailto:support@lunotalk.com">support@lunotalk.com</a></li></ul>',
    deletionTitle: 'アカウント削除のご案内と申請',
    deletionBody: '<p>LUNOアカウントおよび関連データはいつでも完全削除を申請できます。</p><ol><li><strong>アプリ／Webから申請</strong>：ログイン → 設定 → アカウント → <em>アカウント削除</em></li><li><strong>ログインできない場合</strong>：登録メールアドレスから <a href="mailto:support@lunotalk.com?subject=Account%20Deletion%20Request">support@lunotalk.com</a> へご連絡ください。</li></ol><p>申請と同時に全セッションが無効化され、猶予期間終了後にプロフィール・添付・暗号化キーのバックアップが一括削除されます（法令に基づくセキュリティ監査記録を除く）。</p>',
    fullDoc: '全文を見る',
    backHome: 'ホームに戻る',
  },
  'zh-tw': {
    brand: 'LUNO Global Messenger',
    privacyTitle: '隱私權政策',
    privacyBody: '<p>LUNO 僅處理提供通訊服務所需的最少資料，並對一對一、群組與 Keep 對話及附件採用端對端加密（E2EE）保護。</p><ul><li>蒐集項目：電子郵件、PBKDF2 雜湊密碼、個人檔案、工作階段安全紀錄、推播權杖。</li><li>使用者權利：可於設定中直接匯出資料、登出裝置或申請刪除帳號。</li></ul>',
    termsTitle: '服務條款',
    termsBody: '<p>本條款規範 LUNO Global Messenger 的使用條件與雙方權利義務。</p><ul><li>僅限年滿 14 歲以上註冊使用，禁止濫用、垃圾訊息與冒用帳號。</li><li>加密備份還原片語僅由使用者自行保管，遺失將無法復原。</li></ul>',
    supportTitle: '客戶支援',
    supportBody: '<p>若您在使用 LUNO 時遇到任何問題或需要檢舉協助，請透過以下管道聯繫我們：</p><ul><li>應用程式／網頁內支援：設定 → 支援 → 提交工單</li><li>客服信箱：<a href="mailto:support@lunotalk.com">support@lunotalk.com</a></li></ul>',
    deletionTitle: '帳號刪除說明與申請',
    deletionBody: '<p>您隨時可以申請永久刪除 LUNO 帳號與相關個人資料。</p><ol><li><strong>於 App 或網頁直接申請</strong>：登入 → 設定 → 帳號管理 → <em>刪除帳號</em>。</li><li><strong>無法登入時</strong>：請使用註冊信箱寄信至 <a href="mailto:support@lunotalk.com?subject=Account%20Deletion%20Request">support@lunotalk.com</a>。</li></ol><p>提交後將立即撤銷所有裝置工作階段，寬限期滿後將批次清除個人檔案、附件與加密金鑰備份（依法須保存之安全稽核紀錄除外）。</p>',
    fullDoc: '閱讀完整條文',
    backHome: '返回首頁',
  },
};

export function renderStorePageResponse(request, env, lang, slug, legalVersions = {}) {
  const url = new URL(request.url);
  const base = canonicalOriginFor(url, env);
  const core = resolveCoreUiLang(lang);
  const c = STORE_PAGE_COPY[core];
  const canonicalUrl = `${base}/${lang}/${slug}`;
  const alternates = [
    ...PRIMARY_LANDING_LANGS.map((l) => `<link rel="alternate" hreflang="${hreflangOf(l)}" href="${escapeHtml(`${base}/${l}/${slug}`)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${base}/en/${slug}`)}" />`,
  ].join('\n  ');

  const meta = slug === 'privacy'
    ? { title: c.privacyTitle, body: c.privacyBody, version: legalVersions.privacy || '', legalFile: core === 'ko' ? '/legal/privacy.html' : core === 'ja' ? '/legal/privacy.ja.html' : '/legal/privacy.en.html' }
    : slug === 'terms'
      ? { title: c.termsTitle, body: c.termsBody, version: legalVersions.terms || '', legalFile: core === 'ko' ? '/legal/terms.html' : core === 'ja' ? '/legal/terms.ja.html' : '/legal/terms.en.html' }
      : slug === 'support'
        ? { title: c.supportTitle, body: c.supportBody, version: '', legalFile: '' }
        : { title: c.deletionTitle, body: c.deletionBody, version: '', legalFile: '' };

  const langSwitcher = PRIMARY_LANDING_LANGS.map((code) => {
    const label = code === 'ko' ? '한국어' : code === 'en' ? 'English' : code === 'ja' ? '日本語' : '繁體中文';
    const active = code === lang ? ' aria-current="page" class="on"' : '';
    return `<a href="/${code}/${slug}"${active}>${label}</a>`;
  }).join(' ');

  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(meta.title)} — ${escapeHtml(c.brand)}</title>
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  ${alternates}
  <style>
    :root { color-scheme: light dark; }
    body { max-width: 780px; margin: 0 auto; padding: 32px 20px 64px; font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", sans-serif; line-height: 1.7; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-weight: 800; color: #058237; text-decoration: none; font-size: 18px; }
    .langs a { margin-left: 10px; text-decoration: none; color: #64748b; font-size: 13px; }
    .langs a.on { color: #058237; font-weight: 700; text-decoration: underline; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .ver { font-size: 12px; color: #64748b; margin-bottom: 20px; }
    a { color: #058237; }
    footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/${escapeHtml(lang)}/">LUNO</a>
    <nav class="langs" aria-label="Language">${langSwitcher}</nav>
  </header>
  <main>
    <h1>${escapeHtml(meta.title)}</h1>
    ${meta.version ? `<div class="ver">Version ${escapeHtml(meta.version)}</div>` : ''}
    ${meta.body}
    ${meta.legalFile ? `<p><a href="${escapeHtml(meta.legalFile)}">${escapeHtml(c.fullDoc)} →</a></p>` : ''}
  </main>
  <footer>
    <a href="/${escapeHtml(lang)}/">${escapeHtml(c.backHome)}</a>
    <a href="/${escapeHtml(lang)}/privacy">${escapeHtml(c.privacyTitle)}</a>
    <a href="/${escapeHtml(lang)}/terms">${escapeHtml(c.termsTitle)}</a>
    <a href="/${escapeHtml(lang)}/support">${escapeHtml(c.supportTitle)}</a>
    <a href="/${escapeHtml(lang)}/account-deletion">${escapeHtml(c.deletionTitle)}</a>
  </footer>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Language': lang,
      'Cache-Control': 'public, max-age=300',
    },
  });
}

// ---------- Main Edge routing entry (Section 3.5 + Subdomains + Deep Links) ----------

/**
 * Evaluates Edge-level routing rules before the main API/SPA handler runs.
 * Returns a `Response` when handled directly at the Edge, or `null` to pass
 * through to the downstream API / asset handler.
 */
export async function handleMessengerEdgeRouting(request, env = {}, helpers = {}) {
  const url = new URL(request.url);
  const { pathname, search } = url;
  const hostname = effectiveHostname(request);
  const method = request.method.toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  const { role, apexDomain } = classifyHost(hostname);

  // 0. www.{domain} -> 301 permanent consolidation to apex {domain}
  if (role === 'www' && apexDomain) {
    const target = `https://${apexDomain}${pathname}${search}`;
    return new Response(null, { status: 301, headers: { Location: target } });
  }

  // 1. OS app verification (.well-known/*): direct 200 OK JSON, NEVER redirect.
  if (pathname === '/.well-known/apple-app-site-association' && isRead) {
    return appleAppSiteAssociationResponse(env);
  }
  if (pathname === '/.well-known/assetlinks.json' && isRead) {
    return assetLinksResponse(env);
  }

  // 2. Crawler metadata (robots.txt, sitemap.xml, llms.txt): direct 200 OK.
  if (pathname === '/robots.txt' && isRead) return robotsTxtResponse(request, env);
  if (pathname === '/sitemap.xml' && isRead) return sitemapXmlResponse(request, env);
  if (pathname === '/llms.txt' && isRead) return llmsTxtResponse(request, env);

  // 3. Deep links (/invite/:code, /join/:code, /@:handle):
  //    NEVER redirect to /{lang}/...; render localized SSR fallback with OG + X-Robots-Tag: noindex, nofollow.
  if (isRead && role !== 'api' && role !== 'ws' && role !== 'cdn') {
    const inviteMatch = pathname.match(/^\/(?:invite|join)\/([A-Za-z0-9_-]{2,128})\/?$/);
    if (inviteMatch && role !== 'web') {
      const code = inviteMatch[1];
      const meta = typeof helpers.lookupInvite === 'function'
        ? await helpers.lookupInvite(code).catch(() => null)
        : null;
      return renderInviteDeepLinkResponse(request, env, code, meta);
    }
    const profileMatch = pathname.match(/^\/@([A-Za-z0-9_.]{2,40})\/?$/);
    if (profileMatch && role !== 'web') {
      const handle = profileMatch[1];
      const meta = typeof helpers.lookupProfile === 'function'
        ? await helpers.lookupProfile(handle).catch(() => null)
        : null;
      return renderProfileDeepLinkResponse(request, env, handle, meta);
    }
  }

  // 4. Strict whitelist bypass for remaining whitelisted prefixes & exact paths.
  if (WHITELIST_EXACT.has(pathname) || WHITELIST_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  // Subdomain hosts (web / api / ws / cdn) never undergo marketing /{lang} Geo-IP redirection.
  if (role === 'web' || role === 'api' || role === 'ws' || role === 'cdn') {
    return null;
  }

  if (!isRead) return null;

  // 5. Explicit /{lang} prefix handling:
  //    - Uppercase/mixed-case (e.g. /KO/, /EN/privacy) -> 301 lowercase normalization.
  //    - Valid lowercase /{lang} -> respected unconditionally (no Geo-IP/cookie override).
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (first && SUPPORTED_LANGS.has(first.toLowerCase())) {
    const lower = first.toLowerCase();
    if (first !== lower) {
      const rest = segments.slice(1).join('/');
      const trailing = pathname.endsWith('/') ? '/' : '';
      const normalized = rest ? `/${lower}/${rest}${trailing}${search}` : `/${lower}${trailing}${search}`;
      return new Response(null, { status: 301, headers: { Location: normalized } });
    }
    const sub = segments[1] ? segments[1].toLowerCase() : '';
    if (segments.length === 2 && SSR_STORE_PAGES.has(sub)) {
      return renderStorePageResponse(request, env, lower, sub, helpers.legalVersions || {});
    }
    // Valid /{lang} landing path (e.g. /ko, /ko/, /en/features, /ja/download) -> pass through to SPA.
    return null;
  }

  // 6. Bare root (/) or unprefixed marketing/store paths (/privacy, /terms, /support, /account-deletion, /features)
  //    -> 302 Found using cookie -> Geo-IP -> Accept-Language -> en, preserving subpath & query.
  if (GEO_REDIRECT_PATHS.has(pathname)) {
    const targetLang = resolveTargetLang(request, env);
    const location = pathname === '/'
      ? `/${targetLang}${search}`
      : `/${targetLang}${pathname}${search}`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: location,
        'Cache-Control': 'no-store',
        Vary: 'Cookie, Accept-Language, CF-IPCountry',
      },
    });
  }

  return null;
}

// ---------- API Accept-Language localization helper (Section 6.2) ----------

const API_ERROR_I18N = {
  unauthorized: { ko: '인증이 필요합니다', ja: '認証が必要です', 'zh-tw': '需要驗證', en: 'unauthorized' },
  forbidden: { ko: '접근 권한이 없습니다', ja: 'アクセス権限がありません', 'zh-tw': '沒有存取權限', en: 'forbidden' },
  'too many requests': { ko: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요', ja: 'リクエストが多すぎます', 'zh-tw': '請求過於頻繁，請稍後再試', en: 'too many requests' },
  'not found': { ko: '요청한 리소스를 찾을 수 없습니다', ja: '見つかりませんでした', 'zh-tw': '找不到資源', en: 'not found' },
};

export function resolveRequestLocale(request) {
  return matchAcceptLanguage(request.headers.get('Accept-Language')) || 'en';
}

export function localizeApiMessage(lang, rawError) {
  const key = String(rawError || '').toLowerCase().trim();
  const table = API_ERROR_I18N[key];
  if (!table) return rawError;
  return table[resolveCoreUiLang(lang)] || rawError;
}
