<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { AppIcon, type IconName } from '@/components/icons'

defineProps<{
  mobile?: boolean
}>()

const emit = defineEmits<{
  navigate: []
}>()

const route = useRoute()

interface NavItem {
  path: string
  label: string
  icon: IconName
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: '仪表盘', icon: 'dashboard' },
  { path: '/courses', label: '课程管理', icon: 'book' },
  { path: '/knowledge', label: '知识点', icon: 'tree' },
  { path: '/questions', label: '题目库', icon: 'scroll' },
  { path: '/exam/start', label: '开始考试', icon: 'quill' },
  { path: '/exam/history', label: '考试历史', icon: 'inbox' },
  { path: '/wrong-questions', label: '错题本', icon: 'clipboard' },
  { path: '/study-plan', label: '学习计划', icon: 'calendar' },
  { path: '/statistics', label: '学习统计', icon: 'chart' },
  { path: '/chat', label: 'AI 对话', icon: 'dialogue' },
  { path: '/user', label: '用户中心', icon: 'user' },
]

const activePath = computed(() => {
  if (route.path.startsWith('/knowledge')) return '/knowledge'
  if (route.path.startsWith('/exam/history')) return '/exam/history'
  if (route.path.startsWith('/exam')) return '/exam/start'
  if (route.path.startsWith('/chat')) return '/chat'
  if (route.path.startsWith('/study-plan')) return '/study-plan'
  if (route.path.startsWith('/user')) return '/user'
  return route.path
})

function onNavigate() {
  emit('navigate')
}
</script>

<template>
  <aside class="sidenav" :class="{ 'sidenav-mobile': mobile }">
    <router-link to="/dashboard" class="logo" @click="onNavigate">
      <span class="logo-mark">
        <AppIcon name="seal" :size="22" />
      </span>
      <div class="logo-text">
        <span class="logo-title">ExamMaster</span>
        <span class="logo-sub">智能学习平台</span>
      </div>
    </router-link>

    <nav class="nav-list">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: activePath === item.path }"
        @click="onNavigate"
      >
        <AppIcon :name="item.icon" :size="20" />
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </nav>

    <div class="sidenav-footer">
      <span class="footer-seal">v1.0</span>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.sidenav {
  width: 232px;
  height: 100vh;
  background: $chrome;
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 100;
  overflow-y: auto;
  border-right: 1px solid rgba(#000, 0.08);

  &.sidenav-mobile {
    position: static;
    width: 100%;
    height: 100%;
    border-right: none;
  }

  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb {
    background: rgba(#fff, 0.08);
    border-radius: 2px;
  }
}

.logo {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 20px 26px;
  text-decoration: none;

  .logo-mark {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: rgba(#fff, 0.08);
    color: $celadon;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid rgba(#fff, 0.06);
  }

  .logo-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .logo-title {
    font-size: 16px;
    font-weight: 700;
    color: rgba(#fff, 0.9);
    letter-spacing: 1px;
    line-height: 1.2;
  }

  .logo-sub {
    font-size: 11px;
    color: rgba(#fff, 0.35);
    letter-spacing: 2px;
  }
}

.nav-list {
  flex: 1;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  text-decoration: none;
  color: rgba(#fff, 0.5);
  font-size: 14px;
  border-radius: $radius-md;
  transition: all 0.2s ease;
  position: relative;

  &:hover {
    color: rgba(#fff, 0.85);
    background: rgba(#fff, 0.05);
  }

  &.active {
    color: #fff;
    background: rgba($celadon, 0.2);

    :deep(.app-icon) { color: $celadon; }

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 8px;
      bottom: 8px;
      width: 2px;
      border-radius: 1px;
      background: $celadon;
    }
  }

  :deep(.app-icon) {
    color: rgba(#fff, 0.35);
    transition: color 0.2s;
  }

  .nav-label {
    white-space: nowrap;
    font-weight: 450;
  }
}

.sidenav-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(#fff, 0.06);

  .footer-seal {
    font-family: $font-display;
    font-size: 10px;
    color: rgba(#fff, 0.15);
    letter-spacing: 3px;
    text-transform: uppercase;
  }
}
</style>
