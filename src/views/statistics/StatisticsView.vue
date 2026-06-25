<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import * as statsApi from '@/api/statistics'
import type { StatisticsResponse } from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import { useCourseScope } from '@/composables/useCourseScope'
import { calcAccuracy } from '@/utils/accuracy'

const { courses, courseStore, ensureCourses } = useCourseScope()

const selectedCourseId = computed({
  get: () => courseStore.currentCourseId ?? undefined,
  set: (id: number | undefined) => courseStore.setCourseId(id ?? null),
})

const stats = ref<StatisticsResponse | null>(null)
const loading = ref(false)
const loadError = ref(false)

async function fetchStats() {
  loading.value = true
  loadError.value = false
  try {
    if (selectedCourseId.value) {
      stats.value = await statsApi.getCourseStatistics(selectedCourseId.value)
    } else {
      stats.value = await statsApi.getOverview()
    }
  } catch {
    stats.value = null
    loadError.value = true
  }
  finally { loading.value = false }
}

function onCourseChange() {
  fetchStats()
}

const statsAccuracy = computed(() => {
  if (!stats.value) return null
  return calcAccuracy(stats.value)
})

const accuracyPercent = computed(() => statsAccuracy.value?.percent ?? 0)

const animatedPercent = ref(0)
let animFrame = 0

function animateRing(target: number) {
  cancelAnimationFrame(animFrame)
  const start = animatedPercent.value
  const duration = 800
  const startTime = performance.now()

  function step(now: number) {
    const elapsed = now - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    animatedPercent.value = Math.round(start + (target - start) * eased)
    if (progress < 1) {
      animFrame = requestAnimationFrame(step)
    }
  }
  animFrame = requestAnimationFrame(step)
}

// Animate ring when stats load
watch(stats, (val) => {
  if (val) {
    setTimeout(() => animateRing(accuracyPercent.value), 100)
  }
})

const typeLabels: Record<string, string> = {
  CHOICE: '选择题', FILL_BLANK: '填空题', TRUE_FALSE: '判断题', SHORT_ANSWER: '简答题',
}
const typeColors: Record<string, string> = {
  CHOICE: '#1677ff', FILL_BLANK: '#f59e0b', TRUE_FALSE: '#07c160', SHORT_ANSWER: '#8b5cf6',
}

const maxTypeCount = computed(() => {
  if (!stats.value?.typeDistribution) return 1
  return Math.max(...stats.value.typeDistribution.map((d) => d.count), 1)
})

onMounted(async () => {
  await ensureCourses()
  fetchStats()
})
</script>

<template>
  <div class="stats-page">
    <div class="page-header">
      <div>
        <h1>学习统计</h1>
        <p class="sub">跟踪学习进度，发现知识薄弱点</p>
      </div>
      <el-select
        v-model="selectedCourseId"
        placeholder="全部课程"
        size="large"
        style="width: 200px"
        clearable
        @change="onCourseChange"
      >
        <el-option v-for="c in courses" :key="c.id" :label="c.courseName" :value="c.id" />
      </el-select>
    </div>

    <LoadingBlock v-if="loading" text="加载统计数据..." />

    <EmptyBlock
      v-else-if="loadError"
      icon="chart"
      title="加载失败"
      description="无法获取统计数据，请检查网络后重试"
    >
      <el-button type="primary" @click="fetchStats">重试</el-button>
    </EmptyBlock>

    <EmptyBlock
      v-else-if="!stats"
      icon="chart"
      title="暂无数据"
      description="完成考试后即可查看统计"
    />

    <template v-else>
      <!-- Overview Cards -->
      <div class="overview-row">
        <div class="ov-card">
          <div class="ov-num">{{ stats.totalCount }}</div>
          <div class="ov-label">总答题数</div>
        </div>
        <div class="ov-card correct">
          <div class="ov-num">{{ stats.correctCount }}</div>
          <div class="ov-label">正确</div>
        </div>
        <div class="ov-card wrong">
          <div class="ov-num">{{ stats.wrongCount }}</div>
          <div class="ov-label">错误</div>
        </div>
        <div class="ov-card pending" v-if="stats.ungradedCount > 0">
          <div class="ov-num">{{ stats.ungradedCount }}</div>
          <div class="ov-label">待批改</div>
        </div>
      </div>

      <!-- Accuracy Ring + Type Distribution -->
      <div class="charts-row">
        <!-- Ring -->
        <div class="chart-card ring-card">
          <h3>正确率</h3>
          <div class="ring-wrap">
            <svg viewBox="0 0 140 140" width="140" height="140">
              <circle cx="70" cy="70" r="60" fill="none" stroke="#eee" stroke-width="12" />
              <circle
                cx="70" cy="70" r="60"
                fill="none"
                stroke="#07c160"
                stroke-width="12"
                stroke-linecap="round"
                :stroke-dasharray="`${animatedPercent * 3.77} 377`"
                transform="rotate(-90 70 70)"
              />
              <text x="70" y="64" text-anchor="middle" font-size="26" font-weight="700" fill="#333">
                {{ animatedPercent }}%
              </text>
              <text x="70" y="84" text-anchor="middle" font-size="11" fill="#999">正确率</text>
            </svg>
            <div class="ring-detail">
              <span v-if="statsAccuracy">{{ statsAccuracy.label }}</span>
              <span v-if="statsAccuracy && statsAccuracy.gradedCount > 0">
                · {{ stats.totalCount - stats.correctCount - stats.ungradedCount }} 道待提高
              </span>
            </div>
          </div>
        </div>

        <!-- Type Distribution -->
        <div class="chart-card type-card">
          <h3>题型分布</h3>
          <div v-if="stats.typeDistribution.length === 0" class="no-data">
            暂无数据
          </div>
          <div v-else class="type-list">
            <div
              v-for="d in stats.typeDistribution"
              :key="d.questionType"
              class="type-item"
            >
              <span class="type-name">{{ typeLabels[d.questionType] || d.questionType }}</span>
              <div class="type-bar-track">
                <div
                  class="type-bar-fill"
                  :style="{
                    width: (d.count / maxTypeCount * 100) + '%',
                    background: typeColors[d.questionType] || '#999',
                  }"
                />
              </div>
              <span class="type-count">{{ d.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary -->
      <div class="summary-card">
        <h3>学习建议</h3>
        <p v-if="accuracyPercent >= 80">
          👍 表现优秀！正确率超过 80%，继续保持。
        </p>
        <p v-else-if="accuracyPercent >= 60">
          良好水平。建议回顾错题本，针对薄弱知识点加强练习。
        </p>
        <p v-else-if="stats.totalCount > 0">
          需要加油！建议多练习错题，利用 AI 对话功能深入理解概念。
        </p>
        <p v-else>
          还没有答题记录，开始你的第一次考试吧！
        </p>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.stats-page { max-width: 900px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  h1 { font-family: $font-display; font-size: 22px; font-weight: 700; color: $ink; margin-bottom: 4px; letter-spacing: 1px; }
  .sub { font-size: 13px; color: $ink-muted; }
}

.loading-area, .empty-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #eee;
  .empty-icon { font-size: 48px; margin-bottom: 16px; }
  h3 { font-size: 17px; color: #333; margin-bottom: 8px; }
  p { font-size: 13px; color: #999; }
}

.overview-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.ov-card {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  border: 1px solid #eee;
  text-align: center;
  &.correct { border-top: 3px solid #07c160; }
  &.wrong { border-top: 3px solid #e74c3c; }
  &.pending { border-top: 3px solid #f59e0b; }
  .ov-num { font-size: 30px; font-weight: 700; color: #333; }
  .ov-label { font-size: 13px; color: #999; margin-top: 4px; }
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 20px;
}

.chart-card {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  border: 1px solid #eee;
  h3 { font-size: 15px; font-weight: 600; color: #333; margin-bottom: 20px; }
}

.ring-card {
  .ring-wrap { display: flex; flex-direction: column; align-items: center; }
  .ring-detail { margin-top: 12px; font-size: 13px; color: #999; }
}

.type-card {
  .no-data { text-align: center; color: #ccc; padding: 40px 0; }
}

.type-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.type-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.type-name {
  width: 60px;
  font-size: 13px;
  color: #666;
  flex-shrink: 0;
}

.type-bar-track {
  flex: 1;
  height: 20px;
  background: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
}

.type-bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.6s ease;
  min-width: 4px;
}

.type-count {
  width: 32px;
  text-align: right;
  font-size: 13px;
  color: #999;
}

.summary-card {
  background: #fff;
  padding: 20px 24px;
  border-radius: 10px;
  border: 1px solid #eee;
  h3 { font-size: 15px; font-weight: 600; color: #333; margin-bottom: 8px; }
  p { font-size: 14px; color: #666; line-height: 1.6; }
}

@media (max-width: 700px) {
  .overview-row { grid-template-columns: repeat(2, 1fr); }
  .charts-row { grid-template-columns: 1fr; }
}
</style>
