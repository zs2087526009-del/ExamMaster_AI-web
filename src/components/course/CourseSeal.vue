<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    id?: number
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)

const initial = computed(() => props.name.trim().charAt(0) || '课')

const themeIndex = computed(() => {
  const seed = props.id ?? props.name.charCodeAt(0)
  return Math.abs(seed) % 4
})
</script>

<template>
  <div
    class="course-seal"
    :class="[`size-${size}`, `theme-${themeIndex}`]"
    aria-hidden="true"
  >
    <span class="seal-ring" />
    <span class="seal-letter">{{ initial }}</span>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.course-seal {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 12px;
  font-family: $font-display;
  font-weight: 700;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.45;
    background-image:
      radial-gradient(circle at 20% 30%, rgba(#fff, 0.35) 0, transparent 45%),
      linear-gradient(135deg, transparent 40%, rgba(#fff, 0.08) 100%);
    pointer-events: none;
  }

  .seal-ring {
    position: absolute;
    inset: 4px;
    border: 1px solid rgba(#fff, 0.22);
    border-radius: 9px;
    pointer-events: none;
  }

  .seal-letter {
    position: relative;
    z-index: 1;
    line-height: 1;
    letter-spacing: 0.02em;
  }

  &.size-sm {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    .seal-letter { font-size: 15px; }
    .seal-ring { inset: 3px; border-radius: 7px; }
  }

  &.size-md {
    width: 44px;
    height: 44px;
    .seal-letter { font-size: 18px; }
  }

  &.size-lg {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    .seal-letter { font-size: 22px; }
    .seal-ring { border-radius: 11px; }
  }

  &.theme-0 {
    background: linear-gradient(145deg, $celadon 0%, $celadon-deep 100%);
    color: rgba(#fff, 0.95);
    .seal-ring { border-color: rgba(#fff, 0.28); }
  }

  &.theme-1 {
    background: linear-gradient(145deg, lighten($celadon-pale, 2%) 0%, $celadon-pale 100%);
    color: $celadon-deep;
    border: 1px solid rgba($celadon, 0.15);
    .seal-ring { border-color: rgba($celadon, 0.12); }
  }

  &.theme-2 {
    background: linear-gradient(145deg, $paper-dark 0%, darken($paper-dark, 4%) 100%);
    color: $gold;
    border: 1px solid rgba($gold, 0.2);
    .seal-ring { border-color: rgba($gold, 0.18); }
  }

  &.theme-3 {
    background: linear-gradient(145deg, lighten($celadon-deep, 6%) 0%, $celadon-deep 100%);
    color: rgba(#fff, 0.92);
    .seal-ring { border-color: rgba(#fff, 0.2); }
  }
}
</style>
