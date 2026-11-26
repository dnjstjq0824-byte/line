// User report dialog + own history (P2 MessengerView split). Self-contained:
// F4 report actions and E8 message-quote consent handling.
// Extracted verbatim from views/MessengerView.vue.
import { ref } from 'vue'
import { api, note, t, wrap } from '../store/session'
import type { Message, User } from '../../../shared/api'

export function useMessengerReport() {
  // F4: user report dialog + own history.
  const showReportModal = ref(false)
  const reportTarget = ref<User | null>(null)
  const reportCategory = ref('spam')
  const reportDetails = ref('')
  // E8: message-level report — the quoted message plus the reporter's
  // explicit consent to attach its decrypted content.
  const reportMessage = ref<Message | null>(null)
  const reportE2eeConsent = ref(false)
  const myReports = ref<Array<{ id: string; subject_user_id: string; category: string; details: string; state: string; created_at: string }>>([])

  // F4: report dialog actions + own history.
  function openReportModal(friend: User) {
    reportTarget.value = friend
    reportCategory.value = 'spam'
    reportDetails.value = ''
    reportMessage.value = null
    reportE2eeConsent.value = false
    showReportModal.value = true
  }
  // E8: report from a chat bubble — quotes the message; sealed content
  // rides only with the reporter's explicit consent.
  function openReportForMessage(msg: Message) {
    reportTarget.value = { id: msg.sender_id } as User
    reportCategory.value = 'spam'
    reportDetails.value = ''
    reportMessage.value = msg._e2eeError ? null : msg
    reportE2eeConsent.value = false
    showReportModal.value = true
  }
  async function submitReport() {
    if (!reportTarget.value) return
    await wrap(async () => {
      const quoted = reportMessage.value
      const payload: Record<string, unknown> = {
        subject_user_id: reportTarget.value!.id,
        category: reportCategory.value,
        details: reportDetails.value
      }
      if (quoted) {
        payload.message_id = quoted.id
        if (typeof quoted.body === 'string' && quoted.body) {
          if (quoted._e2ee && !reportE2eeConsent.value) {
            delete payload.message_id
          } else {
            payload.e2ee_text = quoted.body.slice(0, 2000)
            if (quoted._e2ee) payload.plaintext_consent = true
          }
        }
      }
      await api('/api/v1/reports', 'POST', payload)
      note.value = t('reportDoneNote')
      showReportModal.value = false
      await loadMyReports()
    })
  }
  async function loadMyReports() {
    try {
      const res = await api<{ reports: typeof myReports.value }>('/api/v1/reports/mine')
      myReports.value = res.reports || []
    } catch {
      myReports.value = []
    }
  }
  function reportStateLabel(state: string): string {
    if (state === 'resolved') return t('reportStateResolved')
    if (state === 'dismissed') return t('reportStateDismissed')
    return t('reportStateOpen')
  }

  return {
    showReportModal,
    reportTarget,
    reportCategory,
    reportDetails,
    reportMessage,
    reportE2eeConsent,
    myReports,
    openReportModal,
    openReportForMessage,
    submitReport,
    loadMyReports,
    reportStateLabel,
  }
}
