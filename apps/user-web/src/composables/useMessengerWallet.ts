// Wallet & Pay state (P2 MessengerView split). Owns balance, points, ledger
// and the send/charge flows; chat-list refresh is injected (useWebRTC deps
// precedent). openSendMoneyFromChat stays in the view (it resolves the
// friend from the selected chat). Extracted verbatim from views/MessengerView.vue.
import { ref } from 'vue'
import { api, note, t, wrap } from '../store/session'
import type { User } from '../../../shared/api'
import { formatKRW } from '../messenger-format'

export interface MessengerWalletDeps {
  loadChats: () => Promise<void>
}

export type WalletTx = { id: string; type?: string; kind?: string; title?: string; amount: number; note?: string; counterparty?: string; created_at: string }

export function useMessengerWallet(deps: MessengerWalletDeps) {
  // U2: never seeded — loadWallet() fills real API values (0 when absent).
  const walletBalance = ref(0)
  const walletPoints = ref(0)
  const walletTx = ref<Array<WalletTx>>([])
  const showSendMoneyModal = ref(false)
  const showChargeModal = ref(false)
  const sendTargetFriend = ref<User | null>(null)
  const sendAmountInput = ref(10000)
  const sendMemoInput = ref('')

  async function loadWallet() {
    try {
      const res = await api<{ balance: number; points?: number; transactions: any[] }>('/api/v1/wallet')
      walletBalance.value = res.balance || 0
      if (typeof res.points === 'number') walletPoints.value = res.points
      walletTx.value = res.transactions || []
    } catch {}
  }

  function openSendMoneyModal(friend: User) {
    sendTargetFriend.value = friend
    sendAmountInput.value = 10000
    sendMemoInput.value = t('mvSendMemoDefault')
    showSendMoneyModal.value = true
  }

  async function executeSendMoney() {
    if (!sendTargetFriend.value || sendAmountInput.value <= 0) return
    await wrap(async () => {
      const res = await api<{ balance: number }>('/api/v1/wallet/send', 'POST', {
        to_user_id: sendTargetFriend.value!.id,
        amount: sendAmountInput.value,
        note: sendMemoInput.value
      })
      walletBalance.value = res.balance
      showSendMoneyModal.value = false
      note.value = t('mvSentMoney').replace('{name}', sendTargetFriend.value!.display_name).replace('{amount}', formatKRW(sendAmountInput.value))
      await Promise.all([loadWallet(), deps.loadChats()])
    })
  }

  async function executeChargeMoney(amount: number) {
    await wrap(async () => {
      const res = await api<{ balance: number }>('/api/v1/wallet/charge', 'POST', { amount })
      walletBalance.value = res.balance
      showChargeModal.value = false
      note.value = t('mvChargedMoney').replace('{amount}', formatKRW(amount))
      await loadWallet()
    })
  }

  return {
    walletBalance,
    walletPoints,
    walletTx,
    showSendMoneyModal,
    showChargeModal,
    sendTargetFriend,
    sendAmountInput,
    sendMemoInput,
    loadWallet,
    openSendMoneyModal,
    executeSendMoney,
    executeChargeMoney,
  }
}
