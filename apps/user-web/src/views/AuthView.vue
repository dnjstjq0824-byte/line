<script setup lang="ts">
import lunoLogo from '../../../shared/brand/luno-logo-horizontal.svg'
import lunoMark from '../../../shared/brand/luno-logo-appicon.svg'
import LunoIcon from '../components/LunoIcon.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { SUPPORTED_LOCALES } from '../luno-i18n'
import { request, type LoginResult, type User } from '../../../shared/api'
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

const authMethod = ref<'email' | 'phone'>('email')
// SMS provider contract required (commercialization P1): the phone form stays
// in the tree for layout stability, but entry is gated until then.
const phoneAuthAvailable = false
const autoLoginCheck = ref(true)
const startOnBootCheck = ref(false)
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

// Demo login exists on the edge worker only; the Go backend has no passwordless
// demo endpoint by design, so the demo chips stay hidden when API_URL is Go.
const demoLoginAvailable = computed(() => !appVersion.value.worker_version.startsWith('go-'))

async function authAction() {
  await wrap(async () => {
    if (registerMode.value) {
      await request('/api/v1/auth/register', null, 'POST', {
        email: email.value.trim(),
        password: password.value,
        display_name: displayName.value.trim() || email.value.split('@')[0]
      })
      note.value = t('registerDoneNote')
      registerMode.value = false
      return
    }
    const data = await request<LoginResult>('/api/v1/auth/login', null, 'POST', {
      email: email.value.trim(),
      password: password.value,
      device_name: 'LUNO Web Desktop Client',
      platform: 'web'
    })
    storeSession(data, autoLoginCheck.value)
    currentUser.value = await api<User>('/api/v1/me')
    password.value = ''
    await router.push('/chats')
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
    note.value = t('qrScanNote')
    if (qrPollInterval) clearInterval(qrPollInterval)
    qrPollInterval = setInterval(async () => {
      try {
        const p = await request<any>('/api/v1/auth/qr/poll', null, 'POST', {
          challenge_id: qrChallengeID.value,
          qr_token: qrToken.value,
          device_name: 'Open Messenger Web QR Client',
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
      device_name: 'Open Messenger Desktop PC'
    })
    storeSession(res, autoLoginCheck.value)
    currentUser.value = res.user || await api<User>('/api/v1/me')
    if (phoneTimerInterval) clearInterval(phoneTimerInterval)
    await router.push('/chats')
  })
}

async function quickDemoLogin(account: 'user' | 'alice') {
  await wrap(async () => {
    const data = await request<LoginResult>('/api/v1/auth/demo', null, 'POST', {
      account
    })
    storeSession(data, autoLoginCheck.value)
    currentUser.value = await api<User>('/api/v1/me')
    password.value = ''
    await router.push('/chats')
  })
}

onMounted(() => { void fetchAppVersion() })
onBeforeUnmount(() => {
  if (qrPollInterval) clearInterval(qrPollInterval)
  if (qrCountdownInterval) clearInterval(qrCountdownInterval)
  if (phoneTimerInterval) clearInterval(phoneTimerInterval)
})
</script>

<template>
    <main class="pc-auth-viewport">
      <div class="pc-auth-window-2col">
        <!-- Title bar with window controls & branding -->
        <div class="pc-window-bar">
          <div class="pc-win-left-controls">
            <button class="btn-win-menu" :title="t('menu')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <button class="btn-win-help" :title="t('winHelpTitle')">
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
            <button class="btn-win-dark" @click="toggleDarkMode" :title="isDarkMode ? t('lightModeTitle') : t('darkModeTitle')">
              <LunoIcon :name="isDarkMode ? 'sun' : 'moon'" :size="13" />
            </button>
            <div class="pc-win-sys-controls">
              <button class="btn-sys-tool" :title="t('winMinTitle')">−</button>
              <button class="btn-sys-tool" :title="t('winMaxTitle')">□</button>
              <button class="btn-sys-tool close" :title="t('menu_close')">✕</button>
            </div>
          </div>
        </div>

        <div class="pc-auth-body-2col">
          <!-- LEFT COLUMN: Credentials Login & Sign-up -->
          <div class="pc-auth-col form-col">
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
                  required
                  class="pc-login-input"
                />
              </div>
              <div class="pc-input-row password-wrap">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('passwordPlaceholder')"
                  required
                  autocomplete="current-password"
                  class="pc-login-input"
                />
                <button type="button" class="btn-eye-toggle" @click="showPassword = !showPassword" tabindex="-1">
                  {{ showPassword ? '🙈' : '👁️' }}
                </button>
              </div>

              <!-- Login Action Button -->
              <button class="btn-pc-submit-full" type="submit" :disabled="!email || !password">
                {{ registerMode ? t('signUpBtn') : t('signInBtn') }}
              </button>

              <!-- Checkbox & Link Options (Matching Screenshot 2 & 3) -->
              <div class="pc-login-options-row">
                <label class="pc-custom-check">
                  <input type="checkbox" v-model="autoLoginCheck" />
                  <span>{{ t('rememberMe') }}</span>
                </label>
                <button type="button" class="btn-subtle-link" @click="note = t('soon_tag')">
                  {{ t('findPassword') }}
                </button>
              </div>

              <div class="pc-login-options-row">
                <label class="pc-custom-check">
                  <input type="checkbox" v-model="startOnBootCheck" disabled />
                  <span>{{ t('startOnBoot') }}</span>
                </label>
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

              <!-- Quick One-Click Demo Credentials (Fail-closed & Passwordless) -->
              <div v-if="demoLoginAvailable" class="pc-demo-chips-compact">
                <span class="demo-caption">{{ t('quickDemoLabel') }}</span>
                <div class="demo-pill-group">
                  <button type="button" class="btn-demo-pill" @click="quickDemoLogin('user')">{{ t('demoUser') }}</button>
                  <button type="button" class="btn-demo-pill" @click="quickDemoLogin('alice')">{{ t('demoAlice') }}</button>
                </div>
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
              <h3 class="pc-qr-heading">{{ t('loginQrTab') }}</h3>
              <div class="pc-qr-matrix-card" :aria-label="t('soon_tag')">
                <img :src="lunoMark" alt="LUNO" class="ln-qr-brand" />
                <!-- High Fidelity Dynamic QR Code SVG with Open Messenger Center Badge -->
              </div>

              <!-- Instruction Text (Screenshot 2 & 3) -->
              <p class="pc-qr-instruction">
                {{ t('qr_preparing') }}
              </p>

              <!-- Expiry & Reload Pill -->
              <div v-if="false" class="pc-qr-timer-pill">
                <span>{{ t('validTimeLabel') }} <strong>{{ formattedQrCountdown }}</strong></span>
                <button type="button" class="btn-qr-reload" @click="refreshQr" :title="t('reloadBtn')">
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
    </main>
</template>
