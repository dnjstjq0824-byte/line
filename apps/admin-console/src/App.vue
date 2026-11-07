<script setup lang="ts">
import LunoThemeToggle from '../../shared/LunoThemeToggle.vue'
import BaseBadge from '../../shared/components/ui/BaseBadge.vue'
import BaseButton from '../../shared/components/ui/BaseButton.vue'
import BaseEmpty from '../../shared/components/ui/BaseEmpty.vue'
import BaseTable from '../../shared/components/ui/BaseTable.vue'
import { ref } from 'vue'
import { request, type LoginResult } from '../../shared/api'

const email = ref(''), password = ref(''), token = ref(''), error = ref(''), note = ref('')
const metrics = ref<Record<string, number>>({})
const users = ref<Array<Record<string, string>>>([])
const reports = ref<Array<Record<string, string>>>([])
const auditLogs = ref<Array<Record<string, string>>>([])
const featureFlags = ref<Array<Record<string, unknown>>>([])
const newFlagKey = ref(''), newFlagEnabled = ref(false)
const userColumns = [
  { key: 'display_name', label: '이름' },
  { key: 'email', label: '이메일' },
  { key: 'role', label: '역할' },
  { key: 'state', label: '상태' },
  { key: 'actions', label: '제재 관리' },
]
const auditColumns = [
  { key: 'created_at', label: '시간' },
  { key: 'actor_user_id', label: '관리자 ID' },
  { key: 'action', label: '작업' },
  { key: 'target_id', label: '대상 ID' },
]

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
    note.value = `조치 (${action})가 완료되었습니다.`
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
    note.value = '기능 플래그가 저장되었습니다.'
    await load()
  })
}
</script>

<template>
  <div class="page">
    <nav style="display:flex;gap:12px;margin-bottom:18px;padding:10px 14px;background:#fff;border-radius:10px;font-size:13px;align-items:center;border:1px solid #e0e8ee">
      <a href="../" style="text-decoration:none;color:#315BCD;font-weight:700">💬 LUNO 메신저 홈</a>
      <span style="color:#ccc">|</span>
      <a href="../admin/" style="text-decoration:none;color:#315BCD;font-weight:700">👑 관리자</a>
      <a href="../partner/" style="text-decoration:none;color:#334155;font-weight:600">🏢 파트너</a>
      <a href="../developer/" style="text-decoration:none;color:#334155;font-weight:600">💻 개발자</a>
      <a href="../creator/" style="text-decoration:none;color:#334155;font-weight:600">🎨 크리에이터</a>
      <a href="../ads/" style="text-decoration:none;color:#334155;font-weight:600">📢 광고주</a>
      <button v-if="token" @click="token = ''" style="margin-left:auto;padding:4px 8px;font-size:12px">로그아웃</button>
    </nav>

    <header><LunoThemeToggle />
      <h1>LUNO 통합 관리자 센터 (Admin)</h1>
      <span>역할: platform_admin · support · moderator</span>
    </header>

    <p class="error" v-if="error" role="alert">{{ error }}</p>
    <p class="note" v-if="note">{{ note }}</p>

    <form v-if="!token" @submit.prevent="login" class="panel">
      <h2>관리자 인증</h2>
      <div style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b">
        <span>🔒 보안 구역: 관리자 권한이 부여된 계정만 로그인이 가능합니다.</span>
      </div>
      <input type="email" v-model="email" placeholder="이메일" required />
      <input type="password" v-model="password" placeholder="비밀번호" required />
      <BaseButton type="submit" variant="primary">로그인</BaseButton>
      <p class="muted">일반 사용자 계정은 접근이 거부됩니다(403 Forbidden).</p>
    </form>

    <main v-else>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2>통합 시스템 대시보드</h2>
        <BaseButton @click="load">새로고침</BaseButton>
      </div>

      <section class="metrics">
        <div class="panel" v-for="(value, key) in metrics" :key="key">
          <small>{{ key }}</small>
          <strong>{{ value.toLocaleString() }}</strong>
        </div>
      </section>

      <section class="panel">
        <h2>사용자 관리 및 제재 집행</h2>
        <BaseTable :columns="userColumns" :rows="users" row-key="id">
          <template #cell-role="{ value }"><BaseBadge tone="info">{{ value }}</BaseBadge></template>
          <template #cell-state="{ value }"><BaseBadge :tone="value === 'active' ? 'success' : 'danger'">{{ value }}</BaseBadge></template>
          <template #cell-actions="{ row }">
            <span style="display:inline-flex;gap:6px">
              <BaseButton v-if="row.state === 'active'" size="sm" variant="danger" @click="takeAction(row.id, 'suspend')">정지</BaseButton>
              <BaseButton v-else-if="row.state === 'suspended'" size="sm" variant="primary" @click="takeAction(row.id, 'activate')">정지 해제</BaseButton>
              <BaseButton size="sm" @click="takeAction(row.id, 'warn')">경고</BaseButton>
            </span>
          </template>
        </BaseTable>
      </section>

      <section class="panel">
        <h2>신고 및 악성 콘텐츠 처리</h2>
        <BaseEmpty v-if="!reports.length" title="접수된 미처리 신고가 없습니다" hint="새 신고가 들어오면 이 목록에 표시됩니다." />
        <div v-for="r in reports" :key="r.id" class="report-item">
          <div>
            <strong>[{{ r.category }}]</strong> 상태: <span class="badge">{{ r.state }}</span> — {{ r.details }}
          </div>
          <div v-if="r.state === 'open'" style="display:flex;gap:6px">
            <button style="background:#d9534f;font-size:12px;padding:4px 8px" @click="takeAction(r.subject_user_id || '', 'suspend', r.id)">피신고자 정지</button>
            <button style="background:#6c757d;font-size:12px;padding:4px 8px" @click="takeAction(r.subject_user_id || '', 'dismiss', r.id)">기각</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>글로벌 Feature Flags</h2>
        <form @submit.prevent="saveFeatureFlag" style="display:flex;gap:8px;margin-bottom:12px">
          <input v-model="newFlagKey" placeholder="플래그 키 (예: enable_e2ee, enable_openchat)" required />
          <label style="display:flex;align-items:center;gap:6px">
            <input type="checkbox" v-model="newFlagEnabled" style="width:auto" /> 활성화
          </label>
          <BaseButton type="submit" variant="primary">플래그 추가/수정</BaseButton>
        </form>
        <div v-for="f in featureFlags" :key="String(f.key)" class="item-line">
          <code>{{ f.key }}</code>
          <BaseBadge :tone="f.enabled ? 'success' : 'danger'">{{ f.enabled ? 'ON' : 'OFF' }}</BaseBadge>
        </div>
      </section>

      <section class="panel">
        <h2>불변 감사 로그 (Audit Logs)</h2>
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
