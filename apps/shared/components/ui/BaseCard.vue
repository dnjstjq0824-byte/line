<script setup lang="ts">
withDefaults(defineProps<{ padding?: number; as?: string }>(), { padding: 20, as: 'section' })
</script>

<template>
  <component :is="as" class="ln-card" :style="{ padding: `${padding}px` }">
    <slot />
  </component>
</template>

<style scoped>
.ln-card { background:var(--ln-surface); border:1px solid var(--ln-line); border-radius:var(--ln-radius,14px); box-shadow:var(--ln-shadow-sm,none); }
</style>
