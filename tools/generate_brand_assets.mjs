// Generates unified LINE-Green LUNO brand SVGs and raster PNGs (Web, PWA, OG, Flutter, Android).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WEB_BRAND = path.join(ROOT, 'apps/user-web/public/brand');
const SHARED_BRAND = path.join(ROOT, 'apps/shared/brand');
const FLUTTER_BRAND = path.join(ROOT, 'mobile/flutter_app/assets/brand');
const ANDROID_RES = path.join(ROOT, 'mobile/flutter_app/android/app/src/main/res');

// Core LUNO mark geometry (512x512 canvas):
// A clean, modern rounded speech bubble (pure white) with an organic chat tail
// and a crisp geometric rounded "L" + accent chat dot in LUNO Green inside.
function speechBubbleGlyph(scale = 1, tx = 0, ty = 0) {
  return `
  <g transform="translate(${tx} ${ty}) scale(${scale})">
    <!-- Pure white rounded speech bubble with smooth bottom-left tail -->
    <path
      d="M256 102
         C156 102 82 167 82 248
         C82 292 104 331 139 357
         C137 379 128 399 114 414
         C109 419 113 427 120 426
         C153 422 184 409 205 391
         C221 395 238 397 256 397
         C356 397 430 331 430 248
         C430 167 356 102 256 102 Z"
      fill="#FFFFFF"
    />
    <!-- Clean geometric L monogram inside bubble -->
    <path
      d="M196 186
         C196 174 206 164 218 164
         C230 164 240 174 240 186
         V284
         H306
         C318 284 328 294 328 306
         C328 318 318 328 306 328
         H218
         C206 328 196 318 196 306
         V186 Z"
      fill="#059B42"
    />
    <!-- Vibrant mint-green spark dot (represents live global messaging) -->
    <circle cx="308" cy="206" r="22" fill="#07D45D" />
  </g>`;
}

function appIconSvg({ rounded = true, maskable = false, idPrefix = 'luno' } = {}) {
  const rx = rounded ? 116 : 0;
  const glyph = maskable ? speechBubbleGlyph(0.76, 61.44, 61.44) : speechBubbleGlyph(0.92, 20.48, 20.48);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="${idPrefix}Bg" x1="56" y1="32" x2="456" y2="480" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#08DC61"/>
      <stop offset="52%" stop-color="#06C755"/>
      <stop offset="100%" stop-color="#049B41"/>
    </linearGradient>
    <radialGradient id="${idPrefix}Gloss" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(148 96) rotate(48) scale(360 280)">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#${idPrefix}Bg)"/>
  <rect width="512" height="512" rx="${rx}" fill="url(#${idPrefix}Gloss)"/>
  ${glyph}
</svg>
`;
}

// Crisp geometric "LUNO" wordmark paths (height ~74, baseline y=112, x starts at 176)
function wordmarkPaths(ink = '#111827', tx = 0, ty = 0, scale = 1) {
  return `
  <g transform="translate(${tx} ${ty}) scale(${scale})" fill="${ink}">
    <!-- L -->
    <path d="M0 10 C0 4.5 4.5 0 10 0 H14 C19.5 0 24 4.5 24 10 V76 H58 C63.5 76 68 80.5 68 86 V88 C68 93.5 63.5 98 58 98 H10 C4.5 98 0 93.5 0 88 V10 Z"/>
    <!-- U -->
    <path d="M84 10 C84 4.5 88.5 0 94 0 H98 C103.5 0 108 4.5 108 10 V56 C108 70.5 117 78 130 78 C143 78 152 70.5 152 56 V10 C152 4.5 156.5 0 162 0 H166 C171.5 0 176 4.5 176 10 V57 C176 84 157.5 100 130 100 C102.5 100 84 84 84 57 V10 Z"/>
    <!-- N -->
    <path d="M198 10 C198 4.5 202.5 0 208 0 H214.5 C218.5 0 222.2 2.1 224.3 5.5 L268 72 V10 C268 4.5 272.5 0 278 0 H282 C287.5 0 292 4.5 292 10 V88 C292 93.5 287.5 98 282 98 H275.5 C271.5 98 267.8 95.9 265.7 92.5 L222 26 V88 C222 93.5 217.5 98 212 98 H208 C202.5 98 198 93.5 198 88 V10 Z"/>
    <!-- O -->
    <path fill-rule="evenodd" d="M362 0 C392 0 414 21 414 50 C414 79 392 100 362 100 C332 100 310 79 310 50 C310 21 332 0 362 0 Z M362 22 C345 22 334 33.8 334 50 C334 66.2 345 78 362 78 C379 78 390 66.2 390 50 C390 33.8 379 22 362 22 Z"/>
  </g>`;
}

function horizontalLogoSvg({ ink = '#111827', width = 560, height = 160 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 560 160" fill="none">
  <defs>
    <linearGradient id="lhBg" x1="16" y1="8" x2="132" y2="148" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#08DC61"/>
      <stop offset="55%" stop-color="#06C755"/>
      <stop offset="100%" stop-color="#049B41"/>
    </linearGradient>
    <radialGradient id="lhGloss" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(46 32) rotate(48) scale(110 85)">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="8" y="14" width="132" height="132" rx="34" fill="url(#lhBg)"/>
  <rect x="8" y="14" width="132" height="132" rx="34" fill="url(#lhGloss)"/>
  <g transform="translate(8 14) scale(0.2578125)">
    ${speechBubbleGlyph(0.92, 20.48, 20.48)}
  </g>
  ${wordmarkPaths(ink, 170, 38, 0.86)}
</svg>
`;
}

function wordmarkOnlySvg(ink = '#111827') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="120" viewBox="0 0 440 120" fill="none">
  ${wordmarkPaths(ink, 13, 10, 1)}
</svg>
`;
}

function adaptiveForegroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  ${speechBubbleGlyph(0.66, 87.04, 87.04)}
</svg>
`;
}

function adaptiveBackgroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="abg" x1="40" y1="20" x2="472" y2="492" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#08DC61"/>
      <stop offset="55%" stop-color="#06C755"/>
      <stop offset="100%" stop-color="#049B41"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#abg)"/>
</svg>
`;
}

function ogShareSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
  <defs>
    <linearGradient id="ogBg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#06C755"/>
      <stop offset="60%" stop-color="#05A447"/>
      <stop offset="100%" stop-color="#047E37"/>
    </linearGradient>
    <radialGradient id="ogGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(260 140) rotate(35) scale(640 420)">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogBg)"/>
  <rect width="1200" height="630" fill="url(#ogGlow)"/>
  <circle cx="1060" cy="110" r="220" fill="#FFFFFF" fill-opacity="0.06"/>
  <circle cx="140" cy="560" r="190" fill="#000000" fill-opacity="0.07"/>
  <!-- Centered badge + wordmark -->
  <g transform="translate(116 184)">
    <rect width="210" height="210" rx="54" fill="#FFFFFF" fill-opacity="0.16" stroke="#FFFFFF" stroke-opacity="0.32" stroke-width="2"/>
    <g transform="scale(0.41015625)">
      ${speechBubbleGlyph(0.92, 20.48, 20.48)}
    </g>
    ${wordmarkPaths('#FFFFFF', 258, 34, 1.18)}
    <text x="260" y="196" fill="#FFFFFF" fill-opacity="0.92" font-family="Inter, Segoe UI, Noto Sans KR, sans-serif" font-size="32" font-weight="600" letter-spacing="-0.3">Global Messenger · Chat, Calls &amp; Live Translation</text>
  </g>
  <text x="116" y="546" fill="#FFFFFF" fill-opacity="0.72" font-family="Inter, Segoe UI, sans-serif" font-size="24" font-weight="600">lunotalk.com</text>
</svg>
`;
}

function splashSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" fill="none">
  <rect width="1080" height="1920" fill="#FFFFFF"/>
  <g transform="translate(360 720) scale(0.703125)">
    ${appIconSvg({ rounded: true, idPrefix: 'sp' }).replace(/<svg[^>]*>|<\/svg>/g, '')}
  </g>
  ${wordmarkPaths('#111827', 376, 1130, 0.8)}
</svg>
`;
}

async function renderSvgToPng(page, svg, width, height, outPath, transparent = true) {
  await page.setViewportSize({ width, height });
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${transparent ? 'transparent' : '#ffffff'};overflow:hidden;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;">${svg.replace(/<svg /, `<svg style="width:${width}px;height:${height}px;display:block;" `)}</body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outPath, omitBackground: transparent });
}

async function main() {
  await mkdir(WEB_BRAND, { recursive: true });
  await mkdir(SHARED_BRAND, { recursive: true });
  await mkdir(FLUTTER_BRAND, { recursive: true });

  const roundedIcon = appIconSvg({ rounded: true, maskable: false, idPrefix: 'li' });
  const fullBleedIcon = appIconSvg({ rounded: false, maskable: false, idPrefix: 'lf' });
  const maskableIcon = appIconSvg({ rounded: false, maskable: true, idPrefix: 'lm' });
  const horizontal = horizontalLogoSvg({ ink: '#111827' });
  const wordmark = wordmarkOnlySvg('#111827');
  const adaptiveFg = adaptiveForegroundSvg();
  const adaptiveBg = adaptiveBackgroundSvg();
  const ogSvg = ogShareSvg();

  // 1. Write all SVG brand files
  const svgTargets = [
    [path.join(SHARED_BRAND, 'luno-logo-appicon.svg'), roundedIcon],
    [path.join(SHARED_BRAND, 'luno-logo-horizontal.svg'), horizontal],
    [path.join(WEB_BRAND, 'luno-symbol.svg'), roundedIcon],
    [path.join(WEB_BRAND, 'luno-favicon.svg'), roundedIcon],
    [path.join(WEB_BRAND, 'luno-app-icon.svg'), roundedIcon],
    [path.join(WEB_BRAND, 'luno-ios-icon.svg'), fullBleedIcon],
    [path.join(WEB_BRAND, 'luno-web-logo.svg'), horizontal],
    [path.join(WEB_BRAND, 'luno-wordmark.svg'), wordmark],
    [path.join(WEB_BRAND, 'luno-adaptive-foreground.svg'), adaptiveFg],
    [path.join(WEB_BRAND, 'luno-adaptive-background.svg'), adaptiveBg],
    [path.join(WEB_BRAND, 'luno-og-share.svg'), ogSvg],
    [path.join(WEB_BRAND, 'luno-sns-profile.svg'), fullBleedIcon],
    [path.join(WEB_BRAND, 'luno-splash.svg'), splashSvg()],
    [path.join(WEB_BRAND, 'open-messenger-favicon.svg'), roundedIcon],
    [path.join(WEB_BRAND, 'open-messenger-icon.svg'), roundedIcon],
    [path.join(WEB_BRAND, 'open-messenger-logo.svg'), horizontal],
  ];
  for (const [p, content] of svgTargets) {
    await writeFile(p, content, 'utf8');
  }

  // 2. Render crisp PNGs with Chromium via Playwright
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await renderSvgToPng(page, roundedIcon, 192, 192, path.join(WEB_BRAND, 'luno-icon-192.png'), true);
    await renderSvgToPng(page, roundedIcon, 512, 512, path.join(WEB_BRAND, 'luno-icon-512.png'), true);
    await renderSvgToPng(page, maskableIcon, 512, 512, path.join(WEB_BRAND, 'luno-icon-maskable-512.png'), false);
    await renderSvgToPng(page, ogSvg, 1200, 630, path.join(WEB_BRAND, 'luno-og-share.png'), false);
    await renderSvgToPng(page, horizontal, 560, 160, path.join(FLUTTER_BRAND, 'luno-logo-horizontal-512.png'), true);

    // Android legacy mipmap icons (rounded squircle with transparent outer corners)
    const androidDensities = [
      ['mipmap-mdpi', 48],
      ['mipmap-hdpi', 72],
      ['mipmap-xhdpi', 96],
      ['mipmap-xxhdpi', 144],
      ['mipmap-xxxhdpi', 192],
    ];
    for (const [folder, sz] of androidDensities) {
      const dir = path.join(ANDROID_RES, folder);
      await mkdir(dir, { recursive: true });
      await renderSvgToPng(page, roundedIcon, sz, sz, path.join(dir, 'ic_launcher.png'), true);
    }

    // Android adaptive icon foreground PNGs (108dp per density) for crisp rendering across all Android 8+ launchers
    const adaptiveDensities = [
      ['drawable-mdpi', 108],
      ['drawable-hdpi', 162],
      ['drawable-xhdpi', 216],
      ['drawable-xxhdpi', 324],
      ['drawable-xxxhdpi', 432],
    ];
    for (const [folder, sz] of adaptiveDensities) {
      const dir = path.join(ANDROID_RES, folder);
      await mkdir(dir, { recursive: true });
      await renderSvgToPng(page, adaptiveFg, sz, sz, path.join(dir, 'ic_launcher_foreground.png'), true);
    }
  } finally {
    await browser.close();
  }

  // 3. Android Adaptive Icon XMLs (API 26+)
  const anydpi = path.join(ANDROID_RES, 'mipmap-anydpi-v26');
  await mkdir(anydpi, { recursive: true });
  await writeFile(
    path.join(anydpi, 'ic_launcher.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
`,
    'utf8'
  );
  await writeFile(
    path.join(ANDROID_RES, 'drawable/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient
        android:angle="315"
        android:startColor="#08DC61"
        android:centerColor="#06C755"
        android:endColor="#049B41"
        android:type="linear" />
</shape>
`,
    'utf8'
  );

  console.log('Brand assets generated successfully.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
