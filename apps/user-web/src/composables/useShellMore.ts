// More-panel config + console links (P2 MessengerView split). Static menu
// vocabulary and visibility-filtered lists; store state only, no view deps.
// Extracted verbatim from views/MessengerView.vue.
import { computed, ref } from 'vue'
import { currentUser, paymentsEnabled } from '../store/session'
import type { NavItem } from '../router'

export function useShellMore() {
  const showMorePanel = ref(false)
  const MORE_ITEMS: { id: string; icon: string; label: string; nav?: NavItem }[] = [
    { id: 'wallet', icon: 'wallet', label: 'mvWallet', nav: 'wallet' },
    { id: 'shop', icon: 'shop', label: 'lxStickerShop', nav: 'shop' },
    { id: 'voom', icon: 'voom', label: 'lxVoom', nav: 'voom' },
    { id: 'openchat', icon: 'openchat', label: 'navOpenChat', nav: 'openchat' },
    { id: 'keep', icon: 'keep', label: 'navKeep' },
    { id: 'add-friend', icon: 'add-friends', label: 'mvAddFriend' },
    { id: 'qr', icon: 'scan', label: 'lxMyQr' },
    { id: 'capture', icon: 'camera', label: 'lxCapture' },
    { id: 'download', icon: 'download', label: 'lxGetApp' },
    { id: 'settings', icon: 'settings', label: 'navSettings' },
  ]
  // Audit P0-7: launch is 100% free — the wallet entry hides until the
  // server reports payments_enabled (Stage 3 re-enables it).
  const visibleMoreItems = computed(() =>
    paymentsEnabled.value ? MORE_ITEMS : MORE_ITEMS.filter(entry => entry.id !== 'wallet'))
  // Operator consoles are tools for staff, not part of the messenger: only an
  // admin account sees the links.
  const consoleLinks = computed(() => currentUser.value?.role === 'admin'
    ? [
        { href: './admin/', label: 'mvConsoleAdmin' },
        { href: './partner/', label: 'mvConsolePartner' },
        { href: './developer/', label: 'mvConsoleDev' },
        { href: './creator/', label: 'mvConsoleCreator' },
        { href: './ads/', label: 'mvConsoleAds' },
      ]
    : [])

  return {
    showMorePanel,
    MORE_ITEMS,
    visibleMoreItems,
    consoleLinks,
  }
}
