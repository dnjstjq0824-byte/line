// Profile name/handle/bio editor (P2 settings/profile separation). Owns
// draft state, dirty tracking and the PATCH save; rendered by ProfileModal
// for the signed-in user only. Moved verbatim from SettingsModal.vue.
import { computed, onMounted, ref } from 'vue'
import { api, currentUser, t } from '../store/session'
import type { User } from '../../../shared/api'

export function useProfileEditor() {
  const editProfileName = ref('')
  const editProfileBio = ref('')
  const editProfileHandle = ref('')
  const profileSaving = ref(false)
  const profileSaveError = ref('')
  const profileSaved = ref(false)

  // Accounts made before the server stopped filling a placeholder bio still carry it; show it as empty.
  function storedBio() {
    const bio = currentUser.value?.status_message || currentUser.value?.bio || ''
    return bio === 'New Messenger User' ? '' : bio
  }
  const profileDirty = computed(() => editProfileName.value.trim() !== (currentUser.value?.display_name || '') || editProfileHandle.value.trim() !== (currentUser.value?.handle || '') || editProfileBio.value.trim() !== storedBio())

  async function saveProfileSettings() {
    if (!editProfileName.value.trim() || profileSaving.value || !profileDirty.value) return
    profileSaving.value = true
    profileSaveError.value = ''
    profileSaved.value = false
    try {
      const textBio = editProfileBio.value.trim()
      await api('/api/v1/me', 'PATCH', {
        display_name: editProfileName.value.trim(),
        bio: textBio,
        ...(currentUser.value && 'status_message' in currentUser.value ? { status_message: textBio } : {}),
        handle: editProfileHandle.value.trim()
      })
      currentUser.value = await api<User>('/api/v1/me')
      profileSaved.value = true
    } catch (err) {
      profileSaveError.value = err instanceof Error ? err.message : t('profile_save_error')
    } finally {
      profileSaving.value = false
    }
  }

  function resetProfileDraft() {
    profileSaved.value = false
    profileSaveError.value = ''
    editProfileName.value = currentUser.value?.display_name || ''
    editProfileBio.value = storedBio()
    editProfileHandle.value = currentUser.value?.handle || ''
  }
  onMounted(resetProfileDraft)

  return {
    editProfileName,
    editProfileBio,
    editProfileHandle,
    profileSaving,
    profileSaveError,
    profileSaved,
    profileDirty,
    saveProfileSettings,
    resetProfileDraft,
  }
}
