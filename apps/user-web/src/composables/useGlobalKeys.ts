// Global keys + keyboard viewport (P2 MessengerView split).
// Dialogs close themselves on Escape (directives/dialog.ts stops the event
// at the topmost dialog), so this handler only sees Escape when no dialog is
// open: it then closes the friend profile pane. The iOS keyboard handler
// needs no state at all.
import type { Ref } from 'vue'
import type { User } from '../../../shared/api'

export interface GlobalKeysDeps {
  selectedFriendProfile: Ref<User | null>
}

export function useGlobalKeys(deps: GlobalKeysDeps) {
  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !e.isComposing && deps.selectedFriendProfile.value) {
      deps.selectedFriendProfile.value = null
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
