<script setup lang="ts">
import { AppIcon, type IconName } from '@/components/icons'

defineProps<{
  icon?: IconName
  title?: string
  description?: string
}>()
</script>

<template>
  <div class="empty-block">
    <div v-if="icon" class="empty-icon-wrap">
      <AppIcon :name="icon" :size="40" />
    </div>
    <h3 v-if="title">{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.empty-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  background: $surface;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  padding: 48px 24px;
  text-align: center;

  .empty-icon-wrap {
    width: 72px;
    height: 72px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: $celadon-pale;
    color: $celadon;
    border: 1px solid rgba($celadon, 0.12);
  }

  h3 {
    font-family: $font-display;
    font-size: 18px;
    color: $ink;
    margin-bottom: 8px;
    font-weight: 600;
  }

  p {
    font-size: 13px;
    color: $ink-muted;
    margin-bottom: 8px;
    max-width: 360px;
    line-height: 1.6;
  }
}
</style>
