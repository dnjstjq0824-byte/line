<script setup lang="ts">
// I-4: settings modal, extracted from MessengerView.vue. Owns theme,
// profile, passkey, QR-approve and push-test state; account deletion and data
// export stay in the view (auth-touching), devices arrive as props.
import { computed, onMounted, ref } from 'vue'

import E2eeSettings from './E2eeSettings.vue'
import LunoIcon from './LunoIcon.vue'
import { SUPPORTED_LOCALES, type LunoLocale } from '../luno-i18n'
import { requestWebNotifyPermission, syncWebPushSubscription, webNotifyEnabled } from '../web_notify'
import {
  api,
  appVersion,
  currentLocale,
  isDarkMode,
  note,
  setLocale,
  t,
  toggleDarkMode,
  wrap,
} from '../store/session'

export interface DeviceItem {
  id: string
  name: string
  platform: string
  trusted: boolean
  last_seen_at?: string
}

export interface ReportHistoryItem {
  id: string
  subject_user_id: string
  category: string
  details: string
  state: string
  created_at: string
}

// F30: customer support tickets filed from settings; answers arrive via the
// admin console and show in my list (plus the official room + push).
interface SupportTicketItem {
  id: string
  category: string
  body: string
  status: string
  answer: string
  answered_at: string
  created_at: string
}

const props = defineProps<{
  devicesList: DeviceItem[]
  translateConfigured: boolean
  translateLanguages: string[]
  myReports: ReportHistoryItem[]
}>()

const emit = defineEmits<{
  close: []
  export: []
  delete: []
  'revoke-device': [deviceId: string]
  'e2ee-backup': [passphrase: string]
  'e2ee-restore': [passphrase: string]
}>()

const e2eeBusy = defineModel<boolean>('e2eeBusy', { default: false })

const targetTranslateLang = defineModel<LunoLocale>('targetTranslateLang', { required: true })
const deletePasswordInput = defineModel<string>('deletePasswordInput', { required: true })
const deleteReasonInput = defineModel<string>('deleteReasonInput', { required: true })
const deleteConfirmInput = defineModel<string>('deleteConfirmInput', { required: true })

const activeTab = ref<'general' | 'security' | 'support' | 'about'>('general')

// Legal pages exist per app language (terms.html = ko, terms.en.html, ...).
function legalDocUrl(doc: 'terms' | 'privacy') {
  return currentLocale.value === 'ko' ? `/legal/${doc}.html` : `/legal/${doc}.${currentLocale.value}.html`
}
function enableLightMode() {
  if (isDarkMode.value) toggleDarkMode()
}
function enableDarkMode() {
  if (!isDarkMode.value) toggleDarkMode()
}

const fontScale = ref<'normal' | 'large' | 'xlarge'>('normal')
function setFontScale(scale: 'normal' | 'large' | 'xlarge') {
  fontScale.value = scale
  if (scale === 'normal') {
    document.documentElement.removeAttribute('data-font-scale')
  } else {
    document.documentElement.setAttribute('data-font-scale', scale)
  }
}

const approveChallengeInput = ref('')
const approveTokenInput = ref('')

// F8: link preview toggle (GET/PATCH me/settings).
const linkPreviews = ref(true)
async function saveLinkPreviews() {
  await wrap(async () => {
    const prefs = await api<Record<string, unknown>>('/api/v1/me/settings', 'PATCH', { link_previews: linkPreviews.value })
    linkPreviews.value = prefs.link_previews !== false
  })
}

async function approveQrLogin() {
  if (!approveChallengeInput.value.trim() || !approveTokenInput.value.trim()) return
  await wrap(async () => {
    await api('/api/v1/auth/qr/approve', 'POST', {
      challenge_id: approveChallengeInput.value.trim(),
      qr_token: approveTokenInput.value.trim()
    })
    approveChallengeInput.value = ''
    approveTokenInput.value = ''
    note.value = t('mvQrApproved')
  })
}

const passkeyBusy = ref(false)
const passkeyNote = ref('')
const passkeyList = ref<Array<{ id: string; name: string; created_at: string; last_used_at: string }>>([])
const passkeyLoaded = ref(false)

async function fetchPasskeys() {
  await wrap(async () => {
    const res = await api<{ passkeys: Array<{ id: string; name: string; created_at: string; last_used_at: string }> }>('/api/v1/passkeys', 'GET')
    passkeyList.value = res?.passkeys || []
    passkeyLoaded.value = true
  })
}

async function deletePasskey(id: string) {
  await wrap(async () => {
    await api('/api/v1/passkeys/' + encodeURIComponent(id), 'DELETE')
    passkeyNote.value = t('mvPasskeyDeleted')
    await fetchPasskeys()
  })
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function registerPasskey() {
  if (passkeyBusy.value) return
  if (!window.PublicKeyCredential || !navigator.credentials?.create) {
    passkeyNote.value = t('mvPasskeyUnsupported')
    return
  }
  passkeyBusy.value = true
  passkeyNote.value = ''
  try {
    await wrap(async () => {
      const begun = await api<{ publicKey: any }>('/api/v1/passkeys/register/begin', 'POST', {})
      const pk = begun.publicKey
      pk.challenge = b64ToBytes(pk.challenge)
      pk.user.id = b64ToBytes(pk.user.id)
      for (const e of pk.excludeCredentials || []) e.id = b64ToBytes(e.id)
      let cred: any = null
      try {
        cred = await navigator.credentials.create({ publicKey: pk })
      } catch {
        passkeyNote.value = t('mvPasskeyCancelled')
        return
      }
      if (!cred) {
        passkeyNote.value = t('mvPasskeyCancelled')
        return
      }
      const done = await api<{ verified: boolean }>('/api/v1/passkeys/register/finish', 'POST', {
        id: cred.id,
        rawId: bytesToB64(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: bytesToB64(cred.response.clientDataJSON),
          attestationObject: bytesToB64(cred.response.attestationObject),
          transports: cred.response.getTransports ? cred.response.getTransports() : undefined,
        },
      })
      if (done?.verified) {
        passkeyNote.value = t('mvPasskeyDone')
        await fetchPasskeys()
      } else {
        passkeyNote.value = t('mvPasskeyFailed')
      }
    })
  } finally {
    passkeyBusy.value = false
  }
}

// N1-L: the ONLY place that asks for browser notification permission.
const notifyState = ref<'off' | 'on' | 'blocked'>('off')
function refreshNotifyState() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') notifyState.value = 'blocked'
  else notifyState.value = webNotifyEnabled.value ? 'on' : 'off'
}
async function enableWebNotify() {
  const granted = await requestWebNotifyPermission()
  // P1-4: granted here also subscribes the closed-browser push channel.
  if (granted) void syncWebPushSubscription()
  refreshNotifyState()
}

async function testPushNotification() {
  await wrap(async () => {
    const deviceId = props.devicesList[0]?.id
    if (!deviceId) { note.value = t('mvNoDevicePush'); return }
    const res = await api<{ status: string }>('/api/v1/push/test', 'POST', { device_id: deviceId })
    if (res?.status === 'test_push_queued') {
      note.value = t('mvTestPushSent')
    }
  })
}

const supportCategory = ref('bug')
const supportBody = ref('')
const supportBusy = ref(false)
const supportNote = ref('')
const supportTickets = ref<SupportTicketItem[]>([])
const supportLoaded = ref(false)
const supportCategoryOptions = computed(() => [
  { value: 'account', label: t('supportCatAccount') },
  { value: 'chat', label: t('supportCatChat') },
  { value: 'payment', label: t('supportCatPayment') },
  { value: 'bug', label: t('supportCatBug') },
  { value: 'other', label: t('supportCatOther') },
])
function supportCategoryLabel(category: string) {
  return supportCategoryOptions.value.find((o) => o.value === category)?.label || category
}
async function fetchSupportTickets() {
  await wrap(async () => {
    const res = await api<{ tickets: SupportTicketItem[] }>('/api/v1/support/tickets', 'GET')
    supportTickets.value = res?.tickets || []
    supportLoaded.value = true
  })
}
async function submitSupportTicket() {
  if (!supportBody.value.trim() || supportBusy.value) return
  supportBusy.value = true
  supportNote.value = ''
  try {
    await wrap(async () => {
      await api('/api/v1/support/tickets', 'POST', {
        category: supportCategory.value,
        body: supportBody.value.trim(),
        app_version: 'web ' + (appVersion.value.worker_version || ''),
        device_info: typeof navigator === 'undefined' ? 'web' : navigator.userAgent,
      })
      supportBody.value = ''
      supportNote.value = t('supportDoneNote')
      await fetchSupportTickets()
    })
  } finally {
    supportBusy.value = false
  }
}

onMounted(() => {
  refreshNotifyState()
  void fetchPasskeys()
  void fetchSupportTickets()
  void api<Record<string, unknown>>('/api/v1/me/settings').then((prefs) => { linkPreviews.value = prefs.link_previews !== false }).catch(() => {})
})
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box settings-modal ln-settings-shell" role="dialog" aria-modal="true" :aria-label="t('settingsTitle')">
      <div class="modal-header">
        <h3 class="ln-modal-title">
          <LunoIcon name="settings" :size="18" />
          <span>{{ t('settingsTitle') }}</span>
        </h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">
          <LunoIcon name="close" :size="18" />
        </button>
      </div>

      <div class="ln-settings-tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="activeTab === 'general'" class="ln-settings-tab" :class="{ active: activeTab === 'general' }" @click="activeTab = 'general'">
          <LunoIcon name="globe" :size="15" />
          <span>{{ t('languageLabel') }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'security'" class="ln-settings-tab" :class="{ active: activeTab === 'security' }" @click="activeTab = 'security'">
          <LunoIcon name="shield" :size="15" />
          <span>{{ t('securitySection') }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'support'" class="ln-settings-tab" :class="{ active: activeTab === 'support' }" @click="activeTab = 'support'">
          <LunoIcon name="help" :size="15" />
          <span>{{ t('supportTitle') }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'about'" class="ln-settings-tab" :class="{ active: activeTab === 'about' }" @click="activeTab = 'about'">
          <LunoIcon name="smartphone" :size="15" />
          <span>{{ t('mvVersionInfo') }}</span>
        </button>
      </div>

      <div class="modal-body-form ln-settings-body">
        <!-- TAB 1: General (Language, Translate, Font, Theme) -->
        <template v-if="activeTab === 'general'">
          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon name="globe" :size="15" /><span>{{ t('languageLabel') }}</span></strong>
            <div class="locale-choice-grid">
              <button
                v-for="loc in SUPPORTED_LOCALES"
                :key="loc.code"
                class="btn-locale-pill"
                :class="{ active: currentLocale === loc.code }"
                @click="setLocale(loc.code)"
              >
                {{ loc.nativeName }}
              </button>
            </div>
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon name="translate" :size="15" /><span>{{ t('targetLangLabel') }}</span></strong>
            <div v-if="translateConfigured" class="locale-choice-grid">
              <button
                v-for="loc in SUPPORTED_LOCALES.filter((l) => translateLanguages.includes(l.code))"
                :key="'pref-target-' + loc.code"
                class="btn-locale-pill"
                :class="{ active: targetTranslateLang === loc.code }"
                @click="targetTranslateLang = loc.code"
              >
                {{ loc.nativeName }}
              </button>
            </div>
            <span v-else class="muted">{{ t('mvTranslatePending') }}</span>
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon name="type" :size="15" /><span>{{ t('fontScaleLabel') }}</span></strong>
            <div class="font-scale-buttons">
              <button class="btn-scale-chip" :class="{ active: fontScale === 'normal' }" @click="setFontScale('normal')">{{ t('mvFontNormal') }}</button>
              <button class="btn-scale-chip" :class="{ active: fontScale === 'large' }" @click="setFontScale('large')">{{ t('mvFontLarge') }}</button>
              <button class="btn-scale-chip" :class="{ active: fontScale === 'xlarge' }" @click="setFontScale('xlarge')">{{ t('mvFontXLarge') }}</button>
            </div>
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon :name="isDarkMode ? 'moon' : 'sun'" :size="15" /><span>{{ t('mvDesignMode') }}</span></strong>
            <div class="theme-choice-buttons">
              <button class="btn-theme-swatch default" :class="{ active: !isDarkMode }" @click="enableLightMode">{{ t('mvThemeLightSwatch') }}</button>
              <button class="btn-theme-swatch dark" :class="{ active: isDarkMode }" @click="enableDarkMode">{{ t('mvThemeDarkSwatch') }}</button>
            </div>
          </div>
        </template>

        <!-- TAB 2: Security, Notifications, Passkeys, Devices, Privacy -->
        <template v-else-if="activeTab === 'security'">
          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon name="shield" :size="15" /><span>{{ t('securitySection') }}</span></strong>
            <div class="setting-toggle-row">
              <span>{{ t('mvConnSecurity') }}</span>
              <span class="badge-status-on">{{ t('mvServerVerify') }}</span>
            </div>
            <label class="setting-toggle-row setting-check-row">
              <span>{{ t('mvReadReceipts') }}</span>
              <input type="checkbox" checked />
            </label>
            <label class="setting-toggle-row setting-check-row">
              <span>{{ t('mvLinkPreviews') }}</span>
              <input v-model="linkPreviews" type="checkbox" @change="saveLinkPreviews" />
            </label>
            <label class="setting-toggle-row setting-check-row">
              <span>{{ t('mvSoundNotif') }}</span>
              <input type="checkbox" checked />
            </label>
            <div class="setting-toggle-row">
              <span>{{ t('mvPushNotif') }}</span>
              <button class="btn-secondary ln-btn-xs" @click="testPushNotification">{{ t('mvTestSend') }}</button>
            </div>
            <div class="setting-toggle-row">
              <span>{{ t('mvNotifyTitle') }}</span>
              <button v-if="notifyState === 'off'" class="btn-secondary ln-btn-xs" @click="enableWebNotify">{{ t('mvNotifyEnable') }}</button>
              <span v-else-if="notifyState === 'on'" class="badge-status-on">{{ t('mvNotifyOn') }}</span>
              <span v-else class="muted">{{ t('mvNotifyBlocked') }}</span>
            </div>

            <E2eeSettings :busy="e2eeBusy" @backup="emit('e2ee-backup', $event)" @restore="emit('e2ee-restore', $event)" />
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon name="key" :size="15" /><span>{{ t('mvPasskeyTitle') }}</span></strong>
            <div class="setting-toggle-row">
              <span>{{ t('mvPasskeyDesc') }}</span>
              <button class="btn-secondary ln-btn-xs" :disabled="passkeyBusy" @click="registerPasskey">{{ t('mvPasskeyRegister') }}</button>
            </div>
            <div v-if="passkeyNote" class="muted ln-small-note" role="status">{{ passkeyNote }}</div>
            <div v-if="passkeyList.length" class="ln-passkey-list">
              <div v-for="k in passkeyList" :key="k.id" class="setting-toggle-row ln-small-row">
                <span class="muted">{{ k.id.slice(0, 8) }}… · {{ (k.created_at || '').slice(0, 10) }}</span>
                <button class="btn-secondary ln-btn-xs" @click="deletePasskey(k.id)">{{ t('mvPasskeyDelete') }}</button>
              </div>
            </div>
            <div v-else-if="passkeyLoaded" class="muted ln-small-note">{{ t('mvPasskeyNoKeys') }}</div>
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon name="scan" :size="15" /><span>{{ t('mvQrApproveTitle') }}</span></strong>
            <div class="flex-row ln-qr-approve-row">
              <input v-model="approveChallengeInput" placeholder="Challenge ID" class="pc-login-input" />
              <input v-model="approveTokenInput" placeholder="QR Token" class="pc-login-input" />
              <button class="btn-secondary" @click="approveQrLogin">{{ t('mvApprove') }}</button>
            </div>
          </div>

          <div v-if="devicesList.length" class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon name="smartphone" :size="15" /><span>{{ t('mvDevicesTitle').replace('{n}', String(devicesList.length)) }}</span></strong>
            <div v-for="dv in devicesList" :key="dv.id" class="setting-toggle-row">
              <span>{{ dv.name }} ({{ dv.platform }})</span>
              <button class="btn-delete-keep" @click="emit('revoke-device', dv.id)">{{ t('mvRevoke') }}</button>
            </div>
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon name="trash" :size="15" /><span>{{ t('mvBackupPrivacy') }}</span></strong>
            <input v-model="deletePasswordInput" type="password" autocomplete="current-password" :placeholder="t('mvDeletePwPh')" :aria-label="t('mvDeletePwAria')" class="pc-login-input" />
            <label class="pc-input-row">
              <span>{{ t('mvDeleteReason') }}</span>
              <select v-model="deleteReasonInput" class="pc-login-input">
                <option value="">{{ t('mvDeleteReasonSkip') }}</option>
                <option value="not_using">{{ t('mvDeleteReasonNotUsing') }}</option>
                <option value="privacy">{{ t('mvDeleteReasonPrivacy') }}</option>
                <option value="hard_to_use">{{ t('mvDeleteReasonHardToUse') }}</option>
                <option value="other">{{ t('mvDeleteReasonOther') }}</option>
              </select>
            </label>
            <input v-model="deleteConfirmInput" type="email" autocomplete="email" :placeholder="t('mvDeleteConfirmPh')" :aria-label="t('mvDeleteConfirmAria')" class="pc-login-input" />
            <p class="muted ln-small-note">{{ t('mvDeleteGraceNote') }}</p>
            <div class="flex-row ln-action-pair">
              <button class="btn-secondary" @click="emit('export')">{{ t('mvBackupData') }}</button>
              <button class="btn-secondary ln-danger-btn" @click="emit('delete')">{{ t('mvDeleteAccount') }}</button>
            </div>
          </div>
        </template>

        <!-- TAB 3: Support & Reports -->
        <template v-else-if="activeTab === 'support'">
          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><LunoIcon name="help" :size="15" /><span>{{ t('supportTitle') }}</span></strong>
            <label class="pc-input-row">
              <span>{{ t('supportCategory') }}</span>
              <select v-model="supportCategory" class="pc-login-input">
                <option v-for="opt in supportCategoryOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
            <textarea v-model="supportBody" rows="3" :placeholder="t('supportBodyPh')" :aria-label="t('supportBodyPh')" class="pc-login-input" />
            <button class="btn-primary" :disabled="supportBusy || !supportBody.trim()" @click="submitSupportTicket">{{ t('supportSubmit') }}</button>
            <div v-if="supportNote" class="muted ln-small-note" role="status">{{ supportNote }}</div>
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><span>{{ t('supportHistoryTitle') }}</span></strong>
            <p v-if="supportLoaded && !supportTickets.length" class="muted ln-small-note">{{ t('supportHistoryEmpty') }}</p>
            <div v-for="tk in supportTickets" :key="tk.id" class="approval-row">
              <div class="approval-row-head">
                <span class="badge-kind">{{ supportCategoryLabel(tk.category) }}</span>
                <span>{{ tk.status === 'answered' ? t('supportStateAnswered') : t('supportStateOpen') }}</span>
              </div>
              <div class="approval-row-body">{{ tk.body }}</div>
              <div v-if="tk.answer" class="approval-row-body">{{ tk.answer }}</div>
            </div>
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><span>{{ t('reportHistoryTitle') }}</span></strong>
            <p v-if="!props.myReports.length" class="muted ln-small-note">{{ t('reportHistoryEmpty') }}</p>
            <div v-for="r in props.myReports" :key="r.id" class="approval-row">
              <div class="approval-row-head">
                <span class="badge-kind">{{ r.category }}</span>
                <span>{{ r.state === 'resolved' ? t('reportStateResolved') : r.state === 'dismissed' ? t('reportStateDismissed') : t('reportStateOpen') }}</span>
              </div>
              <div v-if="r.details" class="approval-row-body">{{ r.details }}</div>
            </div>
          </div>
        </template>

        <!-- TAB 4: Mobile App, Legal & Version Info -->
        <template v-else>
          <div class="setting-group ln-app-download-card">
            <div class="ln-app-download-row">
              <div class="ln-app-download-brand">
                <LunoIcon name="luno-logo" :size="40" />
                <div>
                  <strong>{{ t('mvMobileApp') }}</strong>
                  <p>{{ t('mvMobileAppDesc') }}</p>
                </div>
              </div>
              <a href="./download.html" target="_blank" class="btn-primary ln-app-dl-btn">{{ t('mvApkDownload') }}</a>
            </div>
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><span>{{ t('mvLegal') }}</span></strong>
            <div class="ln-legal-links">
              <a :href="legalDocUrl('terms')" target="_blank" rel="noopener">{{ t('mvTerms') }}</a>
              <a :href="legalDocUrl('privacy')" target="_blank" rel="noopener">{{ t('mvPrivacy') }}</a>
            </div>
          </div>

          <div class="setting-group ln-setting-card">
            <strong class="ln-setting-heading"><span>{{ t('mvVersionInfo') }}</span></strong>
            <div class="ln-version-meta">
              <span>LUNO {{ (appVersion.worker_version || '').replace(/^v/, '').replace(/-.*$/, '') || '—' }}<template v-if="appVersion.short_commit"> · <code>{{ appVersion.short_commit }}</code></template></span>
              <span v-if="appVersion.build_time" class="muted">{{ String(appVersion.build_time).slice(0, 10) }}</span>
            </div>
          </div>
        </template>
      </div>

      <div class="ln-settings-footer">
        <button class="btn-primary" @click="emit('close')">{{ t('mvDone') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ln-settings-shell {
  width: min(560px, 94vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}
.ln-modal-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.ln-settings-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--ln-line);
  background: var(--ln-bg);
  overflow-x: auto;
  scrollbar-width: none;
}
.ln-settings-tabs::-webkit-scrollbar { display: none; }
.ln-settings-tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ln-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}
.ln-settings-tab:hover {
  background: var(--ln-surface);
  color: var(--ln-text);
}
.ln-settings-tab.active {
  background: var(--ln-accent);
  color: var(--ln-on-accent, #ffffff);
}
.ln-settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ln-setting-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: var(--ln-bg);
  border: 1px solid var(--ln-line);
}
.ln-setting-heading {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ln-text);
}
.ln-btn-xs {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 8px;
}
.ln-small-note { font-size: 12px; margin: 0; }
.ln-small-row { font-size: 12px; }
.ln-passkey-list { display: flex; flex-direction: column; gap: 6px; }
.ln-qr-approve-row { display: flex; flex-wrap: wrap; gap: 8px; }
.ln-qr-approve-row input { flex: 1 1 120px; min-width: 0; }
.ln-action-pair { display: flex; gap: 8px; }
.ln-action-pair > button { flex: 1; }
.ln-danger-btn { color: var(--ln-danger, #ef4444); }
.ln-app-download-card {
  padding: 16px;
  border-radius: 16px;
  background: var(--ln-accent-soft);
  border: 1px solid color-mix(in srgb, var(--ln-accent) 28%, transparent);
}
.ln-app-download-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.ln-app-download-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.ln-app-download-brand strong {
  display: block;
  color: var(--ln-accent);
  font-size: 14px;
}
.ln-app-download-brand p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--ln-muted);
}
.ln-app-dl-btn {
  text-decoration: none;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 10px;
  white-space: nowrap;
}
.ln-legal-links {
  display: flex;
  gap: 16px;
  font-size: 13px;
}
.ln-legal-links a {
  color: var(--ln-accent);
  font-weight: 600;
  text-decoration: none;
}
.ln-legal-links a:hover { text-decoration: underline; }
.ln-version-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--ln-text);
}
.ln-settings-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--ln-line);
  display: flex;
  justify-content: flex-end;
  background: var(--ln-surface);
}
</style>
