// Profile/cover photo upload (P2 MessengerView split). Owns the upload
// flags and the downscale+PATCH flows; the open profile ref is injected so
// a self-edit refreshes it (wallet deps precedent).
// Extracted verbatim from views/MessengerView.vue.
import { ref, type Ref } from 'vue'
import { api, currentUser, t } from '../store/session'
import type { User } from '../../../shared/api'

export interface ProfilePhotosDeps {
  activeProfileUser: Ref<User | null>
}

export function useProfilePhotos(deps: ProfilePhotosDeps) {
  const photoSaving = ref(false)
  const photoError = ref('')
  async function changeProfilePhoto(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    photoError.value = ''
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { photoError.value = t('profile_photo_invalid'); return }
    photoSaving.value = true
    try {
      const bitmap = await createImageBitmap(file)
      try {
        const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error(t('profile_photo_invalid'))
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        await persistProfilePhoto(canvas.toDataURL('image/jpeg', 0.85))
      } finally { bitmap.close() }
    } catch (error) { photoError.value = error instanceof Error ? error.message : t('profile_save_error') }
    finally { photoSaving.value = false }
  }
  async function persistProfilePhoto(avatar_url: string) {
    const updated = await api<User>('/api/v1/me', 'PATCH', { avatar_url })
    currentUser.value = updated
    if (deps.activeProfileUser.value?.id === updated.id) deps.activeProfileUser.value = updated
  }
  async function removeProfilePhoto() {
    photoSaving.value = true; photoError.value = ''
    try { await persistProfilePhoto('') }
    catch (error) { photoError.value = error instanceof Error ? error.message : t('profile_save_error') }
    finally { photoSaving.value = false }
  }
  // 6-4: web cover change, the same upload path as the profile photo
  // (client downscale + PATCH /api/v1/me cover_url).
  async function changeCoverPhoto(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    photoError.value = ''
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { photoError.value = t('profile_photo_invalid'); return }
    photoSaving.value = true
    try {
      const bitmap = await createImageBitmap(file)
      try {
        const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error(t('profile_photo_invalid'))
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        await persistCoverPhoto(canvas.toDataURL('image/jpeg', 0.85))
      } finally { bitmap.close() }
    } catch (error) { photoError.value = error instanceof Error ? error.message : t('profile_save_error') }
    finally { photoSaving.value = false }
  }
  async function persistCoverPhoto(cover_url: string) {
    const updated = await api<User>('/api/v1/me', 'PATCH', { cover_url })
    currentUser.value = updated
    if (deps.activeProfileUser.value?.id === updated.id) deps.activeProfileUser.value = updated
  }
  async function removeCoverPhoto() {
    photoSaving.value = true; photoError.value = ''
    try { await persistCoverPhoto('') }
    catch (error) { photoError.value = error instanceof Error ? error.message : t('profile_save_error') }
    finally { photoSaving.value = false }
  }

  return {
    photoSaving,
    photoError,
    changeProfilePhoto,
    persistProfilePhoto,
    removeProfilePhoto,
    changeCoverPhoto,
    persistCoverPhoto,
    removeCoverPhoto,
  }
}
