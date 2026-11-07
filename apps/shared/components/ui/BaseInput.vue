<script setup lang="ts">
defineProps<{
  modelValue: string
  label: string
  type?: string
  placeholder?: string
  error?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  autocomplete?: string
}>()
defineEmits<{ (e: 'update:modelValue', value: string): void }>()
let uid = 0
const inputId = `ln-input-${++uid}`
</script>

<template>
  <div class="ln-field">
    <label :for="inputId" class="ln-field-label">{{ label }}<span v-if="required" aria-hidden="true"> *</span></label>
    <input
      :id="inputId"
      :type="type || 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :aria-invalid="!!error"
      :aria-describedby="error ? `${inputId}-err` : undefined"
      class="ln-input"
      :class="{ 'ln-input-error': !!error }"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="error" :id="`${inputId}-err`" role="alert" class="ln-field-error">{{ error }}</p>
    <p v-else-if="hint" class="ln-field-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.ln-field { display:grid; gap:6px; }
.ln-field-label { font:600 var(--ln-fs-small,12px)/1.4 var(--ln-font,system-ui,sans-serif); color:var(--ln-text); }
.ln-input { min-height:44px; padding:0 12px; border-radius:var(--ln-control-radius,10px); border:1px solid var(--ln-line); background:var(--ln-surface); color:var(--ln-text); font:400 var(--ln-fs-body,15px)/1.4 var(--ln-font,system-ui,sans-serif); }
.ln-input::placeholder { color:var(--ln-muted); }
.ln-input:focus-visible { outline:2px solid var(--ln-info); outline-offset:1px; border-color:var(--ln-info); }
.ln-input-error { border-color:var(--ln-danger); }
.ln-field-error { margin:0; font-size:var(--ln-fs-small,12px); color:var(--ln-danger); }
.ln-field-hint { margin:0; font-size:var(--ln-fs-small,12px); color:var(--ln-muted); }
</style>
