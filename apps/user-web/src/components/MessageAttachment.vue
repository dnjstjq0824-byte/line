<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { API_URL, type Message } from '../../../shared/api'
const props = defineProps<{ message: Message; token: string; labels: { download: string; retry: string; loading: string; error: string } }>()
const url = ref(''), loading = ref(false), failed = ref(false)
let controller: AbortController | null = null
let generation = 0
const mime = computed(() => String(props.message.metadata?.mime_type || '').split(';')[0].trim().toLowerCase())
const media = computed(() => /^(image\/(png|jpeg|gif|webp)|audio\/(mpeg|mp4|ogg|wav|webm)|video\/(mp4|webm|ogg))$/i.test(mime.value))
function release() { if (url.value) URL.revokeObjectURL(url.value); url.value = '' }
async function load() {
  if (loading.value) return
  const id = props.message.metadata?.attachment_id
  if (typeof id !== 'string' || !props.token) return
  const version = ++generation
  controller?.abort(); controller = new AbortController()
  loading.value = true; failed.value = false
  try {
    const response = await fetch(`${API_URL}/api/v1/attachments/${encodeURIComponent(id)}/content`, { headers: { Authorization: `Bearer ${props.token}` }, signal: controller.signal, cache: 'no-store' })
    if (!response.ok) throw new Error('Attachment unavailable')
    const bytes = await response.arrayBuffer()
    if (version !== generation) return
    release()
    url.value = URL.createObjectURL(new Blob([bytes], { type: media.value ? mime.value : 'application/octet-stream' }))
  } catch (error) {
    if (version === generation && !(error instanceof DOMException && error.name === 'AbortError')) failed.value = true
  } finally { if (version === generation) loading.value = false }
}
async function download() {
  if (!url.value) await load()
  if (!url.value) return
  const link = document.createElement('a')
  link.href = url.value; link.download = props.message.body || 'attachment'; link.click()
}
watch(() => [props.message.metadata?.attachment_id, props.message.unsent, props.token], () => {
  generation++; controller?.abort(); release(); loading.value = false; failed.value = false
  if (media.value && !props.message.unsent) void load()
}, { immediate: true })
onBeforeUnmount(() => { generation++; controller?.abort(); release() })
</script>

<template>
  <div class="ln-message-attachment">
    <img v-if="url && mime.startsWith('image/') && media" :src="url" :alt="message.body" class="ln-attachment-image" @error="failed = true" />
    <audio v-else-if="url && mime.startsWith('audio/') && media" :src="url" controls preload="metadata" />
    <video v-else-if="url && mime.startsWith('video/') && media" :src="url" controls preload="metadata" playsinline />
    <span class="ln-attachment-name">{{ message.body }}</span>
    <span v-if="loading" role="status">{{ labels.loading }}</span>
    <span v-if="failed" role="alert">{{ labels.error }}</span>
    <button type="button" :disabled="loading" @click="failed && media ? load() : download()">{{ failed && media ? labels.retry : labels.download }}</button>
  </div>
</template>

<style scoped>
.ln-message-attachment{display:flex;flex-direction:column;gap:10px;max-width:min(320px,65vw);min-width:0}
.ln-attachment-name{overflow-wrap:anywhere;font-size:13px}
.ln-attachment-image,video{max-width:100%;max-height:300px;border-radius:12px;object-fit:contain}
audio{width:100%;max-width:280px;min-width:0}
button{align-self:flex-start;min-height:36px;border:1px solid currentColor;border-radius:8px;padding:6px 12px;background:transparent;color:inherit;cursor:pointer}
[role=alert],[role=status]{font-size:12px;line-height:1.5}
</style>
