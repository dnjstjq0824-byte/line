import { ref } from 'vue'
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
export const activeTheme = ref<'mint' | 'ocean' | 'sunset' | 'sakura' | 'midnight'>('midnight')
export const darkMode = ref(false)

export const appVersion = ref({
  commit: '',
  short_commit: '',
  worker_version: '2.0.0',
  build_time: '',
  env: 'production'
})

export async function fetchAppVersion() {
  try {
    const res = await api<any>('/api/v1/version')
    if (res && res.commit) {
      appVersion.value = res
    }
  } catch {}
}

// I-2: access tokens live 15 minutes; the httpOnly refresh cookie renews
// them. One in-flight refresh is shared (singleflight); a failed refresh
// means re-login, never a retry loop.
let refreshing: Promise<string | null> | null = null
function tryRefresh(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(API_URL + '/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        if (!res.ok) return null
        const pair = await res.json()
        if (!pair?.access_token) return null
        token.value = pair.access_token
        const storage = localStorage.getItem('luno.auth_token') ? localStorage : sessionStorage
        if (storage.getItem('luno.auth_token')) storage.setItem('luno.auth_token', token.value)
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

export function readStoredToken(): string {
  return localStorage.getItem('luno.auth_token') || sessionStorage.getItem('luno.auth_token') || ''
}
export function readStoredDeviceId(): string {
  const storage = localStorage.getItem('luno.auth_token') ? localStorage : sessionStorage
  return storage.getItem('luno.device_id') || ''
}
export function storeSession(session: LoginResult, persistent: boolean) {
  token.value = session.access_token
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem('luno.auth_token')
    storage.removeItem('luno.device_id')
  }
  const storage = persistent ? localStorage : sessionStorage
  storage.setItem('luno.auth_token', token.value)
  if (session.device_id) storage.setItem('luno.device_id', session.device_id)
}
export function clearStoredToken() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem('luno.auth_token')
    storage.removeItem('luno.device_id')
  }
}
export type { LunoLocale, User }
