<script setup lang="ts">
defineProps<{ title: string; hint?: string }>()
</script>

<template>
  <div class="ln-empty" role="status">
    <p class="ln-empty-title">{{ title }}</p>
    <p v-if="hint" class="ln-empty-hint">{{ hint }}</p>
    <div v-if="$slots.action" class="ln-empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.ln-empty { text-align:center; padding:32px 16px; color:var(--ln-muted); }
.ln-empty-title { margin:0; font:700 var(--ln-fs-title,17px)/1.4 var(--ln-font,system-ui,sans-serif); color:var(--ln-text); }
.ln-empty-hint { margin:6px 0 0; font-size:var(--ln-fs-small,12px); }
.ln-empty-action { margin-top:12px; }
</style>
