<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'info' | 'success' | 'warning' | 'danger' | 'muted' }>(), { tone: 'muted' })
</script>

<template>
  <span class="ln-badge2" :class="`ln-badge2-${tone}`"><slot /></span>
</template>

<style scoped>
.ln-badge2 { display:inline-block; padding:3px 10px; border-radius:var(--ln-lamp-radius,999px); font-size:var(--ln-fs-small,12px); font-weight:700; }
.ln-badge2-muted { background:var(--ln-subtle); color:var(--ln-muted); }
.ln-badge2-info { background:var(--ln-accent-soft); color:var(--ln-accent); }
.ln-badge2-success { background:var(--ln-accent-soft); color:var(--ln-success); }
.ln-badge2-warning { background:#fff3d6; color:var(--ln-warning); }
.ln-badge2-danger { background:#fde8e8; color:var(--ln-danger); }
</style>
