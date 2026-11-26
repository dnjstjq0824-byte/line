// Message burst grouping for the chat canvas (P2 MessengerView split).
// Extracted verbatim from views/MessengerView.vue; the view injects its
// messages ref so template call sites keep working unchanged.
import type { Ref } from 'vue'
import { isSameBurst } from '../messenger-format'

export function useBurstGroups(messages: Ref<any[]>) {
  function shouldShowDateDivider(msg: any, index: number) {
    if (index === 0) return true
    const prev = messages.value[index - 1]
    if (!prev) return true
    const d1 = new Date(msg.created_at).toDateString()
    const d2 = new Date(prev.created_at).toDateString()
    return d1 !== d2
  }
  function isGroupLead(msg: any, index: number) {
    if (index === 0) return true
    return !isSameBurst(messages.value[index - 1], msg)
  }
  function isGroupTail(msg: any, index: number) {
    if (index >= messages.value.length - 1) return true
    return !isSameBurst(msg, messages.value[index + 1])
  }
  return { shouldShowDateDivider, isGroupLead, isGroupTail }
}
