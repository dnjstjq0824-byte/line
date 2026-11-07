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
const auditLogs = ref<Array<Record<string, string>>>([])
const featureFlags = ref<Array<Record<string, unknown>>>([])
const newFlagKey = ref(''), newFlagEnabled = ref(false)
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
    const [m, u, r, a, f] = await Promise.all([
      request<{ metrics: Record<string, number> }>('/api/v1/admin/stats', token.value),
      request<{ users: Array<Record<string, string>> }>('/api/v1/admin/users', token.value),
      request<{ reports: Array<Record<string, string>> }>('/api/v1/admin/reports', token.value),
      request<{ audit_logs: Array<Record<string, string>> }>('/api/v1/admin/audit-logs', token.value),
      request<{ feature_flags: Array<Record<string, unknown>> }>('/api/v1/admin/feature-flags', token.value),
    ])
    metrics.value = m.metrics
    users.value = u.users
    reports.value = r.reports
    auditLogs.value = a.audit_logs
    featureFlags.value = f.feature_flags
  })
}

async function takeAction(subjectUserID: string, action: 'warn' | 'suspend' | 'activate' | 'dismiss', reportID = '') {
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
            </span>
          </template>
        </BaseTable>
      </section>

      <section class="panel">
        <h2>{{ t('admin.reports') }}</h2>
        <BaseEmpty v-if="!reports.length" :title="t('admin.reportsEmptyT')" :hint="t('admin.reportsEmptyH')" />
        <div v-for="r in reports" :key="r.id" class="report-item">
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
