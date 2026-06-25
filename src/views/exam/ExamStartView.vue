<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as examApi from '@/api/exam'
import * as kpApi from '@/api/knowledgePoint'
import type {
  KnowledgeTreeResponse, KnowledgePointResponse,
  ExamQuestionItem, AnswerItem, ExamSessionResponse,
} from '@/types'
import { AppIcon } from '@/components/icons'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import { optionKeys, parseQuestionContent } from '@/utils/questionContent'
import { useGradingPoll } from '@/composables/useGradingPoll'
import { useCourseScope } from '@/composables/useCourseScope'
import { calcAccuracy } from '@/utils/accuracy'

const router = useRouter()
const { courses, selectedCourseId, ensureCourses } = useCourseScope()

// --- setup ---
const stage = ref<'setup' | 'exam'>('setup')
const loadError = ref(false)
const kpTree = ref<KnowledgeTreeResponse | null>(null)
const allKps = computed<KnowledgePointResponse[]>(() =>
  kpTree.value ? kpTree.value.chapters.flatMap((ch) => ch.knowledgePoints) : [],
)
const selectedKpIds = ref<number[]>([])
const starting = ref(false)

// --- exam ---
const questions = ref<ExamQuestionItem[]>([])
const answers = reactive<Record<number, string>>({})
const submitted = ref(false)
const result = ref<any>(null)
const submitting = ref(false)
const { polling: gradingPolling, start: startGradingPoll, stop: stopGradingPoll } = useGradingPoll()

function sessionToResult(session: ExamSessionResponse) {
  return {
    submitTime: session.submitTime,
    totalCount: session.totalCount,
    correctCount: session.correctCount,
    wrongCount: session.wrongCount,
    ungradedCount: session.ungradedCount,
    records: session.records.map((r) => ({
      questionId: r.questionId,
      questionType: r.questionType,
      score: r.score,
      userAnswer: r.userAnswer,
      correctAnswer: r.correctAnswer,
    })),
  }
}

function applySessionUpdate(session: ExamSessionResponse) {
  const prevUngraded = result.value?.ungradedCount ?? 0
  result.value = sessionToResult(session)
  if (prevUngraded > 0 && session.ungradedCount === 0) {
    setTimeout(() => animateRing(scorePercent.value), 50)
    ElMessage.success('主观题批改完成')
  }
}

async function fetchKpTree() {
  if (!selectedCourseId.value) { kpTree.value = null; return }
  try {
    kpTree.value = await kpApi.getTree(selectedCourseId.value)
  } catch {
    kpTree.value = null
  }
}

async function initPage() {
  loadError.value = false
  try {
    await ensureCourses()
    if (selectedCourseId.value) {
      await fetchKpTree()
    }
  } catch {
    loadError.value = true
  }
}

function onCourseChange() {
  selectedKpIds.value = []
  fetchKpTree()
}

async function handleStart() {
  if (!selectedCourseId.value) { ElMessage.warning('请选择课程'); return }
  starting.value = true
  try {
    const res = await examApi.startExam({
      courseId: selectedCourseId.value,
      knowledgePointIds: selectedKpIds.value.length > 0 ? selectedKpIds.value : undefined,
    })
    if (res.questions.length === 0) {
      ElMessage.warning('该范围暂无题目，请先上传文档并生成题目')
      return
    }
    questions.value = sortByType(res.questions)
    // init empty answers
    res.questions.forEach((q) => { answers[q.id] = '' })
    stage.value = 'exam'
  } catch { /* */ }
  finally { starting.value = false }
}

async function handleSubmit() {
  // check all answered
  const unanswered = questions.value.filter((q) => !answers[q.id]?.trim())
  if (unanswered.length > 0) {
    try {
      await ElMessageBox.confirm(
        `还有 ${unanswered.length} 道题未作答，确定提交吗？`,
        '确认提交',
        { type: 'warning', confirmButtonText: '确定提交', cancelButtonText: '继续作答' },
      )
    } catch { return }
  }

  if (!selectedCourseId.value) return
  submitting.value = true
  try {
    const answerList: AnswerItem[] = questions.value.map((q) => ({
      questionId: q.id,
      userAnswer: answers[q.id]?.trim() || '',
    }))
    result.value = await examApi.submitExam({
      courseId: selectedCourseId.value,
      answers: answerList,
    })
    result.value.records = sortByType(result.value.records)
    submitted.value = true
    setTimeout(() => animateRing(scorePercent.value), 50)

    if (result.value.ungradedCount > 0 && result.value.submitTime && selectedCourseId.value) {
      startGradingPoll({
        courseId: selectedCourseId.value,
        submitTime: result.value.submitTime,
        onUpdate: applySessionUpdate,
      })
    }
  } catch { /* */ }
  finally { submitting.value = false }
}

function goToHistory() {
  if (!selectedCourseId.value) {
    router.push('/exam/history')
    return
  }
  if (result.value?.submitTime) {
    router.push({
      path: '/exam/history/session',
      query: {
        courseId: String(selectedCourseId.value),
        submitTime: result.value.submitTime,
      },
    })
    return
  }
  router.push({
    path: '/exam/history',
    query: { courseId: String(selectedCourseId.value) },
  })
}

function handleBack() {
  stopGradingPoll()
  sessionStorage.removeItem('practiceExam')
  stage.value = 'setup'
  questions.value = []
  submitted.value = false
  result.value = null
  Object.keys(answers).forEach((k) => delete answers[Number(k)])
}

// --- question helpers ---
const typeOrder: Record<string, number> = {
  CHOICE: 1, FILL_BLANK: 2, TRUE_FALSE: 3, SHORT_ANSWER: 4,
}
function sortByType<T extends { questionType: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (typeOrder[a.questionType] || 99) - (typeOrder[b.questionType] || 99))
}

function typeLabel(t: string) {
  return { CHOICE: '选择题', FILL_BLANK: '填空题', TRUE_FALSE: '判断题', SHORT_ANSWER: '简答题' }[t] || t
}

function parseChoiceContent(raw: string): { stem: string; options: Record<string, string> } {
  const parsed = parseQuestionContent(raw)
  return {
    stem: parsed.stem,
    options: parsed.options ?? {},
  }
}

function getKpName(kpId: number): string {
  const kp = allKps.value.find((k) => k.id === kpId)
  return kp ? `${kp.chapter} › ${kp.name}` : `知识点 #${kpId}`
}

const scorePercent = computed(() => {
  if (!result.value) return 0
  const acc = calcAccuracy(result.value)
  return acc.percent ?? 0
})

const resultAccuracy = computed(() => {
  if (!result.value) return null
  return calcAccuracy(result.value)
})

function resultScoreLabel(score: number | null) {
  if (score === null) return '待批改'
  return `${score} 分`
}

function resultScoreClass(score: number | null) {
  if (score === null) return 'pending'
  if (score >= 60) return 'green'
  if (score > 0) return 'orange'
  return 'red'
}

function resultItemClass(score: number | null) {
  if (score === null) return 'pending'
  return score >= 60 ? 'correct' : 'wrong'
}

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
    // ease-out
    const eased = 1 - Math.pow(1 - progress, 3)
    animatedPercent.value = Math.round(start + (target - start) * eased)
    if (progress < 1) {
      animFrame = requestAnimationFrame(step)
    }
  }
  animFrame = requestAnimationFrame(step)
}

function checkPracticeExam() {
  const raw = sessionStorage.getItem('practiceExam')
  if (!raw) return false
  try {
    const data = JSON.parse(raw)
    if (data.questions?.length > 0) {
      selectedCourseId.value = data.courseId
      questions.value = sortByType(data.questions)
      data.questions.forEach((q: any) => { answers[q.id] = '' })
      stage.value = 'exam'
      return true
    }
  } catch { /* */ }
  return false
}

onMounted(async () => {
  await initPage()
  checkPracticeExam()
})

watch(selectedCourseId, (id, prev) => {
  if (id !== prev && stage.value === 'setup') {
    onCourseChange()
  }
})
</script>

<template>
  <div class="exam-page">
    <div class="page-header">
      <h1>{{ stage === 'setup' ? '开始考试' : '考试中' }}</h1>
      <p class="sub" v-if="stage === 'setup'">选择课程和知识点范围，开始智能测评</p>
    </div>

    <!-- ====== SETUP ====== -->
    <template v-if="stage === 'setup'">
      <EmptyBlock
        v-if="loadError"
        icon="inbox"
        title="加载失败"
        description="无法获取课程列表，请检查网络后重试"
      >
        <el-button type="primary" @click="initPage">重试</el-button>
      </EmptyBlock>

      <div v-else class="setup-card">
        <div class="setup-row">
          <label class="setup-label">选择课程</label>
          <el-select
            v-model="selectedCourseId"
            placeholder="请选择课程"
            size="large"
            style="width: 360px"
            @change="onCourseChange"
          >
            <el-option v-for="c in courses" :key="c.id" :label="c.courseName" :value="c.id" />
          </el-select>
        </div>

        <div class="setup-row">
          <label class="setup-label">
            知识点范围
            <span class="opt">（可选，不选则全课程出题）</span>
          </label>
          <el-select
            v-model="selectedKpIds"
            multiple
            placeholder="选择知识点（可多选，留空=全部）"
            size="large"
            style="width: 560px"
            :disabled="!selectedCourseId"
          >
            <el-option
              v-for="kp in allKps"
              :key="kp.id"
              :label="`${kp.chapter} › ${kp.name}`"
              :value="kp.id"
            />
          </el-select>
        </div>

        <el-button
          type="primary"
          size="large"
          :loading="starting"
          :disabled="!selectedCourseId"
          @click="handleStart"
        >
          {{ starting ? '正在获取题目...' : '🚀 开始考试' }}
        </el-button>
      </div>
    </template>

    <!-- ====== EXAM ====== -->
    <template v-if="stage === 'exam'">
      <!-- Result (after submit) -->
      <template v-if="submitted && result">
        <div class="result-banner">
          <div v-if="gradingPolling" class="grading-hint">主观题 AI 批改中，结果将自动更新...</div>
          <div class="result-ring">
            <svg viewBox="0 0 100 100" width="100" height="100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="#eee" stroke-width="8" />
              <circle
                cx="50" cy="50" r="44"
                fill="none"
                stroke="#07c160"
                stroke-width="8"
                stroke-linecap="round"
                :stroke-dasharray="`${animatedPercent * 2.76} 276`"
                transform="rotate(-90 50 50)"
              />
              <text x="50" y="46" text-anchor="middle" font-size="20" font-weight="700" fill="#333">
                {{ animatedPercent }}%
              </text>
              <text x="50" y="64" text-anchor="middle" font-size="10" fill="#999">正确率</text>
            </svg>
            <p v-if="resultAccuracy" class="accuracy-meta">{{ resultAccuracy.label }}</p>
          </div>
          <div class="result-stats">
            <div class="r-stat">
              <span class="r-num green">{{ result.totalCount }}</span>
              <span class="r-label">总题数</span>
            </div>
            <div class="r-stat">
              <span class="r-num green">{{ result.correctCount }}</span>
              <span class="r-label">正确</span>
            </div>
            <div class="r-stat">
              <span class="r-num red">{{ result.wrongCount }}</span>
              <span class="r-label">错误</span>
            </div>
            <div class="r-stat" v-if="result.ungradedCount > 0">
              <span class="r-num orange">{{ result.ungradedCount }}</span>
              <span class="r-label">待批改</span>
            </div>
          </div>
        </div>

        <!-- Per-question results -->
        <div class="result-list">
          <div
            v-for="(r, idx) in result.records"
            :key="r.questionId"
            class="result-item"
            :class="resultItemClass(r.score)"
          >
            <div class="ri-header">
              <span class="ri-idx">#{{ idx + 1 }}</span>
              <span class="ri-type">{{ typeLabel(r.questionType) }}</span>
              <span
                class="ri-score"
                :class="resultScoreClass(r.score)"
              >
                {{ resultScoreLabel(r.score) }}
              </span>
            </div>
            <div class="ri-row">
              <span class="ri-label">你的答案：</span>
              <span class="ri-val">{{ r.userAnswer || '(未作答)' }}</span>
            </div>
            <div class="ri-row">
              <span class="ri-label">正确答案：</span>
              <span class="ri-val green">{{ r.correctAnswer }}</span>
            </div>
          </div>
        </div>

        <div class="result-actions">
          <el-button size="large" @click="handleBack">返回重考</el-button>
          <el-button size="large" @click="goToHistory">
            查看历史
          </el-button>
          <el-button size="large" type="primary" @click="router.push('/dashboard')">
            返回首页
          </el-button>
        </div>
      </template>

      <!-- Questions (before submit) -->
      <template v-else>
        <div class="exam-header">
          <span>共 {{ questions.length }} 道题</span>
          <el-button @click="handleBack" text>← 返回</el-button>
        </div>

        <div class="question-list">
          <div
            v-for="(q, idx) in questions"
            :key="q.id"
            class="question-card"
          >
            <div class="q-header">
              <span class="q-num">{{ idx + 1 }}</span>
              <span class="q-type-badge" :class="q.questionType.toLowerCase()">
                {{ typeLabel(q.questionType) }}
              </span>
              <span class="q-kp">{{ getKpName(q.knowledgePointId) }}</span>
            </div>

            <!-- CHOICE -->
            <template v-if="q.questionType === 'CHOICE'">
              <div class="q-stem">{{ parseChoiceContent(q.content).stem }}</div>
              <el-radio-group
                v-model="answers[q.id]"
                class="choice-group"
              >
                <el-radio
                  v-for="key in optionKeys(parseChoiceContent(q.content).options)"
                  :key="key"
                  :value="key"
                  size="large"
                  class="choice-option"
                >
                  <span class="opt-key">{{ key }}.</span>
                  {{ parseChoiceContent(q.content).options[key] }}
                </el-radio>
              </el-radio-group>
            </template>

            <!-- TRUE_FALSE -->
            <template v-else-if="q.questionType === 'TRUE_FALSE'">
              <div class="q-stem">{{ parseChoiceContent(q.content).stem || q.content }}</div>
              <el-radio-group v-model="answers[q.id]" class="tf-group">
                <el-radio value="正确" size="large">✅ 正确</el-radio>
                <el-radio value="错误" size="large">❌ 错误</el-radio>
              </el-radio-group>
            </template>

            <!-- FILL_BLANK -->
            <template v-else-if="q.questionType === 'FILL_BLANK'">
              <div class="q-stem">{{ q.content }}</div>
              <el-input
                v-model="answers[q.id]"
                placeholder="请输入答案"
                size="large"
                style="max-width: 500px"
              />
            </template>

            <!-- SHORT_ANSWER -->
            <template v-else-if="q.questionType === 'SHORT_ANSWER'">
              <div class="q-stem">{{ q.content }}</div>
              <el-input
                v-model="answers[q.id]"
                type="textarea"
                :rows="4"
                placeholder="请输入你的回答..."
                style="max-width: 700px"
              />
            </template>
          </div>
        </div>

        <div class="submit-bar">
          <el-button
            type="primary"
            size="large"
            :loading="submitting"
            @click="handleSubmit"
          >
            {{ submitting ? '提交中...' : '提交答卷' }}
          </el-button>
        </div>
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.exam-page { max-width: 800px; }

.page-header {
  margin-bottom: 24px;
  h1 { font-family: $font-display; font-size: 22px; font-weight: 700; color: $ink; margin-bottom: 4px; letter-spacing: 1px; }
  .sub { font-size: 13px; color: $ink-muted; }
}

/* setup */
.setup-card {
  background: $surface;
  padding: 32px;
  border-radius: $radius-lg;
  border: 1px solid $stone;
}

.setup-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.setup-label {
  font-size: 14px;
  font-weight: 500;
  color: $ink;
  width: 120px;
  flex-shrink: 0;
  .opt { font-weight: 400; color: $ink-muted; font-size: 12px; }
}

/* exam header */
.exam-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 14px;
  color: #666;
}

/* question */
.question-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.question-card {
  background: $surface;
  padding: 20px 24px;
  border-radius: $radius-lg;
  border: 1px solid $stone;
}

.q-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.q-num {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  background: #07c160;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.q-type-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  &.choice { color: #1677ff; background: #e6f0ff; }
  &.fill_blank { color: $gold; background: #fef8ee; }
  &.true_false { color: $celadon; background: $celadon-pale; }
  &.short_answer { color: #8b5cf6; background: #f3f0ff; }
}

.q-kp {
  font-size: 12px;
  color: #bbb;
  margin-left: auto;
}

.q-stem {
  font-size: 15px;
  color: #333;
  line-height: 1.7;
  margin-bottom: 14px;
  word-break: break-word;
  overflow-wrap: break-word;
}

.choice-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}

.choice-option {
  margin-right: 0 !important;
  padding: 12px 16px;
  border: 1px solid $stone;
  border-radius: 8px;
  transition: all 0.2s;
  align-items: flex-start !important;

  &:hover {
    border-color: $celadon;
    background: $celadon-pale;
  }

  :deep(.el-radio__label) {
    display: flex;
    align-items: baseline;
    gap: 4px;
    white-space: normal;
    line-height: 1.6;
  }

  .opt-key {
    font-weight: 700;
    color: $celadon;
    flex-shrink: 0;
  }
}

.tf-group {
  display: flex;
  gap: 16px;
}

/* submit */
.submit-bar {
  margin-top: 24px;
  text-align: center;
  padding-bottom: 48px;
}

/* result */
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

.result-stats {
  display: flex;
  gap: 32px;
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

.grading-hint {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #fff7ed;
  color: #b45309;
  font-size: 13px;
  text-align: center;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}

.result-item {
  background: $surface;
  padding: 16px 20px;
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
  margin-bottom: 8px;
}
.ri-idx { font-weight: 600; color: #333; }
.ri-type { font-size: 12px; color: #999; }
.ri-score {
  margin-left: auto;
  font-weight: 600;
  font-size: 15px;
  &.green { color: #07c160; }
  &.red { color: #e74c3c; }
  &.orange { color: #f59e0b; }
  &.pending { color: #f59e0b; }
}

.ri-row {
  font-size: 13px;
  margin-top: 4px;
}
.ri-label { color: #999; }
.ri-val { color: #333; }
.ri-val.green { color: #07c160; font-weight: 500; }

.result-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-bottom: 32px;
}
</style>
