<script setup lang="ts">
import LunoThemeToggle from '../../shared/LunoThemeToggle.vue'
import BaseBadge from '../../shared/components/ui/BaseBadge.vue'
import BaseButton from '../../shared/components/ui/BaseButton.vue'
import BaseEmpty from '../../shared/components/ui/BaseEmpty.vue'
import BaseTable from '../../shared/components/ui/BaseTable.vue'
import { computed, ref } from 'vue'
import { request, type LoginResult } from '../../shared/api'
import { consoleT, detectConsoleLocale, setConsoleLocale, type ConsoleLocale } from '../../shared/console-i18n'

const locale = ref<ConsoleLocale>(detectConsoleLocale())
const t = (key: string, params?: Record<string, string | number>) => consoleT(locale.value, key, params)
function toggleLocale() {
  locale.value = locale.value === 'ko' ? 'en' : 'ko'
  setConsoleLocale(locale.value)
}

const email = ref(''), password = ref(''), token = ref(''), error = ref(''), note = ref('')
const metrics = ref<Record<string, number>>({})
const users = ref<Array<Record<string, string>>>([])
const reports = ref<Array<Record<string, string>>>([])
// F29: instant-blind form state (target comes from the report details).
const hideType = ref('message'), hideTargetId = ref(''), hideReason = ref('')
const auditLogs = ref<Array<Record<string, string>>>([])
const featureFlags = ref<Array<Record<string, unknown>>>([])
// F22: masked client telemetry (errors + API timings).
const telemetry = ref<Array<Record<string, unknown>>>([])
const teleCounts = ref({ error: 0, perf: 0 })
const teleKind = ref('error')
const newFlagKey = ref(''), newFlagEnabled = ref(false)
// F12: admin-managed official accounts + news.
const oaList = ref<Array<Record<string, string>>>([])
const newsList = ref<Array<Record<string, string>>>([])
const newOaName = ref(''), newOaHandle = ref(''), newOaDesc = ref('')
const newNewsTitle = ref(''), newNewsPress = ref(''), newNewsCat = ref(''), newNewsSummary = ref('')
// S8: bot management (existing admin APIs only; bots filter by issuer domain).
const bots = computed(() => users.value.filter((u) => (u.email || '').endsWith('@bots.invalid')))
const newBotName = ref(''), newBotHandle = ref('')
const mintBotId = ref(''), mintRooms = ref(''), mintOpsRead = ref(true), mintOpsPost = ref(true), mintOpsPropose = ref(true), mintTtl = ref('2592000')
const revealedToken = ref(''), revealedExpires = ref('')
const revokeBotId = ref(''), revokeTokenId = ref('')
const llmSwitch = ref<{ enabled: boolean; killed: boolean; rooms: string[]; users: string[] }>({ enabled: false, killed: false, rooms: [], users: [] })
const userColumns = computed(() => [
  { key: 'display_name', label: t('admin.colName') },
  { key: 'email', label: t('admin.colEmail') },
  { key: 'role', label: t('admin.colRole') },
  { key: 'state', label: t('admin.colState') },
  { key: 'actions', label: t('admin.colActions') },
])
const auditColumns = computed(() => [
  { key: 'created_at', label: t('admin.colTime') },
  { key: 'actor_user_id', label: t('admin.colActor') },
  { key: 'action', label: t('admin.colAction') },
  { key: 'target_id', label: t('admin.colTarget') },
])
const teleColumns = computed(() => [
  { key: 'received_at', label: t('admin.colTime') },
  { key: 'reporter', label: 'reporter' },
  { key: 'name', label: 'name' },
  { key: 'message', label: 'message' },
])

// F29: the severe new categories pin to the top of the queue (stable).
const severeReportCats = ['illegal_filming', 'child_exploitation', 'violence']
const sortedReports = computed(() => {
  const rank = (c: string) => (severeReportCats.includes(c) ? 0 : 1)
  return [...reports.value].sort((a, b) => rank(a.category || '') - rank(b.category || ''))
})

async function blindTarget(unhide: boolean) {
  if (!hideTargetId.value.trim()) return
  await run(async () => {
    await request(unhide ? '/api/v1/admin/moderation/unhide' : '/api/v1/admin/moderation/hide', token.value, 'POST', {
      target_type: hideType.value,
      target_id: hideTargetId.value.trim(),
      reason: hideReason.value.trim(),
    })
    note.value = t(unhide ? 'admin.unhideDone' : 'admin.hideDone')
    hideTargetId.value = ''
    hideReason.value = ''
    await load()
  })
}

async function run(fn: () => Promise<void>) {
  error.value = ''; note.value = ''
  try { await fn() } catch (e) { error.value = (e as Error).message }
}

async function login() {
  await run(async () => {
    const x = await request<LoginResult>('/api/v1/auth/login', null, 'POST', { email: email.value, password: password.value })
    token.value = x.access_token
    password.value = ''
    await load()
  })
}

async function load() {
  await run(async () => {
    const [m, u, r, a, f, oa, nw, llm] = await Promise.all([
      request<{ metrics: Record<string, number> }>('/api/v1/admin/stats', token.value),
      request<{ users: Array<Record<string, string>> }>('/api/v1/admin/users', token.value),
      request<{ reports: Array<Record<string, string>> }>('/api/v1/admin/reports', token.value),
      request<{ audit_logs: Array<Record<string, string>> }>('/api/v1/admin/audit-logs', token.value),
      request<{ feature_flags: Array<Record<string, unknown>> }>('/api/v1/admin/feature-flags', token.value),
      request<{ accounts: Array<Record<string, string>> }>('/api/v1/admin/official-accounts', token.value),
      request<{ articles: Array<Record<string, string>> }>('/api/v1/admin/news', token.value),
      request<{ enabled: boolean; killed: boolean; rooms: string[]; users: string[] }>('/api/v1/admin/llm/allowlist', token.value),
    ])
    metrics.value = m.metrics
    users.value = u.users
    reports.value = r.reports
    auditLogs.value = a.audit_logs
    featureFlags.value = f.feature_flags
    oaList.value = oa.accounts
    newsList.value = nw.articles
    llmSwitch.value = { enabled: !!llm.enabled, killed: !!llm.killed, rooms: llm.rooms || [], users: llm.users || [] }
    revealedToken.value = ''
    revealedExpires.value = ''
    await loadTelemetry()
  })
}

async function loadTelemetry() {
  await run(async () => {
    const res = await request<{ telemetry: Array<Record<string, unknown>>; counts: { error: number; perf: number } }>(
      `/api/v1/admin/telemetry?kind=${teleKind.value}&limit=50`, token.value)
    telemetry.value = res.telemetry
    teleCounts.value = res.counts
  })
}

async function takeAction(subjectUserID: string, action: 'warn' | 'suspend' | 'ban' | 'activate' | 'dismiss' | 'erase', reportID = '') {
  if (action === 'erase' && !window.confirm(t('admin.eraseConfirm'))) return
  await run(async () => {
    await request('/api/v1/admin/moderation/actions', token.value, 'POST', {
      subject_user_id: subjectUserID,
      report_id: reportID,
      action,
      reason: `Admin console ${action} action`,
    })
    note.value = t('admin.actionDone', { action })
    await load()
  })
}

async function saveFeatureFlag() {
  if (!newFlagKey.value.trim()) return
  await run(async () => {
    await request('/api/v1/admin/feature-flags', token.value, 'PUT', {
      key: newFlagKey.value.trim(),
      enabled: newFlagEnabled.value,
      config: {},
    })
    newFlagKey.value = ''
    newFlagEnabled.value = false
    note.value = t('admin.flagSaved')
    await load()
  })
}

async function saveOfficialAccount() {
  if (!newOaName.value.trim()) return
  await run(async () => {
    await request('/api/v1/admin/official-accounts', token.value, 'POST', {
      name: newOaName.value.trim(),
      handle: newOaHandle.value.trim(),
      description: newOaDesc.value.trim(),
    })
    newOaName.value = ''
    newOaHandle.value = ''
    newOaDesc.value = ''
    note.value = t('admin.oaSaved')
    await load()
  })
}

async function deleteOfficialAccount(id: string) {
  await run(async () => {
    await request(`/api/v1/admin/official-accounts/${id}`, token.value, 'DELETE')
    note.value = t('admin.oaDeleted')
    await load()
  })
}

async function saveNewsArticle() {
  if (!newNewsTitle.value.trim()) return
  await run(async () => {
    await request('/api/v1/admin/news', token.value, 'POST', {
      title: newNewsTitle.value.trim(),
      press: newNewsPress.value.trim(),
      category: newNewsCat.value.trim(),
      summary: newNewsSummary.value.trim(),
    })
    newNewsTitle.value = ''
    newNewsPress.value = ''
    newNewsCat.value = ''
    newNewsSummary.value = ''
    note.value = t('admin.newsSaved')
    await load()
  })
}

async function deleteNewsArticle(id: string) {
  await run(async () => {
    await request(`/api/v1/admin/news/${id}`, token.value, 'DELETE')
    note.value = t('admin.newsDeleted')
    await load()
  })
}
async function issueBot() {
  if (!newBotName.value.trim()) return
  await run(async () => {
    const handle = newBotHandle.value.trim()
    await request('/api/v1/admin/bots', token.value, 'POST', {
      display_name: newBotName.value.trim(),
      ...(handle ? { handle } : {}),
    })
    newBotName.value = ''
    newBotHandle.value = ''
    note.value = t('admin.botIssued')
    await load()
  })
}

async function mintBotToken() {
  if (!mintBotId.value || !mintRooms.value.trim()) return
  await run(async () => {
    const ops = [
      ...(mintOpsRead.value ? ['read'] : []),
      ...(mintOpsPost.value ? ['post'] : []),
      ...(mintOpsPropose.value ? ['propose'] : []),
    ]
    const res = await request<{ token: string; expires_at: number }>(`/api/v1/admin/bots/${mintBotId.value}/tokens`, token.value, 'POST', {
      rooms: mintRooms.value.split(',').map((s) => s.trim()).filter(Boolean),
      ops,
      ttl_sec: Number(mintTtl.value) || 2592000,
    })
    revealedToken.value = res.token
    revealedExpires.value = new Date(res.expires_at).toLocaleString()
    note.value = t('admin.botMinted')
  })
}

async function revokeBotToken() {
  if (!revokeBotId.value || !revokeTokenId.value.trim()) return
  if (!window.confirm(t('admin.revokeConfirm'))) return
  await run(async () => {
    await request(`/api/v1/admin/bots/${revokeBotId.value}/tokens/${revokeTokenId.value.trim()}`, token.value, 'DELETE')
    revokeTokenId.value = ''
    note.value = t('admin.botRevoked')
  })
}

async function setKill(stopped: boolean) {
  await run(async () => {
    await request('/api/v1/admin/llm/kill', token.value, 'PUT', { stopped })
    note.value = t('admin.killDone')
    await load()
  })
}
</script>

<template>
  <div class="page">
    <nav style="display:flex;gap:12px;margin-bottom:18px;padding:10px 14px;background:#fff;border-radius:10px;font-size:13px;align-items:center;border:1px solid #e0e8ee">
      <a href="../" style="text-decoration:none;color:#315BCD;font-weight:700">{{ t('nav.home') }}</a>
      <span style="color:#ccc">|</span>
      <a href="../admin/" style="text-decoration:none;color:#315BCD;font-weight:700">{{ t('nav.admin') }}</a>
      <a href="../partner/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.partner') }}</a>
      <a href="../developer/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.developer') }}</a>
      <a href="../creator/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.creator') }}</a>
      <a href="../ads/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.ads') }}</a>
      <button @click="toggleLocale" style="margin-left:auto;padding:4px 8px;font-size:12px">{{ t('nav.lang') }}</button>
      <button v-if="token" @click="token = ''" style="padding:4px 8px;font-size:12px">{{ t('nav.logout') }}</button>
    </nav>

    <header><LunoThemeToggle />
      <h1>{{ t('admin.title') }}</h1>
      <span>{{ t('admin.roles') }}</span>
    </header>

    <p class="error" v-if="error" role="alert">{{ error }}</p>
    <p class="note" v-if="note">{{ note }}</p>

    <form v-if="!token" @submit.prevent="login" class="panel">
      <h2>{{ t('admin.authTitle') }}</h2>
      <div style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b">
        <span>{{ t('admin.authHint') }}</span>
      </div>
      <input type="email" v-model="email" :placeholder="t('form.emailPh')" required />
      <input type="password" v-model="password" :placeholder="t('form.passwordPh')" required />
      <BaseButton type="submit" variant="primary">{{ t('form.login') }}</BaseButton>
      <p class="muted">{{ t('admin.denyNote') }}</p>
    </form>

    <main v-else>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2>{{ t('admin.dash') }}</h2>
        <BaseButton @click="load">{{ t('admin.refresh') }}</BaseButton>
      </div>

      <section class="metrics">
        <div class="panel" v-for="(value, key) in metrics" :key="key">
          <small>{{ key }}</small>
          <strong>{{ value.toLocaleString() }}</strong>
        </div>
      </section>

      <section class="panel">
        <h2>{{ t('admin.users') }}</h2>
        <BaseTable :columns="userColumns" :rows="users" row-key="id">
          <template #cell-role="{ value }"><BaseBadge tone="info">{{ value }}</BaseBadge></template>
          <template #cell-state="{ value }"><BaseBadge :tone="value === 'active' ? 'success' : 'danger'">{{ value }}</BaseBadge></template>
          <template #cell-actions="{ row }">
            <span style="display:inline-flex;gap:6px">
              <BaseButton v-if="row.state === 'active'" size="sm" variant="danger" @click="takeAction(row.id, 'suspend')">{{ t('admin.suspend') }}</BaseButton>
              <BaseButton v-else-if="row.state === 'suspended'" size="sm" variant="primary" @click="takeAction(row.id, 'activate')">{{ t('admin.unsuspend') }}</BaseButton>
              <BaseButton size="sm" @click="takeAction(row.id, 'warn')">{{ t('admin.warn') }}</BaseButton>
              <BaseButton v-if="row.state === 'active'" size="sm" variant="danger" @click="takeAction(row.id, 'ban')">{{ t('admin.ban') }}</BaseButton>
              <BaseButton v-if="row.state !== 'deleted'" size="sm" variant="danger" @click="takeAction(row.id, 'erase')">{{ t('admin.erase') }}</BaseButton>
            </span>
          </template>
        </BaseTable>
      </section>

      <section class="panel">
        <h2>{{ t('admin.bots') }}</h2>
        <form @submit.prevent="issueBot" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <input v-model="newBotName" :placeholder="t('admin.botNamePh')" required />
          <input v-model="newBotHandle" :placeholder="t('admin.botHandlePh')" />
          <BaseButton type="submit" variant="primary">{{ t('admin.botIssue') }}</BaseButton>
        </form>
        <p class="muted" v-if="!bots.length">{{ t('admin.allowEmpty') }}</p>
        <div v-for="b in bots" :key="b.id" class="item-line">
          <span><strong>{{ b.display_name }}</strong> <code>{{ b.email }}</code></span>
          <BaseBadge :tone="b.state === 'active' ? 'success' : 'danger'">{{ b.state }}</BaseBadge>
        </div>
        <form @submit.prevent="mintBotToken" style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap;align-items:center">
          <select v-model="mintBotId" required style="padding:6px 10px;border:1px solid #b6c5d5;border-radius:8px">
            <option value="" disabled>{{ t('admin.botTarget') }}</option>
            <option v-for="b in bots" :key="b.id" :value="b.id">{{ b.display_name }}</option>
          </select>
          <input v-model="mintRooms" :placeholder="t('admin.botRoomsPh')" required style="flex:1;min-width:160px" />
          <label style="display:flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" v-model="mintOpsRead" style="width:auto" /> read</label>
          <label style="display:flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" v-model="mintOpsPost" style="width:auto" /> post</label>
          <label style="display:flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" v-model="mintOpsPropose" style="width:auto" /> propose</label>
          <input v-model="mintTtl" :placeholder="t('admin.botTtlPh')" inputmode="numeric" style="width:130px" />
          <BaseButton type="submit" variant="primary">{{ t('admin.botMint') }}</BaseButton>
        </form>
        <div v-if="revealedToken" style="margin:0 0 12px;padding:10px 12px;background:#fff8e1;border:1px solid #f0d48a;border-radius:8px">
          <div style="font-size:13px;font-weight:700;margin-bottom:6px">{{ t('admin.botTokenLabel') }}</div>
          <code style="word-break:break-all">{{ revealedToken }}</code>
          <div style="font-size:13px;margin-top:6px">{{ t('admin.botExpiresAt') }}: {{ revealedExpires }}</div>
          <BaseButton size="sm" @click="revealedToken = ''; revealedExpires = ''">{{ t('admin.botClose') }}</BaseButton>
        </div>
        <form @submit.prevent="revokeBotToken" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select v-model="revokeBotId" required style="padding:6px 10px;border:1px solid #b6c5d5;border-radius:8px">
            <option value="" disabled>{{ t('admin.botTarget') }}</option>
            <option v-for="b in bots" :key="b.id" :value="b.id">{{ b.display_name }}</option>
          </select>
          <input v-model="revokeTokenId" :placeholder="t('admin.botTokenIdPh')" required style="flex:1;min-width:160px" />
          <BaseButton type="submit" variant="danger">{{ t('admin.botRevoke') }}</BaseButton>
        </form>
      </section>

      <section class="panel">
        <h2>{{ t('admin.killTitle') }}</h2>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span style="font-size:13px">{{ t('admin.killMaster') }}</span>
          <BaseBadge :tone="llmSwitch.enabled ? 'success' : 'danger'">{{ llmSwitch.enabled ? 'ON' : 'OFF' }}</BaseBadge>
          <span style="font-size:13px;margin-left:12px">{{ t('admin.killSwitch') }}</span>
          <BaseBadge :tone="llmSwitch.killed ? 'danger' : 'success'">{{ llmSwitch.killed ? t('admin.killStopped') : t('admin.killRunning') }}</BaseBadge>
          <BaseButton v-if="!llmSwitch.killed" size="sm" variant="danger" @click="setKill(true)">{{ t('admin.killStop') }}</BaseButton>
          <BaseButton v-else size="sm" variant="primary" @click="setKill(false)">{{ t('admin.killResume') }}</BaseButton>
        </div>
      </section>

      <section class="panel">
        <h2>{{ t('admin.allowTitle') }}</h2>
        <div style="font-size:13px;margin-bottom:4px"><strong>{{ t('admin.allowRooms') }}</strong></div>
        <p class="muted" v-if="!llmSwitch.rooms.length">{{ t('admin.allowEmpty') }}</p>
        <div v-for="r in llmSwitch.rooms" :key="r" class="item-line"><code>{{ r }}</code></div>
        <div style="font-size:13px;margin:8px 0 4px"><strong>{{ t('admin.allowUsers') }}</strong></div>
        <p class="muted" v-if="!llmSwitch.users.length">{{ t('admin.allowEmpty') }}</p>
        <div v-for="u in llmSwitch.users" :key="u" class="item-line"><code>{{ u }}</code></div>
      </section>

      <section class="panel">
        <h2>{{ t('admin.reports') }}</h2>
        <form @submit.prevent="blindTarget(false)" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
          <strong style="font-size:13px">{{ t('admin.hideTitle') }}</strong>
          <label style="font-size:12px;color:#64748b">{{ t('admin.hideType') }}</label>
          <select v-model="hideType" style="padding:6px 10px;border:1px solid #b6c5d5;border-radius:8px">
            <option value="message">message</option>
            <option value="feed_post">feed_post</option>
            <option value="community_post">community_post</option>
            <option value="attachment">attachment</option>
          </select>
          <input v-model="hideTargetId" :placeholder="t('admin.hideTargetPh')" required style="flex:1;min-width:160px" />
          <input v-model="hideReason" :placeholder="t('admin.hideReasonPh')" style="flex:1;min-width:160px" />
          <BaseButton type="submit" variant="danger">{{ t('admin.hideNow') }}</BaseButton>
          <BaseButton type="button" @click="blindTarget(true)">{{ t('admin.unhideNow') }}</BaseButton>
        </form>
        <BaseEmpty v-if="!reports.length" :title="t('admin.reportsEmptyT')" :hint="t('admin.reportsEmptyH')" />
        <div v-for="r in sortedReports" :key="r.id" class="report-item">
          <div>
            <strong>[{{ r.category }}]</strong> {{ t('admin.reportState') }} <span class="badge">{{ r.state }}</span> — {{ r.details }}
          </div>
          <div v-if="r.state === 'open'" style="display:flex;gap:6px">
            <button style="background:#d9534f;font-size:12px;padding:4px 8px" @click="takeAction(r.subject_user_id || '', 'suspend', r.id)">{{ t('admin.reporterSuspend') }}</button>
            <button style="background:#6c757d;font-size:12px;padding:4px 8px" @click="takeAction(r.subject_user_id || '', 'dismiss', r.id)">{{ t('admin.dismiss') }}</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>{{ t('admin.flags') }}</h2>
        <form @submit.prevent="saveFeatureFlag" style="display:flex;gap:8px;margin-bottom:12px">
          <input v-model="newFlagKey" :placeholder="t('admin.flagKeyPh')" required />
          <label style="display:flex;align-items:center;gap:6px">
            <input type="checkbox" v-model="newFlagEnabled" style="width:auto" /> {{ t('admin.enabled') }}
          </label>
          <BaseButton type="submit" variant="primary">{{ t('admin.flagSave') }}</BaseButton>
        </form>
        <div v-for="f in featureFlags" :key="String(f.key)" class="item-line">
          <code>{{ f.key }}</code>
          <BaseBadge :tone="f.enabled ? 'success' : 'danger'">{{ f.enabled ? 'ON' : 'OFF' }}</BaseBadge>
        </div>
      </section>

      <section class="panel">
        <h2>{{ t('admin.oa') }}</h2>
        <form @submit.prevent="saveOfficialAccount" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <input v-model="newOaName" :placeholder="t('admin.oaNamePh')" required />
          <input v-model="newOaHandle" :placeholder="t('admin.oaHandlePh')" />
          <input v-model="newOaDesc" :placeholder="t('admin.oaDescPh')" />
          <BaseButton type="submit" variant="primary">{{ t('admin.oaAdd') }}</BaseButton>
        </form>
        <div v-for="o in oaList" :key="o.id" class="item-line">
          <span><strong>{{ o.name }}</strong> <code>{{ o.handle }}</code> <small class="muted">{{ o.description }}</small></span>
          <span style="display:inline-flex;gap:6px;align-items:center">
            <BaseBadge v-if="o.id === 'oa-notice'" tone="info">{{ t('admin.oaSystem') }}</BaseBadge>
            <BaseButton v-else size="sm" variant="danger" @click="deleteOfficialAccount(o.id)">{{ t('admin.oaDelete') }}</BaseButton>
          </span>
        </div>
      </section>

      <section class="panel">
        <h2>{{ t('admin.news') }}</h2>
        <form @submit.prevent="saveNewsArticle" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <input v-model="newNewsTitle" :placeholder="t('admin.newsTitlePh')" required />
          <input v-model="newNewsPress" :placeholder="t('admin.newsPressPh')" />
          <input v-model="newNewsCat" :placeholder="t('admin.newsCatPh')" />
          <input v-model="newNewsSummary" :placeholder="t('admin.newsSummaryPh')" />
          <BaseButton type="submit" variant="primary">{{ t('admin.newsAdd') }}</BaseButton>
        </form>
        <div v-for="n in newsList" :key="n.id" class="item-line">
          <span><strong>{{ n.title }}</strong> <small class="muted">{{ n.press }} · {{ n.category }}</small></span>
          <BaseButton size="sm" variant="danger" @click="deleteNewsArticle(n.id)">{{ t('admin.newsDelete') }}</BaseButton>
        </div>
      </section>

      <section class="panel">
        <h2>{{ t('admin.telemetry') }} <small class="muted">{{ t('admin.teleErrors') }} {{ teleCounts.error }} · {{ t('admin.telePerf') }} {{ teleCounts.perf }}</small></h2>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <label style="font-size:12px;color:#64748b">{{ t('admin.teleKind') }}</label>
          <select v-model="teleKind" @change="loadTelemetry" style="padding:6px 10px;border:1px solid #b6c5d5;border-radius:8px">
            <option value="error">{{ t('admin.teleErrors') }}</option>
            <option value="perf">{{ t('admin.telePerf') }}</option>
          </select>
        </div>
        <BaseEmpty v-if="!telemetry.length" :title="t('admin.teleEmpty')" hint="" />
        <BaseTable v-else :columns="teleColumns" :rows="telemetry" row-key="id">
          <template #cell-received_at="{ value }"><small>{{ new Date(String(value)).toLocaleString() }}</small></template>
          <template #cell-reporter="{ value }"><BaseBadge tone="info">{{ String(value ?? '') }}</BaseBadge></template>
          <template #cell-name="{ value }"><code>{{ String(value ?? '') }}</code></template>
          <template #cell-message="{ value }"><small>{{ String(value ?? '').slice(0, 160) }}</small></template>
        </BaseTable>
      </section>

      <section class="panel">
        <h2>{{ t('admin.audit') }}</h2>
        <BaseTable :columns="auditColumns" :rows="auditLogs" row-key="id">
          <template #cell-created_at="{ value }"><small>{{ new Date(String(value)).toLocaleString() }}</small></template>
          <template #cell-actor_user_id="{ value }"><code>{{ value }}</code></template>
          <template #cell-action="{ value }"><strong>{{ value }}</strong></template>
          <template #cell-target_id="{ value }"><code>{{ value }}</code></template>
        </BaseTable>
      </section>
    </main>
  </div>
</template>

<style>
body{margin:0;background:#f2f5fa;color:#15243a;font:15px system-ui,sans-serif}.page{max-width:1150px;margin:auto;padding:28px}header{display:flex;justify-content:space-between;align-items:center;gap:20px}header span{color:#5b6b80}.panel{padding:23px;background:white;margin:18px 0;border:1px solid #dce4f0;border-radius:12px}input,button{padding:10px;border:1px solid #b6c5d5;border-radius:8px;margin:4px}button{background:#225bd6;color:white;cursor:pointer}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.metrics .panel{display:grid;gap:8px}.metrics strong{font-size:30px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:9px;border-bottom:1px solid #eef1f5}.report-item,.item-line{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f4f8}.badge{padding:3px 8px;border-radius:6px;font-size:12px;background:#e2e8f0}.badge-on{background:#d4edda;color:#155724}.badge-off{background:#f8d7da;color:#721c24}.status.active{color:#28a745;font-weight:bold}.status.suspended{color:#dc3545;font-weight:bold}.muted{color:#6c757d}.error{color:#bc2626;background:#fde8e8;padding:10px;border-radius:8px}.note{color:#155724;background:#d4edda;padding:10px;border-radius:8px}
</style>
