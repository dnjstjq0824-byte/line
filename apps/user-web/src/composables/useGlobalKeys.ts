// Global keys + keyboard viewport (P2 MessengerView split). Escape closes
// the topmost dialog; the iOS keyboard handler needs no state at all.
// Modal flags are injected (deps precedent).
// Extracted verbatim from views/MessengerView.vue.
import type { Ref } from 'vue'
import type { NewsArticle } from '../../../shared/api'
import type { User } from '../../../shared/api'

export interface GlobalKeysDeps {
  showSettingsModal: Ref<boolean>
  showNewChatModal: Ref<boolean>
  showAddFriendModal: Ref<boolean>
  showPasswordModal: Ref<boolean>
  activeNewsArticle: Ref<NewsArticle | null>
  selectedFriendProfile: Ref<User | null>
  showQrModal: Ref<boolean>
}

export function useGlobalKeys(deps: GlobalKeysDeps) {
  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (deps.showSettingsModal.value) deps.showSettingsModal.value = false
      if (deps.showNewChatModal.value) deps.showNewChatModal.value = false
      if (deps.showAddFriendModal.value) deps.showAddFriendModal.value = false
      if (deps.showPasswordModal.value) deps.showPasswordModal.value = false
      if (deps.activeNewsArticle.value) deps.activeNewsArticle.value = null
      if (deps.selectedFriendProfile.value) deps.selectedFriendProfile.value = null
      if (deps.showQrModal.value) deps.showQrModal.value = false
    }
  }

  // FX-07: iOS keyboards shrink the visual viewport; while one is open the
  // composer sticks to the viewport bottom instead of hiding behind it.
  function syncKeyboardOpen() {
    const vv = window.visualViewport
    if (!vv) return
    const open = vv.height < window.innerHeight - 120
    document.documentElement.classList.toggle('keyboard-open', open)
    // The phone room pane follows the visible area so the composer stays above the keyboard.
    document.documentElement.style.setProperty('--lx-vv-h', `${Math.round(vv.height)}px`)
  }

  return {
    handleGlobalKeydown,
    syncKeyboardOpen,
  }
}
