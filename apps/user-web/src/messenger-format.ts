// Display formatters for the messenger web client (P2 MessengerView split).
// Pure over (args, session locale, i18n): safe to share across components.
// Extracted verbatim from views/MessengerView.vue; FriendPanel dedupes here too.
import { currentLocale, t } from './store/session'
import { UI_DICTIONARY, formatLocalizedTime, type LunoLocale } from './luno-i18n'
import { listRowTime } from '../../shared/list_time'

// BCP-47 tags for locale-aware Intl formatting (follows formatLocalizedTime precedent).
export const RTF_LOCALE: Record<LunoLocale, string> = { ko: 'ko-KR', en: 'en-US', th: 'th-TH', ja: 'ja-JP' }

// News categories use stable IDs; labels resolve via t().
export const NEWS_CATEGORY_IDS = ['all', 'popular', 'economy', 'science', 'global', 'ent', 'bookmark']
export const NEWS_CAT_KEY: Record<string, string> = { all: 'mvNewsCatAll', popular: 'mvNewsCatPopular', economy: 'mvNewsCatEconomy', science: 'mvNewsCatScience', global: 'mvNewsCatGlobal', ent: 'mvNewsCatEnt', bookmark: 'mvNewsCatBookmark' }
export function newsCatLabel(id: string): string { return t(NEWS_CAT_KEY[id] || 'mvNewsCatAll') }
export function newsCatKoLabel(id: string): string { return UI_DICTIONARY.ko[NEWS_CAT_KEY[id] || 'mvNewsCatAll'] || id }

// Status line for a person; accounts made before the server stopped filling
// a placeholder bio still carry "New Messenger User", which is shown as empty.
export function taglineOf(u: { status_message?: string; bio?: string } | null | undefined): string {
  if (!u) return ''
  const bio = u.bio && u.bio !== 'New Messenger User' ? u.bio : ''
  return u.status_message || bio
}

export function formatKRW(amount: number): string {
  try {
    return new Intl.NumberFormat(RTF_LOCALE[currentLocale.value] || 'ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount)
  } catch { return amount.toLocaleString() }
}

export function relTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  const min = Math.max(1, Math.round(ms / 60000))
  const rtf = new Intl.RelativeTimeFormat(RTF_LOCALE[currentLocale.value] || 'ko-KR', { numeric: 'always' })
  if (min < 60) return rtf.format(-min, 'minute')
  if (min < 60 * 24) return rtf.format(-Math.round(min / 60), 'hour')
  return rtf.format(-Math.round(min / 1440), 'day')
}

export function callDateText(iso: string): string {
  const d = new Date(iso)
  const tag = RTF_LOCALE[currentLocale.value] || 'ko-KR'
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diffDays < 1) return d.toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit' })
  if (diffDays < 7) return new Intl.DateTimeFormat(tag, { weekday: 'long' }).format(d)
  return new Intl.DateTimeFormat(tag, { month: 'numeric', day: 'numeric' }).format(d)
}

export function formatDateDivider(dateStr?: string) {
  if (!dateStr) return t('mvToday')
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return new Intl.DateTimeFormat(RTF_LOCALE[currentLocale.value] || 'ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(d)
}

// --- Burst Grouping (§7-3): same sender within 60s stays in one visual group.
// Group lead shows avatar + name (theirs); group tail shows timestamp + read.
export function isSameBurst(a: any, b: any) {
  if (!a || !b) return false
  if (a.sender_id !== b.sender_id) return false
  const ta = new Date(a.created_at).getTime()
  const tb = new Date(b.created_at).getTime()
  if (isNaN(ta) || isNaN(tb)) return false
  if (new Date(a.created_at).toDateString() !== new Date(b.created_at).toDateString()) return false
  return Math.abs(ta - tb) < 60000
}

// Format duration mm:ss
export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Format time with localized format
export function formatTime(iso: string) {
  if (!iso) return ''
  return formatLocalizedTime(iso, currentLocale.value)
}

// Item 9: day-aware list rows — a 23:20 message from yesterday must not read
// as "today 11:20 PM". Bubbles keep time-only (dividers disambiguate).
export function formatListTime(iso: string) {
  if (!iso) return ''
  return listRowTime(iso, { tag: RTF_LOCALE[currentLocale.value] || 'ko-KR', yesterday: t('mvYesterday') })
}

// FX-10: a broken avatar photo hides itself; the initial layered
// underneath shows instead of the browser's broken-image glyph.
export function hideBrokenAvatar(ev: Event) {
  const img = ev.target as HTMLElement | null
  if (img) img.style.display = 'none'
}
