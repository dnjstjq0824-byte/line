// lunotalk.com front page: languages, URL routing (/ko /en /ja /zh /es ...)
// and copy. Adding a language = one SITE_LANGS entry + one copy block; the
// router, the language menu, hreflang tags and the server's "/" redirect
// (scripts/cf_worker.js SITE_LANGS, kept equal by a test) follow it.
// "/" is redirected by the server: cookie > Geo-IP country > Accept-Language
// > English. pickSiteLang is the client fallback (cookie > browser languages).
import type { LunoLocale } from './luno-i18n'
import {
  PREF_LANG_COOKIE,
  LEGACY_LANG_COOKIE,
  buildPrefLangCookie,
  readPrefLangFromCookie,
} from '../../shared/locale.config'

export const SITE_LANGS = [
  'ko', 'en', 'ja', 'zh', 'zh-tw', 'th', 'vi', 'id', 'ms', 'hi',
  'ar', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'tr',
] as const
export type SiteLang = (typeof SITE_LANGS)[number]

export const SITE_LANG_LABELS: Record<SiteLang, string> = {
  ko: '한국어', en: 'English', ja: '日本語', zh: '简体中文', 'zh-tw': '繁體中文', th: 'ภาษาไทย',
  vi: 'Tiếng Việt', id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', hi: 'हिन्दी', ar: 'العربية',
  es: 'Español', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano', ru: 'Русский', tr: 'Türkçe',
}
export const RTL_LANGS: readonly SiteLang[] = ['ar']

// Hand-typed and country-style codes: /jp, /cn, /kr, /tw, /vn, /br ...
export const SITE_LANG_ALIASES: Record<string, SiteLang> = {
  kr: 'ko', kor: 'ko', jp: 'ja', jpn: 'ja', cn: 'zh', chn: 'zh', 'zh-cn': 'zh', 'zh-hans': 'zh', 'zh-sg': 'zh',
  tw: 'zh-tw', hk: 'zh-tw', 'zh-hk': 'zh-tw', 'zh-hant': 'zh-tw', 'zh-mo': 'zh-tw',
  tha: 'th', vn: 'vi', ind: 'id', my: 'ms', msa: 'ms', sa: 'ar', ae: 'ar',
  mx: 'es', br: 'pt', 'pt-br': 'pt', 'pt-pt': 'pt', us: 'en', gb: 'en', eng: 'en',
}
export const SITE_LANG_COOKIE = PREF_LANG_COOKIE

export function isSiteLang(v: unknown): v is SiteLang {
  return typeof v === 'string' && (SITE_LANGS as readonly string[]).includes(v)
}

/** A browser / Accept-Language tag mapped onto a site language, or null. */
export function siteLangFromTag(tag: string): SiteLang | null {
  const t = String(tag || '').toLowerCase().trim()
  if (!t) return null
  if (t.startsWith('zh')) return /(tw|hk|mo|hant)/.test(t) ? 'zh-tw' : 'zh'
  if (isSiteLang(t)) return t
  const primary = t.split('-')[0]
  if (primary === 'fil' || primary === 'tl') return 'en'
  return isSiteLang(primary) ? primary : null
}

/** Messenger UI locale for a site language (the app has ko/en/th/ja UI). */
export function appLocaleFor(lang: SiteLang): LunoLocale {
  return lang === 'ko' || lang === 'ja' || lang === 'th' ? lang : 'en'
}

function cookieLang(): SiteLang | null {
  try {
    const picked = readPrefLangFromCookie(document.cookie)
    return picked && isSiteLang(picked) ? picked : null
  } catch { return null }
}

export function rememberSiteLang(lang: SiteLang) {
  try {
    const hostname = typeof location !== 'undefined' ? location.hostname : ''
    const secure = typeof location !== 'undefined' ? location.protocol === 'https:' : true
    document.cookie = buildPrefLangCookie(lang, hostname, secure, PREF_LANG_COOKIE)
    document.cookie = buildPrefLangCookie(lang, hostname, secure, LEGACY_LANG_COOKIE)
  } catch {}
}

/** Client fallback when the server did not redirect "/" (dev, cached shell). */
export function pickSiteLang(): SiteLang {
  const saved = cookieLang()
  if (saved) return saved
  const tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']
  for (const tag of tags) {
    const lang = siteLangFromTag(tag)
    if (lang) return lang
  }
  return 'en'
}

/** Legal documents exist in ko (default), en, ja, th; others read English. */
export function legalSuffixFor(lang: SiteLang): string {
  if (lang === 'ko') return ''
  return lang === 'ja' || lang === 'th' ? `.${lang}` : '.en'
}

export const SITE_FOOTER_SUPPORT: Record<SiteLang, { support: string; deletion: string }> = {
  ko: { support: '고객 지원', deletion: '계정 삭제' },
  en: { support: 'Support', deletion: 'Account Deletion' },
  ja: { support: 'サポート', deletion: 'アカウント削除' },
  zh: { support: '客户支持', deletion: '删除账号' },
  'zh-tw': { support: '客戶支援', deletion: '帳號刪除' },
  th: { support: 'ฝ่ายสนับสนุน', deletion: 'ลบบัญชี' },
  vi: { support: 'Hỗ trợ', deletion: 'Xóa tài khoản' },
  id: { support: 'Dukungan', deletion: 'Hapus Akun' },
  ms: { support: 'Sokongan', deletion: 'Padam Akaun' },
  hi: { support: 'सहायता', deletion: 'खाता हटाएं' },
  ar: { support: 'الدعم', deletion: 'حذف الحساب' },
  es: { support: 'Soporte', deletion: 'Eliminar cuenta' },
  pt: { support: 'Suporte', deletion: 'Excluir conta' },
  fr: { support: 'Assistance', deletion: 'Supprimer le compte' },
  de: { support: 'Support', deletion: 'Konto löschen' },
  it: { support: 'Supporto', deletion: 'Elimina account' },
  ru: { support: 'Поддержка', deletion: 'Удаление аккаунта' },
  tr: { support: 'Destek', deletion: 'Hesap Silme' },
}

export type SiteCopy = Record<
  | 'title' | 'navFeatures' | 'navDownload' | 'navLogin' | 'navOpen' | 'language'
  | 'heroTitle' | 'heroSub' | 'ctaApp' | 'ctaPc' | 'ctaWeb' | 'ctaOpen' | 'heroNote'
  | 'f1t' | 'f1d' | 'f2t' | 'f2d' | 'f3t' | 'f3d' | 'f4t' | 'f4d' | 'f5t' | 'f5d'
  | 'dlTitle' | 'dlSub' | 'dlAndroidSub' | 'dlAndroidBtn' | 'dlPcSub' | 'dlPcBtn' | 'dlIosSub' | 'dlIosBtn'
  | 'footTerms' | 'footPrivacy' | 'bubbleIn' | 'bubbleOut' | 'translated',
  string
>

// The demo chat: a Thai message translated into the reader's language
// (Thai readers see a Korean message instead).
const THAI = 'สวัสดีครับ! พรุ่งนี้ว่างไหม'

export const SITE_COPY: Record<SiteLang, SiteCopy> = {
  ko: {
    title: 'LUNO — 언어가 달라도 바로 통하는 메신저',
    navFeatures: '기능', navDownload: '다운로드', navLogin: 'PC 로그인', navOpen: '메신저 열기', language: '언어',
    heroTitle: '언어가 달라도\n바로 통하는 메신저',
    heroSub: '실시간 번역 채팅, 무료 음성·영상 통화, 200가지 스티커까지.\n휴대폰과 PC에서 같은 대화를 이어가세요.',
    ctaApp: 'Android 앱 다운로드', ctaPc: 'PC에서 로그인', ctaWeb: '웹에서 시작하기', ctaOpen: '메신저 열기',
    heroNote: 'Android 8.0 이상 · 무료',
    f1t: '말이 달라도 자연스럽게', f1d: '받은 메시지를 내 언어로 번역해 보여줍니다. 전 세계 친구와 부담 없이 대화하세요.',
    f2t: '무료 음성·영상 통화', f2d: '친구 프로필이나 대화방에서 바로 전화를 겁니다. 와이파이와 데이터 모두에서 연결됩니다.',
    f3t: '200가지 LUNO 스티커', f3d: '말보다 빠른 감정 표현. 카테고리별로 골라 크게 미리 보고 보내세요.',
    f4t: 'PC는 QR 한 번으로', f4d: 'PC 화면의 QR 코드를 휴대폰 앱으로 승인하면 바로 로그인됩니다. 비밀번호 입력 없이 안전하게.',
    f5t: '그룹과 오픈채팅', f5d: '친구들과 그룹을 만들고, 관심사가 같은 사람들과 오픈채팅에서 만나세요.',
    dlTitle: '지금 시작하세요', dlSub: '어디서든 같은 계정, 같은 대화.',
    dlAndroidSub: 'APK 직접 설치', dlAndroidBtn: '다운로드', dlPcSub: '설치 없이 브라우저에서', dlPcBtn: '로그인',
    dlIosSub: '준비 중입니다', dlIosBtn: '준비 중',
    footTerms: '이용약관', footPrivacy: '개인정보처리방침',
    bubbleIn: '안녕하세요! 내일 시간 괜찮아요?', bubbleOut: '좋아요, 3시에 영상통화 해요 😊', translated: '번역됨',
  },
  en: {
    title: 'LUNO — the messenger that speaks every language',
    navFeatures: 'Features', navDownload: 'Download', navLogin: 'PC login', navOpen: 'Open messenger', language: 'Language',
    heroTitle: 'The messenger that\nspeaks every language',
    heroSub: 'Live translated chat, free voice and video calls, 200 stickers.\nPick up the same conversation on phone and PC.',
    ctaApp: 'Download for Android', ctaPc: 'Log in on PC', ctaWeb: 'Start on the web', ctaOpen: 'Open messenger',
    heroNote: 'Android 8.0+ · Free',
    f1t: 'Different languages, one conversation', f1d: 'Incoming messages are translated into your language, so you can chat with friends anywhere in the world.',
    f2t: 'Free voice and video calls', f2d: 'Call right from a profile or a chat, over Wi-Fi or mobile data.',
    f3t: '200 LUNO stickers', f3d: 'Faster than words. Browse by category, preview big, send.',
    f4t: 'PC login with one QR scan', f4d: 'Approve the QR code on your PC with the phone app and you are in. No password typing.',
    f5t: 'Groups and open chats', f5d: 'Make groups with friends and meet people who share your interests.',
    dlTitle: 'Get started', dlSub: 'One account, the same chats, everywhere.',
    dlAndroidSub: 'Install the APK', dlAndroidBtn: 'Download', dlPcSub: 'In your browser, nothing to install', dlPcBtn: 'Log in',
    dlIosSub: 'Coming soon', dlIosBtn: 'Coming soon',
    footTerms: 'Terms', footPrivacy: 'Privacy',
    bubbleIn: 'Hi! Are you free tomorrow?', bubbleOut: 'Sure, video call at 3 😊', translated: 'Translated',
  },
  ja: {
    title: 'LUNO — 言葉が違ってもすぐ通じるメッセンジャー',
    navFeatures: '機能', navDownload: 'ダウンロード', navLogin: 'PCでログイン', navOpen: 'メッセンジャーを開く', language: '言語',
    heroTitle: '言葉が違っても\nすぐ通じるメッセンジャー',
    heroSub: 'リアルタイム翻訳チャット、無料の音声・ビデオ通話、200種類のスタンプ。\nスマホとPCで同じ会話を続けられます。',
    ctaApp: 'Android版をダウンロード', ctaPc: 'PCでログイン', ctaWeb: 'Webで始める', ctaOpen: 'メッセンジャーを開く',
    heroNote: 'Android 8.0以上 · 無料',
    f1t: '言葉が違っても自然に', f1d: '受け取ったメッセージをあなたの言語に翻訳して表示。世界中の友だちと気軽に話せます。',
    f2t: '無料の音声・ビデオ通話', f2d: '友だちのプロフィールやトークルームからすぐに発信。Wi-Fiでもモバイルデータでもつながります。',
    f3t: 'LUNOスタンプ200種類', f3d: '言葉より早く気持ちを伝えよう。カテゴリから選んで、大きくプレビューして送信。',
    f4t: 'PCはQRコードひとつで', f4d: 'PC画面のQRコードをスマホのアプリで承認するだけでログイン。パスワード入力なしで安全に。',
    f5t: 'グループとオープンチャット', f5d: '友だちとグループを作ったり、同じ趣味の人とオープンチャットで出会えます。',
    dlTitle: '今すぐ始めよう', dlSub: 'どこでも同じアカウント、同じ会話。',
    dlAndroidSub: 'APKを直接インストール', dlAndroidBtn: 'ダウンロード', dlPcSub: 'インストール不要、ブラウザで', dlPcBtn: 'ログイン',
    dlIosSub: '準備中です', dlIosBtn: '準備中',
    footTerms: '利用規約', footPrivacy: 'プライバシーポリシー',
    bubbleIn: 'こんにちは！明日あいてる？', bubbleOut: 'いいよ、3時にビデオ通話しよう 😊', translated: '翻訳済み',
  },
  zh: {
    title: 'LUNO — 语言不同也能畅聊的通讯软件',
    navFeatures: '功能', navDownload: '下载', navLogin: '电脑登录', navOpen: '打开 LUNO', language: '语言',
    heroTitle: '语言不同\n也能马上畅聊',
    heroSub: '实时翻译聊天、免费语音和视频通话、200 款贴图。\n手机和电脑上继续同一段对话。',
    ctaApp: '下载 Android 版', ctaPc: '在电脑上登录', ctaWeb: '在网页上开始', ctaOpen: '打开 LUNO',
    heroNote: 'Android 8.0 及以上 · 免费',
    f1t: '语言不同，交流自然', f1d: '收到的消息会翻译成你的语言显示，和世界各地的朋友轻松聊天。',
    f2t: '免费语音和视频通话', f2d: '在好友资料或聊天室中一键拨打，Wi-Fi 和移动数据均可连接。',
    f3t: '200 款 LUNO 贴图', f3d: '比文字更快表达心情。按分类挑选，放大预览后发送。',
    f4t: '电脑扫码即可登录', f4d: '用手机应用确认电脑屏幕上的二维码即可登录，无需输入密码，安全便捷。',
    f5t: '群聊和开放聊天', f5d: '和好友建群，在开放聊天中认识志趣相投的人。',
    dlTitle: '立即开始', dlSub: '同一个账号，随时随地同一段对话。',
    dlAndroidSub: '直接安装 APK', dlAndroidBtn: '下载', dlPcSub: '无需安装，在浏览器中使用', dlPcBtn: '登录',
    dlIosSub: '正在准备中', dlIosBtn: '敬请期待',
    footTerms: '使用条款', footPrivacy: '隐私政策',
    bubbleIn: '你好！明天有空吗？', bubbleOut: '好的，三点视频通话吧 😊', translated: '已翻译',
  },
  'zh-tw': {
    title: 'LUNO — 語言不同也能暢聊的通訊軟體',
    navFeatures: '功能', navDownload: '下載', navLogin: '電腦登入', navOpen: '開啟 LUNO', language: '語言',
    heroTitle: '語言不同\n也能馬上暢聊',
    heroSub: '即時翻譯聊天、免費語音與視訊通話、200 款貼圖。\n在手機和電腦上延續同一段對話。',
    ctaApp: '下載 Android 版', ctaPc: '在電腦上登入', ctaWeb: '在網頁上開始', ctaOpen: '開啟 LUNO',
    heroNote: 'Android 8.0 以上 · 免費',
    f1t: '語言不同，交流自然', f1d: '收到的訊息會翻譯成你的語言顯示，和世界各地的朋友輕鬆聊天。',
    f2t: '免費語音與視訊通話', f2d: '從好友個人檔案或聊天室直接撥打，Wi-Fi 與行動數據都能連線。',
    f3t: '200 款 LUNO 貼圖', f3d: '比文字更快傳達心情。依分類挑選，放大預覽後傳送。',
    f4t: '電腦掃碼即可登入', f4d: '用手機 App 確認電腦畫面上的 QR 碼即可登入，不必輸入密碼，安全又方便。',
    f5t: '群組與開放聊天', f5d: '和好友建立群組，在開放聊天中認識志同道合的人。',
    dlTitle: '立即開始', dlSub: '同一個帳號，隨時隨地同一段對話。',
    dlAndroidSub: '直接安裝 APK', dlAndroidBtn: '下載', dlPcSub: '免安裝，在瀏覽器中使用', dlPcBtn: '登入',
    dlIosSub: '準備中', dlIosBtn: '敬請期待',
    footTerms: '使用條款', footPrivacy: '隱私權政策',
    bubbleIn: '你好！明天有空嗎？', bubbleOut: '好啊，三點視訊通話吧 😊', translated: '已翻譯',
  },
  th: {
    title: 'LUNO — เมสเซนเจอร์ที่คุยกันรู้เรื่องแม้ต่างภาษา',
    navFeatures: 'ฟีเจอร์', navDownload: 'ดาวน์โหลด', navLogin: 'เข้าสู่ระบบบน PC', navOpen: 'เปิดเมสเซนเจอร์', language: 'ภาษา',
    heroTitle: 'ต่างภาษาก็คุยกัน\nรู้เรื่องทันที',
    heroSub: 'แชทแปลภาษาแบบเรียลไทม์ โทรเสียงและวิดีโอฟรี สติกเกอร์ 200 แบบ\nคุยต่อได้ทั้งบนมือถือและ PC',
    ctaApp: 'ดาวน์โหลดสำหรับ Android', ctaPc: 'เข้าสู่ระบบบน PC', ctaWeb: 'เริ่มใช้งานบนเว็บ', ctaOpen: 'เปิดเมสเซนเจอร์',
    heroNote: 'Android 8.0 ขึ้นไป · ฟรี',
    f1t: 'ต่างภาษาก็คุยได้อย่างเป็นธรรมชาติ', f1d: 'ข้อความที่ได้รับจะถูกแปลเป็นภาษาของคุณ คุยกับเพื่อนได้ทั่วโลกอย่างสบายใจ',
    f2t: 'โทรเสียงและวิดีโอฟรี', f2d: 'โทรได้ทันทีจากโปรไฟล์เพื่อนหรือห้องแชท ใช้ได้ทั้ง Wi-Fi และเน็ตมือถือ',
    f3t: 'สติกเกอร์ LUNO 200 แบบ', f3d: 'ส่งความรู้สึกได้เร็วกว่าคำพูด เลือกตามหมวด ดูตัวอย่างแบบใหญ่ แล้วส่งเลย',
    f4t: 'เข้า PC ด้วย QR ครั้งเดียว', f4d: 'อนุมัติ QR บนหน้าจอ PC ด้วยแอปในมือถือก็เข้าสู่ระบบได้ทันที ปลอดภัยโดยไม่ต้องพิมพ์รหัสผ่าน',
    f5t: 'กลุ่มและโอเพนแชท', f5d: 'สร้างกลุ่มกับเพื่อน และพบผู้คนที่ชอบสิ่งเดียวกันในโอเพนแชท',
    dlTitle: 'เริ่มต้นเลย', dlSub: 'บัญชีเดียว แชทเดียวกัน ทุกที่',
    dlAndroidSub: 'ติดตั้งไฟล์ APK', dlAndroidBtn: 'ดาวน์โหลด', dlPcSub: 'ใช้บนเบราว์เซอร์ ไม่ต้องติดตั้ง', dlPcBtn: 'เข้าสู่ระบบ',
    dlIosSub: 'กำลังเตรียมการ', dlIosBtn: 'เร็ว ๆ นี้',
    footTerms: 'ข้อกำหนดการใช้งาน', footPrivacy: 'นโยบายความเป็นส่วนตัว',
    bubbleIn: 'สวัสดี! พรุ่งนี้ว่างไหม', bubbleOut: 'ได้เลย วิดีโอคอลตอนบ่ายสามนะ 😊', translated: 'แปลแล้ว',
  },
  vi: {
    title: 'LUNO — Ứng dụng nhắn tin vượt mọi rào cản ngôn ngữ',
    navFeatures: 'Tính năng', navDownload: 'Tải về', navLogin: 'Đăng nhập trên PC', navOpen: 'Mở LUNO', language: 'Ngôn ngữ',
    heroTitle: 'Khác ngôn ngữ\nvẫn hiểu nhau ngay',
    heroSub: 'Trò chuyện dịch tức thì, gọi thoại và video miễn phí, 200 nhãn dán.\nTiếp tục cùng cuộc trò chuyện trên điện thoại và máy tính.',
    ctaApp: 'Tải cho Android', ctaPc: 'Đăng nhập trên PC', ctaWeb: 'Bắt đầu trên web', ctaOpen: 'Mở LUNO',
    heroNote: 'Android 8.0 trở lên · Miễn phí',
    f1t: 'Khác ngôn ngữ, vẫn tự nhiên', f1d: 'Tin nhắn nhận được sẽ được dịch sang ngôn ngữ của bạn để trò chuyện với bạn bè khắp thế giới.',
    f2t: 'Gọi thoại và video miễn phí', f2d: 'Gọi ngay từ hồ sơ bạn bè hoặc phòng chat, qua Wi-Fi hay dữ liệu di động.',
    f3t: '200 nhãn dán LUNO', f3d: 'Thể hiện cảm xúc nhanh hơn lời nói. Chọn theo danh mục, xem trước cỡ lớn rồi gửi.',
    f4t: 'Đăng nhập PC chỉ với mã QR', f4d: 'Xác nhận mã QR trên màn hình máy tính bằng ứng dụng điện thoại là vào được ngay, không cần gõ mật khẩu.',
    f5t: 'Nhóm và trò chuyện mở', f5d: 'Lập nhóm với bạn bè và gặp gỡ những người cùng sở thích.',
    dlTitle: 'Bắt đầu ngay', dlSub: 'Một tài khoản, cùng cuộc trò chuyện, ở mọi nơi.',
    dlAndroidSub: 'Cài đặt tệp APK', dlAndroidBtn: 'Tải về', dlPcSub: 'Dùng trên trình duyệt, không cần cài đặt', dlPcBtn: 'Đăng nhập',
    dlIosSub: 'Sắp ra mắt', dlIosBtn: 'Sắp ra mắt',
    footTerms: 'Điều khoản', footPrivacy: 'Quyền riêng tư',
    bubbleIn: 'Chào bạn! Mai bạn rảnh không?', bubbleOut: 'Được chứ, gọi video lúc 3 giờ nhé 😊', translated: 'Đã dịch',
  },
  id: {
    title: 'LUNO — Pesan instan yang menembus batas bahasa',
    navFeatures: 'Fitur', navDownload: 'Unduh', navLogin: 'Masuk di PC', navOpen: 'Buka LUNO', language: 'Bahasa',
    heroTitle: 'Beda bahasa,\ntetap langsung nyambung',
    heroSub: 'Obrolan dengan terjemahan langsung, panggilan suara dan video gratis, 200 stiker.\nLanjutkan obrolan yang sama di ponsel dan PC.',
    ctaApp: 'Unduh untuk Android', ctaPc: 'Masuk di PC', ctaWeb: 'Mulai di web', ctaOpen: 'Buka LUNO',
    heroNote: 'Android 8.0+ · Gratis',
    f1t: 'Beda bahasa, tetap akrab', f1d: 'Pesan masuk diterjemahkan ke bahasamu, jadi kamu bisa mengobrol dengan teman di seluruh dunia.',
    f2t: 'Panggilan suara dan video gratis', f2d: 'Langsung menelepon dari profil teman atau ruang obrolan, lewat Wi-Fi maupun data seluler.',
    f3t: '200 stiker LUNO', f3d: 'Ungkapkan perasaan lebih cepat. Pilih per kategori, lihat pratinjau besar, lalu kirim.',
    f4t: 'Masuk PC cukup pindai QR', f4d: 'Setujui kode QR di layar PC lewat aplikasi ponsel dan langsung masuk, tanpa mengetik kata sandi.',
    f5t: 'Grup dan obrolan terbuka', f5d: 'Buat grup bersama teman dan temui orang-orang dengan minat yang sama.',
    dlTitle: 'Mulai sekarang', dlSub: 'Satu akun, obrolan yang sama, di mana saja.',
    dlAndroidSub: 'Pasang file APK', dlAndroidBtn: 'Unduh', dlPcSub: 'Di browser, tanpa instalasi', dlPcBtn: 'Masuk',
    dlIosSub: 'Segera hadir', dlIosBtn: 'Segera hadir',
    footTerms: 'Ketentuan', footPrivacy: 'Privasi',
    bubbleIn: 'Hai! Besok kamu senggang?', bubbleOut: 'Boleh, video call jam 3 ya 😊', translated: 'Diterjemahkan',
  },
  ms: {
    title: 'LUNO — Aplikasi mesej merentasi bahasa',
    navFeatures: 'Ciri-ciri', navDownload: 'Muat turun', navLogin: 'Log masuk di PC', navOpen: 'Buka LUNO', language: 'Bahasa',
    heroTitle: 'Lain bahasa,\ntetap faham serta-merta',
    heroSub: 'Sembang dengan terjemahan masa nyata, panggilan suara dan video percuma, 200 pelekat.\nSambung perbualan yang sama di telefon dan PC.',
    ctaApp: 'Muat turun untuk Android', ctaPc: 'Log masuk di PC', ctaWeb: 'Mula di web', ctaOpen: 'Buka LUNO',
    heroNote: 'Android 8.0 ke atas · Percuma',
    f1t: 'Lain bahasa, tetap mesra', f1d: 'Mesej yang diterima diterjemahkan ke bahasa anda supaya anda boleh bersembang dengan rakan di seluruh dunia.',
    f2t: 'Panggilan suara dan video percuma', f2d: 'Hubungi terus dari profil rakan atau bilik sembang, melalui Wi-Fi atau data mudah alih.',
    f3t: '200 pelekat LUNO', f3d: 'Luahkan perasaan lebih pantas. Pilih ikut kategori, pratonton besar, kemudian hantar.',
    f4t: 'Log masuk PC dengan satu imbasan QR', f4d: 'Luluskan kod QR pada skrin PC dengan aplikasi telefon dan terus masuk, tanpa menaip kata laluan.',
    f5t: 'Kumpulan dan sembang terbuka', f5d: 'Bina kumpulan bersama rakan dan kenali orang yang berkongsi minat sama.',
    dlTitle: 'Mula sekarang', dlSub: 'Satu akaun, perbualan yang sama, di mana-mana.',
    dlAndroidSub: 'Pasang fail APK', dlAndroidBtn: 'Muat turun', dlPcSub: 'Dalam pelayar, tanpa pemasangan', dlPcBtn: 'Log masuk',
    dlIosSub: 'Akan datang', dlIosBtn: 'Akan datang',
    footTerms: 'Terma', footPrivacy: 'Privasi',
    bubbleIn: 'Hai! Esok awak lapang?', bubbleOut: 'Boleh, panggilan video pukul 3 ya 😊', translated: 'Diterjemah',
  },
  hi: {
    title: 'LUNO — हर भाषा में बात करने वाला मैसेंजर',
    navFeatures: 'फ़ीचर', navDownload: 'डाउनलोड', navLogin: 'PC पर लॉग इन', navOpen: 'LUNO खोलें', language: 'भाषा',
    heroTitle: 'भाषा अलग हो,\nफिर भी बात तुरंत समझ आए',
    heroSub: 'लाइव अनुवाद वाली चैट, मुफ़्त वॉइस और वीडियो कॉल, 200 स्टिकर।\nफ़ोन और PC पर एक ही बातचीत जारी रखें।',
    ctaApp: 'Android के लिए डाउनलोड करें', ctaPc: 'PC पर लॉग इन करें', ctaWeb: 'वेब पर शुरू करें', ctaOpen: 'LUNO खोलें',
    heroNote: 'Android 8.0+ · मुफ़्त',
    f1t: 'भाषा अलग, बातचीत सहज', f1d: 'आने वाले संदेश आपकी भाषा में अनुवादित होते हैं, ताकि आप दुनिया भर के दोस्तों से बात कर सकें।',
    f2t: 'मुफ़्त वॉइस और वीडियो कॉल', f2d: 'दोस्त की प्रोफ़ाइल या चैट से सीधे कॉल करें, Wi-Fi या मोबाइल डेटा पर।',
    f3t: '200 LUNO स्टिकर', f3d: 'शब्दों से तेज़ भावनाएँ। श्रेणी चुनें, बड़ा प्रीव्यू देखें और भेजें।',
    f4t: 'एक QR स्कैन से PC लॉग इन', f4d: 'PC स्क्रीन का QR कोड फ़ोन ऐप से स्वीकृत करें और तुरंत लॉग इन करें, बिना पासवर्ड टाइप किए।',
    f5t: 'ग्रुप और ओपन चैट', f5d: 'दोस्तों के साथ ग्रुप बनाएँ और समान रुचि वाले लोगों से मिलें।',
    dlTitle: 'अभी शुरू करें', dlSub: 'एक खाता, वही चैट, हर जगह।',
    dlAndroidSub: 'APK इंस्टॉल करें', dlAndroidBtn: 'डाउनलोड', dlPcSub: 'ब्राउज़र में, बिना इंस्टॉल', dlPcBtn: 'लॉग इन',
    dlIosSub: 'जल्द आ रहा है', dlIosBtn: 'जल्द आ रहा है',
    footTerms: 'शर्तें', footPrivacy: 'गोपनीयता',
    bubbleIn: 'नमस्ते! कल आप फ़्री हैं?', bubbleOut: 'हाँ, 3 बजे वीडियो कॉल करते हैं 😊', translated: 'अनुवादित',
  },
  ar: {
    title: 'LUNO — تطبيق المراسلة الذي يتحدث كل اللغات',
    navFeatures: 'الميزات', navDownload: 'التنزيل', navLogin: 'تسجيل الدخول من الكمبيوتر', navOpen: 'فتح LUNO', language: 'اللغة',
    heroTitle: 'لغات مختلفة\nوتفاهم فوري',
    heroSub: 'دردشة بترجمة فورية، ومكالمات صوتية ومرئية مجانية، و200 ملصق.\nتابع المحادثة نفسها على الهاتف والكمبيوتر.',
    ctaApp: 'تنزيل لنظام Android', ctaPc: 'تسجيل الدخول من الكمبيوتر', ctaWeb: 'ابدأ على الويب', ctaOpen: 'فتح LUNO',
    heroNote: 'Android 8.0 أو أحدث · مجانًا',
    f1t: 'لغات مختلفة، حديث طبيعي', f1d: 'تُترجم الرسائل الواردة إلى لغتك لتتحدث بسهولة مع أصدقائك حول العالم.',
    f2t: 'مكالمات صوتية ومرئية مجانية', f2d: 'اتصل مباشرة من ملف الصديق أو من الدردشة، عبر Wi-Fi أو بيانات الجوال.',
    f3t: '200 ملصق من LUNO', f3d: 'عبّر عن مشاعرك أسرع من الكلمات. اختر حسب الفئة، وعاين بحجم كبير، ثم أرسل.',
    f4t: 'دخول الكمبيوتر بمسح رمز QR', f4d: 'وافق على رمز QR الظاهر على شاشة الكمبيوتر من تطبيق الهاتف لتدخل فورًا دون كتابة كلمة مرور.',
    f5t: 'المجموعات والدردشات المفتوحة', f5d: 'أنشئ مجموعات مع أصدقائك وتعرّف على أشخاص يشاركونك الاهتمامات.',
    dlTitle: 'ابدأ الآن', dlSub: 'حساب واحد والمحادثات نفسها في كل مكان.',
    dlAndroidSub: 'تثبيت ملف APK', dlAndroidBtn: 'تنزيل', dlPcSub: 'في المتصفح دون تثبيت', dlPcBtn: 'تسجيل الدخول',
    dlIosSub: 'قريبًا', dlIosBtn: 'قريبًا',
    footTerms: 'الشروط', footPrivacy: 'الخصوصية',
    bubbleIn: 'مرحبًا! هل أنت متفرغ غدًا؟', bubbleOut: 'بالتأكيد، مكالمة فيديو الساعة 3 😊', translated: 'مُترجَم',
  },
  es: {
    title: 'LUNO — la app de mensajería que habla todos los idiomas',
    navFeatures: 'Funciones', navDownload: 'Descargar', navLogin: 'Iniciar sesión en PC', navOpen: 'Abrir LUNO', language: 'Idioma',
    heroTitle: 'Idiomas distintos,\nentendimiento al instante',
    heroSub: 'Chat con traducción en tiempo real, llamadas de voz y video gratis, 200 stickers.\nSigue la misma conversación en el móvil y en el PC.',
    ctaApp: 'Descargar para Android', ctaPc: 'Iniciar sesión en PC', ctaWeb: 'Empezar en la web', ctaOpen: 'Abrir LUNO',
    heroNote: 'Android 8.0 o superior · Gratis',
    f1t: 'Idiomas distintos, conversación natural', f1d: 'Los mensajes que recibes se traducen a tu idioma para que hables con amigos de todo el mundo.',
    f2t: 'Llamadas de voz y video gratis', f2d: 'Llama directamente desde un perfil o un chat, por Wi-Fi o datos móviles.',
    f3t: '200 stickers de LUNO', f3d: 'Más rápido que las palabras. Elige por categoría, mira la vista previa en grande y envía.',
    f4t: 'Entra en el PC con un código QR', f4d: 'Aprueba el código QR de la pantalla del PC con la app del móvil y listo, sin escribir contraseñas.',
    f5t: 'Grupos y chats abiertos', f5d: 'Crea grupos con tus amigos y conoce a gente con tus mismos intereses.',
    dlTitle: 'Empieza ahora', dlSub: 'Una cuenta, las mismas conversaciones, en todas partes.',
    dlAndroidSub: 'Instala el APK', dlAndroidBtn: 'Descargar', dlPcSub: 'En tu navegador, sin instalar nada', dlPcBtn: 'Iniciar sesión',
    dlIosSub: 'Próximamente', dlIosBtn: 'Próximamente',
    footTerms: 'Términos', footPrivacy: 'Privacidad',
    bubbleIn: '¡Hola! ¿Estás libre mañana?', bubbleOut: 'Claro, videollamada a las 3 😊', translated: 'Traducido',
  },
  pt: {
    title: 'LUNO — o mensageiro que fala todas as línguas',
    navFeatures: 'Recursos', navDownload: 'Baixar', navLogin: 'Entrar no PC', navOpen: 'Abrir o LUNO', language: 'Idioma',
    heroTitle: 'Idiomas diferentes,\nentendimento na hora',
    heroSub: 'Chat com tradução em tempo real, chamadas de voz e vídeo grátis, 200 figurinhas.\nContinue a mesma conversa no celular e no PC.',
    ctaApp: 'Baixar para Android', ctaPc: 'Entrar no PC', ctaWeb: 'Começar na web', ctaOpen: 'Abrir o LUNO',
    heroNote: 'Android 8.0 ou superior · Grátis',
    f1t: 'Idiomas diferentes, conversa natural', f1d: 'As mensagens recebidas são traduzidas para o seu idioma, para você conversar com amigos do mundo todo.',
    f2t: 'Chamadas de voz e vídeo grátis', f2d: 'Ligue direto do perfil ou da conversa, pelo Wi-Fi ou pelos dados móveis.',
    f3t: '200 figurinhas LUNO', f3d: 'Mais rápido que palavras. Escolha por categoria, veja a prévia em tamanho grande e envie.',
    f4t: 'Entre no PC com um QR code', f4d: 'Aprove o QR code da tela do PC pelo app do celular e pronto, sem digitar senha.',
    f5t: 'Grupos e chats abertos', f5d: 'Crie grupos com amigos e conheça pessoas com os mesmos interesses.',
    dlTitle: 'Comece agora', dlSub: 'Uma conta, as mesmas conversas, em qualquer lugar.',
    dlAndroidSub: 'Instale o APK', dlAndroidBtn: 'Baixar', dlPcSub: 'No navegador, sem instalar nada', dlPcBtn: 'Entrar',
    dlIosSub: 'Em breve', dlIosBtn: 'Em breve',
    footTerms: 'Termos', footPrivacy: 'Privacidade',
    bubbleIn: 'Oi! Você está livre amanhã?', bubbleOut: 'Claro, chamada de vídeo às 3 😊', translated: 'Traduzido',
  },
  fr: {
    title: 'LUNO — la messagerie qui parle toutes les langues',
    navFeatures: 'Fonctionnalités', navDownload: 'Télécharger', navLogin: 'Connexion sur PC', navOpen: 'Ouvrir LUNO', language: 'Langue',
    heroTitle: 'Des langues différentes,\nune compréhension immédiate',
    heroSub: 'Discussions traduites en temps réel, appels audio et vidéo gratuits, 200 stickers.\nPoursuivez la même conversation sur mobile et sur PC.',
    ctaApp: 'Télécharger pour Android', ctaPc: 'Se connecter sur PC', ctaWeb: 'Commencer sur le web', ctaOpen: 'Ouvrir LUNO',
    heroNote: 'Android 8.0 ou plus · Gratuit',
    f1t: 'Langues différentes, échange naturel', f1d: 'Les messages reçus sont traduits dans votre langue pour discuter avec des amis du monde entier.',
    f2t: 'Appels audio et vidéo gratuits', f2d: 'Appelez directement depuis un profil ou une discussion, en Wi-Fi ou en données mobiles.',
    f3t: '200 stickers LUNO', f3d: 'Plus rapide que les mots. Choisissez par catégorie, prévisualisez en grand, envoyez.',
    f4t: 'Connexion PC en un scan QR', f4d: "Validez le QR code affiché sur le PC avec l'app mobile et c'est fait, sans saisir de mot de passe.",
    f5t: 'Groupes et discussions ouvertes', f5d: 'Créez des groupes avec vos amis et rencontrez des personnes qui partagent vos centres d’intérêt.',
    dlTitle: 'Commencez dès maintenant', dlSub: 'Un compte, les mêmes discussions, partout.',
    dlAndroidSub: "Installer l'APK", dlAndroidBtn: 'Télécharger', dlPcSub: 'Dans le navigateur, sans installation', dlPcBtn: 'Se connecter',
    dlIosSub: 'Bientôt disponible', dlIosBtn: 'Bientôt',
    footTerms: 'Conditions', footPrivacy: 'Confidentialité',
    bubbleIn: 'Salut ! Tu es libre demain ?', bubbleOut: 'Oui, appel vidéo à 15 h 😊', translated: 'Traduit',
  },
  de: {
    title: 'LUNO — der Messenger, der jede Sprache spricht',
    navFeatures: 'Funktionen', navDownload: 'Download', navLogin: 'Am PC anmelden', navOpen: 'LUNO öffnen', language: 'Sprache',
    heroTitle: 'Andere Sprache,\nsofort verstanden',
    heroSub: 'Chat mit Live-Übersetzung, kostenlose Sprach- und Videoanrufe, 200 Sticker.\nFühre dasselbe Gespräch auf Handy und PC fort.',
    ctaApp: 'Für Android herunterladen', ctaPc: 'Am PC anmelden', ctaWeb: 'Im Web starten', ctaOpen: 'LUNO öffnen',
    heroNote: 'Android 8.0+ · Kostenlos',
    f1t: 'Verschiedene Sprachen, ganz natürlich', f1d: 'Eingehende Nachrichten werden in deine Sprache übersetzt, damit du mit Freunden auf der ganzen Welt chatten kannst.',
    f2t: 'Kostenlose Sprach- und Videoanrufe', f2d: 'Ruf direkt aus einem Profil oder Chat an, per WLAN oder mobilen Daten.',
    f3t: '200 LUNO-Sticker', f3d: 'Schneller als Worte. Nach Kategorie wählen, groß ansehen, senden.',
    f4t: 'PC-Anmeldung per QR-Code', f4d: 'Bestätige den QR-Code auf dem PC mit der Handy-App und schon bist du drin, ganz ohne Passwort.',
    f5t: 'Gruppen und offene Chats', f5d: 'Gründe Gruppen mit Freunden und triff Menschen mit denselben Interessen.',
    dlTitle: 'Jetzt loslegen', dlSub: 'Ein Konto, dieselben Chats, überall.',
    dlAndroidSub: 'APK installieren', dlAndroidBtn: 'Download', dlPcSub: 'Im Browser, ohne Installation', dlPcBtn: 'Anmelden',
    dlIosSub: 'Demnächst', dlIosBtn: 'Demnächst',
    footTerms: 'Nutzungsbedingungen', footPrivacy: 'Datenschutz',
    bubbleIn: 'Hi! Hast du morgen Zeit?', bubbleOut: 'Klar, Videoanruf um 15 Uhr 😊', translated: 'Übersetzt',
  },
  it: {
    title: 'LUNO — la messaggistica che parla ogni lingua',
    navFeatures: 'Funzioni', navDownload: 'Scarica', navLogin: 'Accedi da PC', navOpen: 'Apri LUNO', language: 'Lingua',
    heroTitle: 'Lingue diverse,\nci si capisce subito',
    heroSub: 'Chat con traduzione in tempo reale, chiamate vocali e video gratuite, 200 sticker.\nContinua la stessa conversazione su telefono e PC.',
    ctaApp: 'Scarica per Android', ctaPc: 'Accedi da PC', ctaWeb: 'Inizia sul web', ctaOpen: 'Apri LUNO',
    heroNote: 'Android 8.0 o successivo · Gratis',
    f1t: 'Lingue diverse, dialogo naturale', f1d: 'I messaggi ricevuti vengono tradotti nella tua lingua, così puoi parlare con amici in tutto il mondo.',
    f2t: 'Chiamate vocali e video gratuite', f2d: 'Chiama direttamente da un profilo o da una chat, con Wi-Fi o dati mobili.',
    f3t: '200 sticker LUNO', f3d: 'Più veloci delle parole. Scegli per categoria, guarda l’anteprima in grande e invia.',
    f4t: 'Accesso da PC con un QR', f4d: "Approva il codice QR sullo schermo del PC con l'app del telefono ed entri subito, senza digitare password.",
    f5t: 'Gruppi e chat aperte', f5d: 'Crea gruppi con gli amici e incontra persone con i tuoi stessi interessi.',
    dlTitle: 'Inizia ora', dlSub: 'Un account, le stesse chat, ovunque.',
    dlAndroidSub: "Installa l'APK", dlAndroidBtn: 'Scarica', dlPcSub: 'Nel browser, senza installare nulla', dlPcBtn: 'Accedi',
    dlIosSub: 'In arrivo', dlIosBtn: 'In arrivo',
    footTerms: 'Termini', footPrivacy: 'Privacy',
    bubbleIn: 'Ciao! Sei libero domani?', bubbleOut: 'Certo, videochiamata alle 15 😊', translated: 'Tradotto',
  },
  ru: {
    title: 'LUNO — мессенджер, который говорит на всех языках',
    navFeatures: 'Возможности', navDownload: 'Скачать', navLogin: 'Вход на ПК', navOpen: 'Открыть LUNO', language: 'Язык',
    heroTitle: 'Разные языки —\nи сразу понятно',
    heroSub: 'Чат с мгновенным переводом, бесплатные голосовые и видеозвонки, 200 стикеров.\nПродолжайте один и тот же разговор на телефоне и ПК.',
    ctaApp: 'Скачать для Android', ctaPc: 'Войти на ПК', ctaWeb: 'Начать в браузере', ctaOpen: 'Открыть LUNO',
    heroNote: 'Android 8.0 и выше · Бесплатно',
    f1t: 'Разные языки, живое общение', f1d: 'Входящие сообщения переводятся на ваш язык — общайтесь с друзьями по всему миру.',
    f2t: 'Бесплатные голосовые и видеозвонки', f2d: 'Звоните прямо из профиля или чата — по Wi-Fi или мобильному интернету.',
    f3t: '200 стикеров LUNO', f3d: 'Быстрее слов. Выбирайте по категориям, смотрите крупно и отправляйте.',
    f4t: 'Вход на ПК по QR-коду', f4d: 'Подтвердите QR-код на экране ПК в приложении на телефоне — и вы внутри, без ввода пароля.',
    f5t: 'Группы и открытые чаты', f5d: 'Создавайте группы с друзьями и знакомьтесь с людьми с общими интересами.',
    dlTitle: 'Начните сейчас', dlSub: 'Один аккаунт, те же чаты — везде.',
    dlAndroidSub: 'Установите APK', dlAndroidBtn: 'Скачать', dlPcSub: 'В браузере, без установки', dlPcBtn: 'Войти',
    dlIosSub: 'Скоро', dlIosBtn: 'Скоро',
    footTerms: 'Условия', footPrivacy: 'Конфиденциальность',
    bubbleIn: 'Привет! Ты завтра свободен?', bubbleOut: 'Да, давай видеозвонок в 15:00 😊', translated: 'Переведено',
  },
  tr: {
    title: 'LUNO — her dili konuşan mesajlaşma uygulaması',
    navFeatures: 'Özellikler', navDownload: 'İndir', navLogin: "PC'de giriş", navOpen: "LUNO'yu aç", language: 'Dil',
    heroTitle: 'Diller farklı,\nanlaşmak anında',
    heroSub: 'Anlık çeviri ile sohbet, ücretsiz sesli ve görüntülü arama, 200 çıkartma.\nAynı sohbete telefonda ve PC’de devam edin.',
    ctaApp: 'Android için indir', ctaPc: "PC'de giriş yap", ctaWeb: "Web'de başla", ctaOpen: "LUNO'yu aç",
    heroNote: 'Android 8.0 ve üzeri · Ücretsiz',
    f1t: 'Farklı diller, doğal sohbet', f1d: 'Gelen mesajlar kendi dilinize çevrilir; dünyanın her yerindeki arkadaşlarınızla rahatça konuşun.',
    f2t: 'Ücretsiz sesli ve görüntülü arama', f2d: 'Bir profilden ya da sohbetten doğrudan arayın; Wi-Fi veya mobil veriyle.',
    f3t: '200 LUNO çıkartması', f3d: 'Kelimelerden hızlı. Kategoriye göre seçin, büyük önizleyin, gönderin.',
    f4t: 'Tek QR ile PC girişi', f4d: "PC ekranındaki QR kodunu telefon uygulamasıyla onaylayın ve şifre yazmadan hemen girin.",
    f5t: 'Gruplar ve açık sohbetler', f5d: 'Arkadaşlarınızla grup kurun, aynı ilgi alanlarına sahip insanlarla tanışın.',
    dlTitle: 'Hemen başlayın', dlSub: 'Tek hesap, aynı sohbetler, her yerde.',
    dlAndroidSub: 'APK dosyasını yükleyin', dlAndroidBtn: 'İndir', dlPcSub: 'Tarayıcıda, kurulum gerektirmez', dlPcBtn: 'Giriş yap',
    dlIosSub: 'Çok yakında', dlIosBtn: 'Çok yakında',
    footTerms: 'Koşullar', footPrivacy: 'Gizlilik',
    bubbleIn: 'Merhaba! Yarın müsait misin?', bubbleOut: 'Tabii, saat 3’te görüntülü arayalım 😊', translated: 'Çevrildi',
  },
}

/** The demo's incoming original: Thai, or Korean when the reader is Thai. */
export function demoOriginal(lang: SiteLang): string {
  return lang === 'th' ? '안녕하세요! 내일 시간 괜찮아요?' : THAI
}
