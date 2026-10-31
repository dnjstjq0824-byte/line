<template>
  <div
    v-if="visible"
    class="line-context-menu"
    :style="{ top: y + 'px', left: x + 'px' }"
    @click.stop
  >
    <div
      v-for="(item, idx) in items"
      :key="idx"
      class="context-menu-item"
      :class="{ danger: item.danger, separator: item.separator }"
      @click="handleSelect(item)"
    >
      <span v-if="item.icon" class="item-icon">
        <component :is="item.icon" v-if="typeof item.icon !== 'string'" />
        <span v-else>{{ item.icon }}</span>
      </span>
      <span class="item-label">{{ item.label }}</span>
      <span v-if="item.shortcut" class="item-shortcut">{{ item.shortcut }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: string | object;
  action: () => void;
  danger?: boolean;
  separator?: boolean;
  shortcut?: string;
}

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

function handleSelect(item: ContextMenuItem) {
  item.action();
  emit('close');
}

function handleGlobalClick() {
  if (props.visible) {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('click', handleGlobalClick);
  window.addEventListener('contextmenu', handleGlobalClick);
});

onUnmounted(() => {
  window.removeEventListener('click', handleGlobalClick);
  window.removeEventListener('contextmenu', handleGlobalClick);
});
</script>

<style scoped>
.line-context-menu {
  position: fixed;
  z-index: 99999;
  min-width: 170px;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  padding: 6px 0;
  user-select: none;
  font-size: 13px;
  animation: contextFadeIn 0.1s ease-out;
}

@keyframes contextFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  color: #1e293b;
  cursor: pointer;
  transition: background-color 0.1s;
}

.context-menu-item:hover {
  background-color: #f1f5f9;
  color: var(--om-primary, #2563EB);
}

.context-menu-item.danger {
  color: #ef4444;
}

.context-menu-item.danger:hover {
  background-color: #fee2e2;
  color: #dc2626;
}

.context-menu-item.separator {
  border-top: 1px solid #e2e8f0;
  margin-top: 4px;
  padding-top: 8px;
}

.item-icon {
  display: flex;
  align-items: center;
  font-size: 14px;
  width: 16px;
}

.item-label {
  flex: 1;
}

.item-shortcut {
  font-size: 11px;
  color: #94a3b8;
}
</style>

