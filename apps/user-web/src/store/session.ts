import { ref, watch } from 'vue'
import { reportError } from '../../../shared/monitor'
import { handoffText } from '../../../shared/handoff-i18n'
import { UI_DICTIONARY, detectInitialLocale, type LunoLocale } from '../luno-i18n'
import { API_URL, ApiError, request, type LoginResult, type User } from '../../../shared/api'

// --- Session store: shared reactive state for the auth view and messenger shell ---
export const currentLocale = ref<LunoLocale>(detectInitialLocale())
export const t = (key: string): string => handoffText(currentLocale.value, key) || UI_DICTIONARY[currentLocale.value]?.[key] || UI_DICTIONARY.en[key] || key
export function setLocale(loc: LunoLocale) {
  currentLocale.value = loc
  localStorage.setItem('luno.locale', loc)
}

export const isDarkMode = ref(localStorage.getItem('luno.design.theme') === 'dark' || (!localStorage.getItem('luno.design.theme') && matchMedia('(prefers-color-scheme: dark)').matches))
document.documentElement.dataset.theme = isDarkMode.value ? 'dark' : 'light'
export function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value
  darkMode.value = isDarkMode.value
  localStorage.setItem('luno.design.theme', isDarkMode.value ? 'dark' : 'light')
  if (isDarkMode.value) {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

export const token = ref('')
export const currentUser = ref<User | null>(null)
export const error = ref('')
export const note = ref('')
// Item 5: info toasts dismiss themselves; errors stay until acknowledged.
export const NOTE_TTL_MS = 4000
let noteTimer: ReturnType<typeof setTimeout> | null = null
watch(note, (text) => {
  if (noteTimer) clearTimeout(noteTimer)
  noteTimer = null
  if (!text) return
  noteTimer = setTimeout(() => {
    noteTimer = null
    if (note.value === text) note.value = ''
  }, NOTE_TTL_MS)
})
export const activeTheme = ref<'mint' | 'ocean' | 'sunset' | 'sakura' | 'midnight'>('midnight')
export const darkMode = ref(false)

export const appVersion = ref({
  commit: '',
  short_commit: '',
  worker_version: '2.0.0',
  build_time: '',
  env: 'production'
})
// F13: money UI stays in "preparing" state unless the server says on.
export const paymentsEnabled = ref(false)

export async function fetchAppVersion() {
  try {
    const res = await api<any>('/api/v1/version')
    if (res && res.commit) {
      appVersion.value = res
    }
    paymentsEnabled.value = res?.payments_enabled === true
  } catch {}
}

// I-2: access tokens live 15 minutes; the httpOnly refresh cookie renews
// them. One in-flight refresh is shared (singleflight); a failed refresh
// means re-login, never a retry loop.
// F19: access tokens live in memory only. Reload survival comes from one
// silent cookie refresh; storage keeps the non-secret device marker and
// remember flag only. Legacy `luno.auth_token` rows purge on sight.
const REMEMBER_KEY = 'luno.remember'
const DEVICE_KEY = 'luno.device_id'
const LEGACY_TOKEN_KEY = 'luno.auth_token'
function purgeLegacyTokens() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(LEGACY_TOKEN_KEY)
  }
}
purgeLegacyTokens()
function readRemember(): boolean {
  const v = localStorage.getItem(REMEMBER_KEY) ?? sessionStorage.getItem(REMEMBER_KEY)
  return v === null ? true : v === '1'
}
let refreshing: Promise<string | null> | null = null
function tryRefresh(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(API_URL + '/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remember: readRemember() }),
        })
        if (!res.ok) return null
        const pair = await res.json()
        if (!pair?.access_token) return null
        token.value = pair.access_token
        return token.value
      } catch {
        return null
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}
export async function ensureSession(): Promise<boolean> {
  purgeLegacyTokens()
  if (token.value) return true
  return (await tryRefresh()) !== null
}
export const api = async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  try {
    return await request<T>(path, token.value || null, method, body)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && !path.startsWith('/api/v1/auth/')) {
      const fresh = await tryRefresh()
      if (fresh) return await request<T>(path, fresh, method, body)
    }
    throw e
  }
}
export const wrap = async (job: () => Promise<void>) => {
  error.value = ''
  note.value = ''
  try {
    await job()
  } catch (e) {
    error.value = (e as Error).message
    reportError(e, { surface: 'user-web' })
  }
}

export function readStoredDeviceId(): string {
  return localStorage.getItem(DEVICE_KEY) || sessionStorage.getItem(DEVICE_KEY) || ''
}
export function storeSession(session: LoginResult, persistent: boolean) {
  token.value = session.access_token
  purgeLegacyTokens()
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(DEVICE_KEY)
    storage.removeItem(REMEMBER_KEY)
  }
  const storage = persistent ? localStorage : sessionStorage
  if (session.device_id) storage.setItem(DEVICE_KEY, session.device_id)
  storage.setItem(REMEMBER_KEY, persistent ? '1' : '0')
}
export function clearStoredToken() {
  purgeLegacyTokens()
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(DEVICE_KEY)
    storage.removeItem(REMEMBER_KEY)
  }
}
export type { LunoLocale, User }
