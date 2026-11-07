<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; width?: string }>(), { lines: 3, width: '100%' })
</script>

<template>
  <div class="ln-skeleton" role="status" aria-label="불러오는 중">
    <div v-for="n in lines" :key="n" class="ln-skeleton-line" :style="{ width }" />
  </div>
</template>

<style scoped>
.ln-skeleton { display:grid; gap:8px; }
.ln-skeleton-line { height:14px; border-radius:7px; background:var(--ln-subtle); animation:ln-pulse 1.4s ease-in-out infinite; }
@keyframes ln-pulse { 0%,100% { opacity:1; } 50% { opacity:.45; } }
@media (prefers-reduced-motion:reduce) { .ln-skeleton-line { animation:none; } }
</style>
