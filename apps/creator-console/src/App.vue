<script setup lang="ts">
import LunoThemeToggle from '../../shared/LunoThemeToggle.vue'
import { ref } from 'vue'
import { request, type LoginResult } from '../../shared/api'
import { consoleT, detectConsoleLocale, setConsoleLocale, type ConsoleLocale } from '../../shared/console-i18n'

const locale = ref<ConsoleLocale>(detectConsoleLocale())
const t = (key: string, params?: Record<string, string | number>) => consoleT(locale.value, key, params)
function toggleLocale() {
  locale.value = locale.value === 'ko' ? 'en' : 'ko'
  setConsoleLocale(locale.value)
}

const token = ref(''), email = ref(''), password = ref(''), profile = ref(''), title = ref(''), price = ref(2500), error = ref(''), message = ref('')
const selectedPackID = ref(''), stickerObjectKey = ref(''), stickerOrdinal = ref(1)
const packs = ref<Array<{ id: string; title: string; status: string; price_minor: number; currency: string }>>([])
const settlements = ref<Array<{ id: string; period_start: string; period_end: string; amount_minor: number; currency: string; state: string }>>([])

async function run(fn: () => Promise<void>) {
  error.value = ''; message.value = ''
  try { await fn() } catch (e) { error.value = (e as Error).message }
}

async function login() {
  await run(async () => {
    const x = await request<LoginResult>('/api/v1/auth/login', null, 'POST', { email: email.value, password: password.value })
    token.value = x.access_token
    password.value = ''
    await refresh()
  })
}

async function refresh() {
  const [p, s] = await Promise.all([
    request<{ packs: typeof packs.value }>('/api/v1/creator/packs', token.value),
    request<{ settlements: typeof settlements.value }>('/api/v1/creator/settlements', token.value),
  ])
  packs.value = p.packs
  settlements.value = s.settlements
}

async function saveProfile() {
  await run(async () => {
    await request('/api/v1/creator/profile', token.value, 'POST', { display_name: profile.value })
    message.value = t('creator.profileDone')
  })
}

async function createPack() {
  await run(async () => {
    await request('/api/v1/creator/packs', token.value, 'POST', { title: title.value, price_minor: price.value, currency: 'KRW' })
    title.value = ''
    await refresh()
    message.value = t('creator.packDone')
  })
}

async function addStickerItem() {
  if (!selectedPackID.value || !stickerObjectKey.value.trim()) return
  await run(async () => {
    await request(`/api/v1/creator/packs/${selectedPackID.value}/stickers`, token.value, 'POST', {
      object_key: stickerObjectKey.value.trim(),
      kind: 'static',
      ordinal: stickerOrdinal.value,
    })
    stickerObjectKey.value = ''
    stickerOrdinal.value += 1
    message.value = t('creator.stickerDone')
  })
}
</script>

<template>
  <main class="page"><LunoThemeToggle class="ln-console-theme" />
    <nav style="display:flex;gap:12px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #e2e8f0;font-size:13px;align-items:center">
      <a href="../" style="text-decoration:none;color:#315BCD;font-weight:700">{{ t('nav.home') }}</a>
      <span style="color:#ccc">|</span>
      <a href="../admin/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.admin') }}</a>
      <a href="../partner/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.partner') }}</a>
      <a href="../developer/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.developer') }}</a>
      <a href="../creator/" style="text-decoration:none;color:#315BCD;font-weight:700">{{ t('nav.creator') }}</a>
      <a href="../ads/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.ads') }}</a>
      <button @click="toggleLocale" style="margin-left:auto;padding:4px 8px;font-size:12px">{{ t('nav.lang') }}</button>
      <button v-if="token" @click="token = ''" style="padding:4px 8px;font-size:12px">{{ t('nav.logout') }}</button>
    </nav>

    <header><h1>LUNO Creator Market Center</h1></header>
    <p>{{ t('creator.sub') }}</p>
    <p role="alert" class="error" v-if="error">{{ error }}</p>
    <p class="note" v-if="message">{{ message }}</p>

    <form v-if="!token" @submit.prevent="login">
      <div style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b">
        <span>{{ t('creator.loginHint') }}</span>
      </div>
      <input type="email" v-model="email" :placeholder="t('form.emailPh')" required />
      <input v-model="password" type="password" :placeholder="t('form.passwordPh')" required />
      <button>{{ t('form.login') }}</button>
    </form>

    <template v-else>
      <section>
        <h2>{{ t('creator.profile') }}</h2>
        <form @submit.prevent="saveProfile">
          <input v-model="profile" :placeholder="t('creator.profilePh')" minlength="2" required />
          <button>{{ t('creator.saveProfile') }}</button>
        </form>
      </section>

      <section>
        <h2>{{ t('creator.newPack') }}</h2>
        <form @submit.prevent="createPack">
          <input v-model="title" :placeholder="t('creator.packTitlePh')" minlength="2" required />
          <input v-model.number="price" type="number" min="0" :placeholder="t('creator.pricePh')" />
          <button>{{ t('creator.draft') }}</button>
        </form>
      </section>

      <section>
        <h2>{{ t('creator.myPacks') }}</h2>
        <div v-for="p in packs" :key="p.id" class="pack-card" :class="{ active: selectedPackID === p.id }" @click="selectedPackID = p.id">
          <strong>{{ p.title }}</strong> · {{ p.price_minor }} {{ p.currency }} ({{ p.status }})
        </div>

        <div v-if="selectedPackID" class="sub-form">
          <h3>{{ t('creator.addAsset') }}</h3>
          <form @submit.prevent="addStickerItem">
            <input v-model="stickerObjectKey" :placeholder="t('creator.storageKeyPh')" required />
            <input type="number" v-model="stickerOrdinal" min="1" :placeholder="t('creator.orderPh')" />
            <button>{{ t('creator.addSticker') }}</button>
          </form>
        </div>
      </section>

      <section>
        <h2>{{ t('creator.settlements') }}</h2>
        <p v-if="!settlements.length">{{ t('creator.settlementsEmpty') }}</p>
        <div v-for="s in settlements" :key="s.id" class="item">
          <span>{{ t('creator.settlementPeriod') }} {{ s.period_start }} ~ {{ s.period_end }}</span>
          <strong>{{ s.amount_minor.toLocaleString() }} {{ s.currency }} ({{ s.state }})</strong>
        </div>
      </section>
    </template>
  </main>
</template>

<style>
body{font:15px system-ui;background:#f4f6fa;color:#172536;margin:0}main{max-width:900px;margin:35px auto;background:white;padding:30px;border-radius:12px}section{border:1px solid #ddd;padding:20px;border-radius:10px;margin:16px 0}input,button{padding:10px;border:1px solid #ccc;border-radius:8px;margin:4px}button{background:#096b52;color:white;cursor:pointer}.pack-card{padding:10px;margin:8px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer}.pack-card.active{border-color:#096b52;background:#e9f6f2}.sub-form{margin-top:14px;padding:12px;background:#f8fafc;border-radius:8px}.item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}.error{color:#a22;background:#ffebeb;padding:10px;border-radius:8px}.note{color:#176b3e;background:#e8f7ee;padding:10px;border-radius:8px}
</style>
