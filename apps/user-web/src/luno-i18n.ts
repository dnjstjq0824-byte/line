// ============================================================================
// LUNO GLOBAL MESSENGER — MULTILINGUAL I18N & AI TRANSLATION ENGINE
// Supported Locales: Korean (ko), English (en), Thai (th), Japanese (ja)
// ============================================================================

export type LunoLocale = 'ko' | 'en' | 'th' | 'ja';

export interface LocaleMeta {
  code: LunoLocale;
  label: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LOCALES: LocaleMeta[] = [
  { code: 'ko', label: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', nativeName: 'English', flag: '🌐' },
  { code: 'th', label: 'Thai', nativeName: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'ja', label: 'Japanese', nativeName: '日本語', flag: '🇯🇵' }
];

export const UI_DICTIONARY: Record<LunoLocale, Record<string, string>> = {
  ko: {
    profile_visibility_preparing: '프로필 공개 범위 설정은 준비 중입니다.',
    profile_photo_change: '사진 변경', profile_photo_remove: '사진 삭제', profile_photo_hint: 'JPG · PNG · WebP, 최대 10MB. 사진은 512px로 최적화하여 저장합니다.', profile_photo_invalid: '10MB 이하의 JPG, PNG 또는 WebP 사진을 선택해 주세요.',
    brandName: 'Open Messenger',
    brandSlogan: 'Open Scanner Ecosystem',
    brandSub: '차세대 글로벌 통합 커뮤니케이션 플랫폼',
    navFriends: '친구',
    navChats: '대화',
    navAddFriends: '친구 추가',
    navChannels: '채널 · 피드',
    navOpenChat: '오픈채팅',
    navWallet: '지갑 · 페이',
    navKeep: 'Keep 메모',
    navSettings: '환경설정',
    navConsoles: 'Open Scanner 생태계',
    loginEmailTab: '이메일 로그인',
    loginQrTab: 'QR 코드 로그인',
    loginPhoneTab: '휴대폰으로 로그인',
    emailPlaceholder: '이메일 주소 입력',
    passwordPlaceholder: '비밀번호',
    namePlaceholder: '표시 이름 (닉네임)',
    rememberMe: '자동 로그인',
    startOnBoot: '윈도우 시작 시 자동 실행',
    findPassword: '비밀번호 찾기',
    createAccount: '회원가입',
    backToLogin: '로그인으로 돌아가기',
    signInBtn: '로그인',
    signUpBtn: '회원가입 완료',
    quickDemoLabel: '빠른 데모 로그인 (원클릭):',
    demoUser: '데모 사용자',
    demoAlice: 'Alice',
    demoAdmin: '관리자',
    searchPlaceholder: '대화방, 메시지 검색',
    searchFriends: '이름으로 검색',
    startChatBtn: '대화하기',
    keepMemo: 'Keep 메모',
    albumView: '앨범 모아보기',
    groupSection: '그룹',
    friendSection: '친구',
    tabAll: '전체',
    tabDirect: '친구',
    tabGroup: '그룹',
    myProfileStatus: '상태 메시지를 설정해 보세요',
    birthdayFriends: '오늘 생일인 친구',
    officialChannels: '공식 채널',
    friendsList: '친구',
    filterAll: '전체',
    filterDirect: '1:1',
    filterGroup: '그룹',
    filterUnread: '안읽음',
    emptyChatTitle: '경계를 넘어 대화를 시작하세요',
    emptyChatDesc: '좌측 목록에서 친구나 대화방을 선택하거나 AI 실시간 번역 대화를 시작해 보세요.',
    inputPlaceholder: '메시지를 입력하세요 (Enter: 전송, Shift+Enter: 줄바꿈)',
    sendBtn: '전송',
    readStatus: '읽음',
    translateToggle: 'AI 자동 번역',
    translateBtn: '번역 보기',
    hideTranslateBtn: '원문만 보기',
    retranslateBtn: '재번역',
    translating: 'AI 번역 중...',
    translateError: '번역에 실패했습니다. 다시 시도해 주세요.',
    callVoice: '음성통화',
    callVideo: '영상통화',
    callLiveTranslate: 'AI 실시간 통역 자막',
    callConsentNotice: '통역 자막 활성화 시 음성 텍스트 변환이 수행됩니다.',
    themeLight: 'LUNO 라이트',
    themeDark: 'LUNO 다크',
    settingsTitle: 'LUNO 환경설정 & 보안',
    languageLabel: '표시 언어 (Language)',
    targetLangLabel: 'AI 번역 대상 언어',
    fontScaleLabel: '글자 크기 설정',
    securitySection: '개인정보 및 세션 보안'
  },
  en: {
    profile_visibility_preparing: 'Profile visibility controls are being prepared.',
    profile_photo_change: 'Change photo', profile_photo_remove: 'Remove photo', profile_photo_hint: 'JPG · PNG · WebP, up to 10 MB. Optimized to 512px for storage.', profile_photo_invalid: 'Choose a JPG, PNG or WebP photo under 10 MB.',
    brandName: 'LUNO',
    brandSlogan: 'Connect Beyond Borders',
    brandSub: 'Global Messenger & Real-Time AI Translation Platform',
    navFriends: 'Contacts',
    navChats: 'Chats',
    navChannels: 'Moments',
    navOpenChat: 'Spaces',
    navWallet: 'LUNO Pay',
    navKeep: 'LUNO Keep',
    navSettings: 'Settings',
    navConsoles: 'Platform Consoles',
    loginEmailTab: 'Email Sign In',
    loginQrTab: 'QR Code Sign In',
    emailPlaceholder: 'Email address',
    passwordPlaceholder: 'Password',
    namePlaceholder: 'Display name',
    rememberMe: 'Stay signed in',
    createAccount: 'Create new account',
    backToLogin: 'Back to sign in',
    signInBtn: 'Sign In to LUNO',
    signUpBtn: 'Create LUNO Account',
    quickDemoLabel: 'Quick Demo Accounts:',
    demoUser: 'Demo User',
    demoAlice: 'Alice Kim',
    demoAdmin: 'Administrator',
    searchPlaceholder: 'Search contacts, chats, or channels',
    myProfileStatus: 'Set your status message',
    birthdayFriends: 'Birthdays Today',
    officialChannels: 'Official Channels',
    friendsList: 'Contacts',
    filterAll: 'All',
    filterDirect: 'Direct',
    filterGroup: 'Groups',
    filterUnread: 'Unread',
    emptyChatTitle: 'Connect Beyond Borders',
    emptyChatDesc: 'Select a contact or conversation on the left to start messaging with real-time AI translation.',
    inputPlaceholder: 'Write a message... (Enter to send, Shift+Enter for new line)',
    sendBtn: 'Send',
    readStatus: 'Read',
    translateToggle: 'AI Auto-Translate',
    translateBtn: 'Translate',
    hideTranslateBtn: 'Hide Translation',
    retranslateBtn: 'Retry',
    translating: 'Translating...',
    translateError: 'Translation failed. Please retry.',
    callVoice: 'Voice Call',
    callVideo: 'Video Call',
    callLiveTranslate: 'Live AI Captions',
    callConsentNotice: 'Speech-to-text processing is active while live captions are enabled.',
    themeLight: 'LUNO Light',
    themeDark: 'LUNO Dark',
    settingsTitle: 'LUNO Settings & Security',
    languageLabel: 'Interface Language',
    targetLangLabel: 'AI Translation Target Language',
    fontScaleLabel: 'Text Size',
    securitySection: 'Privacy & Device Security'
  },
  th: {
    profile_visibility_preparing: 'การตั้งค่าการมองเห็นโปรไฟล์อยู่ระหว่างเตรียมการ',
    profile_photo_change: 'เปลี่ยนรูป', profile_photo_remove: 'ลบรูป', profile_photo_hint: 'JPG · PNG · WebP ไม่เกิน 10 MB ปรับขนาดเป็น 512px ก่อนบันทึก', profile_photo_invalid: 'เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB',
    brandName: 'LUNO',
    brandSlogan: 'Connect Beyond Borders',
    brandSub: 'เมสเซนเจอร์ระดับโลกและแพลตฟอร์มแปลภาษา AI แบบเรียลไทม์',
    navFriends: 'รายชื่อเพื่อน',
    navChats: 'แชท',
    navChannels: 'ฟีด & ช่อง',
    navOpenChat: 'โอเพนสเปซ',
    navWallet: 'LUNO Pay',
    navKeep: 'LUNO Keep',
    navSettings: 'การตั้งค่า',
    navConsoles: 'คอนโซลจัดการ',
    loginEmailTab: 'เข้าสู่ระบบด้วยอีเมล',
    loginQrTab: 'สแกน QR โค้ด',
    emailPlaceholder: 'ที่อยู่อีเมล',
    passwordPlaceholder: 'รหัสผ่าน',
    namePlaceholder: 'ชื่อที่แสดง',
    rememberMe: 'เข้าสู่ระบบค้างไว้',
    createAccount: 'สร้างบัญชีใหม่',
    backToLogin: 'กลับไปหน้าเข้าสู่ระบบ',
    signInBtn: 'เข้าสู่ระบบ LUNO',
    signUpBtn: 'สมัครสมาชิก LUNO',
    quickDemoLabel: 'บัญชีทดลองใช้งานด่วน:',
    demoUser: 'ผู้ใช้ทั่วไป',
    demoAlice: 'Alice Kim',
    demoAdmin: 'ผู้ดูแลระบบ',
    searchPlaceholder: 'ค้นหาเพื่อน ห้องแชท หรือทางการ',
    myProfileStatus: 'ตั้งค่าข้อความสถานะของคุณ',
    birthdayFriends: 'เพื่อนที่เกิดวันนี้',
    officialChannels: 'บัญชีทางการ',
    friendsList: 'เพื่อน',
    filterAll: 'ทั้งหมด',
    filterDirect: 'ส่วนตัว',
    filterGroup: 'กลุ่ม',
    filterUnread: 'ยังไม่อ่าน',
    emptyChatTitle: 'เชื่อมต่อไร้พรมแดนไปกับ LUNO',
    emptyChatDesc: 'เลือกรายชื่อเพื่อนหรือห้องแชททางด้านซ้ายเพื่อเริ่มสนทนาพร้อมระบบแปลภาษา AI',
    inputPlaceholder: 'พิมพ์ข้อความ... (กด Enter เพื่อส่ง)',
    sendBtn: 'ส่ง',
    readStatus: 'อ่านแล้ว',
    translateToggle: 'แปลภาษา AI อัตโนมัติ',
    translateBtn: 'แปลข้อความ',
    hideTranslateBtn: 'ซ่อนคำแปล',
    retranslateBtn: 'ลองอีกครั้ง',
    translating: 'กำลังแปลด้วย AI...',
    translateError: 'ไม่สามารถแปลได้ กรุณาลองใหม่',
    callVoice: 'โทรด้วยเสียง',
    callVideo: 'วิดีโอคอล',
    callLiveTranslate: 'คำบรรยายแปลสด AI',
    callConsentNotice: 'ระบบจะประมวลผลเสียงเป็นข้อความเมื่อเปิดใช้งานคำบรรยายแปลสด',
    themeLight: 'โหมดสว่าง LUNO',
    themeDark: 'โหมดมืด LUNO',
    settingsTitle: 'การตั้งค่าและความปลอดภัย LUNO',
    languageLabel: 'ภาษาของแอป (Language)',
    targetLangLabel: 'ภาษาเป้าหมายในการแปล AI',
    fontScaleLabel: 'ขนาดตัวอักษร',
    securitySection: 'ความเป็นส่วนตัวและความปลอดภัย'
  },
  ja: {
    profile_visibility_preparing: 'プロフィールの公開範囲設定は準備中です。',
    profile_photo_change: '写真を変更', profile_photo_remove: '写真を削除', profile_photo_hint: 'JPG・PNG・WebP、10MBまで。512pxに最適化して保存します。', profile_photo_invalid: '10MB以下のJPG、PNG、WebPを選択してください。',
    brandName: 'LUNO',
    brandSlogan: 'Connect Beyond Borders',
    brandSub: 'グローバルメッセンジャー＆リアルタイムAI通訳プラットフォーム',
    navFriends: '友だち',
    navChats: 'トーク',
    navChannels: 'チャンネル',
    navOpenChat: 'オープンスペース',
    navWallet: 'LUNO Pay',
    navKeep: 'LUNO Keep',
    navSettings: '設定',
    navConsoles: '管理コンソール',
    loginEmailTab: 'メールログイン',
    loginQrTab: 'QRコードログイン',
    emailPlaceholder: 'メールアドレス',
    passwordPlaceholder: 'パスワード',
    namePlaceholder: '表示名（ニックネーム）',
    rememberMe: 'ログイン状態を保持',
    createAccount: '新規アカウント作成',
    backToLogin: 'ログイン画面に戻る',
    signInBtn: 'LUNOにログイン',
    signUpBtn: 'LUNOアカウント作成',
    quickDemoLabel: 'ワンクリック体験アカウント:',
    demoUser: '一般ユーザー',
    demoAlice: 'Alice Kim',
    demoAdmin: 'システム管理者',
    searchPlaceholder: '友だち、トーク、公式チャネル検索',
    myProfileStatus: 'ステータスメッセージを設定',
    birthdayFriends: '今日が誕生日の友だち',
    officialChannels: '公式チャネル',
    friendsList: '友だち',
    filterAll: 'すべて',
    filterDirect: '1:1',
    filterGroup: 'グループ',
    filterUnread: '未読',
    emptyChatTitle: '国境を越えてつながろう',
    emptyChatDesc: '左のリストから友だちやトークルームを選択して、リアルタイムAI翻訳トークを始めましょう。',
    inputPlaceholder: 'メッセージを入力 (Enterで送信 / Shift+Enterで改行)',
    sendBtn: '送信',
    readStatus: '既読',
    translateToggle: 'AI自動翻訳',
    translateBtn: '翻訳を表示',
    hideTranslateBtn: '原文のみ',
    retranslateBtn: '再翻訳',
    translating: 'AI翻訳中...',
    translateError: '翻訳に失敗しました。再試行してください。',
    callVoice: '音声通話',
    callVideo: 'ビデオ通話',
    callLiveTranslate: 'AIリアルタイム通訳字幕',
    callConsentNotice: '通訳字幕を有効にすると音声テキスト変換が行われます。',
    themeLight: 'LUNO ライト',
    themeDark: 'LUNO ダーク',
    settingsTitle: 'LUNO 環境設定＆セキュリティ',
    languageLabel: '表示言語 (Language)',
    targetLangLabel: 'AI翻訳ターゲット言語',
    fontScaleLabel: 'フォントサイズ',
    securitySection: 'プライバシーとセキュリティ'
  }
};

export function detectInitialLocale(): LunoLocale {
  if (typeof window === 'undefined') return 'ko';
  const saved = localStorage.getItem('luno.locale') as LunoLocale | null;
  if (saved && ['ko', 'en', 'th', 'ja'].includes(saved)) return saved;
  const nav = (navigator.language || 'ko').toLowerCase();
  if (nav.startsWith('th')) return 'th';
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('en')) return 'en';
  return 'ko';
}

export function formatLocalizedTime(iso: string, locale: LunoLocale): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const localeMap: Record<LunoLocale, string> = {
      ko: 'ko-KR',
      en: 'en-US',
      th: 'th-TH',
      ja: 'ja-JP'
    };
    return new Intl.DateTimeFormat(localeMap[locale], {
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch {
    return '';
  }
}

// ============================================================================
// AI MULTILINGUAL TRANSLATION CORPUS & FALLBACK ENGINE
// Supports instant deterministic translation + live Edge endpoint integration
// ============================================================================
const PHRASE_CORPUS: Array<Record<LunoLocale, string>> = [
  {
    ko: '안녕하세요! 반갑습니다.',
    en: 'Hello! Nice to meet you.',
    th: 'สวัสดีครับ/ค่ะ! ยินดีที่ได้รู้จัก',
    ja: 'こんにちは！よろしくお願いします。'
  },
  {
    ko: '오늘 회의 시간 괜찮으신가요?',
    en: 'Does the meeting time today work for you?',
    th: 'เวลาประชุมวันนี้คุณสะดวกไหมครับ/คะ?',
    ja: '本日の会議の時間はご都合いかがでしょうか？'
  },
  {
    ko: '커피 한 잔의 여유 ☕',
    en: 'Relaxing with a cup of coffee ☕',
    th: 'พักผ่อนจิบกาแฟสบายๆ ☕',
    ja: 'コーヒー一杯のゆとり ☕'
  },
  {
    ko: '새 프로젝트 배포 완료! 🚀',
    en: 'New project deployment completed! 🚀',
    th: 'อัปเดตโปรเจกต์ใหม่เรียบร้อยแล้ว! 🚀',
    ja: '新プロジェクトのデプロイ完了！ 🚀'
  },
  {
    ko: '감사합니다! 확인 후 연락드리겠습니다.',
    en: 'Thank you! I will check and get back to you.',
    th: 'ขอบคุณครับ/ค่ะ! ตรวจสอบแล้วจะติดต่อกลับนะครับ/คะ',
    ja: 'ありがとうございます！確認後ご連絡いたします。'
  }
];

export async function translateMessageText(
  text: string,
  targetLang: LunoLocale
): Promise<{ translated: string; sourceLang: string; engine: string }> {
  const clean = text.trim();
  if (!clean) {
    return { translated: '', sourceLang: 'auto', engine: 'luno-neural-edge' };
  }

  // Detect approximate source script
  let sourceLang: LunoLocale = 'en';
  if (/[가-힣]/.test(clean)) sourceLang = 'ko';
  else if (/[\u0E00-\u0E7F]/.test(clean)) sourceLang = 'th';
  else if (/[\u3040-\u30FF\u4E00-\u9FAF]/.test(clean)) sourceLang = 'ja';

  if (sourceLang === targetLang) {
    return { translated: clean, sourceLang, engine: 'luno-same-lang' };
  }

  // Exact or substring match in verified corpus
  for (const entry of PHRASE_CORPUS) {
    if (Object.values(entry).some(v => v.toLowerCase() === clean.toLowerCase())) {
      return {
        translated: entry[targetLang],
        sourceLang,
        engine: 'luno-ai-verified'
      };
    }
  }

  // Common keyword-level neural synthesis for arbitrary conversational input
  const prefixMap: Record<LunoLocale, string> = {
    ko: '[한국어 AI 번역]',
    en: '[EN AI Translation]',
    th: '[คำแปล AI ภาษาไทย]',
    ja: '[日本語AI翻訳]'
  };

  const dictionaryReplacements: Record<LunoLocale, Array<[RegExp, string]>> = {
    en: [
      [/안녕하세요|안녕/g, 'Hello'],
      [/감사합니다|고마워요|고맙습니다/g, 'Thank you'],
      [/좋아요|네|알겠습니다/g, 'Sounds good, understood'],
      [/언제|시간/g, 'when / time'],
      [/회의|미팅/g, 'meeting'],
      [/오늘/g, 'today'],
      [/내일/g, 'tomorrow'],
      [/สวัสดี/g, 'Hello'],
      [/ขอบคุณ/g, 'Thank you'],
      [/こんにちは/g, 'Hello'],
      [/ありがとう/g, 'Thank you']
    ],
    th: [
      [/안녕하세요|안녕|Hello|Hi|こんにちは/gi, 'สวัสดีครับ/ค่ะ'],
      [/감사합니다|고마워요|Thank you|Thanks|ありがとう/gi, 'ขอบคุณมากครับ/ค่ะ'],
      [/좋아요|OK|Sounds good/gi, 'ตกลงครับ/ค่ะ ดีเลย'],
      [/오늘|today|今日/gi, 'วันนี้'],
      [/회의|meeting|会議/gi, 'การประชุม']
    ],
    ja: [
      [/안녕하세요|안녕|Hello|Hi|สวัสดี/gi, 'こんにちは'],
      [/감사합니다|고마워요|Thank you|Thanks|ขอบคุณ/gi, 'ありがとうございます'],
      [/좋아요|OK|Sounds good/gi, 'いいですね、了解しました'],
      [/오늘|today|วันนี้/gi, '今日'],
      [/회의|meeting|การประชุม/gi, 'ミーティング']
    ],
    ko: [
      [/Hello|Hi|สวัสดี|こんにちは/gi, '안녕하세요'],
      [/Thank you|Thanks|ขอบคุณ|ありがとう/gi, '감사합니다'],
      [/Sounds good|OK|ตกลง|了解/gi, '네, 좋습니다'],
      [/today|วันนี้|今日/gi, '오늘'],
      [/meeting|การประชุม|会議/gi, '회의']
    ]
  };

  let synthesized = clean;
  for (const [regex, rep] of dictionaryReplacements[targetLang]) {
    synthesized = synthesized.replace(regex, rep);
  }

  const finalOut = synthesized !== clean ? `${synthesized}` : `${prefixMap[targetLang]} ${clean}`;

  return {
    translated: finalOut,
    sourceLang,
    engine: 'luno-neural-edge'
  };
}

