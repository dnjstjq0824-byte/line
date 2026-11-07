<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'md' | 'sm'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), { variant: 'secondary', size: 'md', loading: false, disabled: false, type: 'button' })
</script>

<template>
  <button
    :type="type"
    class="ln-btn"
    :class="[`ln-btn-${variant}`, `ln-btn-${size}`]"
    :disabled="disabled || loading"
    :aria-busy="loading"
  >
    <span v-if="loading" class="ln-btn-spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.ln-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 18px; border-radius:var(--ln-control-radius,10px); border:1px solid transparent; font:600 var(--ln-fs-body,15px)/1 var(--ln-font,system-ui,sans-serif); cursor:pointer; transition:background .15s ease,border-color .15s ease; }
.ln-btn-sm { min-height:36px; padding:0 12px; font-size:var(--ln-fs-small,12px); }
.ln-btn-primary { background:var(--ln-accent); color:var(--ln-on-accent); }
.ln-btn-primary:hover:not(:disabled) { background:var(--ln-accent-hover); }
.ln-btn-secondary { background:var(--ln-surface); color:var(--ln-text); border-color:var(--ln-line); }
.ln-btn-secondary:hover:not(:disabled) { border-color:var(--ln-accent); }
.ln-btn-danger { background:var(--ln-danger); color:#fff; }
.ln-btn-ghost { background:transparent; color:var(--ln-accent); }
.ln-btn:disabled { opacity:.55; cursor:not-allowed; }
.ln-btn:focus-visible { outline:2px solid var(--ln-info); outline-offset:2px; }
.ln-btn-spinner { width:14px; height:14px; border-radius:50%; border:2px solid currentColor; border-top-color:transparent; animation:ln-spin .7s linear infinite; }
@keyframes ln-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { .ln-btn-spinner { animation:none; border-top-color:currentColor; opacity:.6; } }
</style>
