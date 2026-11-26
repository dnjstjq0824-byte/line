<script setup lang="ts">
// P2 split: contact picker, extracted verbatim from views/MessengerView.vue.
// The friend list is read-only; picking emits upward. Visibility stays outside.
import { t } from '../store/session'
import type { User } from '../../../shared/api'

defineProps<{
  friends: User[]
}>()

const emit = defineEmits<{
  close: []
  share: [friend: User]
}>()
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section class="standard-modal-box ln-contact-picker" role="dialog" aria-modal="true" aria-labelledby="contact-picker-title">
      <header class="modal-header"><h3 id="contact-picker-title">{{ t('contact_choose') }}</h3><button class="btn-modal-close" :aria-label="t('contact_close')" @click="emit('close')">✕</button></header>
      <div class="modal-body-form">
        <p v-if="!friends.length" class="muted">{{ t('contact_empty') }}</p>
        <button v-for="friend in friends" :key="friend.id" type="button" class="btn-secondary ln-contact-choice" @click="emit('share', friend)"><strong>{{ friend.display_name }}</strong><small v-if="friend.handle">@{{ friend.handle }}</small></button>
      </div>
    </section>
  </div>
</template>
