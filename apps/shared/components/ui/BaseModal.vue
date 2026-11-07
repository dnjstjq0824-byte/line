<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
defineProps<{ title: string; width?: number }>()
const open = defineModel<boolean>({ default: false })
function close() { open.value = false }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close() }
watch(open, (v) => {
  if (v) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="open" class="ln-modal-backdrop" @click.self="close">
    <div class="ln-modal-box" role="dialog" aria-modal="true" :aria-label="title" :style="{ maxWidth: `${width || 480}px` }">
      <div class="ln-modal-head">
        <h3>{{ title }}</h3>
        <button type="button" class="ln-modal-x" aria-label="닫기" @click="close">✕</button>
      </div>
      <div class="ln-modal-body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="ln-modal-foot">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ln-modal-backdrop { position:fixed; inset:0; z-index:60; background:rgba(10,20,18,.5); display:flex; align-items:center; justify-content:center; padding:16px; }
.ln-modal-box { width:100%; background:var(--ln-surface); color:var(--ln-text); border:1px solid var(--ln-line); border-radius:var(--ln-sheet-radius,22px); box-shadow:var(--ln-shadow); max-height:min(86vh,720px); display:flex; flex-direction:column; }
.ln-modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px 0; }
.ln-modal-head h3 { margin:0; font-size:var(--ln-fs-title,17px); }
.ln-modal-x { border:1px solid var(--ln-line); background:var(--ln-surface); color:var(--ln-text); border-radius:var(--ln-control-radius,10px); min-width:44px; min-height:44px; cursor:pointer; }
.ln-modal-body { padding:14px 18px 18px; overflow:auto; }
.ln-modal-foot { display:flex; justify-content:flex-end; gap:8px; padding:0 18px 18px; }
</style>
