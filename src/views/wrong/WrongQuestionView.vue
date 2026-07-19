<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as wqApi from '@/api/wrongQuestion'
import * as kpApi from '@/api/knowledgePoint'
import * as questionApi from '@/api/question'
import * as docApi from '@/api/document'
import type {
  KnowledgeTreeResponse, KnowledgePointResponse, DocumentResponse,
  WrongQuestionResponse, PageResult, QuestionResponse, QuestionType,
  WrongQuestionExportFormat,
} from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import { AppIcon } from '@/components/icons'
import { formatChoiceAnswer, parseQuestionContent } from '@/utils/questionContent'
import { buildKpCascaderOptions } from '@/utils/kpCascader'
import { useCourseScope } from '@/composables/useCourseScope'

const router = useRouter()
const route = useRoute()
const { courses, selectedCourseId, courseStore, ensureCourses } = useCourseScope()

// filters
const loadError = ref(false)
const kpTree = ref<KnowledgeTreeResponse | null>(null)
const documents = ref<DocumentResponse[]>([])
const kpIdsWithWrong = ref<Set<number>>(new Set())
/** Cascader path: [documentId, knowledgePointId] */
const cascaderValue = ref<number[] | null>(null)
const selectedKpId = computed(() => cascaderValue.value?.[1])
const selectedType = ref<QuestionType | ''>('')

const allKps = computed<KnowledgePointResponse[]>(() =>
  kpTree.value ? kpTree.value.chapters.flatMap((ch) => ch.knowledgePoints) : [],
)
const filterCascaderOptions = computed(() =>
  buildKpCascaderOptions(allKps.value, documents.value, kpIdsWithWrong.value),
)
const cascaderProps = { expandTrigger: 'click' as const }

const typeOptions: { label: string; value: QuestionType | '' }[] = [
  { label: '全部题型', value: '' },
  { label: '选择题', value: 'CHOICE' },
  { label: '填空题', value: 'FILL_BLANK' },
  { label: '判断题', value: 'TRUE_FALSE' },
  { label: '简答题', value: 'SHORT_ANSWER' },
]

// list
const page = ref(1)
const pageSize = 20
const pageResult = ref<PageResult<WrongQuestionResponse> | null>(null)
const loading = ref(false)
const loadingQuestions = ref(false)
const questionCache = ref<Record<number, QuestionResponse>>({})

async function fetchKpTree() {
  if (!selectedCourseId.value) {
    kpTree.value = null
    documents.value = []
    kpIdsWithWrong.value = new Set()
    return
  }
  try {
    const [tree, docs, kpIds] = await Promise.all([
      kpApi.getTree(selectedCourseId.value),
      docApi.list(selectedCourseId.value).catch(() => [] as DocumentResponse[]),
      wqApi.listKnowledgePointIds(selectedCourseId.value).catch(() => [] as number[]),
    ])
    kpTree.value = tree
    documents.value = docs
    kpIdsWithWrong.value = new Set(kpIds)
    if (selectedKpId.value && !kpIdsWithWrong.value.has(selectedKpId.value)) {
      cascaderValue.value = null
    }
  } catch {
    kpTree.value = null
    documents.value = []
    kpIdsWithWrong.value = new Set()
  }
}

async function loadQuestionsForPage(records: WrongQuestionResponse[]) {
  const missingIds = records
    .map((r) => r.questionId)
    .filter((id) => !questionCache.value[id])

  if (missingIds.length === 0) return

  loadingQuestions.value = true
  try {
    await Promise.all(missingIds.map(async (id) => {
      try {
        questionCache.value[id] = await questionApi.getById(id)
      } catch { /* */ }
    }))
  } finally {
    loadingQuestions.value = false
  }
}

async function fetchList() {
  if (!selectedCourseId.value) { pageResult.value = null; return }
  loading.value = true
  loadError.value = false
  try {
    pageResult.value = await wqApi.list({
      courseId: selectedCourseId.value,
      knowledgePointId: selectedKpId.value,
      questionType: selectedType.value || undefined,
      page: page.value,
      size: pageSize,
    })
    if (pageResult.value?.records.length) {
      await loadQuestionsForPage(pageResult.value.records)
    }
  } catch {
    pageResult.value = null
    loadError.value = true
  }
  finally { loading.value = false }
}

async function onCourseChange() {
  cascaderValue.value = null
  selectedType.value = ''
  page.value = 1
  questionCache.value = {}
  await fetchKpTree()
  fetchList()
}

function onCascaderChange() {
  page.value = 1
  fetchList()
}

function onTypeChange() {
  page.value = 1
  fetchList()
}

function onPageChange(p: number) {
  page.value = p
  fetchList()
}

function getParsedQuestion(qid: number) {
  const q = questionCache.value[qid]
  return parseQuestionContent(q?.content ?? null)
}

function getKpName(kpId: number): string {
  const kp = allKps.value.find((k) => k.id === kpId)
  return kp ? `${kp.chapter} › ${kp.name}` : `知识点 #${kpId}`
}

const exporting = ref(false)

async function handleExport(format: WrongQuestionExportFormat) {
  if (!selectedCourseId.value) return
  exporting.value = true
  try {
    const { blob, filename } = await wqApi.exportWrongQuestions({
      courseId: selectedCourseId.value,
      knowledgePointId: selectedKpId.value,
      questionType: selectedType.value || undefined,
      format,
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(format === 'pdf' ? '错题已导出为 PDF' : '错题已导出为 Word')
  } catch { /* */ }
  finally { exporting.value = false }
}

async function handleDelete(wq: WrongQuestionResponse) {
  try {
    await ElMessageBox.confirm('确定要移出错题本吗？', '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  try {
    await wqApi.deleteOne(wq.id)
    ElMessage.success('已移出错题本')
    await fetchKpTree()
    await fetchList()
  } catch { /* */ }
}

async function handlePractice() {
  if (!selectedCourseId.value) return
  try {
    const res = await wqApi.practice({
      courseId: selectedCourseId.value,
      knowledgePointIds: selectedKpId.value ? [selectedKpId.value] : undefined,
    })
    if (res.questions.length === 0) {
      ElMessage.info('没有可练习的错题')
      return
    }
    ElMessage.success(`已生成 ${res.totalCount} 道错题练习，即将开始考试`)
    sessionStorage.setItem('practiceExam', JSON.stringify({
      courseId: selectedCourseId.value,
      questions: res.questions,
    }))
    router.push('/exam/start')
  } catch { /* */ }
}

function typeLabel(t: string) {
  return { CHOICE: '选择题', FILL_BLANK: '填空题', TRUE_FALSE: '判断题', SHORT_ANSWER: '简答题' }[t] || t
}

function typeColor(t: string) {
  return { CHOICE: '#1677ff', FILL_BLANK: '#f59e0b', TRUE_FALSE: '#07c160', SHORT_ANSWER: '#8b5cf6' }[t] || '#999'
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatDate(s: string) {
  return s ? s.replace('T', ' ').substring(0, 16) : ''
}

function scoreClass(s: number) {
  if (s >= 60) return 'green'
  if (s > 0) return 'orange'
  return 'red'
}

onMounted(async () => {
  await ensureCourses()
  const q = Number(route.query.courseId)
  if (!Number.isNaN(q) && q > 0) {
    courseStore.setCourseId(q)
  }
  if (selectedCourseId.value) {
    await onCourseChange()
  }
})

watch(() => route.query.courseId, (val) => {
  const q = Number(val)
  if (!Number.isNaN(q) && q > 0) {
    courseStore.setCourseId(q)
    onCourseChange()
  }
})
</script>

<template>
  <div class="wq-page">
    <div class="page-header">
      <div>
        <h1>错题本</h1>
        <p class="sub">回顾错题，查漏补缺。低于 60 分的题目自动收录</p>
      </div>
      <div class="header-actions">
        <el-dropdown :disabled="!selectedCourseId" @command="handleExport">
          <el-button
            size="large"
            :disabled="!selectedCourseId"
            :loading="exporting"
          >
            导出错题 ▾
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="docx">导出 Word (.docx)</el-dropdown-item>
              <el-dropdown-item command="pdf">导出 PDF</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button
          type="primary"
          size="large"
          :disabled="!selectedCourseId"
          @click="handlePractice"
        >
          <AppIcon name="quill" :size="16" class="btn-icon" />
          错题练习
        </el-button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar responsive-filters">
      <el-select
        v-model="selectedCourseId"
        placeholder="选择课程"
        size="large"
        class="filter-select"
        clearable
        @change="onCourseChange"
      >
        <el-option v-for="c in courses" :key="c.id" :label="c.courseName" :value="c.id" />
      </el-select>

      <el-cascader
        v-model="cascaderValue"
        :options="filterCascaderOptions"
        :props="cascaderProps"
        clearable
        filterable
        size="large"
        class="filter-select filter-select-wide"
        placeholder="课程资料 › 知识点（仅有错题）"
        :disabled="!selectedCourseId"
        @change="onCascaderChange"
      />

      <el-select
        v-model="selectedType"
        placeholder="题型筛选"
        size="large"
        class="filter-select"
        :disabled="!selectedCourseId"
        @change="onTypeChange"
      >
        <el-option
          v-for="opt in typeOptions"
          :key="opt.value || 'all'"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
    </div>

    <!-- Empty -->
    <EmptyBlock
      v-if="!selectedCourseId"
      icon="clipboard"
      title="选择课程"
      description="选择一个课程查看错题"
    />

    <LoadingBlock v-else-if="loading" />

    <EmptyBlock
      v-else-if="loadError"
      icon="clipboard"
      title="加载失败"
      description="无法获取错题列表，请检查网络后重试"
    >
      <el-button type="primary" @click="fetchList">重试</el-button>
    </EmptyBlock>

    <EmptyBlock
      v-else-if="!pageResult || pageResult.records.length === 0"
      icon="complete"
      title="暂无错题"
      description="太棒了！当前课程没有错题记录"
    />

    <!-- Card list -->
    <div v-else class="card-list">
      <div
        v-for="(wq, idx) in pageResult.records"
        :key="wq.id"
        class="wq-card"
      >
        <div class="wq-card-top">
          <div class="wq-left">
            <span class="wq-num">#{{ (page - 1) * pageSize + idx + 1 }}</span>
            <span
              class="wq-type"
              :style="{
                color: typeColor(wq.questionType),
                background: hexToRgba(typeColor(wq.questionType), 0.1),
              }"
            >
              {{ typeLabel(wq.questionType) }}
            </span>
            <span class="wq-kp">{{ getKpName(wq.knowledgePointId) }}</span>
            <span
              class="wq-score"
              :class="scoreClass(wq.latestScore)"
            >
              {{ wq.latestScore ?? '-' }} 分
            </span>
          </div>
          <div class="wq-right">
            <span class="wq-times">错 {{ wq.wrongCount }} 次</span>
            <span class="wq-time">{{ formatDate(wq.lastWrongTime) }}</span>
          </div>
        </div>

        <div class="wq-question">
          <div v-if="loadingQuestions && !questionCache[wq.questionId]" class="q-loading">
            加载题目...
          </div>
          <template v-else-if="questionCache[wq.questionId]">
            <div class="q-stem">{{ getParsedQuestion(wq.questionId).stem }}</div>
            <div
              v-if="getParsedQuestion(wq.questionId).options"
              class="q-options"
            >
              <div
                v-for="(optText, optKey) in getParsedQuestion(wq.questionId).options!"
                :key="optKey"
                class="q-opt"
              >
                <b>{{ optKey }}.</b> {{ optText }}
              </div>
            </div>
          </template>
          <div v-else class="q-loading">题目加载失败</div>
        </div>

        <div class="wq-answers">
          <div class="ans-row user">
            <span class="ans-label">你的答案</span>
            <span class="ans-val">
              {{ formatChoiceAnswer(wq.latestUserAnswer, wq.questionType, getParsedQuestion(wq.questionId).options) }}
            </span>
          </div>
          <div class="ans-row correct">
            <span class="ans-label">正确答案</span>
            <span class="ans-val">
              {{ formatChoiceAnswer(wq.correctAnswer, wq.questionType, getParsedQuestion(wq.questionId).options) }}
            </span>
          </div>
        </div>

        <div v-if="wq.feedback" class="wq-feedback">
          <div v-if="wq.feedback.missingPoints?.length" class="feedback-block">
            <div class="feedback-title">遗漏要点</div>
            <ul>
              <li v-for="(point, i) in wq.feedback.missingPoints" :key="i">{{ point }}</li>
            </ul>
          </div>
          <div v-if="wq.feedback.suggestions?.length" class="feedback-block">
            <div class="feedback-title">改进建议</div>
            <ul>
              <li v-for="(tip, i) in wq.feedback.suggestions" :key="i">{{ tip }}</li>
            </ul>
          </div>
        </div>

        <div class="wq-actions">
          <el-button size="small" text type="danger" @click="handleDelete(wq)">
            移出错题本
          </el-button>
        </div>
      </div>

      <div class="pagination-wrap" v-if="pageResult.pages > 1">
        <el-pagination
          layout="prev, pager, next"
          :total="pageResult.total"
          :page-size="pageSize"
          :current-page="page"
          @current-change="onPageChange"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.wq-page { max-width: 800px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  h1 { font-family: $font-display; font-size: 22px; font-weight: 700; color: $ink; margin-bottom: 4px; letter-spacing: 1px; }
  .sub { font-size: 13px; color: $ink-muted; }
}

.header-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.empty-area, .loading-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #eee;
  .empty-icon { font-size: 48px; margin-bottom: 16px; }
  h3 { font-size: 17px; color: #333; margin-bottom: 8px; }
  p { font-size: 13px; color: #999; }
}

/* Cards */
.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wq-card {
  background: $surface;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  padding: 16px 20px;
  transition: all 0.2s;
  &:hover { border-color: darken($stone, 5%); box-shadow: $shadow-card; }
}

.wq-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.wq-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wq-num {
  font-weight: 600;
  color: #ccc;
  font-size: 13px;
}

.wq-type {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.wq-kp {
  font-size: 12px;
  color: $celadon;
  background: $celadon-pale;
  padding: 2px 8px;
  border-radius: 4px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wq-score {
  font-weight: 700;
  font-size: 15px;
  &.green { color: $celadon; }
  &.orange { color: $gold; }
  &.red { color: $cinnabar; }
}

.wq-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.wq-times {
  font-size: 12px;
  color: #e74c3c;
  background: #fef2f2;
  padding: 2px 8px;
  border-radius: 4px;
}

.wq-time {
  font-size: 12px;
  color: #bbb;
}

/* Answers */
.wq-question {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.wq-answers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 4px;
}

.ans-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;

  &.user {
    background: $cinnabar-pale;
    .ans-val { color: $cinnabar; }
  }
  &.correct {
    background: $celadon-pale;
    .ans-val { color: $celadon; }
  }
}

.ans-label {
  color: #999;
  font-size: 12px;
  flex-shrink: 0;
  width: 60px;
}

.ans-val {
  font-weight: 500;
  word-break: break-word;
  overflow-wrap: break-word;
  min-width: 0;
}

/* Question */
.q-loading {
  font-size: 13px;
  color: #999;
  text-align: center;
  padding: 16px 0;
}

.q-stem {
  font-size: 15px;
  color: #333;
  line-height: 1.7;
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
}

.q-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.q-opt {
  font-size: 13px;
  color: #555;
  padding: 2px 0;
  word-break: break-word;
  overflow-wrap: break-word;
  b { color: $celadon; }
}

.wq-feedback {
  margin-top: 12px;
  padding-top: 12px;
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

/* Actions */
.wq-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f5f5f5;
}

.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}
</style>
