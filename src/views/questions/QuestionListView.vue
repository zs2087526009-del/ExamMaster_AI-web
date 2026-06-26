<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import * as questionApi from '@/api/question'
import * as kpApi from '@/api/knowledgePoint'
import type {
  QuestionResponse, KnowledgePointResponse,
  KnowledgeTreeResponse, QuestionConfig,
} from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import { AppIcon } from '@/components/icons'
import { formatChoiceAnswer, parseQuestionContent } from '@/utils/questionContent'
import { useCourseScope } from '@/composables/useCourseScope'

const { courses, selectedCourseId, ensureCourses } = useCourseScope()

// --- course & KP filter ---
const loadError = ref(false)
const kpTree = ref<KnowledgeTreeResponse | null>(null)
const allKps = computed<KnowledgePointResponse[]>(() => {
  if (!kpTree.value) return []
  return kpTree.value.chapters.flatMap((ch) => ch.knowledgePoints)
})
const selectedKpId = ref<number | null>(null)

// --- question list ---
const questions = ref<QuestionResponse[]>([])
const loading = ref(false)
const expandedAnswer = ref<Record<number, boolean>>({})

async function fetchKpTree() {
  if (!selectedCourseId.value) { kpTree.value = null; return }
  try {
    kpTree.value = await kpApi.getTree(selectedCourseId.value)
  } catch { kpTree.value = null }
}

async function fetchQuestions() {
  if (!selectedCourseId.value) { questions.value = []; return }
  loading.value = true
  loadError.value = false
  try {
    if (selectedKpId.value) {
      questions.value = sortByType(await questionApi.listByKnowledgePoint(selectedKpId.value))
    } else {
      if (!kpTree.value) {
        await fetchKpTree()
      }
      questions.value = sortByType(await questionApi.listByCourse(selectedCourseId.value))
    }
  } catch {
    questions.value = []
    loadError.value = true
  } finally { loading.value = false }
}

const canBatchDelete = computed(() => !!selectedKpId.value && questions.value.length > 0)

async function onCourseChange() {
  selectedKpId.value = null
  kpTree.value = null
  questions.value = []
  await fetchKpTree()
  fetchQuestions()
}

function onKpChange() {
  expandedAnswer.value = {}
  fetchQuestions()
}

function toggleAnswer(id: number) {
  expandedAnswer.value[id] = !expandedAnswer.value[id]
}

// --- generate dialog ---
const genVisible = ref(false)
const genFormRef = ref<FormInstance>()
const generating = ref(false)
const genProgress = ref(0)
let genProgressTimer: ReturnType<typeof setInterval> | null = null

const genForm = reactive({
  knowledgePointIds: [] as number[],
})

const genConfig = reactive<QuestionConfig>({
  choiceCount: 5,
  fillBlankCount: 3,
  trueFalseCount: 3,
  shortAnswerCount: 2,
})

const genRules: FormRules = {
  knowledgePointIds: [
    { type: 'array', required: true, min: 1, message: '请至少选择一个知识点', trigger: 'change' },
  ],
}

function startGenProgress() {
  stopGenProgress()
  genProgress.value = 0
  genProgressTimer = setInterval(() => {
    genProgress.value = Math.min(genProgress.value + 1, 92)
  }, 2500)
}

function stopGenProgress() {
  if (genProgressTimer) {
    clearInterval(genProgressTimer)
    genProgressTimer = null
  }
}

async function openGenerate() {
  if (!selectedCourseId.value) {
    ElMessage.warning('请先选择课程')
    return
  }
  if (!kpTree.value) {
    await fetchKpTree()
  }
  if (allKps.value.length === 0) {
    ElMessage.warning('该课程暂无知识点，请先上传文档提取知识点')
    return
  }
  genForm.knowledgePointIds = selectedKpId.value ? [selectedKpId.value] : []
  genProgress.value = 0
  genVisible.value = true
}

async function handleGenerate() {
  const valid = await genFormRef.value?.validate().catch(() => false)
  if (!valid) return

  const totalCount =
    (genConfig.choiceCount || 0) +
    (genConfig.fillBlankCount || 0) +
    (genConfig.trueFalseCount || 0) +
    (genConfig.shortAnswerCount || 0)
  if (totalCount < 1) {
    ElMessage.warning('题目总数至少为 1 题')
    return
  }

  generating.value = true
  startGenProgress()
  try {
    const res = await questionApi.generate({
      courseId: selectedCourseId.value!,
      knowledgePointIds: genForm.knowledgePointIds,
      config: {
        choiceCount: genConfig.choiceCount || 0,
        fillBlankCount: genConfig.fillBlankCount || 0,
        trueFalseCount: genConfig.trueFalseCount || 0,
        shortAnswerCount: genConfig.shortAnswerCount || 0,
      },
    })
    genProgress.value = 100
    ElMessage.success(
      `生成完成：成功 ${res.generatedCount} 题` +
      (res.failedCount ? `，失败 ${res.failedCount} 题` : ''),
    )
    genVisible.value = false
    await fetchQuestions()
  } catch { /* interceptor handles */ }
  finally {
    stopGenProgress()
    generating.value = false
  }
}

// --- delete ---
async function handleDeleteOne(q: QuestionResponse) {
  try {
    await ElMessageBox.confirm('确定要删除这道题目吗？', '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  try {
    await questionApi.deleteOne(q.id)
    ElMessage.success('已删除')
    fetchQuestions()
  } catch { /* */ }
}

async function handleBatchDelete() {
  if (!canBatchDelete.value || !selectedKpId.value) {
    ElMessage.warning('请先选择具体知识点后再批量删除')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定要删除当前知识点下的全部 ${questions.value.length} 道题目吗？`,
      '批量删除',
      { type: 'warning', confirmButtonText: '全部删除', cancelButtonText: '取消' },
    )
  } catch { return }
  try {
    await questionApi.batchDelete(selectedKpId.value)
    ElMessage.success('已全部删除')
    fetchQuestions()
  } catch { /* */ }
}

// --- helpers ---
function typeLabel(t: string): string {
  const map: Record<string, string> = {
    CHOICE: '选择题', FILL_BLANK: '填空题', TRUE_FALSE: '判断题', SHORT_ANSWER: '简答题',
  }
  return map[t] || t
}

function typeColor(t: string): string {
  const map: Record<string, string> = {
    CHOICE: '#1677ff', FILL_BLANK: '#d4933e', TRUE_FALSE: '#3d7a6a', SHORT_ANSWER: '#8b5cf6',
  }
  return map[t] || '#999'
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function diffLabel(d: string): string {
  const map: Record<string, string> = { EASY: '简单', MEDIUM: '中等', HARD: '困难' }
  return map[d] || d
}

function diffColor(d: string): string {
  const map: Record<string, string> = { EASY: '#5b8c5a', MEDIUM: '#d4933e', HARD: '#c44536' }
  return map[d] || '#999'
}

const typeOrder: Record<string, number> = {
  CHOICE: 1, FILL_BLANK: 2, TRUE_FALSE: 3, SHORT_ANSWER: 4,
}

function sortByType<T extends { questionType: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (typeOrder[a.questionType] || 99) - (typeOrder[b.questionType] || 99))
}

function formatDate(s: string): string {
  return s ? s.replace('T', ' ').substring(0, 16) : ''
}

onMounted(async () => {
  await ensureCourses()
  if (selectedCourseId.value) {
    await onCourseChange()
  }
})
</script>

<template>
  <div class="question-page">
    <div class="page-header">
      <h1>题目库</h1>
      <p class="sub">按知识点筛选题目，或使用 AI 生成新题目</p>
    </div>

    <!-- Filters -->
    <div class="filter-bar responsive-filters">
      <div class="filter-row">
        <el-select
          v-model="selectedCourseId"
          placeholder="选择课程"
          clearable
          size="large"
          class="filter-select"
          @change="onCourseChange"
        >
          <el-option
            v-for="c in courses" :key="c.id"
            :label="c.courseName" :value="c.id"
          />
        </el-select>

        <el-select
          v-model="selectedKpId"
          placeholder="知识点筛选（可选，不选=全部）"
          clearable
          size="large"
          class="filter-select filter-select-wide"
          :disabled="!selectedCourseId"
          @change="onKpChange"
        >
          <el-option
            v-for="kp in allKps" :key="kp.id"
            :label="`${kp.chapter} › ${kp.name}`"
            :value="kp.id"
          />
        </el-select>

        <el-button
          type="primary"
          size="large"
          :disabled="!selectedCourseId"
          @click="openGenerate"
        >
          <AppIcon name="dialogue" :size="16" class="btn-icon" />
          AI 生成题目
        </el-button>

        <el-button
          v-if="canBatchDelete"
          type="danger"
          size="large"
          plain
          @click="handleBatchDelete"
        >
          批量删除
        </el-button>
      </div>
    </div>

    <!-- Empty -->
    <EmptyBlock
      v-if="!selectedCourseId"
      icon="scroll"
      title="选择课程和知识点"
      description="请先选择课程，再选择知识点查看题目"
    />

    <EmptyBlock
      v-else-if="!selectedKpId && allKps.length === 0"
      icon="scroll"
      title="该课程暂无知识点"
      description="请先上传文档提取知识点"
    />

    <LoadingBlock v-else-if="loading" text="加载题目..." />

    <EmptyBlock
      v-else-if="loadError"
      icon="scroll"
      title="加载失败"
      description="无法获取题目列表，请检查网络后重试"
    >
      <el-button type="primary" @click="fetchQuestions">重试</el-button>
    </EmptyBlock>

    <EmptyBlock
      v-else-if="questions.length === 0"
      icon="inbox"
      title="该知识点暂无题目"
      description="点击「AI 生成题目」自动出题"
    >
      <el-button type="primary" @click="openGenerate">生成题目</el-button>
    </EmptyBlock>

    <!-- Question List -->
    <div v-else class="question-list">
      <div
        v-for="q in questions"
        :key="q.id"
        class="q-card"
      >
        <div class="q-top">
          <span
            class="q-type"
            :style="{
              color: typeColor(q.questionType),
              background: hexToRgba(typeColor(q.questionType), 0.1),
            }"
          >
            {{ typeLabel(q.questionType) }}
          </span>
          <span class="q-diff" :style="{ color: diffColor(q.difficulty) }">
            {{ diffLabel(q.difficulty) }}
          </span>
          <span class="q-time">{{ formatDate(q.createTime) }}</span>
        </div>

        <div class="q-content">
          <div class="q-stem">{{ parseQuestionContent(q.content).stem }}</div>
          <div
            v-if="parseQuestionContent(q.content).options"
            class="q-options"
          >
            <span
              v-for="(optText, optKey) in parseQuestionContent(q.content).options!"
              :key="optKey"
              class="q-opt-item"
            >
              <b>{{ optKey }}.</b> {{ optText }}
            </span>
          </div>
        </div>

        <div class="q-bottom">
          <el-button size="small" text @click="toggleAnswer(q.id)">
            {{ expandedAnswer[q.id] ? '隐藏答案' : '查看答案' }}
          </el-button>
          <el-button size="small" text type="danger" @click="handleDeleteOne(q)">
            删除
          </el-button>
        </div>

        <div v-show="expandedAnswer[q.id]" class="q-answer">
          <span class="answer-label">答案：</span>
          {{ formatChoiceAnswer(q.answer, q.questionType, parseQuestionContent(q.content).options) }}
        </div>
      </div>
    </div>

    <!-- Generate Dialog -->
    <el-dialog
      v-model="genVisible"
      title="AI 生成题目"
      width="520px"
      :close-on-click-modal="false"
      :close-on-press-escape="!generating"
      :show-close="!generating"
      destroy-on-close
    >
      <el-form ref="genFormRef" :model="genForm" :rules="genRules" label-position="top">
        <el-form-item label="选择知识点" prop="knowledgePointIds">
          <el-select
            v-model="genForm.knowledgePointIds"
            multiple
            placeholder="请选择知识点（可多选）"
            style="width:100%"
            :disabled="generating"
          >
            <el-option
              v-for="kp in allKps"
              :key="kp.id"
              :label="`${kp.chapter} › ${kp.name}`"
              :value="kp.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="题目数量配置">
          <div class="config-grid">
            <div class="config-item">
              <span class="config-label">选择题</span>
              <el-input-number v-model="genConfig.choiceCount" :min="0" :max="20" size="small" />
            </div>
            <div class="config-item">
              <span class="config-label">填空题</span>
              <el-input-number v-model="genConfig.fillBlankCount" :min="0" :max="20" size="small" />
            </div>
            <div class="config-item">
              <span class="config-label">判断题</span>
              <el-input-number v-model="genConfig.trueFalseCount" :min="0" :max="20" size="small" />
            </div>
            <div class="config-item">
              <span class="config-label">简答题</span>
              <el-input-number v-model="genConfig.shortAnswerCount" :min="0" :max="10" size="small" />
            </div>
          </div>
          <p class="config-hint">设为 0 则跳过该类型，总数至少 1 题</p>
        </el-form-item>

        <div v-if="generating" class="gen-progress">
          <el-progress
            :percentage="genProgress"
            :stroke-width="10"
            striped
            striped-flow
            :duration="12"
          />
          <p class="gen-progress-text">正在调用 AI 生成题目，请耐心等待…</p>
        </div>
      </el-form>

      <template #footer>
        <el-button :disabled="generating" @click="genVisible = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="handleGenerate">
          开始生成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.question-page { max-width: 960px; }

.page-header {
  margin-bottom: 20px;
  h1 { font-family: $font-display; font-size: 22px; font-weight: 700; color: $ink; margin-bottom: 4px; letter-spacing: 1px; }
  .sub { font-size: 13px; color: $ink-muted; }
}

.filter-bar {
  background: $surface;
  padding: 16px 20px;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.question-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.q-card {
  background: $surface;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  padding: 16px 20px;
  transition: all 0.2s;
  &:hover { border-color: darken($stone, 5%); box-shadow: $shadow-card; }
}

.q-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.q-type {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: $radius-sm;
}

.q-diff { font-size: 12px; }

.q-time {
  font-size: 11px;
  color: darken($stone, 8%);
  margin-left: auto;
}

.q-content {
  font-size: 14px;
  color: $ink;
  line-height: 1.6;
}
.q-stem {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  margin-bottom: 8px;
}
.q-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 4px;
}
.q-opt-item {
  font-size: 13px;
  color: $ink-light;
  padding: 4px 10px;
  background: $paper-dark;
  border-radius: $radius-sm;
  word-break: break-word;
  overflow-wrap: break-word;
  b { color: $celadon; }
}

.q-bottom {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.q-answer {
  margin-top: 10px;
  padding: 10px 14px;
  background: $celadon-pale;
  border-radius: 6px;
  font-size: 14px;
  color: $ink;
  border: 1px solid rgba($celadon, 0.15);
  .answer-label { font-weight: 600; color: $celadon; }
}

/* generate dialog */
.config-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.config-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 0;
  background: $paper-dark;
  border-radius: $radius-md;
}
.config-label { font-size: 13px; color: $ink-light; }
.config-hint { font-size: 11px; color: $ink-muted; margin-top: 8px; }

.gen-progress {
  margin-top: 8px;
  padding: 14px 16px;
  background: $paper-dark;
  border-radius: $radius-md;
}
.gen-progress-text {
  margin-top: 10px;
  font-size: 13px;
  color: $ink-muted;
  text-align: center;
}
</style>
