<script setup lang="ts">
// L-05: approval box. Lists a room's proposals with their decision state;
// approve/reject go through the view (auth-touching) via decide events.
import { t } from '../store/session'

export interface ApprovalItem {
  message_id: string
  body: string
  author_id: string
  author_name: string
  created_at: string
  state: string
  decided_by: string | null
}

const props = defineProps<{
  proposals: ApprovalItem[]
  canDecide: boolean
  roomTitle: string
}>()

const emit = defineEmits<{
  close: []
  decide: [messageId: string, decision: 'approved' | 'rejected']
}>()

function stateLabel(state: string): string {
  if (state === 'approved') return t('apprApprovedState')
  if (state === 'rejected') return t('apprRejectedState')
  return t('apprPendingState')
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card settings-modal" role="dialog" :aria-label="t('apprTitle')">
      <div class="modal-header">
        <h2>{{ t('apprTitle') }} · {{ props.roomTitle }}</h2>
        <button class="btn-modal-close" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body-form">
        <p v-if="!props.proposals.length" class="muted">{{ t('apprEmpty') }}</p>
        <div v-for="p in props.proposals" :key="p.message_id" class="approval-row">
          <div class="approval-row-head">
            <span class="badge-kind">{{ t('msgKindProposal') }}</span>
            <span>{{ p.author_name }}</span>
            <span>· {{ stateLabel(p.state) }}</span>
          </div>
          <div class="approval-row-body">{{ p.body }}</div>
          <div v-if="p.state === 'pending' && props.canDecide" class="approval-row-actions">
            <button class="btn-decide-approve" @click="emit('decide', p.message_id, 'approved')">{{ t('apprApprove') }}</button>
            <button class="btn-decide-reject" @click="emit('decide', p.message_id, 'rejected')">{{ t('apprReject') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
