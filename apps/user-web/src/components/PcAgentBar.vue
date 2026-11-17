<script setup lang="ts">
// A12: runner presence + command chips above the composer in bot rooms.
// Mirrors mobile PcAgentBar: 20s poll, one row per bot (ready/working/
// offline with queue and last-seen details), chips send real messages
// through the normal send path (parent fills the draft + sends).
import { onMounted, onUnmounted, ref, watch } from 'vue'

import { api, t } from '../store/session'

interface RoomBot {
  display_name?: string
  state?: string
  detail?: string
  queue?: number
  last_seen_at?: string
}

const props = defineProps<{
  conversationId: string
  disabled: boolean
}>()

const emit = defineEmits<{
  command: [text: string]
}>()

const bots = ref<RoomBot[]>([])
const botsFor = ref('')
const commandsAllowed = ref(false)
let poll: ReturnType<typeof setInterval> | null = null

const COMMANDS = ['/status', '/git', '/check', '/continue', '/auto off']

function chipLabel(cmd: string) {
  switch (cmd) {
    case '/status': return t('pcQuickStatus')
    case '/git': return t('pcQuickGit')
    case '/check': return t('pcQuickCheck')
    case '/continue': return t('pcQuickContinue')
    default: return t('pcQuickAutoOff')
  }
}

function botState(b: RoomBot) {
  return b.state === 'ready' || b.state === 'busy' ? b.state : 'offline'
}

function botLabel(b: RoomBot) {
  const s = botState(b)
  return s === 'ready' ? t('pcAgentReady') : s === 'busy' ? t('pcAgentBusy') : t('pcAgentOffline')
}

function botClock(iso?: string) {
  const at = iso ? new Date(iso) : null
  if (!at || isNaN(at.getTime())) return ''
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(at.getHours())}:${two(at.getMinutes())}`
}

function botDetails(b: RoomBot) {
  const s = botState(b)
  const out: string[] = []
  if (s === 'busy' && b.detail) out.push(b.detail)
  if (s !== 'offline' && (b.queue ?? 0) > 0) out.push(t('pcAgentQueue').replace('{count}', String(b.queue)))
  const clock = botClock(b.last_seen_at)
  if (s === 'offline' && clock) out.push(t('pcAgentLastSeen').replace('{time}', clock))
  return out
}

async function load() {
  const cid = props.conversationId
  botsFor.value = cid
  if (!cid) {
    bots.value = []
    commandsAllowed.value = false
    return
  }
  try {
    const res = await api<{ bots: RoomBot[]; commands_allowed: boolean }>(`/api/v1/conversations/${cid}/bots`, 'GET')
    if (botsFor.value !== cid) return
    bots.value = Array.isArray(res?.bots) ? res.bots : []
    commandsAllowed.value = res?.commands_allowed === true
  } catch {
    if (botsFor.value !== cid) return
    bots.value = []
    commandsAllowed.value = false
  }
}

onMounted(() => {
  void load()
  poll = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void load()
  }, 20000)
})

onUnmounted(() => {
  if (poll) clearInterval(poll)
})

watch(() => props.conversationId, () => {
  void load()
})
</script>

<template>
  <div v-if="botsFor === conversationId && bots.length" class="lx-pcagent-bar" role="status">
    <div v-for="b in bots" :key="b.display_name || 'bot'" class="lx-pcagent-row">
      <span class="lx-pcagent-dot" :class="'is-' + botState(b)" aria-hidden="true"></span>
      <span class="lx-pcagent-text">
        <strong>{{ b.display_name }}</strong>
        <span>{{ botLabel(b) }}</span>
        <span v-if="botDetails(b).length" class="lx-pcagent-detail">· {{ botDetails(b).join(' · ') }}</span>
      </span>
    </div>
    <div v-if="commandsAllowed" class="lx-pcagent-chips">
      <button
        v-for="cmd in COMMANDS"
        :key="cmd"
        type="button"
        class="lx-pcagent-chip"
        :disabled="disabled"
        @click="emit('command', cmd)"
      >
        {{ chipLabel(cmd) }}
      </button>
    </div>
  </div>
</template>
