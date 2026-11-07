<script setup lang="ts">
const props = defineProps<{ tabs: Array<{ id: string; label: string }>; modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()
function select(id: string) { emit('update:modelValue', id) }
function onKey(e: KeyboardEvent) {
  const i = props.tabs.findIndex(t => t.id === props.modelValue)
  if (i < 0) return
  if (e.key === 'ArrowRight') select(props.tabs[(i + 1) % props.tabs.length].id)
  if (e.key === 'ArrowLeft') select(props.tabs[(i - 1 + props.tabs.length) % props.tabs.length].id)
}
</script>

<template>
  <div class="ln-tabs" role="tablist" @keydown="onKey">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      :aria-selected="tab.id === modelValue"
      class="ln-tab"
      :class="{ active: tab.id === modelValue }"
      @click="select(tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.ln-tabs { display:flex; gap:4px; border-bottom:2px solid var(--ln-line); }
.ln-tab { min-height:44px; padding:0 14px; border:none; background:transparent; color:var(--ln-muted); font:600 var(--ln-fs-body,15px)/1 var(--ln-font,system-ui,sans-serif); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; }
.ln-tab.active { color:var(--ln-accent); border-bottom-color:var(--ln-accent); }
.ln-tab:focus-visible { outline:2px solid var(--ln-info); outline-offset:2px; }
</style>
