<script setup lang="ts">
// F6: group room settings. Photo/name/notice, member roles, friend invites,
// invite links and leave. Privileged-only controls hide for plain members;
// the server still enforces every permission.
import { computed, onMounted, ref } from 'vue'

import type { Chat, User } from '../../../shared/api'
import { initialOf } from '../../../shared/avatar_initial'
import { api, note, t, wrap } from '../store/session'

interface InviteLink {
  token: string
  invite_url: string
  expires_at: number
  created_at: string
}

const props = defineProps<{
  chat: Chat
  friends: User[]
  myId: string
}>()

const emit = defineEmits<{
  close: []
  changed: [chat: Chat]
  left: []
}>()

const room = ref<Chat>({ ...props.chat })
const nameInput = ref(props.chat.title)
const noticeInput = ref(props.chat.notice || '')
const saving = ref(false)
const formError = ref('')
const invites = ref<InviteLink[]>([])
const expiryHours = ref(168)
const invitePick = ref<string[]>([])
const photoInput = ref<HTMLInputElement | null>(null)

const myRole = computed(() => room.value.my_role || (room.value.owner_id === props.myId ? 'owner' : 'member'))
const privileged = computed(() => myRole.value === 'owner' || myRole.value === 'admin')
const isOwner = computed(() => myRole.value === 'owner')
const memberIds = computed(() => new Set((room.value.members || []).map((m) => m.id)))
const invitable = computed(() => props.friends.filter((f) => !memberIds.value.has(f.id) && !(f as User & { is_blocked?: boolean }).is_blocked))

function roleLabel(role?: string): string {
  if (role === 'owner') return t('gsOwner')
  if (role === 'admin') return t('gsAdmin')
  return t('gsMember')
}

async function refresh() {
  room.value = await api<Chat>(`/api/v1/conversations/${props.chat.id}`)
  nameInput.value = room.value.title
  noticeInput.value = room.value.notice || ''
  emit('changed', room.value)
}

async function saveBasics() {
  if (!privileged.value || saving.value) return
  saving.value = true
  formError.value = ''
  try {
    await api(`/api/v1/conversations/${props.chat.id}`, 'PATCH', {
      title: nameInput.value.trim(),
      notice: noticeInput.value.trim()
    })
    await refresh()
    note.value = t('gsSaved')
  } catch (err) {
    formError.value = err instanceof Error ? err.message : t('profile_save_error')
  } finally {
    saving.value = false
  }
}

async function pushPhoto(dataUrl: string) {
  await wrap(async () => {
    await api(`/api/v1/conversations/${props.chat.id}`, 'PATCH', { avatar: dataUrl })
    await refresh()
    note.value = t('gsSaved')
  })
}

async function changePhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  formError.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    formError.value = t('profile_photo_invalid')
    return
  }
  saving.value = true
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error(t('profile_photo_invalid'))
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      await pushPhoto(canvas.toDataURL('image/jpeg', 0.85))
    } finally {
      bitmap.close()
    }
  } catch (err) {
    formError.value = err instanceof Error ? err.message : t('profile_save_error')
  } finally {
    saving.value = false
  }
}

async function inviteSelected() {
  if (!invitePick.value.length) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${props.chat.id}/members`, 'POST', { member_ids: invitePick.value })
    invitePick.value = []
    await refresh()
    note.value = t('gsInviteDone')
  })
}

async function kickMember(id: string) {
  if (!window.confirm(t('gsKickConfirm'))) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${props.chat.id}/members/${id}`, 'DELETE')
    await refresh()
  })
}

async function setRole(id: string, role: 'admin' | 'member') {
  await wrap(async () => {
    await api(`/api/v1/conversations/${props.chat.id}/members/${id}/role`, 'PATCH', { role })
    await refresh()
  })
}

async function transfer(id: string) {
  if (!window.confirm(t('gsTransferConfirm'))) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${props.chat.id}`, 'PATCH', { owner_id: id })
    await refresh()
  })
}

async function loadInvites() {
  if (!privileged.value) return
  invites.value = (await api<{ invites: InviteLink[] }>(`/api/v1/conversations/${props.chat.id}/invites`)).invites || []
}

async function createInvite() {
  await wrap(async () => {
    await api(`/api/v1/conversations/${props.chat.id}/invites`, 'POST', { expires_in_hours: expiryHours.value })
    await loadInvites()
  })
}

async function revokeInvite(token: string) {
  await wrap(async () => {
    await api(`/api/v1/conversations/${props.chat.id}/invites/${token}`, 'DELETE')
    await loadInvites()
  })
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    note.value = t('gsLinkCopied')
  } catch {
    note.value = url
  }
}

async function leave() {
  if (!window.confirm(t('gsLeaveConfirm'))) return
  await wrap(async () => {
    await api(`/api/v1/conversations/${props.chat.id}`, 'DELETE')
    emit('left')
  })
}

function canActOn(target: User): boolean {
  if (target.id === props.myId) return false
  if (isOwner.value) return true
  return myRole.value === 'admin' && (target.role || 'member') === 'member'
}

onMounted(() => { void loadInvites() })
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box settings-modal">
      <div class="modal-header">
        <h3>{{ t('gsTitle') }} · {{ room.title }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="modal-body-form">
        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="setting-group">
          <strong>{{ t('gsPhoto') }}</strong>
          <div class="gs-photo-row">
            <div class="pc-avatar circle-46 group-avatar">
              <span>{{ initialOf(room.title, '?') }}</span>
              <img v-if="room.avatar_url" :src="room.avatar_url" alt="" class="ln-profile-photo" />
            </div>
            <template v-if="privileged">
              <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden-file" @change="changePhoto" />
              <button class="btn-secondary" :disabled="saving" @click="photoInput?.click()">{{ t('gsPhotoChange') }}</button>
              <button v-if="room.avatar_url" class="btn-secondary" :disabled="saving" @click="pushPhoto('')">{{ t('gsPhotoRemove') }}</button>
            </template>
          </div>
        </div>

        <div class="setting-group">
          <strong>{{ t('gsName') }}</strong>
          <input v-model="nameInput" class="text-input" maxlength="50" :disabled="!privileged" />
          <strong>{{ t('gsNotice') }}</strong>
          <textarea v-model="noticeInput" class="text-input" rows="2" maxlength="500" :placeholder="t('gsNoticePh')" :disabled="!privileged" />
          <div v-if="privileged" class="modal-actions-right">
            <button class="btn-primary" :disabled="saving" @click="saveBasics">{{ t('gsSave') }}</button>
          </div>
          <span v-else class="muted">{{ t('gsForbidden') }}</span>
        </div>

        <div class="setting-group">
          <strong>{{ t('gsMembers') }} ({{ room.member_count || (room.members || []).length }})</strong>
          <div v-for="m in room.members || []" :key="m.id" class="gs-member-row">
            <div class="pc-avatar circle-36" :style="{ background: m.avatar_color || 'var(--ln-accent)' }">
              <span>{{ initialOf(m.display_name, '?') }}</span>
              <img v-if="m.avatar_url" :src="m.avatar_url" alt="" class="ln-profile-photo" />
            </div>
            <span class="gs-member-name">{{ m.display_name }}</span>
            <span class="badge-role" :class="'role-' + (m.role || 'member')">{{ roleLabel(m.role) }}</span>
            <span v-if="canActOn(m)" class="gs-member-actions">
              <button v-if="isOwner && m.role !== 'admin'" class="btn-secondary gs-mini" @click="setRole(m.id, 'admin')">{{ t('gsMakeAdmin') }}</button>
              <button v-if="isOwner && m.role === 'admin'" class="btn-secondary gs-mini" @click="setRole(m.id, 'member')">{{ t('gsRemoveAdmin') }}</button>
              <button v-if="isOwner" class="btn-secondary gs-mini" @click="transfer(m.id)">{{ t('gsTransfer') }}</button>
              <button class="btn-secondary gs-mini gs-danger" @click="kickMember(m.id)">{{ t('gsKick') }}</button>
            </span>
          </div>
        </div>

        <div class="setting-group">
          <strong>{{ t('gsInvite') }}</strong>
          <div v-if="invitable.length" class="gs-invite-list">
            <label v-for="f in invitable" :key="f.id" class="setting-toggle-row setting-check-row">
              <span>{{ f.display_name }}</span>
              <input v-model="invitePick" type="checkbox" :value="f.id" />
            </label>
          </div>
          <span v-else class="muted">{{ t('gsInviteNone') }}</span>
          <div v-if="invitable.length" class="modal-actions-right">
            <button class="btn-primary" :disabled="!invitePick.length" @click="inviteSelected">{{ t('gsInvite') }}</button>
          </div>
        </div>

        <div v-if="privileged" class="setting-group">
          <strong>{{ t('gsLinks') }}</strong>
          <div class="gs-link-new">
            <label>{{ t('gsLinkExpiry') }}</label>
            <select v-model.number="expiryHours" class="text-input">
              <option :value="1">{{ t('gsExp1') }}</option>
              <option :value="24">{{ t('gsExp24') }}</option>
              <option :value="168">{{ t('gsExp168') }}</option>
            </select>
            <button class="btn-secondary" @click="createInvite">{{ t('gsLinkNew') }}</button>
          </div>
          <div v-if="invites.length" class="gs-invite-list">
            <div v-for="inv in invites" :key="inv.token" class="gs-link-row">
              <span class="gs-link-url">{{ inv.invite_url }}</span>
              <button class="btn-secondary gs-mini" @click="copyLink(inv.invite_url)">{{ t('gsLinkCopy') }}</button>
              <button class="btn-secondary gs-mini gs-danger" @click="revokeInvite(inv.token)">{{ t('gsLinkRevoke') }}</button>
            </div>
          </div>
          <span v-else class="muted">{{ t('gsLinkEmpty') }}</span>
        </div>

        <div class="setting-group">
          <button class="btn-secondary gs-danger" @click="leave">{{ t('gsLeave') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gs-photo-row { display: flex; align-items: center; gap: 8px; }
.hidden-file { display: none; }
.gs-member-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
.gs-member-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gs-member-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.gs-mini { font-size: 11px; padding: 2px 8px; }
.gs-danger { color: #ef4444; }
.gs-invite-list { display: flex; flex-direction: column; max-height: 180px; overflow-y: auto; }
.gs-link-new { display: flex; align-items: center; gap: 8px; }
.gs-link-new .text-input { width: 110px; }
.gs-link-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.gs-link-url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.badge-role { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: #f1f5f9; }
.badge-role.role-owner { background: #fef3c7; }
.badge-role.role-admin { background: #dbeafe; }
</style>
