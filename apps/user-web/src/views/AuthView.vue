<script setup lang="ts">
import lunoLogo from '../../../shared/brand/luno-logo-horizontal.svg'
import lunoMark from '../../../shared/brand/luno-logo-appicon.svg'
import LunoIcon from '../components/LunoIcon.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { SUPPORTED_LOCALES } from '../luno-i18n'
import { ApiError, request, type LoginResult, type User } from '../../../shared/api'
import { ageOnDate, todayUTC } from '../../../shared/legal'
import { makeLoginQrSvg } from '../../../shared/login_qr'
import {
  api,
  appVersion,
  currentUser,
  currentLocale,
  error,
  fetchAppVersion,
  isDarkMode,
  note,
  setLocale,
  storeSession,
  t,
  toggleDarkMode,
  wrap,
} from '../store/session'

const router = useRouter()

const email = ref('')
const password = ref('')
const displayName = ref('')
const registerMode = ref(false)

// F24: terms consent + birthdate. Versions come from the server so the form
// always submits exactly what the gates demand; the birthdate verifies age
// and is never stored anywhere.
const birthdate = ref('')
const agreeTerms = ref(false)
const agreePrivacy = ref(false)
const legalVersions = ref({ terms: '', privacy: '' })
const showConsentModal = ref(false)

async function loadLegalVersions() {
  try {
    const v = await request<{ terms_version: string; privacy_version: string }>('/api/v1/legal', null, 'GET')
    legalVersions.value = { terms: v.terms_version, privacy: v.privacy_version }
  } catch {
    legalVersions.value = { terms: '', privacy: '' }
  }
}
function consentOf() {
  return { terms: legalVersions.value.terms, privacy: legalVersions.value.privacy }
}
// Canonical Korean docs keep their short names; other locales are suffixed.
function legalUrl(doc: string) {
  return currentLocale.value === 'ko' ? `/legal/${doc}.html` : `/legal/${doc}.${currentLocale.value}.html`
}

const authMethod = ref<'email' | 'phone'>('email')
// SMS provider contract required (commercialization P1): the phone form stays
// in the tree for layout stability, but entry is gated until then.
const phoneAuthAvailable = false
const autoLoginCheck = ref(true)
const showPassword = ref(false)
const phoneInput = ref('')
const phoneCountryCode = ref('+82')
const phoneCodeInput = ref('')
const phoneCodeSent = ref(false)
const phoneTimer = ref(180)
let phoneTimerInterval: ReturnType<typeof setInterval> | null = null

// --- Dynamic QR Code Countdown (Article 3.B) ---
const qrCountdown = ref(180)
let qrCountdownInterval: ReturnType<typeof setInterval> | null = null

const qrChallengeID = ref('')
const qrToken = ref('')
const loginQrSvg = computed(() => makeLoginQrSvg(qrChallengeID.value, qrToken.value))
let qrPollInterval: ReturnType<typeof setInterval> | null = null

const formattedPhoneTimer = computed(() => {
  const m = Math.floor(phoneTimer.value / 60).toString().padStart(2, '0')
  const s = (phoneTimer.value % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})

const formattedQrCountdown = computed(() => {
  const m = Math.floor(qrCountdown.value / 60).toString().padStart(2, '0')
  const s = (qrCountdown.value % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})


const showRecoverModal = ref(false)
const recoverEmail = ref('')
const recoverChallengeId = ref('')
const recoverCodeInput = ref('')
const recoverNewPassword = ref('')
const recoverSent = ref(false)

// F1: email verification step after signup, or after a gated login.
const showVerifyModal = ref(false)
const verifyEmail = ref('')
const verifyCodeInput = ref('')

function openVerifyModal(address: string) {
  showVerifyModal.value = true
  verifyEmail.value = address
  verifyCodeInput.value = ''
}

async function submitVerifyCode() {
  await wrap(async () => {
    await request('/api/v1/auth/verify-email', null, 'POST', {
      email: verifyEmail.value.trim(),
      code: verifyCodeInput.value.trim()
    })
    note.value = t('verifyDoneNote')
    email.value = verifyEmail.value
    password.value = ''
    registerMode.value = false
    showVerifyModal.value = false
  })
}

async function resendVerifyCode() {
  await wrap(async () => {
    await request('/api/v1/auth/verify-email/resend', null, 'POST', {
      email: verifyEmail.value.trim()
    })
    note.value = t('verifyResentNote')
  })
}

function openRecoverModal() {
  showRecoverModal.value = true
  recoverEmail.value = email.value
  recoverSent.value = false
  recoverChallengeId.value = ''
  recoverCodeInput.value = ''
  recoverNewPassword.value = ''
}

async function sendRecoverCode() {
  await wrap(async () => {
    try {
      const res = await request<{ challenge_id?: string }>('/api/v1/auth/recover', null, 'POST', {
        email: recoverEmail.value.trim()
      })
      recoverSent.value = true
      recoverChallengeId.value = res.challenge_id || ''
    } catch (e) {
      // S1: no mail sender is configured, so recovery is unavailable.
      if (e instanceof ApiError && e.status === 501) throw new Error(t('mvRecoverUnavailable'))
      throw e
    }
  })
}

async function verifyRecoverCode() {
  await wrap(async () => {
    await request('/api/v1/auth/recover/verify', null, 'POST', {
      challenge_id: recoverChallengeId.value,
      recovery_code: recoverCodeInput.value.trim(),
      new_password: recoverNewPassword.value
    })
    note.value = t('mvRecoverDone')
    email.value = recoverEmail.value
    password.value = ''
    showRecoverModal.value = false
  })
}

async function authAction() {
  await wrap(async () => {
    if (registerMode.value) {
      // Client pre-checks are UX only; the server re-verifies everything.
      if (!agreeTerms.value || !agreePrivacy.value) throw new Error(t('consentRequiredErr'))
      if (!birthdate.value) throw new Error(t('birthdateRequiredErr'))
      const age = ageOnDate(birthdate.value, todayUTC())
      if (age === null) throw new Error(t('birthdateRequiredErr'))
      if (age < 14) throw new Error(t('underageErr'))
      if (!legalVersions.value.terms) await loadLegalVersions()
      try {
        const reg = await request<{ email_verified?: boolean }>('/api/v1/auth/register', null, 'POST', {
          email: email.value.trim(),
          password: password.value,
          display_name: displayName.value.trim() || email.value.split('@')[0],
          birthdate: birthdate.value,
          consent: consentOf()
        })
        if (reg.email_verified === false) {
          note.value = t('verifyNeededNote')
          registerMode.value = false
          openVerifyModal(email.value.trim())
          return
        }
        note.value = t('registerDoneNote')
        registerMode.value = false
        birthdate.value = ''
        agreeTerms.value = false
        agreePrivacy.value = false
        return
      } catch (e) {
        if (e instanceof ApiError && e.code === 'CONSENT_REQUIRED') throw new Error(t('consentRequiredErr'))
        if (e instanceof ApiError && e.code === 'BIRTHDATE_REQUIRED') throw new Error(t('birthdateRequiredErr'))
        if (e instanceof ApiError && e.code === 'UNDERAGE') throw new Error(t('underageErr'))
        throw e
      }
    }
    try {
      await loginWithConsent()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
        note.value = t('verifyNeededNote')
        openVerifyModal(email.value.trim())
        return
      }
      if (e instanceof ApiError && e.code === 'CONSENT_STALE') {
        // F24: terms changed since this account consented. The modal collects
        // fresh agreement, then the same credentials retry with consent.
        agreeTerms.value = false
        agreePrivacy.value = false
        await loadLegalVersions()
        showConsentModal.value = true
        return
      }
      throw e
    }
  })
}

async function loginWithConsent(withConsent = false) {
  const data = await request<LoginResult>('/api/v1/auth/login', null, 'POST', {
    email: email.value.trim(),
    password: password.value,
    device_name: 'LUNO Web Desktop Client',
    platform: 'web',
    remember: autoLoginCheck.value,
    ...(withConsent ? { consent: consentOf() } : {})
  })
  storeSession(data, autoLoginCheck.value)
  currentUser.value = await api<User>('/api/v1/me')
  if (data.recovered) note.value = t('accountRecoveredNote')
  password.value = ''
  showConsentModal.value = false
  await router.push('/chats')
}

async function submitReconsent() {
  await wrap(async () => {
    if (!agreeTerms.value || !agreePrivacy.value) throw new Error(t('consentRequiredErr'))
    await loginWithConsent(true)
  })
}

function startQrCountdown() {
  if (qrCountdownInterval) clearInterval(qrCountdownInterval)
  qrCountdown.value = 180
  qrCountdownInterval = setInterval(() => {
    if (qrCountdown.value > 0) {
      qrCountdown.value--
    } else {
      if (qrCountdownInterval) clearInterval(qrCountdownInterval)
      if (qrPollInterval) clearInterval(qrPollInterval)
    }
  }, 1000)
}

function refreshQr() {
  startQrCountdown()
  startQrLoginChallenge()
}

async function startQrLoginChallenge() {
  await wrap(async () => {
    startQrCountdown()
    const res = await request<{ challenge_id: string; qr_token: string }>('/api/v1/auth/qr/challenge', null, 'POST', {})
    qrChallengeID.value = res.challenge_id
    qrToken.value = res.qr_token
    if (qrPollInterval) clearInterval(qrPollInterval)
    qrPollInterval = setInterval(async () => {
      try {
        const p = await request<any>('/api/v1/auth/qr/poll', null, 'POST', {
          challenge_id: qrChallengeID.value,
          qr_token: qrToken.value,
          device_name: 'Open Messenger Web QR Client',
          remember: autoLoginCheck.value,
          platform: 'web'
        })
        if (p && p.access_token) {
          if (qrPollInterval) clearInterval(qrPollInterval)
          qrPollInterval = null
          if (qrCountdownInterval) clearInterval(qrCountdownInterval)
          storeSession(p, autoLoginCheck.value)
          currentUser.value = await api<User>('/api/v1/me')
          qrChallengeID.value = ''
          qrToken.value = ''
          await router.push('/chats')
        }
      } catch {}
    }, 2500)
  })
}

async function sendPhoneCode() {
  if (!phoneInput.value.trim()) {
    error.value = t('phoneRequiredErr')
    return
  }
  await wrap(async () => {
    const res = await request<{ message: string; expiresInSec: number; debugCode?: string }>('/api/v1/auth/phone/send-code', null, 'POST', {
      phone_number: phoneInput.value.trim(),
      country_code: phoneCountryCode.value
    })
    phoneCodeSent.value = true
    phoneTimer.value = res.expiresInSec || 180
    if (res.debugCode) {
      phoneCodeInput.value = res.debugCode
      note.value = t('codeSentDebugNote').replace('{code}', res.debugCode)
    } else {
      note.value = t('codeSentNote')
    }
    if (phoneTimerInterval) clearInterval(phoneTimerInterval)
    phoneTimerInterval = setInterval(() => {
      if (phoneTimer.value > 0) phoneTimer.value--
      else if (phoneTimerInterval) clearInterval(phoneTimerInterval)
    }, 1000)
  })
}

async function verifyPhoneLogin() {
  if (!phoneCodeInput.value.trim()) {
    error.value = t('codeRequiredErr')
    return
  }
  await wrap(async () => {
    const res = await request<any>('/api/v1/auth/phone/verify', null, 'POST', {
      phone_number: phoneInput.value.trim(),
      code: phoneCodeInput.value.trim(),
      device_name: 'Open Messenger Desktop PC',
      remember: autoLoginCheck.value
    })
    storeSession(res, autoLoginCheck.value)
    currentUser.value = res.user || await api<User>('/api/v1/me')
    if (phoneTimerInterval) clearInterval(phoneTimerInterval)
    await router.push('/chats')
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

async function passkeyLogin() {
  if (!email.value) return
  if (!window.PublicKeyCredential || !navigator.credentials?.get) {
    note.value = t('mvPasskeyUnsupported')
    return
  }
  await wrap(async () => {
    const begun = await request<{ publicKey: any }>('/api/v1/passkeys/login/begin', null, 'POST', { email: email.value })
    const pk = begun.publicKey
    pk.challenge = b64ToBytes(pk.challenge)
    for (const c of pk.allowCredentials || []) c.id = b64ToBytes(c.id)
    let cred: any = null
    try {
      cred = await navigator.credentials.get({ publicKey: pk })
    } catch {
      note.value = t('mvPasskeyCancelled')
      return
    }
    if (!cred) {
      note.value = t('mvPasskeyCancelled')
      return
    }
    const data = await request<LoginResult>('/api/v1/passkeys/login/finish', null, 'POST', {
      id: cred.id,
      rawId: bytesToB64(cred.rawId),
      type: cred.type,
      remember: autoLoginCheck.value,
      response: {
        clientDataJSON: bytesToB64(cred.response.clientDataJSON),
        authenticatorData: bytesToB64(cred.response.authenticatorData),
        signature: bytesToB64(cred.response.signature),
        userHandle: cred.response.userHandle ? bytesToB64(cred.response.userHandle) : undefined,
      },
    })
    storeSession(data, autoLoginCheck.value)
    router.push('/chats')
  })
}

onMounted(() => { void fetchAppVersion(); void startQrLoginChallenge(); void loadLegalVersions() })
onBeforeUnmount(() => {
  if (qrPollInterval) clearInterval(qrPollInterval)
  if (qrCountdownInterval) clearInterval(qrCountdownInterval)
  if (phoneTimerInterval) clearInterval(phoneTimerInterval)
})
</script>

<template>
    <main class="pc-auth-viewport" id="main-content">
      <a class="lx-skip-link" href="#auth-form-col">{{ t('lxSkipToMain') }}</a>
      <div class="pc-auth-window-2col">
        <!-- Title bar with window controls & branding -->
        <div class="pc-window-bar">
          <div class="pc-win-left-controls">
            <button class="btn-win-menu" :title="t('menu')" :aria-label="t('menu')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <button class="btn-win-help" :title="t('winHelpTitle')" :aria-label="t('winHelpTitle')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>
          </div>
          <span class="pc-win-title">LUNO</span>
          <div class="pc-win-tools">
            <div class="pc-locale-pills">
              <button
                v-for="loc in SUPPORTED_LOCALES"
                :key="'auth-' + loc.code"
                class="btn-auth-locale"
                :class="{ active: currentLocale === loc.code }"
                @click="setLocale(loc.code)"
                :title="loc.nativeName"
              >
                {{ loc.code.toUpperCase() }}
              </button>
            </div>
            <button class="btn-win-dark" @click="toggleDarkMode" :title="isDarkMode ? t('lightModeTitle') : t('darkModeTitle')" :aria-label="isDarkMode ? t('lightModeTitle') : t('darkModeTitle')">
              <LunoIcon :name="isDarkMode ? 'sun' : 'moon'" :size="13" />
            </button>
            <div class="pc-win-sys-controls">
              <button class="btn-sys-tool" :title="t('winMinTitle')" :aria-label="t('winMinTitle')">−</button>
              <button class="btn-sys-tool" :title="t('winMaxTitle')" :aria-label="t('winMaxTitle')">□</button>
              <button class="btn-sys-tool close" :title="t('menu_close')" :aria-label="t('menu_close')">✕</button>
            </div>
          </div>
        </div>

        <div class="pc-auth-body-2col">
          <!-- LEFT COLUMN: Credentials Login & Sign-up -->
          <div id="auth-form-col" class="pc-auth-col form-col" tabindex="-1">
            <!-- Brand Logo Header -->
            <div class="pc-brand-header-left">
              <img class="pc-om-logo" :src="lunoLogo" alt="LUNO" height="42" />
              <h1 class="ln-auth-title">{{ registerMode ? t('hd_signup') : t('login_btn') }}</h1>
              <p class="ln-auth-subtitle">{{ t('auth_subtitle') }}</p>
            </div>

            <!-- Email Login Mode -->
            <form v-if="authMethod === 'email'" class="pc-login-form-inner" @submit.prevent="authAction">
              <div class="pc-input-row">
                <input
                  v-model="email"
                  type="email"
                  :placeholder="t('emailPlaceholder')"
                  :aria-label="t('emailPlaceholder')"
                  required
                  autocomplete="username"
                  class="pc-login-input"
                />
              </div>
              <div v-if="registerMode" class="pc-input-row">
                <input
                  v-model="displayName"
                  type="text"
                  :placeholder="t('namePlaceholder')"
                  :aria-label="t('namePlaceholder')"
                  required
                  class="pc-login-input"
                />
              </div>
              <div v-if="registerMode" class="pc-input-row">
                <label class="pc-custom-check" style="width:100%">
                  <span>{{ t('birthdateLabel') }}</span>
                  <input v-model="birthdate" type="date" class="pc-login-input" required style="margin-left:8px" />
                </label>
              </div>
              <div v-if="registerMode" class="pc-login-options-row" style="flex-direction:column;align-items:stretch;gap:4px">
                <label class="pc-custom-check">
                  <input type="checkbox" v-model="agreeTerms" />
                  <span>{{ t('consentTerms') }}</span>
                  <a :href="legalUrl('terms')" target="_blank" rel="noopener" class="btn-subtle-link" style="margin-left:auto">{{ t('consentViewTerms') }}</a>
                </label>
                <label class="pc-custom-check">
                  <input type="checkbox" v-model="agreePrivacy" />
                  <span>{{ t('consentPrivacy') }}</span>
                  <a :href="legalUrl('privacy')" target="_blank" rel="noopener" class="btn-subtle-link" style="margin-left:auto">{{ t('consentViewPrivacy') }}</a>
                </label>
              </div>
              <div class="pc-input-row password-wrap">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('passwordPlaceholder')"
                  :aria-label="t('passwordPlaceholder')"
                  required
                  autocomplete="current-password"
                  class="pc-login-input"
                />
                <button type="button" class="btn-eye-toggle" @click="showPassword = !showPassword" tabindex="-1" :aria-label="t('passwordPlaceholder')">
                  {{ showPassword ? '🙈' : '👁️' }}
                </button>
              </div>

              <!-- Login Action Button -->
              <button class="btn-pc-submit-full" type="submit" :disabled="!email || !password">
                {{ registerMode ? t('signUpBtn') : t('signInBtn') }}
              </button>

              <div v-if="!registerMode" class="pc-login-bottom-switch">
                <button type="button" class="btn-switch-auth-link" :disabled="!email" @click="passkeyLogin">
                  🔑 {{ t('passkeyLoginBtn') }}
                </button>
              </div>

              <!-- Checkbox & Link Options (Matching Screenshot 2 & 3) -->
              <div class="pc-login-options-row">
                <label class="pc-custom-check">
                  <input type="checkbox" v-model="autoLoginCheck" />
                  <span>{{ t('rememberMe') }}</span>
                </label>
                <button type="button" class="btn-subtle-link" @click="openRecoverModal">
                  {{ t('findPassword') }}
                </button>
              </div>

              <div class="pc-login-options-row ln-register-row">
                <button type="button" class="btn-subtle-link accent" @click="registerMode = !registerMode">
                  {{ registerMode ? t('backToLogin') : t('createAccount') }}
                </button>
              </div>

              <!-- Switch to Phone Login (Matching Screenshot 2 & 3) -->
              <div class="pc-login-bottom-switch">
                <p v-if="!phoneAuthAvailable" class="ln-charge-notice" role="note">{{ t('phoneSealedNote') }}</p>
                <button v-else type="button" class="btn-switch-auth-link" @click="authMethod = 'phone'">
                  {{ t('loginPhoneTab') }} &gt;
                </button>
              </div>

            </form>

            <!-- Phone Login Mode (Article 3.C) -->
            <form v-else class="pc-login-form-inner phone-mode" @submit.prevent="verifyPhoneLogin">
              <div class="pc-input-row phone-composite">
                <select v-model="phoneCountryCode" class="pc-country-select" :aria-label="t('countryCodeLabel')">
                  <option value="+82">KR +82</option>
                  <option value="+1">US +1</option>
                  <option value="+81">JP +81</option>
                  <option value="+66">TH +66</option>
                </select>
                <input
                  v-model="phoneInput"
                  type="tel"
                  placeholder="010-1234-5678"
                  :aria-label="t('phoneLoginTitle')"
                  required
                  class="pc-login-input phone-input"
                />
                <button type="button" class="btn-send-code" @click="sendPhoneCode">
                  {{ phoneCodeSent ? t('resendBtn') : t('sendCodeBtn') }}
                </button>
              </div>

              <div v-if="phoneCodeSent" class="pc-input-row code-wrap">
                <input
                  v-model="phoneCodeInput"
                  type="text"
                  :placeholder="t('codePlaceholder')"
                  :aria-label="t('codePlaceholder')"
                  maxlength="6"
                  required
                  class="pc-login-input"
                />
                <span class="phone-timer-pill">{{ formattedPhoneTimer }}</span>
              </div>

              <button class="btn-pc-submit-full" type="submit" :disabled="!phoneCodeInput.trim()">
                {{ t('phoneLoginTitle') }}
              </button>

              <div class="pc-login-bottom-switch">
                <button type="button" class="btn-switch-method" @click="authMethod = 'email'">
                  &lt; {{ t('backToEmail') }}
                </button>
              </div>
            </form>
          </div>

          <!-- Vertical Divider Line -->
          <div class="pc-auth-col-divider"></div>

          <!-- RIGHT COLUMN: QR Code Login (Matching Screenshots 2 & 3) -->
          <div class="pc-auth-col qr-col">
            <div class="pc-qr-box-inner">
              <h2 class="pc-qr-heading">{{ t('loginQrTab') }}</h2>
              <div class="pc-qr-matrix-card" role="img" :aria-label="t('loginQrTab')">
                <div v-if="loginQrSvg" v-html="loginQrSvg" class="ln-qr-matrix"></div>
                <img v-else :src="lunoMark" alt="LUNO" class="ln-qr-brand" />
              </div>

              <!-- Instruction Text (Screenshot 2 & 3) -->
              <p class="pc-qr-instruction">
                {{ qrChallengeID ? t('qrScanNote') : t('qr_preparing') }}
              </p>
              <p v-if="qrChallengeID" class="pc-qr-manual">
                {{ t('qrManualLabel') }}: <code>{{ qrChallengeID }}</code> / <code>{{ qrToken }}</code>
              </p>

              <!-- Expiry & Reload Pill -->
              <div v-if="qrChallengeID" class="pc-qr-timer-pill">
                <span>{{ t('validTimeLabel') }} <strong>{{ formattedQrCountdown }}</strong></span>
                <button type="button" class="btn-qr-reload" @click="refreshQr" :title="t('reloadBtn')" :aria-label="t('reloadBtn')">
                  {{ t('reloadBtn') }} ↻
                </button>
              </div>
              <div class="pc-qr-session-id">
                <small v-if="qrChallengeID">Session: {{ qrChallengeID.slice(0, 8) }}... | </small>
                <small>LUNO v2.0.0 (commit: <code>{{ appVersion.short_commit || t('checkingText') }}</code>)</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Password recovery dialog -->
      <div v-if="showRecoverModal" class="modal-backdrop" @click.self="showRecoverModal = false">
        <div class="standard-modal-box" role="dialog" :aria-label="t('mvRecoverTitle')">
          <div class="modal-header">
            <h3>{{ t('mvRecoverTitle') }}</h3>
            <button class="btn-modal-close" @click="showRecoverModal = false" :aria-label="t('mvClose')">✕</button>
          </div>
          <div class="modal-body-form">
            <label class="pc-input-row">
              <span>{{ t('mvRecoverEmail') }}</span>
              <input v-model="recoverEmail" type="email" class="pc-login-input" :disabled="recoverSent" />
            </label>
            <button v-if="!recoverSent" class="btn-pc-submit-full" type="button" :disabled="!recoverEmail.includes('@')" @click="sendRecoverCode">
              {{ t('mvRecoverSend') }}
            </button>
            <template v-else>
              <p class="ln-charge-notice" role="note">
                {{ t('mvRecoverCodeHint') }}
              </p>
              <label class="pc-input-row">
                <span>{{ t('mvRecoverCode') }}</span>
                <input v-model="recoverCodeInput" type="text" class="pc-login-input" autocomplete="one-time-code" />
              </label>
              <label class="pc-input-row">
                <span>{{ t('mvRecoverNewPw') }}</span>
                <input v-model="recoverNewPassword" type="password" class="pc-login-input" autocomplete="new-password" />
              </label>
              <button class="btn-pc-submit-full" type="button" :disabled="!recoverCodeInput.trim() || recoverNewPassword.length < 10" @click="verifyRecoverCode">
                {{ t('mvRecoverReset') }}
              </button>
            </template>
            <button class="btn-secondary" type="button" @click="showRecoverModal = false">{{ t('mvRecoverCancel') }}</button>
          </div>
        </div>
      </div>
      <div v-if="showVerifyModal" class="modal-backdrop" @click.self="showVerifyModal = false">
        <div class="standard-modal-box" role="dialog" :aria-label="t('verifyTitle')">
          <div class="modal-header">
            <h3>{{ t('verifyTitle') }}</h3>
            <button class="btn-modal-close" @click="showVerifyModal = false" :aria-label="t('mvClose')">✕</button>
          </div>
          <div class="modal-body-form">
            <p class="ln-charge-notice" role="note">
              {{ t('verifyPrompt') }}
            </p>
            <label class="pc-input-row">
              <span>{{ t('verifyEmailLabel') }}</span>
              <input v-model="verifyEmail" type="email" class="pc-login-input" disabled />
            </label>
            <label class="pc-input-row">
              <span>{{ t('verifyCodeLabel') }}</span>
              <input v-model="verifyCodeInput" type="text" class="pc-login-input" autocomplete="one-time-code" inputmode="numeric" maxlength="6" />
            </label>
            <button class="btn-pc-submit-full" type="button" :disabled="verifyCodeInput.trim().length < 6" @click="submitVerifyCode">
              {{ t('verifySubmit') }}
            </button>
            <button class="btn-secondary" type="button" @click="resendVerifyCode">{{ t('verifyResend') }}</button>
          </div>
        </div>
      </div>
      <div v-if="showConsentModal" class="modal-backdrop" @click.self="showConsentModal = false">
        <div class="standard-modal-box" role="dialog" :aria-label="t('consentStaleTitle')">
          <div class="modal-header">
            <h3>{{ t('consentStaleTitle') }}</h3>
            <button class="btn-modal-close" @click="showConsentModal = false" :aria-label="t('mvClose')">✕</button>
          </div>
          <div class="modal-body-form">
            <p class="ln-charge-notice" role="note">{{ t('consentStaleNote') }}</p>
            <label class="pc-custom-check">
              <input type="checkbox" v-model="agreeTerms" />
              <span>{{ t('consentTerms') }}</span>
              <a :href="legalUrl('terms')" target="_blank" rel="noopener" class="btn-subtle-link" style="margin-left:auto">{{ t('consentViewTerms') }}</a>
            </label>
            <label class="pc-custom-check">
              <input type="checkbox" v-model="agreePrivacy" />
              <span>{{ t('consentPrivacy') }}</span>
              <a :href="legalUrl('privacy')" target="_blank" rel="noopener" class="btn-subtle-link" style="margin-left:auto">{{ t('consentViewPrivacy') }}</a>
            </label>
            <button class="btn-pc-submit-full" type="button" :disabled="!agreeTerms || !agreePrivacy" @click="submitReconsent">
              {{ t('signInBtn') }}
            </button>
            <button class="btn-secondary" type="button" @click="showConsentModal = false">{{ t('mvRecoverCancel') }}</button>
          </div>
        </div>
      </div>
    </main>
</template>
