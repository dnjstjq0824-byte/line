// AI translation + link-preview preference (P2 MessengerView split).
// Self-contained: server state only, no view bindings.
// Extracted verbatim from views/MessengerView.vue.
import { ref } from 'vue'
import { api, t } from '../store/session'
import type { LunoLocale } from '../luno-i18n'
import { ApiError, type Message } from '../../../shared/api'

export type MessageTranslation = {
  translated: string
  sourceLang: string
  engine: string
  loading?: boolean
  error?: string
}

export function useMessengerTranslate() {
  const autoTranslateEnabled = ref(false)
  const targetTranslateLang = ref<LunoLocale>('en')
  const messageTranslations = ref<Record<string, MessageTranslation>>({})
  // T1: translation engine state from GET /api/v1/translate/languages.
  const translateConfigured = ref(false)
  // F8: link preview toggle from GET /api/v1/me/settings (default on).
  const linkPreviewsEnabled = ref(true)
  async function ensureLinkPreviewPref() {
    try {
      const prefs = await api<Record<string, unknown>>('/api/v1/me/settings', 'GET')
      linkPreviewsEnabled.value = prefs.link_previews !== false
    } catch {
      linkPreviewsEnabled.value = true
    }
  }
  const translateLanguages = ref<string[]>([])
  let translateLangsLoaded = false
  async function ensureTranslateLanguages() {
    if (translateLangsLoaded) return
    translateLangsLoaded = true
    try {
      const res = await api<{ configured: boolean; languages: string[] }>('/api/v1/translate/languages', 'GET')
      if (res.configured && Array.isArray(res.languages) && res.languages.length > 0) {
        translateLanguages.value = res.languages
        translateConfigured.value = true
        if (!res.languages.includes(targetTranslateLang.value)) {
          targetTranslateLang.value = res.languages[0] as LunoLocale
        }
      }
    } catch {
      translateConfigured.value = false
    }
  }

  async function handleTranslateMessage(msg: Message) {
    if (messageTranslations.value[msg.id]?.translated && !messageTranslations.value[msg.id]?.error) {
      delete messageTranslations.value[msg.id]
      return
    }
    // E8: sealed text leaves the device only on an explicit per-tap notice.
    if (msg._e2ee && !window.confirm(t('mvE2eeAiNotice'))) return
    await ensureTranslateLanguages()
    if (!translateConfigured.value) {
      messageTranslations.value[msg.id] = {
        translated: '',
        sourceLang: 'auto',
        engine: 'luno-ai',
        loading: false,
        error: t('mvTranslatePending')
      }
      return
    }
    messageTranslations.value[msg.id] = {
      translated: '',
      sourceLang: 'auto',
      engine: 'luno-ai',
      loading: true
    }
    try {
      const res = await api<{ translated: string; source_lang: string; target_lang: string; engine: string }>(
        '/api/v1/translate', 'POST', { text: msg.body, target_lang: targetTranslateLang.value })
      messageTranslations.value[msg.id] = {
        translated: res.translated,
        sourceLang: res.source_lang,
        engine: res.engine,
        loading: false
      }
    } catch (e) {
      messageTranslations.value[msg.id] = {
        translated: '',
        sourceLang: 'auto',
        engine: 'luno-ai',
        loading: false,
        error: e instanceof ApiError && e.status === 503 ? t('mvTranslatePending') : t('mvTranslateFailed')
      }
    }
  }

  return {
    autoTranslateEnabled,
    targetTranslateLang,
    messageTranslations,
    translateConfigured,
    linkPreviewsEnabled,
    ensureLinkPreviewPref,
    translateLanguages,
    ensureTranslateLanguages,
    handleTranslateMessage,
  }
}
