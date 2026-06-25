<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as examApi from '@/api/exam'
import * as courseApi from '@/api/course'
import type { CourseResponse, ExamRecordDetailResponse, ExamSessionResponse } from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import { formatChoiceAnswer, parseQuestionContent } from '@/utils/questionContent'
import { useGradingPoll } from '@/composables/useGradingPoll'
import { calcAccuracy } from '@/utils/accuracy'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const loadError = ref(false)
const session = ref<ExamSessionResponse | null>(null)
const courseName = ref('')
const { polling: gradingPolling, start: startGradingPoll, stop: stopGradingPoll } = useGradingPoll()

const sessionAccuracy = computed(() => {
  if (!session.value) return null
  return calcAccuracy(session.value)
})

const accuracyPercent = computed(() => sessionAccuracy.value?.percent ?? 0)

const courseId = computed(() => {
  const id = Number(route.query.courseId)
  return Number.isNaN(id) ? null : id
})

const submitTime = computed(() => {
  const value = route.query.submitTime
  return typeof value === 'string' ? value : ''
})

function typeLabel(t: string) {
  return { CHOICE: '选择题', FILL_BLANK: '填空题', TRUE_FALSE: '判断题', SHORT_ANSWER: '简答题' }[t] || t
}

function formatDate(s: string) {
  return s ? s.replace('T', ' ').substring(0, 16) : ''
}

function scoreLabel(score: number | null) {
  if (score === null) return '待批改'
  return `${score} 分`
}

function scoreClass(score: number | null) {
  if (score === null) return 'pending'
  if (score >= 60) return 'green'
  if (score > 0) return 'orange'
  return 'red'
}

function itemClass(record: ExamRecordDetailResponse) {
  if (record.score === null) return 'pending'
  return record.score >= 60 ? 'correct' : 'wrong'
}

async function fetchSession() {
  if (!courseId.value || !submitTime.value) {
    session.value = null
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = false
  try {
    const [data, courses] = await Promise.all([
      examApi.getSession({ courseId: courseId.value, submitTime: submitTime.value }),
      courseApi.listCourses().catch(() => [] as CourseResponse[]),
    ])
    session.value = data
    courseName.value = courses.find((c) => c.id === courseId.value)?.courseName || ''

    if (data.ungradedCount > 0) {
      startGradingPoll({
        courseId: courseId.value,
        submitTime: submitTime.value,
        onUpdate: (updated) => {
          const prevUngraded = session.value?.ungradedCount ?? 0
          session.value = updated
          if (prevUngraded > 0 && updated.ungradedCount === 0) {
            ElMessage.success('主观题批改完成')
          }
        },
      })
    } else {
      stopGradingPoll()
    }
  } catch {
    session.value = null
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(fetchSession)
</script>

<template>
  <div class="session-page">
    <div class="page-header">
      <div>
        <a class="back-link" @click="router.push('/exam/history')">← 返回考试历史</a>
        <h1>答题详情</h1>
        <p v-if="session" class="sub">
          {{ courseName || `课程 #${session.courseId}` }} · {{ formatDate(session.submitTime) }}
        </p>
      </div>
    </div>

    <EmptyBlock
      v-if="!courseId || !submitTime"
      icon="inbox"
      title="参数无效"
      description="缺少课程或考试时间信息"
    >
      <el-button @click="router.push('/exam/history')">返回列表</el-button>
    </EmptyBlock>

    <LoadingBlock v-else-if="loading" text="加载答题详情..." />

    <EmptyBlock
      v-else-if="loadError"
      icon="inbox"
      title="加载失败"
      description="无法获取答题详情，请检查网络后重试"
    >
      <el-button type="primary" @click="fetchSession">重试</el-button>
    </EmptyBlock>

    <EmptyBlock
      v-else-if="!session"
      icon="inbox"
      title="记录不存在"
      description="未找到对应的考试记录"
    >
      <el-button @click="router.push('/exam/history')">返回列表</el-button>
    </EmptyBlock>

    <template v-else>
      <div v-if="gradingPolling" class="grading-hint">主观题 AI 批改中，结果将自动更新...</div>
      <div class="result-banner">
        <div class="result-ring">
          <svg viewBox="0 0 100 100" width="100" height="100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#eee" stroke-width="8" />
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              stroke="#07c160"
              stroke-width="8"
              stroke-linecap="round"
              :stroke-dasharray="`${accuracyPercent * 2.76} 276`"
              transform="rotate(-90 50 50)"
            />
            <text x="50" y="46" text-anchor="middle" font-size="20" font-weight="700" fill="#333">
              {{ accuracyPercent }}%
            </text>
              <text x="50" y="64" text-anchor="middle" font-size="10" fill="#999">正确率</text>
            </svg>
            <p v-if="sessionAccuracy" class="accuracy-meta">{{ sessionAccuracy.label }}</p>
          </div>
        <div class="result-stats">
          <div class="r-stat">
            <span class="r-num green">{{ session.totalCount }}</span>
            <span class="r-label">总题数</span>
          </div>
          <div class="r-stat">
            <span class="r-num green">{{ session.correctCount }}</span>
            <span class="r-label">正确</span>
          </div>
          <div class="r-stat">
            <span class="r-num red">{{ session.wrongCount }}</span>
            <span class="r-label">错误</span>
          </div>
          <div v-if="session.ungradedCount > 0" class="r-stat">
            <span class="r-num orange">{{ session.ungradedCount }}</span>
            <span class="r-label">待批改</span>
          </div>
        </div>
      </div>

      <div class="result-list">
        <div
          v-for="(record, idx) in session.records"
          :key="record.id"
          class="result-item"
          :class="itemClass(record)"
        >
          <div class="ri-header">
            <span class="ri-idx">#{{ idx + 1 }}</span>
            <span class="ri-type">{{ typeLabel(record.questionType) }}</span>
            <span v-if="record.knowledgePointName" class="ri-kp">{{ record.knowledgePointName }}</span>
            <span class="ri-score" :class="scoreClass(record.score)">
              {{ scoreLabel(record.score) }}
            </span>
          </div>

          <div v-if="record.questionContent" class="ri-question">
            <div class="ri-stem">{{ parseQuestionContent(record.questionContent).stem }}</div>
            <div
              v-if="parseQuestionContent(record.questionContent).options"
              class="ri-options"
            >
              <div
                v-for="(optText, optKey) in parseQuestionContent(record.questionContent).options!"
                :key="optKey"
                class="ri-opt"
              >
                <b>{{ optKey }}.</b> {{ optText }}
              </div>
            </div>
          </div>

          <div class="ri-row">
            <span class="ri-label">你的答案：</span>
            <span class="ri-val">
              {{ formatChoiceAnswer(
                record.userAnswer,
                record.questionType,
                parseQuestionContent(record.questionContent).options,
              ) }}
            </span>
          </div>
          <div class="ri-row">
            <span class="ri-label">正确答案：</span>
            <span class="ri-val green">
              {{ formatChoiceAnswer(
                record.correctAnswer,
                record.questionType,
                parseQuestionContent(record.questionContent).options,
              ) }}
            </span>
          </div>

          <div v-if="record.feedback" class="ri-feedback">
            <div v-if="record.feedback.missingPoints?.length" class="feedback-block">
              <div class="feedback-title">遗漏要点</div>
              <ul>
                <li v-for="(point, i) in record.feedback.missingPoints" :key="i">{{ point }}</li>
              </ul>
            </div>
            <div v-if="record.feedback.suggestions?.length" class="feedback-block">
              <div class="feedback-title">改进建议</div>
              <ul>
                <li v-for="(tip, i) in record.feedback.suggestions" :key="i">{{ tip }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.session-page { max-width: 860px; }

.grading-hint {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #fff7ed;
  color: #b45309;
  font-size: 13px;
  text-align: center;
}

.page-header {
  margin-bottom: 20px;

  .back-link {
    display: inline-block;
    font-size: 13px;
    color: $celadon;
    cursor: pointer;
    margin-bottom: 8px;
    &:hover { text-decoration: underline; }
  }

  h1 {
    font-family: $font-display;
    font-size: 22px;
    font-weight: 700;
    color: $ink;
    margin-bottom: 4px;
  }

  .sub { font-size: 13px; color: $ink-muted; }
}

.result-banner {
  display: flex;
  align-items: center;
  gap: 40px;
  background: $surface;
  padding: 32px 40px;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  margin-bottom: 20px;
}

.result-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.accuracy-meta {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
  text-align: center;
}

.result-stats {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}

.r-stat {
  text-align: center;
  .r-num {
    display: block;
    font-size: 28px;
    font-weight: 700;
    &.green { color: #07c160; }
    &.red { color: #e74c3c; }
    &.orange { color: #f59e0b; }
  }
  .r-label { font-size: 12px; color: #999; }
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 32px;
}

.result-item {
  background: $surface;
  padding: 18px 20px;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  border-left: 4px solid $stone;

  &.correct { border-left-color: $celadon; }
  &.wrong { border-left-color: $cinnabar; }
  &.pending { border-left-color: #f59e0b; }
}

.ri-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.ri-idx { font-weight: 600; color: #333; }
.ri-type { font-size: 12px; color: #999; }
.ri-kp {
  font-size: 12px;
  color: $celadon;
  background: $celadon-pale;
  padding: 2px 8px;
  border-radius: 4px;
}

.ri-score {
  margin-left: auto;
  font-weight: 600;
  font-size: 15px;
  &.green { color: #07c160; }
  &.red { color: #e74c3c; }
  &.orange { color: #f59e0b; }
  &.pending { color: #999; }
}

.ri-question {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.ri-stem {
  font-size: 15px;
  color: #333;
  line-height: 1.7;
  word-break: break-word;
}

.ri-options {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ri-opt {
  font-size: 13px;
  color: #555;
}

.ri-row {
  display: flex;
  gap: 8px;
  font-size: 14px;
  margin-top: 6px;
  .ri-label { color: #999; flex-shrink: 0; }
  .ri-val {
    color: #333;
    word-break: break-word;
    &.green { color: #07c160; }
  }
}

.ri-feedback {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #eee;
}

.feedback-block {
  margin-top: 8px;
  .feedback-title {
    font-size: 13px;
    font-weight: 600;
    color: #555;
    margin-bottom: 6px;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    li {
      font-size: 13px;
      color: #666;
      line-height: 1.6;
      margin-bottom: 4px;
    }
  }
}
</style>
