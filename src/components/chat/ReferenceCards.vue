<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { ReferenceVO } from '@/types'
import { AppIcon } from '@/components/icons'

const props = defineProps<{
  references: ReferenceVO[]
  courseId?: number | null
}>()

const router = useRouter()
const expanded = ref<Record<number, boolean>>({})

function toggle(index: number) {
  expanded.value[index] = !expanded.value[index]
}

function goKnowledge() {
  if (props.courseId) {
    router.push(`/knowledge/${props.courseId}`)
  }
}
</script>

<template>
  <div class="msg-refs">
    <div class="refs-title">
      <AppIcon name="book" :size="14" />
      参考来源
    </div>
    <div
      v-for="(ref, ri) in references"
      :key="ri"
      class="ref-card"
      :class="{ expanded: expanded[ri] }"
    >
      <button type="button" class="ref-header" @click="toggle(ri)">
        <span class="ref-title">{{ ref.title }}</span>
        <span class="ref-toggle">{{ expanded[ri] ? '收起' : '展开' }}</span>
      </button>
      <p class="ref-snippet">
        {{ expanded[ri] ? ref.content : (ref.content?.substring(0, 120) + (ref.content && ref.content.length > 120 ? '…' : '')) }}
      </p>
      <button
        v-if="courseId"
        type="button"
        class="ref-link"
        @click.stop="goKnowledge"
      >
        在知识库中查看 →
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.msg-refs {
  margin-top: 10px;
  padding: 12px 14px;
  background: #fdfcf0;
  border-radius: 8px;
  border: 1px solid #f0ecd0;
  text-align: left;
}

.refs-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #9b8e80;
  margin-bottom: 8px;
}

.ref-card {
  margin-bottom: 8px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  &:last-child { margin-bottom: 0; }
}

.ref-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.ref-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

.ref-toggle {
  font-size: 11px;
  color: #07c160;
  flex-shrink: 0;
  margin-left: 8px;
}

.ref-snippet {
  font-size: 12px;
  color: #888;
  line-height: 1.5;
  margin: 6px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.ref-link {
  margin-top: 6px;
  border: none;
  background: none;
  padding: 0;
  font-size: 11px;
  color: #3d7a6a;
  cursor: pointer;
  &:hover { text-decoration: underline; }
}
</style>
