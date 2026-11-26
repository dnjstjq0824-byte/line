// Account danger zone: data export + account deletion (P2 MessengerView split).
// Self-contained except the post-delete logout, which is injected.
// Extracted verbatim from views/MessengerView.vue.
import { ref } from 'vue'
import { api, error, note, t, wrap } from '../store/session'

export interface AccountDangerDeps {
  logout: () => Promise<void>
}

export function useAccountDanger(deps: AccountDangerDeps) {
  async function exportUserDataArchive() {
    await wrap(async () => {
      const data = await api<object>('/api/v1/me/export-data')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `luno_backup_${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      note.value = t('mvBackupDone')
    })
  }

  const deletePasswordInput = ref('')
  const deleteReasonInput = ref('')
  const deleteConfirmInput = ref('')
  async function deleteUserAccount() {
    if (!deletePasswordInput.value) { error.value = t('mvDeletePwRequired'); return }
    if (!deleteConfirmInput.value) { error.value = t('mvDeleteConfirmRequired'); return }
    if (!confirm(t('mvDeleteConfirm'))) return
    await wrap(async () => {
      const res = await api<{ status: string; grace_until?: string }>('/api/v1/me', 'DELETE', {
        password: deletePasswordInput.value,
        reason: deleteReasonInput.value || undefined,
        confirm_text: deleteConfirmInput.value
      })
      deletePasswordInput.value = ''
      deleteReasonInput.value = ''
      deleteConfirmInput.value = ''
      if (res.status === 'deletion_scheduled') note.value = t('mvDeleteScheduledNote')
      deps.logout()
    })
  }

  return {
    exportUserDataArchive,
    deletePasswordInput,
    deleteReasonInput,
    deleteConfirmInput,
    deleteUserAccount,
  }
}
