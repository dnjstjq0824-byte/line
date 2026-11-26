// Official-account rich menu (P2 MessengerView split). Owns the active menu
// and tile taps; the composer draft and sender are injected.
// Extracted verbatim from views/MessengerView.vue.
import { ref, type Ref } from 'vue'
import { api, t } from '../store/session'

export interface RichMenuDeps {
  draftMessage: Ref<string>
  sendMessage: () => Promise<void>
}

export function useRichMenu(deps: RichMenuDeps) {
  // --- Official Account Rich Menu ---
  const activeRichMenu = ref<{ id: string; title: string; layout?: 'grid_2x3' | 'grid_1x3'; tiles: Array<{ id: string; label: string; icon: string; action: { type: string; text?: string; uri?: string; data?: string } }> } | null>(null)
  const showRichMenu = ref(true)

  async function loadConversationRichMenu(cid: string) {
    activeRichMenu.value = null
    if (!cid) return
    try {
      const res = await api<{ rich_menu: any }>(`/api/v1/conversations/${cid}/rich-menu`)
      if (res && res.rich_menu) {
        activeRichMenu.value = res.rich_menu
        showRichMenu.value = true
      }
    } catch {
      activeRichMenu.value = null
    }
  }

  function onRichMenuTileClick(tile: any) {
    if (!tile || !tile.action) return
    if (tile.action.type === 'message') {
      deps.draftMessage.value = tile.action.text || tile.label
      void deps.sendMessage()
    } else if (tile.action.type === 'uri') {
      if (tile.action.uri) window.open(tile.action.uri, '_blank')
    } else if (tile.action.type === 'postback') {
      deps.draftMessage.value = t('mvPostback').replace('{body}', String(tile.action.data || tile.label))
      void deps.sendMessage()
    }
  }

  return {
    activeRichMenu,
    showRichMenu,
    loadConversationRichMenu,
    onRichMenuTileClick,
  }
}
