<script setup lang="ts">
import { AppIcon } from '@/components/icons'

export interface SidebarItem {
  id: string | number
  title: string
  subtitle?: string
  badge?: string
  readOnly?: boolean
}

const props = defineProps<{
  mode: 'rag' | 'tutor'
  items: SidebarItem[]
  activeId: string | number | null
  loading?: boolean
  collapsed?: boolean
}>()

const emit = defineEmits<{
  newChat: []
  select: [id: string | number]
  delete: [id: string | number]
  toggle: []
}>()

function isActive(id: string | number) {
  return props.activeId != null && String(props.activeId) === String(id)
}

function onDelete(e: Event, id: string | number) {
  e.stopPropagation()
  emit('delete', id)
}
</script>

<template>
  <aside class="chat-sidebar" :class="{ collapsed }">
    <div v-if="collapsed" class="collapsed-bar">
      <button type="button" class="expand-btn" title="展开对话列表" @click="emit('toggle')">
        <AppIcon name="inbox" :size="16" />
      </button>
    </div>

    <template v-else>
      <div class="sidebar-head">
        <button type="button" class="new-chat-btn" @click="emit('newChat')">
          <AppIcon name="dialogue" :size="15" />
          <span>{{ mode === 'rag' ? '新对话' : '新辅导' }}</span>
        </button>
        <button type="button" class="collapse-btn" title="收起" @click="emit('toggle')">
          <AppIcon name="inbox" :size="16" />
        </button>
      </div>

      <div class="sidebar-label">
        {{ mode === 'rag' ? '历史对话' : '辅导记录' }}
      </div>

      <div v-if="loading" class="sidebar-loading">加载中…</div>

      <div v-else-if="items.length === 0" class="sidebar-empty">
        {{ mode === 'rag' ? '暂无对话' : '暂无记录' }}
      </div>

      <div v-else class="sidebar-list">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="sidebar-item"
          :class="{ active: isActive(item.id), readonly: item.readOnly }"
          @click="emit('select', item.id)"
        >
          <div class="item-title">{{ item.title }}</div>
          <div v-if="item.subtitle" class="item-sub">{{ item.subtitle }}</div>
          <span v-if="item.badge" class="item-badge">{{ item.badge }}</span>
          <button
            type="button"
            class="item-delete"
            :title="mode === 'rag' ? '删除对话' : '删除记录'"
            @click="onDelete($event, item.id)"
          >
            ×
          </button>
        </button>
      </div>
    </template>
  </aside>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.chat-sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid $stone;
  background: $paper-dark;
  min-height: 0;

  &.collapsed {
    width: 44px;
  }
}

.collapsed-bar {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14px;
  height: 100%;
}

.expand-btn {
  width: 32px;
  height: 32px;
  border: 1px solid $stone;
  border-radius: $radius-md;
  background: $surface;
  color: $ink-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    border-color: $celadon;
    color: $celadon;
    background: $celadon-pale;
  }
}

.sidebar-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px 10px;
  flex-shrink: 0;
}

.new-chat-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 12px;
  border: none;
  border-radius: $radius-md;
  background: $celadon;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: $celadon-deep;
  }
}

.collapse-btn {
  width: 32px;
  height: 32px;
  border: 1px solid $stone;
  border-radius: $radius-md;
  background: $surface;
  color: $ink-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover {
    border-color: $celadon;
    color: $celadon;
  }
}

.sidebar-label {
  padding: 0 16px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $ink-muted;
}

.sidebar-loading,
.sidebar-empty {
  padding: 20px 16px;
  font-size: 13px;
  color: $ink-muted;
  text-align: center;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-item {
  position: relative;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  border-radius: $radius-md;
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;

  &:hover {
    background: rgba($surface, 0.7);

    .item-delete { opacity: 1; }
  }

  &.active {
    background: $surface;
    box-shadow: $shadow-card;

    .item-title { color: $celadon-deep; }
  }

  &.readonly .item-title {
    color: $ink-light;
  }
}

.item-title {
  font-size: 13px;
  font-weight: 600;
  color: $ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 18px;
  line-height: 1.4;
}

.item-sub {
  margin-top: 3px;
  font-size: 11px;
  color: $ink-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-badge {
  position: absolute;
  top: 10px;
  right: 24px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: $celadon-pale;
  color: $celadon;
  font-weight: 600;
}

.item-delete {
  position: absolute;
  top: 8px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: $ink-muted;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s;

  &:hover {
    background: $cinnabar-pale;
    color: $cinnabar;
  }
}

@media (max-width: 900px) {
  .chat-sidebar:not(.collapsed) {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 20;
    box-shadow: $shadow-modal;
  }
}
</style>
