<script setup lang="ts">
defineProps<{
  text?: string
}>()
</script>

<template>
  <div class="loading-block">
    <div class="loading-spinner">
      <span class="spinner-dot" />
      <span class="spinner-dot" />
      <span class="spinner-dot" />
    </div>
    <p v-if="text">{{ text }}</p>
    <p v-else>加载中...</p>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.loading-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  background: $surface;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  gap: 16px;
}

.loading-spinner {
  display: flex;
  gap: 8px;
}

.spinner-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: $celadon;
  animation: dot-bounce 1.4s ease-in-out infinite both;

  &:nth-child(1) { animation-delay: -0.32s; }
  &:nth-child(2) { animation-delay: -0.16s; }
  &:nth-child(3) { animation-delay: 0s; }
}

@keyframes dot-bounce {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.75);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

p {
  font-size: 14px;
  color: $ink-muted;
}
</style>
