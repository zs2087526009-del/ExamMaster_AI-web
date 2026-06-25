<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCourseStore } from '@/stores/course'
import * as statisticsApi from '@/api/statistics'
import type { StatisticsResponse, CourseResponse } from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import { AppIcon } from '@/components/icons'
import { calcAccuracy, formatAccuracyPercent } from '@/utils/accuracy'
import { buildContinueLearning, useOnboardingLoader } from '@/composables/useOnboarding'

const authStore = useAuthStore()
const courseStore = useCourseStore()
const router = useRouter()

const loading = ref(true)
const stats = ref<StatisticsResponse | null>(null)
const courses = ref<CourseResponse[]>([])

const { steps: checklistSteps, load: loadOnboarding } = useOnboardingLoader()

const statCards = computed(() => {
  const accuracy = stats.value ? formatAccuracyPercent(calcAccuracy(stats.value)) : '-'
  return [
    { label: '课程数量', value: courses.value.length, color: '#3d7a6a' },
    { label: '总答题数', value: stats.value?.totalCount ?? '-', color: '#5b8c5a' },
    { label: '正确率', value: accuracy, color: '#b8944d' },
    { label: '错题数', value: stats.value?.wrongCount ?? '-', color: '#c44536' },
  ]
})

const continueLearning = computed(() =>
  buildContinueLearning(checklistSteps.value, courseStore.currentCourse),
)

const focusCourse = computed(() =>
  courseStore.currentCourse ?? courses.value[0] ?? null,
)

onMounted(async () => {
  try {
    const [s, c] = await Promise.all([
      statisticsApi.getOverview(true).catch(() => null),
      courseStore.fetchCourses().catch(() => [] as CourseResponse[]),
    ])
    stats.value = s
    courses.value = c
    await loadOnboarding({
      courses: c,
      focusCourseId: courseStore.currentCourseId,
      hasExamRecord: (s?.totalCount ?? 0) > 0,
    })
  } finally {
    loading.value = false
  }
})

function navigate(route: string, courseId?: number) {
  if (courseId) courseStore.setCourseId(courseId)
  router.push(route)
}
</script>

<template>
  <div class="dashboard">
    <LoadingBlock v-if="loading" />

    <template v-else>
      <div class="welcome">
        <p class="welcome-greeting">欢迎回来</p>
        <h1 class="welcome-name">{{ authStore.displayName }}</h1>
        <p class="welcome-desc">
          按步骤完成课程设置，即可开始智能测评
          <span v-if="courseStore.currentCourse" class="current-course">
            · 当前课程：{{ courseStore.currentCourse.courseName }}
          </span>
        </p>
      </div>

      <div class="stats-row">
        <div v-for="card in statCards" :key="card.label" class="stat-card">
          <span class="stat-value" :style="{ color: card.color }">{{ card.value }}</span>
          <span class="stat-label">{{ card.label }}</span>
        </div>
      </div>

      <section class="section">
        <h2 class="section-title"><span class="title-decor">/</span> 继续学习</h2>
        <div class="continue-card">
          <div class="continue-main">
            <div class="continue-icon">
              <AppIcon name="quill" :size="28" />
            </div>
            <div>
              <div class="continue-title">{{ continueLearning.title }}</div>
              <div class="continue-desc">{{ continueLearning.description }}</div>
            </div>
          </div>
          <el-button
            type="primary"
            size="large"
            @click="navigate(continueLearning.route, focusCourse?.id)"
          >
            {{ continueLearning.actionLabel }}
          </el-button>
        </div>
      </section>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.dashboard { max-width: 1000px; }

.welcome {
  margin-bottom: 28px;
  .welcome-greeting {
    font-size: 13px;
    color: $ink-muted;
    letter-spacing: 3px;
    margin-bottom: 6px;
  }
  .welcome-name {
    font-family: $font-display;
    font-size: 32px;
    font-weight: 600;
    color: $ink;
    margin-bottom: 8px;
  }
  .welcome-desc {
    font-size: 15px;
    color: $ink-muted;
    .current-course { color: $celadon; font-weight: 500; }
  }
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}

.stat-card {
  background: $surface;
  padding: 20px 18px;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  .stat-value {
    font-family: $font-display;
    font-size: 28px;
    font-weight: 700;
    display: block;
    line-height: 1;
  }
  .stat-label { font-size: 13px; color: $ink-muted; margin-top: 6px; display: block; }
}

.section { margin-bottom: 32px; }

.section-title {
  font-family: $font-display;
  font-size: 17px;
  font-weight: 600;
  color: $ink;
  margin-bottom: 14px;
  .title-decor { color: $cinnabar; font-weight: 700; margin-right: 6px; }
}

.continue-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, rgba($celadon, 0.08), $surface);
  border: 1px solid rgba($celadon, 0.25);
  border-radius: $radius-lg;
  padding: 24px 28px;
}

.continue-main {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.continue-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: $celadon-pale;
  color: $celadon;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.continue-title {
  font-size: 17px;
  font-weight: 600;
  color: $ink;
  margin-bottom: 4px;
}

.continue-desc {
  font-size: 13px;
  color: $ink-muted;
}

@media (max-width: 768px) {
  .continue-card {
    flex-direction: column;
    align-items: stretch;
    .el-button { width: 100%; }
  }
}
</style>
