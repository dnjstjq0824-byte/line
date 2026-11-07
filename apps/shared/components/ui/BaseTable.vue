<script setup lang="ts" generic="T extends Record<string, unknown>">
defineProps<{
  columns: Array<{ key: string; label: string }>
  rows: T[]
  rowKey?: string
}>()
</script>

<template>
  <div class="ln-table-scroll">
    <table class="ln-table">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key" scope="col">{{ col.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="String(row[rowKey || 'id'] ?? i)">
          <td v-for="col in columns" :key="col.key">
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
              {{ String(row[col.key] ?? '') }}
            </slot>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length" class="ln-table-empty">
            <slot name="empty">표시할 항목이 없습니다.</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ln-table-scroll { overflow-x:auto; border:1px solid var(--ln-line); border-radius:var(--ln-radius,14px); background:var(--ln-surface); }
.ln-table { border-collapse:collapse; width:100%; min-width:560px; font-size:var(--ln-fs-body,15px); color:var(--ln-text); }
.ln-table th, .ln-table td { padding:10px 12px; border-bottom:1px solid var(--ln-line); text-align:left; vertical-align:middle; }
.ln-table thead th { font-size:var(--ln-fs-small,12px); color:var(--ln-muted); font-weight:700; background:var(--ln-subtle); }
.ln-table tbody tr:last-child td { border-bottom:none; }
.ln-table-empty { text-align:center; color:var(--ln-muted); padding:20px 12px; }
</style>
