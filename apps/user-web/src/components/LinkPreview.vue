<script setup lang="ts">
// F8: one link card under a text bubble. First https URL only; the server
// fetches OG tags and caches in D1. Silent when disabled, blocked or empty.
import { onMounted, ref, watch } from 'vue'

import { api, t } from '../store/session'

interface Preview {
  url: string
  title: string
  description: string
  image_url: string
  unavailable?: boolean
}

const props = defineProps<{
  text: string
  enabled: boolean
  sealed?: boolean
  room?: string
}>()

const preview = ref<Preview | null>(null)
const consented = ref(false)

function firstUrl(s: string): string {
  const m = s.match(/https:\/\/[^\s<>"']+/i)
  return m ? m[0].replace(/[.,!?;:)\]]+$/, '') : ''
}

async function load() {
  preview.value = null
  if (!props.enabled) return
  // E8: sealed rooms never auto-resolve — one tap consents per link.
  if (props.sealed && !consented.value) return
  const u = firstUrl(props.text)
  if (!u) return
  try {
    const extra = props.sealed ? `&room=${encodeURIComponent(props.room || '')}&consented=1` : ''
    const pv = await api<Preview>(`/api/v1/link-preview?url=${encodeURIComponent(u)}${extra}`)
    if (pv && !pv.unavailable && pv.title) preview.value = pv
  } catch {
    preview.value = null
  }
}

function tapConsent() {
  consented.value = true
  void load()
}

onMounted(load)
watch(() => [props.text, props.enabled, props.sealed], () => { consented.value = false; void load() })
</script>

<template>
  <button v-if="sealed && !consented && !preview" class="link-preview-consent" type="button" @click="tapConsent">
    {{ t('mvE2eePreviewTap') }}
  </button>
  <a v-if="preview" class="link-preview-card" :href="preview.url" target="_blank" rel="noopener">
    <img v-if="preview.image_url" :src="preview.image_url" alt="" loading="lazy" class="link-preview-img" />
    <span class="link-preview-meta">
      <strong>{{ preview.title }}</strong>
      <span v-if="preview.description" class="link-preview-desc">{{ preview.description }}</span>
    </span>
  </a>
</template>

<style scoped>
.link-preview-consent {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px dashed currentColor;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.85;
}
.link-preview-card {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  padding: 8px;
  border-radius: 8px;
  background: rgb(0 0 0 / 6%);
  text-decoration: none;
  color: inherit;
  max-width: 320px;
}
.link-preview-img {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}
.link-preview-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 12px;
}
.link-preview-desc {
  opacity: 0.75;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
