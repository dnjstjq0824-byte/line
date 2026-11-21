<script setup lang="ts">
// E9: my E2EE devices + passphrase backup panel inside settings. Key
// backup/restore payloads are built by the parent (it owns chats and the
// decryptor); this panel owns devices, status and the passphrase UI.
import { computed, onMounted, ref } from 'vue'

import { api, currentUser, note, readStoredDeviceId, t, wrap } from '../store/session'

const props = defineProps<{
  busy: boolean
}>()

const emit = defineEmits<{
  backup: [passphrase: string]
  restore: [passphrase: string]
}>()

interface E2eeDevice {
  device_id: string
  identity_key: string
  updated_at: string
}

const devices = ref<E2eeDevice[]>([])
const devicesLoaded = ref(false)
const myDeviceId = ref('')

const bkPass = ref('')
const bkStatus = ref<{ updated_at: string; byte_len: number } | null>(null)
const bkKnown = ref(false)

const passStrength = computed(() => {
  const p = bkPass.value
  if (p.length < 8) return ''
  let score = 0
  if (p.length >= 12) score++
  if (p.length >= 20) score++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++
  if (/[0-9]/.test(p)) score++
  if (/[^a-zA-Z0-9]/.test(p)) score++
  return score <= 1 ? t('e2eeBkWeak') : score <= 3 ? t('e2eeBkFair') : t('e2eeBkStrong')
})

function fmtSize(n: number): string {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function statusLine(): string {
  if (!bkStatus.value) return t('e2eeBkNone')
  return t('e2eeBkStatus')
    .replace('{date}', bkStatus.value.updated_at.slice(0, 16).replace('T', ' '))
    .replace('{size}', fmtSize(bkStatus.value.byte_len))
}

async function loadDevices() {
  devicesLoaded.value = false
  try {
    const res = await api<{ devices: E2eeDevice[] }>('/api/v1/me/e2ee-devices')
    devices.value = res.devices || []
  } catch {
    devices.value = []
  } finally {
    devicesLoaded.value = true
  }
}

async function loadBackupStatus() {
  try {
    const res = await api<{ backup: unknown; byte_len: number; updated_at: string }>('/api/v1/e2ee/backup')
    bkStatus.value = res.backup ? { updated_at: res.updated_at || '', byte_len: res.byte_len || 0 } : null
  } catch {
    bkStatus.value = null
  } finally {
    bkKnown.value = true
  }
}

async function revokeDevice(id: string) {
  if (!window.confirm(t('e2eeDevRevokeConfirm'))) return
  await wrap(async () => {
    await api(`/api/v1/devices/${encodeURIComponent(id)}/keys`, 'DELETE')
    note.value = t('e2eeDevRevoked')
    await loadDevices()
  })
}

async function deleteBackup() {
  await wrap(async () => {
    await api('/api/v1/e2ee/backup', 'DELETE')
    note.value = t('e2eeBkDeleted')
    await loadBackupStatus()
  })
}

function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}

onMounted(() => {
  myDeviceId.value = readStoredDeviceId() || currentUser.value?.id || ''
  void loadDevices()
  void loadBackupStatus()
})

defineExpose({ loadDevices, loadBackupStatus })
</script>

<template>
  <div class="e2ee-settings">
    <div class="setting-group">
      <strong>🔐 {{ t('e2eeDevTitle') }}</strong>
      <div v-if="!devicesLoaded" class="muted" style="font-size: 12px">…</div>
      <div v-else-if="!devices.length" class="muted" style="font-size: 12px">{{ t('e2eeDevEmpty') }}</div>
      <div v-for="d in devices" :key="d.device_id" class="setting-toggle-row" style="font-size: 12px">
        <span>
          <code>{{ shortId(d.device_id) }}</code>
          <span v-if="d.device_id === myDeviceId" class="badge-status-on" style="margin-left: 6px">{{ t('e2eeDevThis') }}</span>
          <span v-else class="muted" style="margin-left: 6px">{{ (d.updated_at || '').slice(0, 10) }}</span>
        </span>
        <button v-if="d.device_id !== myDeviceId" class="btn-secondary" style="font-size: 12px; padding: 3px 8px" @click="revokeDevice(d.device_id)">
          {{ t('e2eeDevRevoke') }}
        </button>
      </div>
    </div>

    <div class="setting-group" style="margin-top: 8px">
      <strong>💾 {{ t('e2eeBkTitle') }}</strong>
      <div class="muted" style="font-size: 12px" role="status">{{ bkKnown ? statusLine() : '…' }}</div>
      <div class="setting-toggle-row">
        <input v-model="bkPass" type="password" class="pc-login-input" :placeholder="t('e2eeBkPassPh')" autocomplete="new-password" style="flex: 1" />
      </div>
      <div v-if="passStrength" class="muted" style="font-size: 12px">{{ passStrength }}</div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px">
        <button class="btn-secondary" style="font-size: 12px; padding: 4px 10px" :disabled="props.busy || bkPass.length < 8" @click="emit('backup', bkPass)">
          {{ props.busy ? t('e2eeBkBusy') : t('e2eeBkNow') }}
        </button>
        <button class="btn-secondary" style="font-size: 12px; padding: 4px 10px" :disabled="props.busy || bkPass.length < 8 || !bkStatus" @click="emit('restore', bkPass)">
          {{ t('e2eeBkRestore') }}
        </button>
        <button v-if="bkStatus" class="btn-secondary" style="font-size: 12px; padding: 4px 10px" :disabled="props.busy" @click="deleteBackup">
          {{ t('e2eeBkDelete') }}
        </button>
      </div>
    </div>
  </div>
</template>
