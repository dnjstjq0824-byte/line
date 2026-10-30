// Official LINE Friends High-Fidelity Vector Sticker Collection
// Characters: Brown (곰 브라운), Cony (토끼 코니), Sally (오리 샐리)

export interface LineSticker {
  id: string;
  name: string;
  character: 'Brown' | 'Cony' | 'Sally';
  svg: string;
}

export const LINE_STICKERS: LineSticker[] = [
  // --- BROWN STICKERS ---
  {
    id: 'brown_hello',
    name: '브라운 안녕',
    character: 'Brown',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="28" r="16" fill="#784421"/>
      <circle cx="28" cy="28" r="9" fill="#5c3418"/>
      <circle cx="72" cy="28" r="16" fill="#784421"/>
      <circle cx="72" cy="28" r="9" fill="#5c3418"/>
      <circle cx="50" cy="54" r="38" fill="#8c5028"/>
      <ellipse cx="50" cy="62" rx="15" ry="11" fill="#fff" opacity="0.9"/>
      <circle cx="50" cy="58" r="3.5" fill="#222"/>
      <path d="M50 61.5v6M46 70c2-1.5 6-1.5 8 0" stroke="#222" stroke-width="2.2" stroke-linecap="round" fill="none"/>
      <circle cx="37" cy="50" r="3" fill="#111"/>
      <circle cx="63" cy="50" r="3" fill="#111"/>
      <!-- Waving Hand -->
      <g transform="translate(76, 45) rotate(-20)">
        <ellipse cx="8" cy="12" rx="7" ry="11" fill="#8c5028"/>
        <path d="M3 2c3-4 8-3 10 1" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>
      </g>
    </svg>`
  },
  {
    id: 'brown_heart',
    name: '브라운 하트',
    character: 'Brown',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="26" r="15" fill="#784421"/>
      <circle cx="72" cy="26" r="15" fill="#784421"/>
      <circle cx="50" cy="52" r="36" fill="#8c5028"/>
      <ellipse cx="50" cy="59" rx="14" ry="10" fill="#fff" opacity="0.9"/>
      <circle cx="50" cy="56" r="3" fill="#222"/>
      <path d="M50 59v5M47 66c2-1 4-1 6 0" stroke="#222" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="38" cy="48" r="3" fill="#111"/>
      <circle cx="62" cy="48" r="3" fill="#111"/>
      <!-- Big Red Heart -->
      <path d="M72 58 C72 48, 88 48, 88 60 C88 74, 72 84, 72 84 C72 84, 56 74, 56 60 C56 48, 72 48, 72 58 Z" fill="#ff334b"/>
      <circle cx="65" cy="56" r="2" fill="#fff" opacity="0.6"/>
    </svg>`
  },
  {
    id: 'brown_thumbsup',
    name: '브라운 따봉',
    character: 'Brown',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="28" r="16" fill="#784421"/>
      <circle cx="72" cy="28" r="16" fill="#784421"/>
      <circle cx="50" cy="52" r="36" fill="#8c5028"/>
      <ellipse cx="50" cy="59" rx="14" ry="10" fill="#fff" opacity="0.9"/>
      <circle cx="50" cy="56" r="3.2" fill="#222"/>
      <path d="M50 59v5M47 66c2-1 4-1 6 0" stroke="#222" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="38" cy="48" r="3" fill="#111"/>
      <circle cx="62" cy="48" r="3" fill="#111"/>
      <!-- Thumbs Up Glove -->
      <g transform="translate(14, 56)">
        <ellipse cx="12" cy="14" rx="10" ry="12" fill="#ffcc00"/>
        <rect x="7" y="2" width="7" height="12" rx="3.5" fill="#ffcc00"/>
        <path d="M10 6v5" stroke="#cc9900" stroke-width="1.5" stroke-linecap="round"/>
        <text x="12" y="32" font-size="10" font-weight="bold" fill="#06C755" text-anchor="middle">GOOD!</text>
      </g>
    </svg>`
  },
  {
    id: 'brown_cry',
    name: '브라운 눈물',
    character: 'Brown',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="28" r="16" fill="#784421"/>
      <circle cx="72" cy="28" r="16" fill="#784421"/>
      <circle cx="50" cy="52" r="36" fill="#8c5028"/>
      <ellipse cx="50" cy="62" rx="14" ry="10" fill="#fff" opacity="0.9"/>
      <circle cx="50" cy="59" r="3" fill="#222"/>
      <path d="M47 68c2-2 4-2 6 0" stroke="#222" stroke-width="2" stroke-linecap="round" fill="none"/>
      <!-- Sad eyes -->
      <path d="M34 50c3-2 6-1 8 0M58 50c2-1 5-2 8 0" stroke="#111" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <!-- Tears stream -->
      <path d="M37 54 C35 66, 32 78, 30 86" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M63 54 C65 66, 68 78, 70 86" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" fill="none"/>
    </svg>`
  },

  // --- CONY STICKERS ---
  {
    id: 'cony_happy',
    name: '코니 신남',
    character: 'Cony',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <!-- Ears -->
      <ellipse cx="36" cy="24" rx="9" ry="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <ellipse cx="36" cy="25" rx="5" ry="17" fill="#fca5a5"/>
      <ellipse cx="64" cy="24" rx="9" ry="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <ellipse cx="64" cy="25" rx="5" ry="17" fill="#fca5a5"/>
      <!-- Head -->
      <circle cx="50" cy="58" r="34" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <!-- Blushing Cheeks -->
      <circle cx="30" cy="64" r="6" fill="#f43f5e" opacity="0.4"/>
      <circle cx="70" cy="64" r="6" fill="#f43f5e" opacity="0.4"/>
      <!-- Happy Arch Eyes -->
      <path d="M33 54c4-4 8-4 12 0M55 54c4-4 8-4 12 0" stroke="#1e293b" stroke-width="3" stroke-linecap="round" fill="none"/>
      <!-- Nose & Mouth -->
      <circle cx="50" cy="60" r="2.5" fill="#f43f5e"/>
      <path d="M46 66c2 4 6 4 8 0" stroke="#1e293b" stroke-width="2" stroke-linecap="round" fill="#f43f5e"/>
      <!-- Sparkles -->
      <path d="M18 42l2 4 4 2-4 2-2 4-2-4-4-2 4-2zM82 42l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill="#facc15"/>
    </svg>`
  },
  {
    id: 'cony_love',
    name: '코니 하트뿅',
    character: 'Cony',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="36" cy="24" rx="9" ry="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <ellipse cx="36" cy="25" rx="5" ry="17" fill="#fca5a5"/>
      <ellipse cx="64" cy="24" rx="9" ry="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <ellipse cx="64" cy="25" rx="5" ry="17" fill="#fca5a5"/>
      <circle cx="50" cy="58" r="34" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <circle cx="28" cy="64" r="7" fill="#f43f5e" opacity="0.5"/>
      <circle cx="72" cy="64" r="7" fill="#f43f5e" opacity="0.5"/>
      <!-- Heart Eyes -->
      <path d="M39 52 C39 46, 46 46, 46 52 C46 58, 39 63, 39 63 C39 63, 32 58, 32 52 C32 46, 39 46, 39 52 Z" fill="#e11d48"/>
      <path d="M61 52 C61 46, 68 46, 68 52 C68 58, 61 63, 61 63 C61 63, 54 58, 54 52 C54 46, 61 46, 61 52 Z" fill="#e11d48"/>
      <!-- Kiss Mouth -->
      <path d="M47 67c3 2 5 2 6 0" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>`
  },
  {
    id: 'cony_cheer',
    name: '코니 파이팅',
    character: 'Cony',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="36" cy="24" rx="9" ry="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <ellipse cx="36" cy="25" rx="5" ry="17" fill="#fca5a5"/>
      <ellipse cx="64" cy="24" rx="9" ry="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <ellipse cx="64" cy="25" rx="5" ry="17" fill="#fca5a5"/>
      <circle cx="50" cy="58" r="34" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <!-- Red Headband -->
      <path d="M18 52 C35 44, 65 44, 82 52" stroke="#dc2626" stroke-width="5" stroke-linecap="round" fill="none"/>
      <!-- Determined Eyes -->
      <circle cx="38" cy="58" r="3" fill="#111"/>
      <circle cx="62" cy="58" r="3" fill="#111"/>
      <path d="M34 52l7 3M66 52l-7 3" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M46 68h8" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
      <text x="50" y="94" font-size="12" font-weight="900" fill="#dc2626" text-anchor="middle">FIGHTING!</text>
    </svg>`
  },
  {
    id: 'cony_angry',
    name: '코니 분노',
    character: 'Cony',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="32" cy="24" rx="9" ry="24" fill="#fee2e2" stroke="#f87171" stroke-width="1.5"/>
      <ellipse cx="68" cy="24" rx="9" ry="24" fill="#fee2e2" stroke="#f87171" stroke-width="1.5"/>
      <circle cx="50" cy="58" r="34" fill="#fee2e2" stroke="#f87171" stroke-width="1.5"/>
      <!-- Anger mark -->
      <path d="M68 38l6 6M74 38l-6 6M65 41h12M71 35v12" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Angry Eyes -->
      <path d="M32 54l10 5M68 54l-10 5" stroke="#991b1b" stroke-width="3" stroke-linecap="round"/>
      <circle cx="39" cy="62" r="3" fill="#991b1b"/>
      <circle cx="61" cy="62" r="3" fill="#991b1b"/>
      <!-- Open Grr Mouth -->
      <path d="M44 71c3-4 9-4 12 0z" fill="#991b1b"/>
    </svg>`
  },

  // --- SALLY STICKERS ---
  {
    id: 'sally_wink',
    name: '샐리 윙크',
    character: 'Sally',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <!-- Body -->
      <circle cx="50" cy="54" r="36" fill="#facc15"/>
      <!-- Left Eye Open -->
      <circle cx="37" cy="48" r="3.5" fill="#1e293b"/>
      <!-- Right Eye Wink -->
      <path d="M58 48c4-3 8-3 12 0" stroke="#1e293b" stroke-width="3" stroke-linecap="round" fill="none"/>
      <!-- Orange Beak -->
      <ellipse cx="50" cy="58" rx="14" ry="8" fill="#ea580c"/>
      <line x1="40" y1="58" x2="60" y2="58" stroke="#9a3412" stroke-width="1.5"/>
      <!-- Feet -->
      <ellipse cx="38" cy="88" rx="7" ry="3" fill="#ea580c"/>
      <ellipse cx="62" cy="88" rx="7" ry="3" fill="#ea580c"/>
    </svg>`
  },
  {
    id: 'sally_yay',
    name: '샐리 만세',
    character: 'Sally',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="54" r="36" fill="#facc15"/>
      <circle cx="36" cy="46" r="3.5" fill="#1e293b"/>
      <circle cx="64" cy="46" r="3.5" fill="#1e293b"/>
      <!-- Open Beak -->
      <ellipse cx="50" cy="57" rx="14" ry="10" fill="#ea580c"/>
      <ellipse cx="50" cy="59" rx="8" ry="5" fill="#7c2d12"/>
      <!-- Wings Raised -->
      <ellipse cx="14" cy="44" rx="7" ry="12" fill="#eab308" transform="rotate(-30 14 44)"/>
      <ellipse cx="86" cy="44" rx="7" ry="12" fill="#eab308" transform="rotate(30 86 44)"/>
      <!-- Cheeks -->
      <circle cx="28" cy="56" r="5" fill="#f97316" opacity="0.5"/>
      <circle cx="72" cy="56" r="5" fill="#f97316" opacity="0.5"/>
    </svg>`
  },
  {
    id: 'sally_question',
    name: '샐리 갸우뚱',
    character: 'Sally',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(12 50 54)">
        <circle cx="50" cy="54" r="36" fill="#facc15"/>
        <circle cx="37" cy="47" r="3.5" fill="#1e293b"/>
        <circle cx="63" cy="47" r="3.5" fill="#1e293b"/>
        <ellipse cx="50" cy="57" rx="13" ry="8" fill="#ea580c"/>
        <line x1="41" y1="57" x2="59" y2="57" stroke="#9a3412" stroke-width="1.5"/>
      </g>
      <!-- Question Mark -->
      <text x="80" y="36" font-size="28" font-weight="bold" fill="#0284c7">?</text>
    </svg>`
  },
  {
    id: 'sally_love',
    name: '샐리 사랑',
    character: 'Sally',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="54" r="36" fill="#facc15"/>
      <circle cx="36" cy="48" r="3" fill="#1e293b"/>
      <circle cx="64" cy="48" r="3" fill="#1e293b"/>
      <ellipse cx="50" cy="58" rx="14" ry="8" fill="#ea580c"/>
      <!-- Cheeks -->
      <circle cx="27" cy="56" r="5" fill="#f43f5e" opacity="0.6"/>
      <circle cx="73" cy="56" r="5" fill="#f43f5e" opacity="0.6"/>
      <!-- Hearts around -->
      <path d="M22 28 C22 23, 27 23, 27 28 C27 34, 22 38, 22 38 C22 38, 17 34, 17 28 C17 23, 22 23, 22 28 Z" fill="#ef4444"/>
      <path d="M78 26 C78 21, 83 21, 83 26 C83 32, 78 36, 78 36 C78 36, 73 32, 73 26 C73 21, 78 21, 78 26 Z" fill="#ef4444"/>
    </svg>`
  }
];
