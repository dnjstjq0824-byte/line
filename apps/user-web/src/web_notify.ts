// N1-L: hidden-tab browser notifications for messages and incoming calls.
//
// Permission is requested ONLY from the settings-screen button calling
// requestWebNotifyPermission() — never on load or on first message.
import { ref } from 'vue'

import { api } from './store/session'

const STORAGE_KEY = 'luno_web_notify'

function storedFlag(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const webNotifyEnabled = ref(storedFlag())

export function setWebNotifyEnabled(on: boolean) {
  webNotifyEnabled.value = on
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {}
}

/// Settings-button entry point. Resolves true when notifications can show.
export async function requestWebNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  try {
    if (Notification.permission === 'granted') {
      setWebNotifyEnabled(true)
      return true
    }
    if (Notification.permission === 'denied') {
      setWebNotifyEnabled(false)
      return false
    }
    const result = await Notification.requestPermission()
    setWebNotifyEnabled(result === 'granted')
    return result === 'granted'
  } catch {
    return false
  }
}

/// P1-4: Web Push subscription (closed-browser delivery through the
/// service worker). Subscribe only after the settings permission grant;
/// without server VAPID keys this silently stays off and hidden-tab
/// notifications keep working.
function vapidKeyBytes(publicKey: string): Uint8Array {
  const padded = publicKey + '='.repeat((4 - (publicKey.length % 4)) % 4)
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function syncWebPushSubscription(): Promise<boolean> {
  try {
    if (!webNotifyEnabled.value) return false
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const { public_key } = await api<{ public_key: string }>('/api/v1/push/vapid-key')
      if (!public_key) return false
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(public_key) as BufferSource })
    }
    const raw = sub.toJSON()
    await api('/api/v1/push/subscriptions', 'POST', {
      endpoint: raw.endpoint,
      keys: { p256dh: raw.keys?.p256dh, auth: raw.keys?.auth },
    })
    return true
  } catch {
    return false
  }
}

export async function clearWebPushSubscription(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready.catch(() => null)
    const sub = await reg?.pushManager.getSubscription().catch(() => null)
    const endpoint = sub?.endpoint || ''
    await sub?.unsubscribe().catch(() => {})
    if (endpoint) await api('/api/v1/push/subscriptions', 'DELETE', { endpoint }).catch(() => {})
  } catch {}
}

/// Show only when the tab is hidden, the user enabled notifications in
/// settings, and the browser granted permission.
export function maybeWebNotify(title: string, body: string, tag: string) {
  try {
    if (typeof document !== 'undefined' && !document.hidden) return
    if (!webNotifyEnabled.value) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    new Notification(title, { body, tag })
  } catch {}
}

export function webNotifyKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    image: '[사진]',
    video: '[동영상]',
    file: '[파일]',
    voice: '[음성 메시지]',
    sticker: '[스티커]',
    location: '[위치]',
    contact: '[연락처]',
  }
  return labels[kind] || '[새 메시지]'
}
