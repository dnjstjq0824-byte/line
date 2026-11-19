// Image sticker catalog loader (LUNO200): one cached fetch per page load.
export interface StickerCatalogItem {
  id: string
  char: string
  label: string
  file: string
}
export interface StickerCatalogCategory {
  id: string
  ko: string
  en: string
  items: StickerCatalogItem[]
}
export interface StickerCatalog {
  version: number
  pack: string
  count: number
  categories: StickerCatalogCategory[]
}

let cachedCatalog: StickerCatalog | null = null
let inflightCatalog: Promise<StickerCatalog | null> | null = null

export function imageStickerChar(id: string): string | undefined {
  if (!cachedCatalog) return undefined
  for (const c of cachedCatalog.categories) {
    const found = c.items.find((i) => i.id === id)
    if (found) return found.char
  }
  return undefined
}

// Fetches /stickers/catalog.json once per page load; null when unreachable.
export function loadStickerCatalog(): Promise<StickerCatalog | null> {
  if (cachedCatalog) return Promise.resolve(cachedCatalog)
  if (inflightCatalog) return inflightCatalog
  inflightCatalog = fetch('/stickers/catalog.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || !Array.isArray(j.categories)) return null
      cachedCatalog = j as StickerCatalog
      return cachedCatalog
    })
    .catch(() => null)
  return inflightCatalog
}
