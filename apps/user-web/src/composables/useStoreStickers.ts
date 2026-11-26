// Store + sticker catalogs + devices (P2 MessengerView split). Owns the
// shop packs, sticker picker state, device list and their loaders; server
// state only, no view bindings.
// Extracted verbatim from views/MessengerView.vue.
import { computed, ref } from 'vue'
import { api, t, token } from '../store/session'
import { LUNO_STICKERS, type LunoSticker } from '../luno-stickers'
import { parseStorePacks } from '../../../shared/shop'

export function useStoreStickers() {
  const activeStickerCategory = ref<'All' | LunoSticker['character']>('All')

  const filteredStickers = computed(() => {
    if (activeStickerCategory.value === 'All') return LUNO_STICKERS
    return LUNO_STICKERS.filter(s => s.character === activeStickerCategory.value)
  })

  function getStickerSvg(id: string): string {
    const found = LUNO_STICKERS.find(s => s.id === id)
    return found ? found.svg : ''
  }

  // --- Store / Stickers & Themes ---
  const stickerPacks = ref<Array<{ id: string; title: string; price_minor: number; stickers: string[]; owned?: boolean }>>([])
  const showStickerPicker = ref(false)
  const activeStickerTab = ref(0)
  const stickersList = [
    { id: 'pack-brown', name: t('mvStickerPackBrown'), items: ['🐻', '🐰', '🐥', '🐸', '🐱', '🐶', '🐼', '🐨', '🦁', '🐯', '🦊', '🦄'] },
    { id: 'pack-emotions', name: t('mvStickerPackEmotion'), items: ['😀', '😂', '😍', '🥳', '😎', '😭', '😡', '🤔', '😴', '😱', '🤩', '😇'] },
    { id: 'pack-daily', name: t('mvStickerPackDaily'), items: ['☕', '🍰', '🍕', '🍔', '🍣', '🍜', '🍺', '🍙', '🎉', '🎁', '💖', '👍'] },
    { id: 'pack-work', name: t('mvStickerPackOffice'), items: ['💻', '⌨️', '📱', '🚀', '🔥', '✨', '💯', '☕', '💪', '🙏', '🆗', '✅'] }
  ]

  const devicesList = ref<Array<{ id: string; name: string; platform: string; trusted: boolean; last_seen_at?: string }>>([])

  const storePacks = ref<ReturnType<typeof parseStorePacks>>([])
  const storeLoading = ref(false)
  async function loadStorePacks() {
    if (!token.value) { storePacks.value = []; return }
    storeLoading.value = true
    try {
      const res = await api<{ packs: any }>('/api/v1/store/stickers')
      storePacks.value = parseStorePacks(res.packs)
    } catch { storePacks.value = [] }
    finally { storeLoading.value = false }
  }

  async function loadStoreCatalog() {
    try {
      const res = await api<{ packs: any[] }>('/api/v1/store/stickers')
      stickerPacks.value = res.packs || []
    } catch {}
  }

  async function loadDevices() {
    try {
      const res = await api<{ devices: any[] }>('/api/v1/devices')
      devicesList.value = res.devices || []
    } catch {}
  }

  return {
    activeStickerCategory,
    filteredStickers,
    getStickerSvg,
    stickerPacks,
    showStickerPicker,
    activeStickerTab,
    stickersList,
    devicesList,
    storePacks,
    storeLoading,
    loadStorePacks,
    loadStoreCatalog,
    loadDevices,
  }
}
