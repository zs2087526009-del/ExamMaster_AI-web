<script setup lang="ts">
import { computed } from 'vue'
import { icons, type IconName } from './iconRegistry'

const props = withDefaults(
  defineProps<{
    name: IconName
    size?: number | string
    strokeWidth?: number
  }>(),
  {
    size: 24,
    strokeWidth: 1.75,
  },
)

const sizeValue = computed(() =>
  typeof props.size === 'number' ? `${props.size}px` : props.size,
)

const iconDef = computed(() => icons[props.name])
</script>

<template>
  <svg
    class="app-icon"
    :width="sizeValue"
    :height="sizeValue"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      v-for="(d, i) in iconDef.paths"
      :key="`path-${i}`"
      :d="d"
      stroke="currentColor"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      v-for="(d, i) in iconDef.fills ?? []"
      :key="`fill-${i}`"
      :d="d"
      fill="currentColor"
    />
  </svg>
</template>

<style scoped>
.app-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
