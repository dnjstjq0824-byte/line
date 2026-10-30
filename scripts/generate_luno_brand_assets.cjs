const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '..', 'assets', 'brand', 'luno'),
  path.join(__dirname, '..', 'apps', 'user-web', 'public', 'brand')
];

for (const d of dirs) {
  fs.mkdirSync(d, { recursive: true });
}

function saveAsset(filename, content) {
  for (const d of dirs) {
    fs.writeFileSync(path.join(d, filename), content.trim() + '\n', 'utf8');
  }
}

// ============================================================================
// CONCEPT A: LUNO Wordmark (Soft Rounded Geometric Letterforms)
// ============================================================================
const conceptALight = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" fill="none">
  <rect width="320" height="96" rx="24" fill="#F7FAFF"/>
  <g transform="translate(28, 22)">
    <!-- L -->
    <path d="M12 8V40C12 43.3137 14.6863 46 18 46H38" stroke="#315BCD" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- U -->
    <path d="M58 8V30C58 39.3888 65.6112 47 75 47C84.3888 47 92 39.3888 92 30V8" stroke="#4F7CFF" stroke-width="10" stroke-linecap="round"/>
    <!-- N -->
    <path d="M116 46V10C116 8.5 118 8 119 9.2L147 44.8C148 46 150 45.5 150 44V8" stroke="#315BCD" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- O with Mint Connection Node -->
    <circle cx="194" cy="27" r="19" stroke="#4F7CFF" stroke-width="10"/>
    <circle cx="209" cy="12" r="6" fill="#5EE6C2"/>
  </g>
  <text x="256" y="55" font-family="Inter, Pretendard, sans-serif" font-size="13" font-weight="600" fill="#5B6475">GLOBAL</text>
</svg>`;

const conceptADark = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" fill="none">
  <rect width="320" height="96" rx="24" fill="#0B1220"/>
  <g transform="translate(28, 22)">
    <path d="M12 8V40C12 43.3137 14.6863 46 18 46H38" stroke="#90B2FF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M58 8V30C58 39.3888 65.6112 47 75 47C84.3888 47 92 39.3888 92 30V8" stroke="#F7FAFF" stroke-width="10" stroke-linecap="round"/>
    <path d="M116 46V10C116 8.5 118 8 119 9.2L147 44.8C148 46 150 45.5 150 44V8" stroke="#90B2FF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="194" cy="27" r="19" stroke="#F7FAFF" stroke-width="10"/>
    <circle cx="209" cy="12" r="6" fill="#5EE6C2"/>
  </g>
  <text x="256" y="55" font-family="Inter, Pretendard, sans-serif" font-size="13" font-weight="600" fill="#B8C5DB">GLOBAL</text>
</svg>`;

const conceptAMono = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" fill="none">
  <rect width="320" height="96" rx="24" fill="#FFFFFF" stroke="#D9E1EC" stroke-width="2"/>
  <g transform="translate(28, 22)">
    <path d="M12 8V40C12 43.3137 14.6863 46 18 46H38" stroke="#14213D" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M58 8V30C58 39.3888 65.6112 47 75 47C84.3888 47 92 39.3888 92 30V8" stroke="#14213D" stroke-width="10" stroke-linecap="round"/>
    <path d="M116 46V10C116 8.5 118 8 119 9.2L147 44.8C148 46 150 45.5 150 44V8" stroke="#14213D" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="194" cy="27" r="19" stroke="#14213D" stroke-width="10"/>
    <circle cx="209" cy="12" r="6" fill="#14213D"/>
  </g>
</svg>`;

// ============================================================================
// CONCEPT B: LUNO Chat Symbol (Official Adopted Primary Concept)
// Soft Rounded Speech Bubble + Orbital Crescent Bridge
// ============================================================================
const conceptBLight = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" fill="none">
  <rect width="320" height="96" rx="24" fill="#F7FAFF"/>
  <!-- Symbol -->
  <g transform="translate(24, 16)">
    <rect width="64" height="64" rx="20" fill="#315BCD"/>
    <!-- Speech Bubble Body -->
    <path d="M16 30C16 20.6112 23.6112 13 33 13H35C44.3888 13 52 20.6112 52 30C52 39.3888 44.3888 47 35 47H26L17.5 52.5C16.5 53.1 15.3 52.2 15.6 51L17.2 43.5C16.4 41.2 16 38.7 16 36V30Z" fill="#FFFFFF"/>
    <!-- LUNO Crescent & Connection Nodes -->
    <path d="M26 27C26 32.5228 30.4772 37 36 37C39.2 37 42 35.5 43.8 33.2" stroke="#315BCD" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="27" cy="24" r="3" fill="#4F7CFF"/>
    <circle cx="42" cy="24" r="3.5" fill="#5EE6C2"/>
  </g>
  <!-- Wordmark -->
  <text x="106" y="54" font-family="Inter, Pretendard, sans-serif" font-size="34" font-weight="800" letter-spacing="-0.5" fill="#14213D">LUNO</text>
  <text x="108" y="74" font-family="Inter, Pretendard, sans-serif" font-size="12" font-weight="600" letter-spacing="0.4" fill="#5B6475">CONNECT BEYOND BORDERS</text>
</svg>`;

const conceptBDark = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" fill="none">
  <rect width="320" height="96" rx="24" fill="#0B1220"/>
  <g transform="translate(24, 16)">
    <rect width="64" height="64" rx="20" fill="#4F7CFF"/>
    <path d="M16 30C16 20.6112 23.6112 13 33 13H35C44.3888 13 52 20.6112 52 30C52 39.3888 44.3888 47 35 47H26L17.5 52.5C16.5 53.1 15.3 52.2 15.6 51L17.2 43.5C16.4 41.2 16 38.7 16 36V30Z" fill="#0B1220"/>
    <path d="M26 27C26 32.5228 30.4772 37 36 37C39.2 37 42 35.5 43.8 33.2" stroke="#90B2FF" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="27" cy="24" r="3" fill="#8EC5FF"/>
    <circle cx="42" cy="24" r="3.5" fill="#5EE6C2"/>
  </g>
  <text x="106" y="54" font-family="Inter, Pretendard, sans-serif" font-size="34" font-weight="800" letter-spacing="-0.5" fill="#F7FAFF">LUNO</text>
  <text x="108" y="74" font-family="Inter, Pretendard, sans-serif" font-size="12" font-weight="600" letter-spacing="0.4" fill="#B8C5DB">CONNECT BEYOND BORDERS</text>
</svg>`;

const conceptBMono = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" fill="none">
  <rect width="320" height="96" rx="24" fill="#FFFFFF" stroke="#D9E1EC" stroke-width="2"/>
  <g transform="translate(24, 16)">
    <rect width="64" height="64" rx="20" fill="#14213D"/>
    <path d="M16 30C16 20.6112 23.6112 13 33 13H35C44.3888 13 52 20.6112 52 30C52 39.3888 44.3888 47 35 47H26L17.5 52.5C16.5 53.1 15.3 52.2 15.6 51L17.2 43.5C16.4 41.2 16 38.7 16 36V30Z" fill="#FFFFFF"/>
    <path d="M26 27C26 32.5228 30.4772 37 36 37C39.2 37 42 35.5 43.8 33.2" stroke="#14213D" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="27" cy="24" r="3" fill="#14213D"/>
    <circle cx="42" cy="24" r="3.5" fill="#14213D"/>
  </g>
  <text x="106" y="54" font-family="Inter, Pretendard, sans-serif" font-size="34" font-weight="800" letter-spacing="-0.5" fill="#14213D">LUNO</text>
  <text x="108" y="74" font-family="Inter, Pretendard, sans-serif" font-size="12" font-weight="600" letter-spacing="0.4" fill="#5B6475">CONNECT BEYOND BORDERS</text>
</svg>`;

// ============================================================================
// CONCEPT C: LUNO Connection (Geometric Interlocking Bridge Nodes)
// ============================================================================
const conceptCLight = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" fill="none">
  <rect width="320" height="96" rx="24" fill="#F7FAFF"/>
  <g transform="translate(24, 16)">
    <rect width="64" height="64" rx="20" fill="#EAF1FF"/>
    <circle cx="24" cy="32" r="13" stroke="#315BCD" stroke-width="5"/>
    <circle cx="40" cy="32" r="13" stroke="#4F7CFF" stroke-width="5"/>
    <circle cx="32" cy="32" r="4.5" fill="#5EE6C2"/>
  </g>
  <text x="106" y="54" font-family="Inter, Pretendard, sans-serif" font-size="34" font-weight="800" fill="#14213D">LUNO</text>
  <text x="108" y="74" font-family="Inter, Pretendard, sans-serif" font-size="12" font-weight="600" fill="#5B6475">GLOBAL CONNECTION</text>
</svg>`;

const conceptCDark = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" fill="none">
  <rect width="320" height="96" rx="24" fill="#0B1220"/>
  <g transform="translate(24, 16)">
    <rect width="64" height="64" rx="20" fill="#101B2F"/>
    <circle cx="24" cy="32" r="13" stroke="#90B2FF" stroke-width="5"/>
    <circle cx="40" cy="32" r="13" stroke="#8EC5FF" stroke-width="5"/>
    <circle cx="32" cy="32" r="4.5" fill="#5EE6C2"/>
  </g>
  <text x="106" y="54" font-family="Inter, Pretendard, sans-serif" font-size="34" font-weight="800" fill="#F7FAFF">LUNO</text>
  <text x="108" y="74" font-family="Inter, Pretendard, sans-serif" font-size="12" font-weight="600" fill="#B8C5DB">GLOBAL CONNECTION</text>
</svg>`;

const conceptCMono = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" fill="none">
  <rect width="320" height="96" rx="24" fill="#FFFFFF" stroke="#D9E1EC" stroke-width="2"/>
  <g transform="translate(24, 16)">
    <rect width="64" height="64" rx="20" fill="#F7FAFF"/>
    <circle cx="24" cy="32" r="13" stroke="#14213D" stroke-width="5"/>
    <circle cx="40" cy="32" r="13" stroke="#14213D" stroke-width="5"/>
    <circle cx="32" cy="32" r="4.5" fill="#14213D"/>
  </g>
  <text x="106" y="54" font-family="Inter, Pretendard, sans-serif" font-size="34" font-weight="800" fill="#14213D">LUNO</text>
</svg>`;

// ============================================================================
// STANDALONE ASSETS (Symbol, App Icon, Adaptive Icon, Splash, Favicon, OG)
// ============================================================================
const lunoSymbol = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="20" fill="#315BCD"/>
  <path d="M15 29C15 19.6112 22.6112 12 32 12H34C43.3888 12 51 19.6112 51 29C51 38.3888 43.3888 46 34 46H25L16.5 51.5C15.5 52.1 14.3 51.2 14.6 50L16.2 42.5C15.4 40.2 15 37.7 15 35V29Z" fill="#FFFFFF"/>
  <path d="M25 26C25 31.5228 29.4772 36 35 36C38.2 36 41 34.5 42.8 32.2" stroke="#315BCD" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="26" cy="23" r="3" fill="#4F7CFF"/>
  <circle cx="41" cy="23" r="3.5" fill="#5EE6C2"/>
</svg>`;

const lunoWordmark = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 64" fill="none">
  <g transform="translate(0, 0)">
    <rect width="64" height="64" rx="18" fill="#315BCD"/>
    <path d="M15 29C15 19.6112 22.6112 12 32 12H34C43.3888 12 51 19.6112 51 29C51 38.3888 43.3888 46 34 46H25L16.5 51.5C15.5 52.1 14.3 51.2 14.6 50L16.2 42.5C15.4 40.2 15 37.7 15 35V29Z" fill="#FFFFFF"/>
    <path d="M25 26C25 31.5228 29.4772 36 35 36C38.2 36 41 34.5 42.8 32.2" stroke="#315BCD" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="26" cy="23" r="3" fill="#4F7CFF"/>
    <circle cx="41" cy="23" r="3.5" fill="#5EE6C2"/>
  </g>
  <text x="80" y="44" font-family="Inter, Pretendard, sans-serif" font-size="36" font-weight="800" letter-spacing="-0.6" fill="#14213D">LUNO</text>
</svg>`;

const lunoSplash = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" fill="none">
  <rect width="1080" height="1920" fill="#F7FAFF"/>
  <circle cx="540" cy="860" r="240" fill="#EAF1FF"/>
  <g transform="translate(444, 764) scale(3)">
    <rect width="64" height="64" rx="20" fill="#315BCD"/>
    <path d="M15 29C15 19.6112 22.6112 12 32 12H34C43.3888 12 51 19.6112 51 29C51 38.3888 43.3888 46 34 46H25L16.5 51.5C15.5 52.1 14.3 51.2 14.6 50L16.2 42.5C15.4 40.2 15 37.7 15 35V29Z" fill="#FFFFFF"/>
    <path d="M25 26C25 31.5228 29.4772 36 35 36C38.2 36 41 34.5 42.8 32.2" stroke="#315BCD" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="26" cy="23" r="3" fill="#4F7CFF"/>
    <circle cx="41" cy="23" r="3.5" fill="#5EE6C2"/>
  </g>
  <text x="540" y="1180" text-anchor="middle" font-family="Inter, Pretendard, sans-serif" font-size="64" font-weight="800" fill="#14213D">LUNO</text>
  <text x="540" y="1240" text-anchor="middle" font-family="Inter, Pretendard, sans-serif" font-size="26" font-weight="600" letter-spacing="2" fill="#5B6475">CONNECT BEYOND BORDERS</text>
</svg>`;

const lunoOgShare = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" fill="none">
  <rect width="1200" height="630" fill="#F7FAFF"/>
  <circle cx="1050" cy="120" r="260" fill="#EAF1FF"/>
  <circle cx="140" cy="540" r="200" fill="#EAF1FF"/>
  <g transform="translate(120, 200) scale(2.2)">
    <rect width="64" height="64" rx="20" fill="#315BCD"/>
    <path d="M15 29C15 19.6112 22.6112 12 32 12H34C43.3888 12 51 19.6112 51 29C51 38.3888 43.3888 46 34 46H25L16.5 51.5C15.5 52.1 14.3 51.2 14.6 50L16.2 42.5C15.4 40.2 15 37.7 15 35V29Z" fill="#FFFFFF"/>
    <path d="M25 26C25 31.5228 29.4772 36 35 36C38.2 36 41 34.5 42.8 32.2" stroke="#315BCD" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="26" cy="23" r="3" fill="#4F7CFF"/>
    <circle cx="41" cy="23" r="3.5" fill="#5EE6C2"/>
  </g>
  <text x="300" y="290" font-family="Inter, Pretendard, sans-serif" font-size="84" font-weight="800" fill="#14213D">LUNO</text>
  <text x="304" y="350" font-family="Inter, Pretendard, sans-serif" font-size="32" font-weight="600" fill="#315BCD">Connect Beyond Borders</text>
  <text x="304" y="405" font-family="Inter, Pretendard, sans-serif" font-size="24" font-weight="500" fill="#5B6475">Global Messenger &amp; Real-Time AI Translation Platform</text>
</svg>`;

const lunoPattern = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" fill="none">
  <circle cx="30" cy="30" r="3" fill="#4F7CFF" fill-opacity="0.12"/>
  <circle cx="90" cy="30" r="2" fill="#315BCD" fill-opacity="0.1"/>
  <circle cx="60" cy="60" r="4" fill="#5EE6C2" fill-opacity="0.15"/>
  <circle cx="30" cy="90" r="2" fill="#315BCD" fill-opacity="0.1"/>
  <circle cx="90" cy="90" r="3" fill="#4F7CFF" fill-opacity="0.12"/>
  <path d="M30 30L60 60L90 30" stroke="#4F7CFF" stroke-opacity="0.08" stroke-width="1.5"/>
</svg>`;

saveAsset('concept-a-wordmark-light.svg', conceptALight);
saveAsset('concept-a-wordmark-dark.svg', conceptADark);
saveAsset('concept-a-wordmark-mono.svg', conceptAMono);

saveAsset('concept-b-chat-symbol-light.svg', conceptBLight);
saveAsset('concept-b-chat-symbol-dark.svg', conceptBDark);
saveAsset('concept-b-chat-symbol-mono.svg', conceptBMono);

saveAsset('concept-c-connection-light.svg', conceptCLight);
saveAsset('concept-c-connection-dark.svg', conceptCDark);
saveAsset('concept-c-connection-mono.svg', conceptCMono);

saveAsset('luno-symbol.svg', lunoSymbol);
saveAsset('luno-wordmark.svg', lunoWordmark);
saveAsset('luno-app-icon.svg', lunoSymbol);
saveAsset('luno-ios-icon.svg', lunoSymbol);
saveAsset('luno-adaptive-foreground.svg', lunoSymbol);
saveAsset('luno-adaptive-background.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" fill="#315BCD"/></svg>');
saveAsset('luno-favicon.svg', lunoSymbol);
saveAsset('luno-sns-profile.svg', lunoSymbol);
saveAsset('luno-web-logo.svg', lunoWordmark);
saveAsset('luno-splash.svg', lunoSplash);
saveAsset('luno-og-share.svg', lunoOgShare);
saveAsset('luno-pattern.svg', lunoPattern);

console.log('Generated all 21 official LUNO SVG brand assets.');

