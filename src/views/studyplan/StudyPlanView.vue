<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as studyPlanApi from '@/api/studyPlan'
import * as masteryApi from '@/api/knowledgeMastery'
import type { StudyPlanResponse, DayPlan, StudyTask } from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import { ElMessage } from 'element-plus'
import { useCourseScope } from '@/composables/useCourseScope'

const router = useRouter()
const { courses, selectedCourseId, ensureCourses } = useCourseScope()

const examDate = ref<Date | null>(null)
const loading = ref(false)
const plan = ref<StudyPlanResponse | null>(null)

const selectedCourseName = computed(() => {
  const c = courses.value.find((c) => c.id === selectedCourseId.value)
  return c?.courseName || ''
})

const canGenerate = computed(
  () => !!selectedCourseId.value && !!examDate.value && !loading.value,
)

function disabledDate(date: Date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date <= today
}

function formatDateForApi(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function displayMonthDay(dateStr: string): string {
  const parts = dateStr.split('-')
  return `${parseInt(parts[1])}月${parseInt(parts[2])}日`
}

function getDayOfWeek(dateStr: string): string {
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return labels[new Date(dateStr).getDay()]
}

async function enrichPlanWithMastery(
  raw: StudyPlanResponse,
  courseId: number,
): Promise<StudyPlanResponse> {
  let masteryList: Awaited<ReturnType<typeof masteryApi.listByCourse>> = []
  try {
    masteryList = await masteryApi.listByCourse(courseId)
  } catch {
    masteryList = []
  }
  const scoreMap = new Map(masteryList.map((m) => [m.knowledgePointId, m.masteryScore]))

  return {
    ...raw,
    days: raw.days.map((day) => ({
      ...day,
      tasks: day.tasks.map((task) => {
        if (task.type !== 'KNOWLEDGE_POINT' || task.knowledgePointId == null) {
          return task
        }
        const score = scoreMap.get(task.knowledgePointId)
        return { ...task, masteryScore: score ?? null }
      }),
    })),
  }
}

async function generatePlan() {
  if (!selectedCourseId.value) {
    ElMessage.warning('请先选择课程')
    return
  }
  if (!examDate.value) {
    ElMessage.warning('请选择考试日期')
    return
  }
  loading.value = true
  plan.value = null
  try {
    const raw = await studyPlanApi.generateStudyPlan(
      selectedCourseId.value,
      formatDateForApi(examDate.value),
    )
    if (raw && raw.totalDays === 0) {
      ElMessage.warning('暂无学习数据，请先上传文档并生成知识点')
      plan.value = null
      return
    }
    plan.value = await enrichPlanWithMastery(raw, selectedCourseId.value)
  } catch (e: unknown) {
    const err = e as { message?: string }
    ElMessage.error(err?.message || '生成失败，请重试')
  } finally {
    loading.value = false
  }
}

function isLastDay(day: DayPlan): boolean {
  return !!plan.value && day.dayNumber === plan.value.totalDays
}

function knowledgeTaskCount(day: DayPlan): number {
  return day.tasks.filter((t) => t.type === 'KNOWLEDGE_POINT').length
}

function masteryGrade(score: number): string {
  if (score >= 80) return 'high'
  if (score >= 50) return 'mid'
  return 'low'
}

function taskTypeClass(type: string): string {
  switch (type) {
    case 'KNOWLEDGE_POINT': return 'task-kp'
    case 'WRONG_QUESTION_REVIEW': return 'task-wq'
    case 'KEY_MEMORY': return 'task-km'
    default: return ''
  }
}

function taskTypeLabel(type: string): string {
  switch (type) {
    case 'KNOWLEDGE_POINT': return '知识点'
    case 'WRONG_QUESTION_REVIEW': return '错题回顾'
    case 'KEY_MEMORY': return '重点记忆'
    default: return type
  }
}

function isTaskClickable(type: string) {
  return type === 'KNOWLEDGE_POINT' || type === 'WRONG_QUESTION_REVIEW' || type === 'KEY_MEMORY'
}

function navigateTask(task: StudyTask) {
  if (!selectedCourseId.value || !isTaskClickable(task.type)) return

  if (task.type === 'WRONG_QUESTION_REVIEW') {
    router.push({
      path: '/wrong-questions',
      query: { courseId: String(selectedCourseId.value) },
    })
    return
  }

  router.push(`/knowledge/${selectedCourseId.value}`)
}

function importanceDots(importance: number | null): number[] {
  if (!importance) return []
  return Array.from({ length: Math.min(importance, 5) })
}

onMounted(() => { void ensureCourses() })
</script>

<template>
  <div class="plan-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>学习计划</h1>
        <p class="sub">根据知识点掌握度，智能生成每日复习安排</p>
      </div>
    </div>

    <!-- Generate Form -->
    <div class="gen-card">
      <div class="gen-fields">
        <div class="field-group">
          <label class="field-label">选择课程</label>
          <el-select
            v-model="selectedCourseId"
            placeholder="请选择课程"
            size="large"
            style="width: 220px"
            @change="plan = null"
          >
            <el-option
              v-for="c in courses"
              :key="c.id"
              :label="c.courseName"
              :value="c.id"
            />
          </el-select>
        </div>

        <div class="field-sep">—</div>

        <div class="field-group">
          <label class="field-label">考试日期</label>
          <el-date-picker
            v-model="examDate"
            type="date"
            placeholder="选择考试日期"
            size="large"
            style="width: 180px"
            :disabled-date="disabledDate"
            @change="plan = null"
          />
        </div>

        <el-button
          type="primary"
          size="large"
          :loading="loading"
          :disabled="!canGenerate"
          class="gen-btn"
          @click="generatePlan"
        >
          <span v-if="!loading">生成计划</span>
          <span v-else>生成中…</span>
        </el-button>
      </div>

      <p class="gen-hint">
        系统将根据各知识点的掌握度和重要性，自动分配每日学习任务
      </p>
    </div>

    <!-- Loading -->
    <LoadingBlock v-if="loading" text="AI 正在规划学习路径…" />

    <!-- Empty placeholder before generation -->
    <div v-else-if="!plan" class="pre-empty">
      <div class="pre-empty-inner">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <rect x="10" y="14" width="60" height="56" rx="6" stroke="#d6cfc3" stroke-width="2.5" fill="#faf6ed"/>
          <line x1="26" y1="6" x2="26" y2="22" stroke="#c4b89a" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="54" y1="6" x2="54" y2="22" stroke="#c4b89a" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="10" y1="30" x2="70" y2="30" stroke="#e3ddd2" stroke-width="2"/>
          <rect x="20" y="38" width="14" height="8" rx="2" fill="#c9dfd8"/>
          <rect x="40" y="38" width="14" height="8" rx="2" fill="#e3ddd2"/>
          <rect x="20" y="52" width="14" height="8" rx="2" fill="#e3ddd2"/>
          <rect x="40" y="52" width="14" height="8" rx="2" fill="#c9dfd8"/>
        </svg>
        <p class="pre-empty-title">选择课程和考试日期，生成专属学习计划</p>
        <p class="pre-empty-sub">计划将根据您的知识点掌握情况智能分配</p>
      </div>
    </div>

    <!-- Plan Display -->
    <template v-else>
      <!-- Summary Banner -->
      <div class="plan-banner">
        <div class="banner-info">
          <span class="banner-course">{{ selectedCourseName }}</span>
          <span class="banner-sep">·</span>
          <span class="banner-label">共 <b>{{ plan.totalDays }}</b> 天备考计划</span>
          <span class="banner-sep">·</span>
          <span class="banner-exam">考试日期：{{ displayMonthDay(plan.examDate) }}</span>
        </div>
        <div class="banner-meta">
          从今天起每天坚持，助你高分通过
        </div>
      </div>

      <!-- Timeline -->
      <div class="timeline">
        <div
          v-for="day in plan.days"
          :key="day.dayNumber"
          class="day-block"
          :class="{ 'is-last': isLastDay(day) }"
        >
          <!-- Day connector left -->
          <div class="day-connector">
            <div class="day-badge" :class="{ 'badge-last': isLastDay(day) }">
              {{ day.dayNumber }}
            </div>
            <div class="connector-line" v-if="!isLastDay(day)" />
          </div>

          <!-- Day card -->
          <div class="day-card" :class="{ 'card-last': isLastDay(day) }">
            <div class="day-card-header">
              <div class="day-date-row">
                <span class="day-date">{{ displayMonthDay(day.date) }}</span>
                <span class="day-weekday">{{ getDayOfWeek(day.date) }}</span>
                <span v-if="knowledgeTaskCount(day) > 0" class="day-kp-count">
                  {{ knowledgeTaskCount(day) }} 个知识点
                </span>
              </div>
              <div v-if="isLastDay(day)" class="sprint-badge">考前冲刺</div>
              <div v-else class="day-num-label">第 {{ day.dayNumber }} 天</div>
            </div>

            <div class="day-tasks">
              <div
                v-for="(task, ti) in day.tasks"
                :key="ti"
                class="task-item"
                :class="[taskTypeClass(task.type), { clickable: isTaskClickable(task.type) }]"
                @click="navigateTask(task)"
              >
                <div class="task-header">
                  <span class="task-type-chip">{{ taskTypeLabel(task.type) }}</span>
                  <span class="task-name">{{ task.name }}</span>
                  <!-- Importance dots for knowledge points -->
                  <span v-if="task.importance !== null" class="importance-dots">
                    <span
                      v-for="(_, i) in importanceDots(task.importance)"
                      :key="i"
                      class="dot"
                      :class="{ 'dot-active': true }"
                    />
                    <span
                      v-for="i in (5 - (task.importance || 0))"
                      :key="`e-${i}`"
                      class="dot dot-empty"
                    />
                  </span>
                </div>

                <!-- Mastery bar for knowledge points -->
                <div v-if="task.type === 'KNOWLEDGE_POINT'" class="mastery-row">
                  <span class="mastery-label">掌握度</span>
                  <div class="mastery-track" :class="{ 'is-untested': task.masteryScore === null }">
                    <div
                      v-if="task.masteryScore !== null"
                      class="mastery-fill"
                      :class="masteryGrade(task.masteryScore)"
                      :style="{ width: task.masteryScore + '%' }"
                    />
                  </div>
                  <span
                    class="mastery-value"
                    :class="{ 'is-untested': task.masteryScore === null }"
                  >
                    {{ task.masteryScore !== null ? task.masteryScore + '%' : '未测评' }}
                  </span>
                </div>

                <!-- Wrong count for wrong question review -->
                <div v-if="task.wrongCount !== null" class="task-meta">
                  共 <b>{{ task.wrongCount }}</b> 道错题待复习
                </div>

                <!-- Key memory names -->
                <div v-if="task.knowledgePointNames && task.knowledgePointNames.length > 0" class="km-names">
                  <span
                    v-for="(n, ni) in task.knowledgePointNames"
                    :key="ni"
                    class="km-tag"
                  >{{ n }}</span>
                </div>
              </div>

              <div v-if="day.tasks.length === 0" class="no-tasks">
                今日休息，调整状态
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.plan-page {
  max-width: 860px;
}

// ── Header ──────────────────────────────
.page-header {
  margin-bottom: 24px;

  h1 {
    font-family: $font-display;
    font-size: 22px;
    font-weight: 700;
    color: $ink;
    margin-bottom: 4px;
    letter-spacing: 1px;
  }

  .sub {
    font-size: 13px;
    color: $ink-muted;
  }
}

// ── Generate Card ────────────────────────
.gen-card {
  background: $surface;
  border: 1px solid $stone;
  border-radius: $radius-lg;
  padding: 24px 28px 20px;
  margin-bottom: 24px;
  box-shadow: $shadow-card;
}

.gen-fields {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: $ink-muted;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.field-sep {
  color: $stone;
  font-size: 18px;
  padding-bottom: 8px;
  align-self: flex-end;
}

.gen-btn {
  align-self: flex-end;
  min-width: 110px;
  font-weight: 600;
  letter-spacing: 1px;
}

.gen-hint {
  margin-top: 14px;
  font-size: 12px;
  color: $ink-muted;
  padding-left: 2px;
}

// ── Pre-empty state ──────────────────────
.pre-empty {
  background: $surface;
  border: 1px dashed $stone;
  border-radius: $radius-lg;
  padding: 60px 40px;
  text-align: center;
}

.pre-empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.pre-empty-title {
  font-size: 15px;
  font-weight: 500;
  color: $ink-light;
}

.pre-empty-sub {
  font-size: 13px;
  color: $ink-muted;
}

// ── Plan Banner ──────────────────────────
.plan-banner {
  background: linear-gradient(135deg, $celadon-pale 0%, lighten($celadon-pale, 2%) 100%);
  border: 1px solid lighten($celadon, 28%);
  border-left: 4px solid $celadon;
  border-radius: $radius-md;
  padding: 16px 20px;
  margin-bottom: 28px;
}

.banner-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.banner-course {
  font-weight: 700;
  font-size: 15px;
  color: $celadon-deep;
  font-family: $font-display;
}

.banner-sep {
  color: lighten($celadon, 18%);
}

.banner-label {
  font-size: 14px;
  color: $ink-light;

  b {
    color: $celadon-deep;
    font-weight: 700;
  }
}

.banner-exam {
  font-size: 14px;
  color: $ink-light;
}

.banner-meta {
  font-size: 12px;
  color: $ink-muted;
}

// ── Timeline ────────────────────────────
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.day-block {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  position: relative;

  &.is-last .day-card {
    border-color: lighten($cinnabar, 24%);
  }
}

// Left connector
.day-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 36px;
}

.day-badge {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: $celadon;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba($celadon, 0.3);
  flex-shrink: 0;
  z-index: 1;
  transition: transform 0.2s;

  &.badge-last {
    background: $cinnabar;
    box-shadow: 0 2px 8px rgba($cinnabar, 0.35);
  }
}

.day-block:hover .day-badge {
  transform: scale(1.08);
}

.connector-line {
  width: 2px;
  flex: 1;
  min-height: 20px;
  background: linear-gradient($stone, $stone);
  margin-top: 4px;
  margin-bottom: 4px;
}

// Day card
.day-card {
  flex: 1;
  background: $surface;
  border: 1px solid $stone;
  border-radius: $radius-md;
  margin-bottom: 12px;
  overflow: hidden;
  box-shadow: $shadow-card;
  transition: box-shadow 0.2s, transform 0.2s;

  &:hover {
    box-shadow: $shadow-raised;
    transform: translateY(-1px);
  }

  &.card-last {
    border-color: lighten($cinnabar, 22%);
    background: lighten($cinnabar-pale, 2%);
  }
}

.day-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid $stone;
  background: $paper;

  .card-last & {
    background: lighten($cinnabar-pale, 3%);
    border-bottom-color: lighten($cinnabar, 26%);
  }
}

.day-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.day-date {
  font-size: 14px;
  font-weight: 600;
  color: $ink;
  font-family: $font-display;
}

.day-weekday {
  font-size: 12px;
  color: $ink-muted;
  background: $paper-dark;
  padding: 1px 6px;
  border-radius: $radius-sm;
}

.day-kp-count {
  font-size: 11px;
  color: $celadon;
  background: $celadon-pale;
  padding: 1px 7px;
  border-radius: $radius-sm;
  font-weight: 500;
}

.sprint-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: $cinnabar;
  background: $cinnabar-pale;
  border: 1px solid lighten($cinnabar, 22%);
  padding: 2px 10px;
  border-radius: 20px;
}

.day-num-label {
  font-size: 12px;
  color: $ink-muted;
}

// Tasks
.day-tasks {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.no-tasks {
  font-size: 13px;
  color: $ink-muted;
  text-align: center;
  padding: 8px 0;
  font-style: italic;
}

.task-item {
  padding: 10px 12px;
  border-radius: $radius-sm;
  border-left: 3px solid transparent;

  &.clickable {
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;

    &:hover {
      transform: translateX(2px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
  }

  &.task-kp {
    background: $celadon-pale;
    border-left-color: $celadon;
  }

  &.task-wq {
    background: $cinnabar-pale;
    border-left-color: $cinnabar;
  }

  &.task-km {
    background: lighten(#f5eddb, 3%);
    border-left-color: $gold;
  }
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.task-type-chip {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 2px 7px;
  border-radius: 10px;
  flex-shrink: 0;

  .task-kp & {
    background: rgba($celadon, 0.15);
    color: $celadon-deep;
  }

  .task-wq & {
    background: rgba($cinnabar, 0.12);
    color: darken($cinnabar, 5%);
  }

  .task-km & {
    background: rgba($gold, 0.15);
    color: darken($gold, 15%);
  }
}

.task-name {
  font-size: 13px;
  font-weight: 500;
  color: $ink;
  flex: 1;
}

.importance-dots {
  display: flex;
  gap: 3px;
  align-items: center;
  flex-shrink: 0;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: $gold;

  &.dot-empty {
    background: $stone;
  }
}

// Mastery bar
.mastery-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mastery-label {
  font-size: 11px;
  color: $ink-muted;
  width: 36px;
  flex-shrink: 0;
}

.mastery-track {
  flex: 1;
  height: 5px;
  background: rgba($stone, 1.2);
  border-radius: 3px;
  overflow: hidden;

  &.is-untested {
    background: repeating-linear-gradient(
      90deg,
      $stone 0,
      $stone 4px,
      transparent 4px,
      transparent 8px
    );
  }
}

.mastery-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease;

  &.high { background: #5b8c5a; }
  &.mid  { background: $gold; }
  &.low  { background: $cinnabar; }
}

.mastery-value {
  font-size: 11px;
  font-weight: 600;
  width: 40px;
  text-align: right;
  flex-shrink: 0;
  color: $ink-muted;

  &.is-untested {
    color: $ink-muted;
    font-weight: 500;
  }
}

// Task meta (wrong question count)
.task-meta {
  font-size: 12px;
  color: $ink-light;

  b {
    color: $cinnabar;
    font-weight: 700;
  }
}

// Key memory names
.km-names {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.km-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba($gold, 0.12);
  color: darken($gold, 18%);
  border: 1px solid rgba($gold, 0.25);
}

// Responsive
@media (max-width: 640px) {
  .gen-fields {
    flex-direction: column;
    align-items: stretch;
  }

  .field-sep { display: none; }

  .gen-btn { width: 100%; }

  .day-block { gap: 12px; }
}
</style>
