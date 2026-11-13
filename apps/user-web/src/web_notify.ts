// N1-L: hidden-tab browser notifications for messages and incoming calls.
//
// Permission is requested ONLY from the settings-screen button calling
// requestWebNotifyPermission() — never on load or on first message.
import { ref } from 'vue'

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
