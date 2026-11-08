// ============================================================================
// LUNO ORIGINAL BRAND STICKER COLLECTION — "LUNO ORBIT CREW"
// 100% Original LUNO Brand Characters: Lumi (루미), Nori (노리), Poko (포코)
// Zero third-party copyrighted assets (Article 2 Compliance)
// ============================================================================

export interface LunoSticker {
  id: string;
  name: string;
  character: 'Lumi' | 'Nori' | 'Poko';
  svg: string;
}

// Legacy sticker aliases were removed in the LUNO rename; import the
// LUNO_STICKERS list and LunoSticker type directly.

export const LUNO_STICKERS: LunoSticker[] = [
  // --- LUMI (루미 — LUNO Blue Celestial Mascot) ---
  {
    id: 'lumi_hello',
    name: 'Lumi Hello',
    character: 'Lumi',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="52" r="36" fill="#4F7CFF"/>
      <circle cx="32" cy="24" r="10" fill="#315BCD"/>
      <circle cx="68" cy="24" r="10" fill="#315BCD"/>
      <ellipse cx="50" cy="58" rx="16" ry="12" fill="#F7FAFF"/>
      <circle cx="38" cy="46" r="3.5" fill="#14213D"/>
      <circle cx="62" cy="46" r="3.5" fill="#14213D"/>
      <path d="M44 58c3 4 9 4 12 0" stroke="#14213D" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <circle cx="74" cy="34" r="6" fill="#5EE6C2"/>
      <text x="50" y="95" font-size="11" font-weight="800" fill="#315BCD" text-anchor="middle">HELLO!</text>
    </svg>`
  },
  {
    id: 'lumi_heart',
    name: 'Lumi Love',
    character: 'Lumi',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="54" r="35" fill="#4F7CFF"/>
      <circle cx="32" cy="26" r="9" fill="#315BCD"/>
      <circle cx="68" cy="26" r="9" fill="#315BCD"/>
      <path d="M34 46c3-3 6-3 9 0M57 46c3-3 6-3 9 0" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M70 52 C70 43, 84 43, 84 54 C84 66, 70 75, 70 75 C70 75, 56 66, 56 54 C56 43, 70 43, 70 52 Z" fill="#EF4444"/>
    </svg>`
  },
  {
    id: 'lumi_thumbsup',
    name: 'Lumi Great',
    character: 'Lumi',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="52" r="35" fill="#315BCD"/>
      <circle cx="38" cy="46" r="3.5" fill="#FFFFFF"/>
      <circle cx="62" cy="46" r="3.5" fill="#FFFFFF"/>
      <path d="M43 56c4 5 10 5 14 0" stroke="#5EE6C2" stroke-width="3" stroke-linecap="round" fill="none"/>
      <rect x="14" y="52" width="22" height="22" rx="8" fill="#5EE6C2"/>
      <text x="50" y="95" font-size="11" font-weight="800" fill="#315BCD" text-anchor="middle">GREAT!</text>
    </svg>`
  },
  {
    id: 'lumi_cry',
    name: 'Lumi Sad',
    character: 'Lumi',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="54" r="35" fill="#4F7CFF"/>
      <path d="M34 48c3-2 6-1 8 0M58 48c2-1 5-2 8 0" stroke="#14213D" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <path d="M38 53v22M62 53v22" stroke="#8EC5FF" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M45 64c3-3 7-3 10 0" stroke="#14213D" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>`
  },

  // --- NORI (노리 — LUNO Mint Star Companion) ---
  {
    id: 'nori_happy',
    name: 'Nori Joy',
    character: 'Nori',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="54" r="34" fill="#5EE6C2" stroke="#315BCD" stroke-width="3"/>
      <path d="M34 50c3-4 7-4 10 0M56 50c3-4 7-4 10 0" stroke="#14213D" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M44 62c3 5 9 5 12 0" stroke="#14213D" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <circle cx="28" cy="58" r="5" fill="#4F7CFF" opacity="0.35"/>
      <circle cx="72" cy="58" r="5" fill="#4F7CFF" opacity="0.35"/>
    </svg>`
  },
  {
    id: 'nori_cheer',
    name: 'Nori Cheer',
    character: 'Nori',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="52" r="34" fill="#5EE6C2" stroke="#14213D" stroke-width="3"/>
      <circle cx="38" cy="48" r="3.5" fill="#14213D"/>
      <circle cx="62" cy="48" r="3.5" fill="#14213D"/>
      <path d="M44 60h12" stroke="#14213D" stroke-width="3" stroke-linecap="round"/>
      <text x="50" y="95" font-size="11" font-weight="800" fill="#14213D" text-anchor="middle">LET'S GO!</text>
    </svg>`
  },
  {
    id: 'nori_thanks',
    name: 'Nori Thanks',
    character: 'Nori',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="52" r="34" fill="#EAF1FF" stroke="#4F7CFF" stroke-width="3"/>
      <circle cx="38" cy="48" r="3.5" fill="#315BCD"/>
      <circle cx="62" cy="48" r="3.5" fill="#315BCD"/>
      <path d="M44 58c3 4 9 4 12 0" stroke="#315BCD" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <text x="50" y="95" font-size="11" font-weight="800" fill="#315BCD" text-anchor="middle">THANK YOU</text>
    </svg>`
  },
  {
    id: 'nori_translate',
    name: 'Nori Global',
    character: 'Nori',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="35" fill="#315BCD"/>
      <ellipse cx="50" cy="50" rx="18" ry="35" stroke="#8EC5FF" stroke-width="2.5" fill="none"/>
      <line x1="15" y1="50" x2="85" y2="50" stroke="#5EE6C2" stroke-width="2.5"/>
      <text x="50" y="55" font-size="14" font-weight="800" fill="#FFFFFF" text-anchor="middle">A↔가</text>
    </svg>`
  },

  // --- POKO (포코 — Warm Cloud Companion) ---
  {
    id: 'poko_wink',
    name: 'Poko Wink',
    character: 'Poko',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="54" r="34" fill="#8EC5FF"/>
      <circle cx="37" cy="48" r="3.5" fill="#14213D"/>
      <path d="M57 48c4-3 8-3 12 0" stroke="#14213D" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M44 60c3 4 9 4 12 0" stroke="#14213D" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>`
  },
  {
    id: 'poko_yay',
    name: 'Poko Celebrate',
    character: 'Poko',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="54" r="34" fill="#8EC5FF"/>
      <circle cx="37" cy="47" r="3.5" fill="#14213D"/>
      <circle cx="63" cy="47" r="3.5" fill="#14213D"/>
      <circle cx="50" cy="60" r="6" fill="#315BCD"/>
      <circle cx="22" cy="26" r="4" fill="#5EE6C2"/>
      <circle cx="78" cy="26" r="4" fill="#4F7CFF"/>
    </svg>`
  },
  {
    id: 'poko_question',
    name: 'Poko Curious',
    character: 'Poko',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="56" r="33" fill="#8EC5FF"/>
      <circle cx="38" cy="50" r="3.5" fill="#14213D"/>
      <circle cx="62" cy="50" r="3.5" fill="#14213D"/>
      <circle cx="50" cy="62" r="3.5" fill="#14213D"/>
      <text x="78" y="34" font-size="26" font-weight="800" fill="#315BCD">?</text>
    </svg>`
  },
  {
    id: 'poko_ok',
    name: 'Poko OK',
    character: 'Poko',
    svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="52" r="34" fill="#315BCD"/>
      <circle cx="50" cy="52" r="26" stroke="#5EE6C2" stroke-width="3" fill="none"/>
      <text x="50" y="59" font-size="22" font-weight="800" fill="#FFFFFF" text-anchor="middle">OK</text>
    </svg>`
  }
];
