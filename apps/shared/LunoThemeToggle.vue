<script setup lang="ts">
import { ref } from 'vue'
const saved = localStorage.getItem('luno.design.theme')
const dark = ref(saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)
function apply() { document.documentElement.dataset.theme = dark.value ? 'dark' : 'light' }
apply()
function toggle() { dark.value = !dark.value; apply(); localStorage.setItem('luno.design.theme', dark.value ? 'dark' : 'light') }
</script>
<template><button type="button" class="ln-theme-toggle" :aria-pressed="dark" aria-label="Light / Dark" @click="toggle"><span aria-hidden="true">{{ dark ? '☾' : '☼' }}</span><span>{{ dark ? 'Dark' : 'Light' }}</span></button></template>
