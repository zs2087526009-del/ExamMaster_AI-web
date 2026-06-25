<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  score: number
  color: string
}>()

const radius = 34
const circumference = 2 * Math.PI * radius

const dashOffset = computed(() => {
  const pct = Math.min(100, Math.max(0, props.score)) / 100
  return circumference * (1 - pct)
})
</script>

<template>
  <div class="score-ring" :style="{ '--ring-color': color }">
    <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden="true">
      <circle
        class="ring-bg"
        cx="40"
        cy="40"
        :r="radius"
        fill="none"
        stroke-width="6"
      />
      <circle
        class="ring-fg"
        cx="40"
        cy="40"
        :r="radius"
        fill="none"
        stroke-width="6"
        stroke-linecap="round"
        :stroke-dasharray="`${circumference}`"
        :stroke-dashoffset="dashOffset"
        transform="rotate(-90 40 40)"
      />
    </svg>
    <div class="score-value">
      <span class="score-num">{{ score }}</span>
      <span class="score-unit">分</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.score-ring {
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
}

.ring-bg {
  stroke: #eee;
}

.ring-fg {
  stroke: var(--ring-color, #07c160);
  transition: stroke-dashoffset 0.4s ease;
}

.score-value {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.score-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--ring-color, #333);
}

.score-unit {
  font-size: 10px;
  color: #999;
  margin-top: 2px;
}
</style>
