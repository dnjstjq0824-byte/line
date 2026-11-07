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

const token = ref(''), email = ref(''), password = ref(''), name = ref(''), org = ref(''), selectedAdv = ref('')
const campaign = ref(''), objective = ref('conversions'), budget = ref(50000), error = ref(''), note = ref('')
const selectedCamp = ref(''), adGroupName = ref(''), bidAmount = ref(150)

const orgs = ref<Array<{ id: string; name: string }>>([])
const advertisers = ref<Array<{ id: string; name: string; status: string }>>([])
const campaigns = ref<Array<{ id: string; name: string; status: string; daily_budget_minor: number }>>([])

async function run(fn: () => Promise<void>) {
  error.value = ''; note.value = ''
  try { await fn() } catch (e) { error.value = (e as Error).message }
}

async function login() {
  await run(async () => {
    token.value = (await request<LoginResult>('/api/v1/auth/login', null, 'POST', { email: email.value, password: password.value })).access_token
    password.value = ''
    orgs.value = (await request<{ organizations: typeof orgs.value }>('/api/v1/partner/organizations', token.value)).organizations
    await refresh()
  })
}

async function refresh() {
  const [adv, camp] = await Promise.all([
    request<{ advertisers: typeof advertisers.value }>('/api/v1/ads/advertisers', token.value),
    request<{ campaigns: typeof campaigns.value }>('/api/v1/ads/campaigns', token.value),
  ])
  advertisers.value = adv.advertisers
  campaigns.value = camp.campaigns
}

async function addAdvertiser() {
  await run(async () => {
    await request('/api/v1/ads/advertisers', token.value, 'POST', { organization_id: org.value, name: name.value })
    name.value = ''
    await refresh()
    note.value = t('ads.advDone')
  })
}

async function addCampaign() {
  await run(async () => {
    await request('/api/v1/ads/campaigns', token.value, 'POST', {
      advertiser_id: selectedAdv.value,
      name: campaign.value,
      objective: objective.value,
      daily_budget_minor: budget.value,
      currency: 'KRW',
    })
    campaign.value = ''
    await refresh()
    note.value = t('ads.campDone')
  })
}

async function addAdGroup() {
  if (!selectedCamp.value || !adGroupName.value.trim()) return
  await run(async () => {
    await request(`/api/v1/ads/campaigns/${selectedCamp.value}/groups`, token.value, 'POST', {
      name: adGroupName.value.trim(),
      targeting: { age: '20-40', geo: 'KR' },
      bid_minor: bidAmount.value,
    })
    adGroupName.value = ''
    note.value = t('ads.groupDone')
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
      <a href="../creator/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.creator') }}</a>
      <a href="../ads/" style="text-decoration:none;color:#315BCD;font-weight:700">{{ t('nav.ads') }}</a>
      <button @click="toggleLocale" style="margin-left:auto;padding:4px 8px;font-size:12px">{{ t('nav.lang') }}</button>
      <button v-if="token" @click="token = ''" style="padding:4px 8px;font-size:12px">{{ t('nav.logout') }}</button>
    </nav>

    <header><h1>LUNO Advertiser Center (Ads)</h1></header>
    <p>{{ t('ads.sub') }}</p>
    <p role="alert" class="error" v-if="error">{{ error }}</p>
    <p class="note" v-if="note">{{ note }}</p>

    <form v-if="!token" @submit.prevent="login">
      <div style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b">
        <span>{{ t('ads.loginHint') }}</span>
      </div>
      <input v-model="email" type="email" :placeholder="t('form.emailPh')" required />
      <input v-model="password" type="password" :placeholder="t('form.passwordPh')" required />
      <button>{{ t('form.login') }}</button>
    </form>

    <template v-else>
      <section>
        <h2>{{ t('ads.newAdv') }}</h2>
        <form @submit.prevent="addAdvertiser">
          <select v-model="org" required>
            <option value="" disabled>{{ t('ads.pickOrg') }}</option>
            <option v-for="o in orgs" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
          <input v-model="name" :placeholder="t('ads.advNamePh')" required minlength="2" />
          <button>{{ t('ads.createAdv') }}</button>
        </form>
      </section>

      <section>
        <h2>{{ t('ads.camps') }}</h2>
        <form @submit.prevent="addCampaign">
          <select v-model="selectedAdv" required>
            <option value="" disabled>{{ t('ads.pickAdv') }}</option>
            <option v-for="a in advertisers" :key="a.id" :value="a.id">{{ a.name }} ({{ a.status }})</option>
          </select>
          <input v-model="campaign" :placeholder="t('ads.campNamePh')" minlength="2" required />
          <select v-model="objective">
            <option value="conversions">{{ t('ads.objConv') }}</option>
            <option value="awareness">{{ t('ads.objAware') }}</option>
            <option value="traffic">{{ t('ads.objTraffic') }}</option>
          </select>
          <input v-model.number="budget" type="number" min="0" :placeholder="t('ads.budgetPh')" />
          <button>{{ t('ads.createCamp') }}</button>
        </form>

        <div style="margin-top:16px">
          <h3>{{ t('ads.myCamps') }}</h3>
          <div v-for="c in campaigns" :key="c.id" class="camp-card" :class="{ active: selectedCamp === c.id }" @click="selectedCamp = c.id">
            <strong>{{ c.name }}</strong> · {{ c.status }} · {{ t('ads.daily') }} {{ c.daily_budget_minor.toLocaleString() }} KRW
          </div>

          <div v-if="selectedCamp" class="sub-form">
            <h4>{{ t('ads.addGroup') }}</h4>
            <form @submit.prevent="addAdGroup">
              <input v-model="adGroupName" :placeholder="t('ads.groupNamePh')" required />
              <input type="number" v-model="bidAmount" min="10" :placeholder="t('ads.bidPh')" />
              <button>{{ t('ads.createGroup') }}</button>
            </form>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style>
body{font:15px system-ui;background:#f4f6fa;color:#172536;margin:0}main{max-width:900px;margin:35px auto;background:white;padding:30px;border-radius:12px}section{border:1px solid #ddd;padding:20px;border-radius:10px;margin:16px 0}input,button,select{padding:10px;border:1px solid #ccc;border-radius:8px;margin:4px}button{background:#145bc0;color:white;cursor:pointer}.camp-card{padding:10px;margin:8px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer}.camp-card.active{border-color:#145bc0;background:#ebf2fc}.sub-form{margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px}.error{color:#a22;background:#ffebeb;padding:10px;border-radius:8px}.note{color:#0b6623;background:#e9f6ec;padding:10px;border-radius:8px}
</style>
