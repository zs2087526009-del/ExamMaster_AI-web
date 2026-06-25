<script setup lang="ts">
import { ref, provide } from 'vue'
import SideNav from './SideNav.vue'
import TopBar from './TopBar.vue'

const drawerOpen = ref(false)

function openDrawer() {
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
}

provide('closeSidebar', closeDrawer)
</script>

<template>
  <div class="app-layout">
    <SideNav class="desktop-sidenav" />

    <el-drawer
      v-model="drawerOpen"
      direction="ltr"
      :size="280"
      :with-header="false"
      class="mobile-drawer"
      append-to-body
    >
      <SideNav mobile @navigate="closeDrawer" />
    </el-drawer>

    <div class="main-area">
      <TopBar @toggle-menu="openDrawer" />
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.app-layout {
  display: flex;
  min-height: 100vh;
  background: $paper;
  position: relative;
  z-index: 1;
}

.main-area {
  flex: 1;
  margin-left: 232px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0;
}

.content {
  flex: 1;
  padding: 28px 32px;
}

@media (max-width: 768px) {
  .desktop-sidenav {
    display: none;
  }

  .main-area {
    margin-left: 0;
  }

  .content {
    padding: 16px;
  }
}
</style>

<style lang="scss">
.mobile-drawer {
  .el-drawer__body {
    padding: 0;
    background: #1a1f1e;
  }
}
</style>
