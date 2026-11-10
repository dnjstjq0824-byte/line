<script setup lang="ts">
// I-4: settings modal, extracted verbatim from MessengerView.vue. Owns theme,
// profile, passkey, QR-approve and push-test state; account deletion and data
// export stay in the view (auth-touching), devices arrive as props.
import { computed, onMounted, ref } from 'vue'

import type { User } from '../../../shared/api'
import { SUPPORTED_LOCALES, type LunoLocale } from '../luno-i18n'
import {
  api,
  appVersion,
  currentLocale,
  currentUser,
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

const props = defineProps<{
  devicesList: DeviceItem[]
}>()

const emit = defineEmits<{
  close: []
  export: []
  delete: []
  'revoke-device': [deviceId: string]
}>()

const targetTranslateLang = defineModel<LunoLocale>('targetTranslateLang', { required: true })
const deletePasswordInput = defineModel<string>('deletePasswordInput', { required: true })

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

const editProfileName = ref('')
const editProfileBio = ref('')
const editProfileHandle = ref('')
const profileSaving = ref(false)
const profileSaveError = ref('')
const profileSaved = ref(false)

const profileDirty = computed(() => editProfileName.value.trim() !== (currentUser.value?.display_name || '') || editProfileHandle.value.trim() !== (currentUser.value?.handle || '') || editProfileBio.value.trim() !== (currentUser.value?.status_message || currentUser.value?.bio || ''))

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

async function saveProfileSettings() {
  if (!editProfileName.value.trim() || profileSaving.value || !profileDirty.value) return
  profileSaving.value = true
  profileSaveError.value = ''
  profileSaved.value = false
  try {
    const textBio = editProfileBio.value.trim()
    await api('/api/v1/me', 'PATCH', {
      display_name: editProfileName.value.trim(),
      bio: textBio,
      ...(currentUser.value && 'status_message' in currentUser.value ? { status_message: textBio } : {}),
      handle: editProfileHandle.value.trim()
    })
    currentUser.value = await api<User>('/api/v1/me')
    profileSaved.value = true
  } catch (err) {
    profileSaveError.value = err instanceof Error ? err.message : t('profile_save_error')
  } finally {
    profileSaving.value = false
  }
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

onMounted(() => {
  profileSaved.value = false
  profileSaveError.value = ''
  editProfileName.value = currentUser.value?.display_name || ''
  editProfileBio.value = currentUser.value?.status_message || currentUser.value?.bio || ''
  editProfileHandle.value = currentUser.value?.handle || ''
  void fetchPasskeys()
})
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box settings-modal">
      <div class="modal-header">
        <h3>⚙️ {{ t('settingsTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body-form">
        <!-- 1. Language Selector (Article 11) -->
        <div class="setting-group">
          <strong>🌐 {{ t('languageLabel') }}</strong>
          <div class="locale-choice-grid">
            <button
              v-for="loc in SUPPORTED_LOCALES"
              :key="loc.code"
              class="btn-locale-pill"
              :class="{ active: currentLocale === loc.code }"
              @click="setLocale(loc.code)"
            >
              <span>{{ loc.flag }}</span> {{ loc.nativeName }} ({{ loc.code.toUpperCase() }})
            </button>
          </div>
        </div>

        <!-- 2. AI Translation Target Language (Article 10) -->
        <div class="setting-group">
          <strong>✨ {{ t('targetLangLabel') }}</strong>
          <div class="locale-choice-grid">
            <button
              v-for="loc in SUPPORTED_LOCALES"
              :key="'pref-target-' + loc.code"
              class="btn-locale-pill"
              :class="{ active: targetTranslateLang === loc.code }"
              @click="targetTranslateLang = loc.code"
            >
              <span>{{ loc.flag }}</span> {{ loc.nativeName }}
            </button>
          </div>
        </div>

        <!-- 3. Accessible Font Scale (Article 6.2 & 17.3) -->
        <div class="setting-group">
          <strong>🔤 {{ t('fontScaleLabel') }}</strong>
          <div class="font-scale-buttons">
            <button class="btn-scale-chip" :class="{ active: fontScale === 'normal' }" @click="setFontScale('normal')">{{ t('mvFontNormal') }}</button>
            <button class="btn-scale-chip" :class="{ active: fontScale === 'large' }" @click="setFontScale('large')">{{ t('mvFontLarge') }}</button>
            <button class="btn-scale-chip" :class="{ active: fontScale === 'xlarge' }" @click="setFontScale('xlarge')">{{ t('mvFontXLarge') }}</button>
          </div>
        </div>

        <!-- 4. Design Theme & Dark Mode (Article 4 & 4.5) -->
        <div class="setting-group">
          <strong>{{ t('mvDesignMode') }}</strong>
          <div class="theme-choice-buttons">
            <button class="btn-theme-swatch default" :class="{ active: !isDarkMode }" @click="enableLightMode">{{ t('mvThemeLightSwatch') }}</button>
            <button class="btn-theme-swatch dark" :class="{ active: isDarkMode }" @click="enableDarkMode">{{ t('mvThemeDarkSwatch') }}</button>
          </div>
        </div>

        <!-- 5. Honest Security (Article 14 & 17.4) -->
        <div class="setting-group">
          <strong>🛡️ {{ t('securitySection') }}</strong>
          <div class="setting-toggle-row">
            <span>{{ t('mvConnSecurity') }}</span>
            <span class="badge-status-on">{{ t('mvServerVerify') }}</span>
          </div>
          <div class="setting-toggle-row">
            <span>{{ t('mvReadReceipts') }}</span>
            <input type="checkbox" checked />
          </div>
          <div class="setting-toggle-row">
            <span>{{ t('mvSoundNotif') }}</span>
            <input type="checkbox" checked />
          </div>
          <!-- Phase 1: Push Notifications -->
          <div class="setting-toggle-row">
            <span>{{ t('mvPushNotif') }}</span>
            <button class="btn-secondary" style="font-size:12px;padding:3px 8px" @click="testPushNotification">{{ t('mvTestSend') }}</button>
          </div>

          <!-- Phase 2: E2EE Key Management -->
          <div class="setting-toggle-row">
            <span>{{ t('mvKeyMgmt') }}</span>
            <span class="muted">{{ t('e2ee_preparing') }}</span>
          </div>
        </div>

        <!-- 5b. Passkey registration -->
        <div class="setting-group" style="margin-top:8px">
          <strong>🔑 {{ t('mvPasskeyTitle') }}</strong>
          <div class="setting-toggle-row">
            <span>{{ t('mvPasskeyDesc') }}</span>
            <button class="btn-secondary" style="font-size:12px;padding:3px 8px" :disabled="passkeyBusy" @click="registerPasskey">{{ t('mvPasskeyRegister') }}</button>
          </div>
          <div v-if="passkeyNote" class="muted" style="font-size:12px;margin-top:4px" role="status">{{ passkeyNote }}</div>
          <div v-if="passkeyList.length" style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
            <div v-for="k in passkeyList" :key="k.id" class="setting-toggle-row" style="font-size:12px">
              <span class="muted">🔑 {{ k.id.slice(0, 8) }}… · {{ (k.created_at || '').slice(0, 10) }}</span>
              <button class="btn-secondary" style="font-size:11px;padding:2px 8px" @click="deletePasskey(k.id)">{{ t('mvPasskeyDelete') }}</button>
            </div>
          </div>
          <div v-else-if="passkeyLoaded" class="muted" style="font-size:12px;margin-top:4px">{{ t('mvPasskeyNoKeys') }}</div>
        </div>

        <!-- Phase 6: GDPR Data Portability & Deletion -->
        <div class="setting-group" style="margin-top:8px">
          <strong>{{ t('mvBackupPrivacy') }}</strong>
          <input v-model="deletePasswordInput" type="password" autocomplete="current-password" :placeholder="t('mvDeletePwPh')" :aria-label="t('mvDeletePwAria')" class="pc-login-input" style="margin:2px 0 6px" />
          <div class="flex-row" style="margin-top:6px;gap:8px">
            <button class="btn-secondary" style="flex:1" @click="emit('export')">{{ t('mvBackupData') }}</button>
            <button class="btn-secondary" style="flex:1;color:#ef4444" @click="emit('delete')">{{ t('mvDeleteAccount') }}</button>
          </div>
        </div>

        <form class="setting-group ln-profile-editor" :aria-busy="profileSaving" @submit.prevent="saveProfileSettings" @input="profileSaved = false; profileSaveError = ''">
          <div class="ln-section-heading"><strong>{{ t('profileEdit') }}</strong><span>{{ t('profile_details') }}</span></div>
          <div class="ln-profile-fields">
            <label for="profile-name">{{ t('profile_name_label') }}<input id="profile-name" v-model="editProfileName" autocomplete="name" required :disabled="profileSaving" /></label>
            <label for="profile-handle">LUNO ID<input id="profile-handle" v-model="editProfileHandle" autocomplete="off" autocapitalize="none" spellcheck="false" :disabled="profileSaving" /></label>
            <label for="profile-bio" class="ln-profile-bio">{{ t('profile_bio_label') }}<textarea id="profile-bio" v-model="editProfileBio" rows="3" :disabled="profileSaving" /></label>
          </div>
          <p class="ln-profile-hint">{{ t('profile_visibility_preparing') }}</p>
          <p v-if="profileSaveError" class="ln-profile-error" role="alert">{{ profileSaveError }}</p>
          <div class="ln-profile-save"><span role="status">{{ profileSaved ? t('profile_saved') : '' }}</span><button type="submit" class="btn-primary" :disabled="profileSaving || !profileDirty || !editProfileName.trim()">{{ profileSaving ? t('profile_saving') : t('profile_save') }}</button></div>
        </form>

        <div class="setting-group" style="margin-top:8px">
          <strong>{{ t('mvQrApproveTitle') }}</strong>
          <div class="flex-row" style="margin-top:6px">
            <input v-model="approveChallengeInput" placeholder="Challenge ID" style="flex:1" />
            <input v-model="approveTokenInput" placeholder="QR Token" style="flex:1" />
            <button class="btn-secondary" @click="approveQrLogin">{{ t('mvApprove') }}</button>
          </div>
        </div>

        <div v-if="devicesList.length" class="setting-group" style="margin-top:8px">
          <strong>{{ t('mvDevicesTitle').replace('{n}', String(devicesList.length)) }}</strong>
          <div v-for="dv in devicesList" :key="dv.id" class="setting-toggle-row">
            <span>{{ dv.name }} ({{ dv.platform }})</span>
            <button class="btn-delete-keep" @click="emit('revoke-device', dv.id)">{{ t('mvRevoke') }}</button>
          </div>
        </div>

        <div class="setting-group" style="margin-top:12px; background: #eaf1ff; padding: 12px; border-radius: 12px; border: 1px solid #d9e1ec;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong style="color:#315BCD; font-size:13px;">{{ t('mvMobileApp') }}</strong>
              <p style="font-size:11px; color:#5b6475; margin-top:2px;">{{ t('mvMobileAppDesc') }}</p>
            </div>
            <a href="./download.html" target="_blank" class="btn-primary" style="text-decoration:none; font-size:12px; padding:6px 12px; display:inline-block;">{{ t('mvApkDownload') }}</a>
          </div>
        </div>

        <div class="setting-group" style="margin-top:8px; font-size:12px; color:#64748b;">
          <strong>{{ t('mvLegal') }}</strong>
          <div style="margin-top:4px; display:flex; gap:12px;">
            <a href="./legal/terms.html" target="_blank" rel="noopener">{{ t('mvTerms') }}</a>
            <a href="./legal/privacy.html" target="_blank" rel="noopener">{{ t('mvPrivacy') }}</a>
          </div>
        </div>

        <div class="setting-group" style="margin-top:8px; font-size:12px; color:#64748b;">
          <strong>{{ t('mvVersionInfo') }}</strong>
          <div style="margin-top:4px; display:flex; flex-direction:column; gap:2px;">
            <span><b>LUNO Messenger:</b> {{ appVersion.worker_version || '—' }}</span>
            <span><b>Git Commit:</b> <code>{{ appVersion.commit || t('checkingText') }}</code></span>
            <span><b>Build Time:</b> {{ appVersion.build_time || '—' }}</span>
            <span><b>Environment:</b> {{ appVersion.env || '—' }}</span>
          </div>
        </div>

        <div class="modal-actions-right">
          <button class="btn-primary" @click="emit('close')">{{ t('mvDone') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
