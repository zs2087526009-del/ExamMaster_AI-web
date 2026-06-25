<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'

defineEmits<{
  toggleMenu: []
}>()

const authStore = useAuthStore()
const router = useRouter()

function goToUserCenter() {
  router.push('/user')
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await authStore.logout()
  router.push('/login')
}
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <button type="button" class="menu-btn" aria-label="打开菜单" @click="$emit('toggleMenu')">
        <span class="menu-icon"><span /><span /><span /></span>
      </button>
      <span class="greeting">欢迎，{{ authStore.displayName }}</span>
    </div>
    <div class="topbar-right">
      <button class="user-badge" type="button" title="用户中心" @click="goToUserCenter">
        <span class="avatar">{{ authStore.displayName.charAt(0) }}</span>
        <span class="user-name">{{ authStore.displayName }}</span>
      </button>
      <button class="logout-btn" @click="handleLogout">退出登录</button>
    </div>
  </header>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 32px;
  background: transparent;
  border-bottom: 1px solid $stone;
  position: sticky;
  top: 0;
  z-index: 50;
  gap: 12px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.menu-btn {
  display: none;
  width: 36px;
  height: 36px;
  border: 1px solid $stone;
  border-radius: $radius-md;
  background: $surface;
  color: $ink;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-icon {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 16px;

  span {
    display: block;
    height: 2px;
    background: currentColor;
    border-radius: 1px;
  }
}

.greeting {
  font-size: 13px;
  color: $ink-muted;
  font-family: $font-display;
  letter-spacing: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-shrink: 0;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 4px 4px;
  border: 1px solid transparent;
  border-radius: 24px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;

  &:hover {
    background: $celadon-pale;
    border-color: lighten($celadon, 24%);
  }

  .avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: $celadon;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    font-family: $font-display;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .user-name {
    font-size: 13px;
    color: $ink-light;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.logout-btn {
  padding: 6px 18px;
  border: 1px solid $stone;
  border-radius: $radius-md;
  background: transparent;
  color: $ink-muted;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;

  &:hover {
    border-color: $cinnabar;
    color: $cinnabar;
    background: $cinnabar-pale;
  }
}

@media (max-width: 768px) {
  .topbar {
    padding: 0 16px;
  }

  .menu-btn {
    display: inline-flex;
  }

  .user-name,
  .logout-btn {
    display: none;
  }
}
</style>
