// Password change dialog (P2 MessengerView split). Self-contained:
// inputs, validation and the change-password call.
// Extracted verbatim from views/MessengerView.vue.
import { ref } from 'vue'
import { api, note, t } from '../store/session'

export function usePasswordChange() {
  const showPasswordModal = ref(false)
  const currentPasswordInput = ref('')
  const newPasswordInput = ref('')
  const confirmPasswordInput = ref('')
  const passwordChangeError = ref('')

  async function submitPasswordChange() {
    if (!currentPasswordInput.value) {
      passwordChangeError.value = t('mvPwCurrentRequired')
      return
    }
    if (newPasswordInput.value !== confirmPasswordInput.value) {
      passwordChangeError.value = t('mvPwMismatch')
      return
    }
    if (newPasswordInput.value.length < 12) {
      passwordChangeError.value = t('mvPwTooShort')
      return
    }
    try {
      await api('/api/v1/auth/change-password', 'POST', {
        current_password: currentPasswordInput.value,
        new_password: newPasswordInput.value
      })
      note.value = t('mvPwChanged')
      showPasswordModal.value = false
      currentPasswordInput.value = ''
      newPasswordInput.value = ''
      confirmPasswordInput.value = ''
      passwordChangeError.value = ''
    } catch (err: any) {
      passwordChangeError.value = err?.message || t('mvPwChangeFailed')
    }
  }

  return {
    showPasswordModal,
    currentPasswordInput,
    newPasswordInput,
    confirmPasswordInput,
    passwordChangeError,
    submitPasswordChange,
  }
}
