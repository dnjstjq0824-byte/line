// Shell preferences: notifications, wallpaper, theme (P2 MessengerView split).
// Self-contained over the session store; no view bindings.
// Extracted verbatim from views/MessengerView.vue.
import { ref } from 'vue'
import { activeTheme, darkMode, note, t } from '../store/session'

export function useShellPrefs() {
  const notificationsEnabled = ref(true)
  function toggleNotifications() {
    notificationsEnabled.value = !notificationsEnabled.value
    note.value = notificationsEnabled.value ? t('mvNotifEnabled') : t('mvDndEnabled')
  }

  const chatWallpaper = ref<'skyblue' | 'slate' | 'mint' | 'dark'>('skyblue')
  function cycleWallpaper() {
    const order: Array<'skyblue' | 'slate' | 'mint' | 'dark'> = ['skyblue', 'slate', 'mint', 'dark']
    const next = order[(order.indexOf(chatWallpaper.value) + 1) % order.length]
    chatWallpaper.value = next
    const names: Record<string, string> = { skyblue: t('mvWallSky'), slate: t('mvWallSlate'), mint: t('mvWallMint'), dark: t('mvWallDark') }
    note.value = t('mvWallpaperChanged').replace('{name}', names[next])
  }

  // --- Settings & Themes ---
  function switchTheme(theme: 'mint' | 'ocean' | 'sunset' | 'sakura' | 'midnight') {
    activeTheme.value = theme
    darkMode.value = theme === 'midnight'
    note.value = t('mvThemeChanged').replace('{name}', theme.toUpperCase())
  }

  return {
    notificationsEnabled,
    toggleNotifications,
    chatWallpaper,
    cycleWallpaper,
    switchTheme,
  }
}
