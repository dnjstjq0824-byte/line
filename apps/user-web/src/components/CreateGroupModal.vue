<script setup lang="ts">
// P2 split: group-create modal, extracted verbatim from views/MessengerView.vue.
// Inputs are two-way models; creation and join-by-link emit upward.
// Visibility stays outside.
import { t } from '../store/session'
import type { User } from '../../../shared/api'

const groupTitle = defineModel<string>('groupTitle', { default: '' })
const selectedFriendIds = defineModel<string[]>('selectedFriendIds', { default: () => [] })
const joinLink = defineModel<string>('joinLink', { default: '' })

defineProps<{
  friends: User[]
}>()

const emit = defineEmits<{
  close: []
  submit: []
  join: []
}>()
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="standard-modal-box">
      <div class="modal-header">
        <h3>{{ t('mvGroupTitle') }}</h3>
        <button class="btn-modal-close" @click="emit('close')" :aria-label="t('mvClose')">✕</button>
      </div>
      <div class="modal-body-form">
        <label>{{ t('mvGroupName') }}</label>
        <input v-model="groupTitle" :placeholder="t('mvGroupNamePh')" />
        <label>{{ t('mvGroupInvite').replace('{n}', String(selectedFriendIds.length)) }}</label>
        <div class="select-friends-scroll">
          <label v-for="f in friends" :key="f.id" class="friend-check-item">
            <input v-model="selectedFriendIds" type="checkbox" :value="f.id" />
            <span>{{ f.display_name }}</span>
          </label>
        </div>
        <div class="modal-actions-right">
          <button class="btn-secondary" @click="emit('close')">{{ t('mvCancel') }}</button>
          <button class="btn-primary" :disabled="!groupTitle.trim() || !selectedFriendIds.length" @click="emit('submit')">{{ t('mvCreateGroup') }}</button>
        </div>
        <div class="setting-group">
          <strong>{{ t('gsJoinByLink') }}</strong>
          <div class="flex-row">
            <input v-model="joinLink" :placeholder="t('gsJoinPh')" @keydown.enter.prevent="emit('join')" />
            <button class="btn-secondary" :disabled="!joinLink.trim()" @click="emit('join')">{{ t('gsJoin') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
