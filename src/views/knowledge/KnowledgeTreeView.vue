<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as kpApi from '@/api/knowledgePoint'
import * as docApi from '@/api/document'
import * as masteryApi from '@/api/knowledgeMastery'
import type { KnowledgeTreeResponse, CourseResponse, KnowledgePointResponse, DocumentResponse, ParseStatus } from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import { AppIcon } from '@/components/icons'
import { CourseSeal } from '@/components/course'
import { useCourseStore } from '@/stores/course'
import { storeToRefs } from 'pinia'

const route = useRoute()
const router = useRouter()
const courseStore = useCourseStore()
const { courses } = storeToRefs(courseStore)
const coursesLoading = ref(true)

// --- tree (has courseId) ---
const tree = ref<KnowledgeTreeResponse | null>(null)
const treeLoading = ref(false)
const expandedChapters = ref<Record<string, boolean>>({})
const selectedPoint = ref<KnowledgePointResponse | null>(null)
const detailVisible = ref(false)

// --- mastery ---
const masteryMap = ref<Record<number, number>>({}) // kpId → score

function masteryLabel(score: number): string {
  if (score >= 80) return '已掌握'
  if (score >= 60) return '良好'
  if (score >= 30) return '薄弱'
  return '未掌握'
}
function masteryColor(score: number): string {
  if (score >= 80) return '#07c160'
  if (score >= 60) return '#1677ff'
  if (score >= 30) return '#f59e0b'
  return '#e74c3c'
}

// --- document upload ---
const documents = ref<DocumentResponse[]>([])
const documentsLoading = ref(false)
const selectedDocument = ref<DocumentResponse | null>(null)
const docDetailVisible = ref(false)
const uploadVisible = ref(false)
const uploadFile = ref<File | null>(null)
const uploading = ref(false)
const uploadRef = ref<any>(null)

// --- parsing progress ---
const PARSING_STATUSES: ParseStatus[] = ['PENDING', 'PARSING', 'EXTRACTING']
const POLL_INTERVAL_MS = 2000
const MAX_POLL_COUNT = 150 // 150 * 2s = 5 min

const parsingVisible = ref(false)
const parsingProgress = ref(0)
const parsingStatus = ref('')
const parsingFileName = ref('')
const parsingDocumentId = ref<number | null>(null)
const isParsingActive = ref(false)
let parsingTimer: ReturnType<typeof setInterval> | null = null
let pollCount = 0

function getParsingDocuments() {
  return documents.value.filter((doc) => PARSING_STATUSES.includes(doc.parseStatus))
}

function hasParsingDocuments() {
  return getParsingDocuments().length > 0
}

function syncParsingUi() {
  const parsingDocs = getParsingDocuments()
  isParsingActive.value = parsingDocs.length > 0
  if (parsingDocs.length === 0) {
    parsingFileName.value = ''
    parsingDocumentId.value = null
    return
  }
  const current = parsingDocs.find((doc) => doc.id === parsingDocumentId.value) ?? parsingDocs[0]
  parsingDocumentId.value = current.id
  parsingFileName.value = current.fileName
}

function onFileChange(file: any) {
  uploadFile.value = file.raw || file
}

async function handleUpload() {
  if (!uploadFile.value || !courseId.value) return
  uploading.value = true
  try {
    const res = await docApi.upload(courseId.value, uploadFile.value)
    uploadVisible.value = false
    uploadFile.value = null
    uploadRef.value?.clearFiles()

    if (res.status === 'SUCCESS') {
      ElMessage.success('文档上传并解析完成')
      await Promise.all([fetchTree(), fetchDocuments()])
    } else {
      parsingDocumentId.value = res.documentId
      parsingFileName.value = res.fileName
      parsingVisible.value = true
      parsingProgress.value = 0
      parsingStatus.value = '正在解析文档，提取知识点...'
      await fetchDocuments()
      startParsingPoll()
    }
  } catch { /* interceptor handles */ }
  finally { uploading.value = false }
}

function startParsingPoll() {
  if (parsingTimer) return
  pollCount = 0
  isParsingActive.value = true
  syncParsingUi()

  parsingTimer = setInterval(async () => {
    pollCount++
    parsingProgress.value = Math.min(Math.round((pollCount / MAX_POLL_COUNT) * 100), 95)

    if (pollCount <= 5) {
      parsingStatus.value = '正在解析文档，提取知识点...'
    } else if (pollCount <= 40) {
      parsingStatus.value = 'AI 正在分析知识结构，请耐心等待...'
    } else {
      parsingStatus.value = '仍在处理中，文档较大可能需要更长时间...'
    }

    try {
      await fetchDocuments({ silent: true })
      syncParsingUi()

      const parsingDocs = getParsingDocuments()
      const trackingDoc = parsingDocumentId.value
        ? documents.value.find((doc) => doc.id === parsingDocumentId.value)
        : null

      if (trackingDoc?.parseStatus === 'EXTRACTING') {
        parsingStatus.value = '向量入库完成，AI 正在提取知识点...'
      }

      if (parsingDocs.length === 0) {
        const failedDoc = trackingDoc?.parseStatus === 'FAILED'
        stopParsingPoll()
        parsingProgress.value = 100
        parsingStatus.value = failedDoc ? '解析失败' : '解析完成！'
        await Promise.all([
          fetchTree({ silent: true }),
          fetchDocuments({ silent: true }),
        ])
        setTimeout(() => {
          parsingVisible.value = false
          if (failedDoc) {
            ElMessage.error('文档解析失败，请重新上传')
          } else {
            ElMessage.success('文档解析完成，知识点已更新')
          }
        }, failedDoc ? 0 : 1200)
        return
      }

      if (pollCount >= MAX_POLL_COUNT) {
        stopParsingPoll()
        parsingVisible.value = false
        isParsingActive.value = hasParsingDocuments()
        await fetchTree({ silent: true })
        ElMessage.warning('解析时间较长，系统将继续在后台检测，请稍后刷新查看')
        resumeParsingPollIfNeeded()
      }
    } catch {
      // keep polling on transient API errors
    }
  }, POLL_INTERVAL_MS)
}

function resumeParsingPollIfNeeded() {
  if (!courseId.value || parsingTimer) return
  if (!hasParsingDocuments()) return
  syncParsingUi()
  startParsingPoll()
}

function stopParsingPoll() {
  if (parsingTimer) {
    clearInterval(parsingTimer)
    parsingTimer = null
  }
  isParsingActive.value = hasParsingDocuments()
}

function closeParsingDialog() {
  parsingVisible.value = false
  ElMessage.info('文档仍在后台解析，完成后将自动刷新知识点')
}

async function fetchDocuments(options?: { silent?: boolean }) {
  if (!courseId.value) return
  const silent = options?.silent ?? false
  if (!silent) documentsLoading.value = true
  try {
    documents.value = await docApi.list(courseId.value)
    syncParsingUi()
  } catch {
    if (!silent) documents.value = []
  } finally {
    if (!silent) documentsLoading.value = false
  }
}

async function openDocDetail(doc: DocumentResponse) {
  try {
    selectedDocument.value = await docApi.getById(doc.id)
  } catch {
    selectedDocument.value = doc
  }
  docDetailVisible.value = true
}

function isInProgressStatus(status: ParseStatus | string) {
  return PARSING_STATUSES.includes(status as ParseStatus)
}

async function handleDeleteDoc(doc: DocumentResponse) {
  const inProgress = isInProgressStatus(doc.parseStatus)
  try {
    await ElMessageBox.confirm(
      inProgress
        ? `文档「${doc.fileName}」正在解析中。\n\n删除将终止处理并清除相关知识点，确定删除吗？`
        : `确定要删除文档「${doc.fileName}」吗？\n\n⚠️ 该文档下的全部知识点和题目将被一并删除（同课程其他文档不受影响）。`,
      '删除文档确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await docApi.deleteOne(doc.id)
    if (parsingDocumentId.value === doc.id) {
      stopParsingPoll()
      parsingVisible.value = false
    }
    ElMessage.success('文档已删除')
    await Promise.all([fetchTree(), fetchDocuments()])
  } catch { /* handled by interceptor */ }
}

async function handleRetryParse(doc: DocumentResponse) {
  try {
    await ElMessageBox.confirm(
      `确定要重新解析「${doc.fileName}」吗？\n\n将重新提取知识点，可能需要几分钟。`,
      '重新解析确认',
      { type: 'info', confirmButtonText: '重新解析', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await docApi.retryParse(doc.id)
    parsingDocumentId.value = doc.id
    parsingFileName.value = doc.fileName
    parsingVisible.value = true
    parsingProgress.value = 0
    parsingStatus.value = '正在重新解析文档...'
    ElMessage.success('已开始重新解析')
    await fetchDocuments({ silent: true })
    startParsingPoll()
  } catch { /* handled by interceptor */ }
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return dateStr.replace('T', ' ').substring(0, 16)
}

function parseStatusLabel(status: ParseStatus | string): string {
  const map: Record<string, string> = {
    PENDING: '等待解析',
    PARSING: '解析中',
    EXTRACTING: '知识点提取中',
    SUCCESS: '解析成功',
    FAILED: '解析失败',
  }
  return map[status] || status
}

function parseStatusType(status: ParseStatus | string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'PARSING' || status === 'EXTRACTING') return 'warning'
  return 'info'
}

const courseId = ref<number | null>(null)

function parseCourseId(): number | null {
  const id = route.params.courseId
  if (!id) return null
  const n = Number(id)
  return Number.isNaN(n) ? null : n
}

async function fetchCourses() {
  coursesLoading.value = true
  try {
    await courseStore.fetchCourses()
  } catch {
    // interceptor shows toast
  } finally {
    coursesLoading.value = false
  }
}

function syncCourseFromRoute() {
  const fromRoute = parseCourseId()
  if (fromRoute) {
    courseId.value = fromRoute
    courseStore.setCourseId(fromRoute)
    return
  }
  if (courseStore.currentCourseId) {
    router.replace(`/knowledge/${courseStore.currentCourseId}`)
  }
}

async function fetchTree(options?: { silent?: boolean }) {
  if (!courseId.value) return
  const silent = options?.silent ?? false
  if (!silent) treeLoading.value = true
  try {
    const [t, masteryList] = await Promise.all([
      kpApi.getTree(courseId.value),
      masteryApi.listByCourse(courseId.value).catch(() => []),
    ])
    tree.value = t
    masteryMap.value = {}
    masteryList.forEach((m) => { masteryMap.value[m.knowledgePointId] = m.masteryScore })
    // 仅首次加载时自动展开第一章，后台刷新不打断用户已展开的章节
    if (!silent && tree.value?.chapters.length) {
      expandedChapters.value[tree.value.chapters[0].chapter] = true
    }
  } catch {
    if (!silent) tree.value = null
  } finally {
    if (!silent) treeLoading.value = false
  }
}

function selectCourse(c: CourseResponse) {
  courseStore.setCourseId(c.id)
  router.push(`/knowledge/${c.id}`)
}

function toggleChapter(chapter: string) {
  expandedChapters.value[chapter] = !expandedChapters.value[chapter]
}

async function openDetail(point: KnowledgePointResponse) {
  try {
    selectedPoint.value = await kpApi.getById(point.id)
  } catch {
    selectedPoint.value = point
  }
  detailVisible.value = true
}

async function handleDelete(point: KnowledgePointResponse) {
  try {
    await ElMessageBox.confirm(
      `确定要删除知识点「${point.name}」吗？\n\n仅删除此知识点及其关联题目，不会影响同课程下的其他知识点。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await kpApi.deletePoint(point.id)
    ElMessage.success('已删除')
    await fetchTree()
  } catch { /* handled by interceptor */ }
}

function importanceLabel(level: number | undefined): string {
  if (!level) return ''
  const map: Record<number, string> = {
    5: '核心考点', 4: '重要定理', 3: '一般', 2: '辅助', 1: '了解',
  }
  return map[level] || ''
}

function importanceColor(level: number | undefined): string {
  if (!level || level <= 2) return '#999'
  if (level === 3) return '#1677ff'
  if (level === 4) return '#f59e0b'
  return '#e74c3c' // 5 = core
}

// init
onMounted(async () => {
  await fetchCourses()
  syncCourseFromRoute()
  if (courseId.value) {
    await Promise.all([fetchTree(), fetchDocuments()])
    resumeParsingPollIfNeeded()
  }
})

watch(() => route.params.courseId, (newId) => {
  const n = newId ? Number(newId) : null
  courseId.value = Number.isNaN(n) ? null : n
  if (courseId.value) {
    courseStore.setCourseId(courseId.value)
    tree.value = null
    documents.value = []
    expandedChapters.value = {}
    Promise.all([fetchTree(), fetchDocuments()]).then(() => resumeParsingPollIfNeeded())
  }
})
</script>

<template>
  <div class="kp-page">
    <!-- Course Selector (no courseId in route) -->
    <template v-if="!courseId">
      <div class="page-header">
        <h1>知识点</h1>
        <p class="sub">选择一个课程查看其知识体系</p>
      </div>

      <LoadingBlock v-if="coursesLoading" text="加载课程列表..." />

      <EmptyBlock
        v-else-if="courses.length === 0"
        icon="book"
        title="还没有课程"
        description="请先创建课程并上传教材资料"
      >
        <el-button type="primary" @click="router.push('/courses')">
          去创建课程
        </el-button>
      </EmptyBlock>

      <div v-else class="course-selector">
        <div
          v-for="(c, idx) in courses"
          :key="c.id"
          class="selector-card"
          @click="selectCourse(c)"
        >
          <CourseSeal :name="c.courseName" :id="c.id" size="md" />
          <div class="sel-body">
            <div class="sel-name">{{ c.courseName }}</div>
            <div class="sel-meta">{{ c.teacher || c.semester || '查看知识点' }}</div>
          </div>
          <span class="sel-arrow">→</span>
        </div>
      </div>
    </template>

    <!-- Knowledge Tree (has courseId) -->
    <template v-else>
      <div class="page-header">
        <div>
          <h1>知识点</h1>
          <p class="sub">
            <a class="back-link" @click="router.push('/knowledge')">← 切换课程</a>
          </p>
        </div>
        <el-button type="primary" size="large" @click="uploadVisible = true">
          <AppIcon name="upload" :size="16" class="btn-icon" />
          上传文档
        </el-button>
      </div>

      <div v-if="isParsingActive && !parsingVisible" class="parsing-banner">
        <AppIcon name="scroll" :size="16" class="inline-icon" />
        <span>正在解析「{{ parsingFileName }}」，完成后将自动刷新知识点</span>
      </div>

      <!-- Document List -->
      <section class="doc-section">
        <div class="doc-section-header">
          <h2>课程文档</h2>
          <span class="doc-count">{{ documents.length }} 个文件</span>
        </div>

        <LoadingBlock v-if="documentsLoading" text="加载文档列表..." />

        <EmptyBlock
          v-else-if="documents.length === 0"
          icon="folder"
          title="暂无文档"
          description="上传教材后，系统将自动解析并提取知识点"
        >
          <el-button type="primary" @click="uploadVisible = true">
            <AppIcon name="upload" :size="16" class="btn-icon" />
            上传文档
          </el-button>
        </EmptyBlock>

        <div v-else class="doc-list">
          <div
            v-for="doc in documents"
            :key="doc.id"
            class="doc-item"
          >
            <div class="doc-main">
              <div class="doc-info">
                <AppIcon name="scroll" :size="16" class="doc-icon" />
                <span class="doc-name" :title="doc.fileName">{{ doc.fileName }}</span>
                <el-tag :type="parseStatusType(doc.parseStatus)" size="small">
                  {{ parseStatusLabel(doc.parseStatus) }}
                </el-tag>
              </div>
              <div class="doc-meta">
                <span>{{ doc.fileType || '未知类型' }}</span>
                <span class="meta-dot">·</span>
                <span>{{ formatFileSize(doc.fileSize) }}</span>
                <span class="meta-dot">·</span>
                <span>{{ formatDate(doc.createTime) }}</span>
              </div>
            </div>
            <div class="doc-actions">
              <el-button size="small" text @click="openDocDetail(doc)">
                详情
              </el-button>
              <el-button
                v-if="doc.parseStatus === 'FAILED' || doc.parseStatus === 'EXTRACTING'"
                size="small"
                text
                type="primary"
                @click="handleRetryParse(doc)"
              >
                重新解析
              </el-button>
              <el-button
                size="small"
                text
                type="danger"
                @click="handleDeleteDoc(doc)"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>
      </section>

      <div class="tree-section-header">
        <h2>知识点结构</h2>
      </div>

      <LoadingBlock v-if="treeLoading" text="加载知识点..." />

      <EmptyBlock
        v-else-if="!tree || tree.chapters.length === 0"
        icon="tree"
        title="暂无知识点"
        description="请先上传教材文档，系统将自动解析知识点结构"
      >
        <el-button type="primary" @click="uploadVisible = true">
          <AppIcon name="upload" :size="16" class="btn-icon" />
          上传文档
        </el-button>
      </EmptyBlock>

      <div v-else class="tree-list">
        <div
          v-for="chapter in tree.chapters"
          :key="chapter.chapter"
          class="chapter-group"
        >
          <div class="chapter-header" @click="toggleChapter(chapter.chapter)">
            <span class="chapter-arrow">
              {{ expandedChapters[chapter.chapter] ? '▾' : '▸' }}
            </span>
            <span class="chapter-title">{{ chapter.chapter || '未分类' }}</span>
            <span class="chapter-count">
              {{ chapter.knowledgePoints.length }} 个知识点
            </span>
          </div>

          <div v-show="expandedChapters[chapter.chapter]" class="kp-list">
            <div
              v-for="point in chapter.knowledgePoints"
              :key="point.id"
              class="kp-item"
            >
              <div class="kp-main">
                <div class="kp-info">
                  <span class="kp-name">{{ point.name }}</span>
                  <span
                    v-if="point.importance"
                    class="kp-importance"
                    :style="{ color: importanceColor(point.importance) }"
                  >
                    {{ importanceLabel(point.importance) }}
                  </span>
                  <span
                    v-if="masteryMap[point.id] !== undefined"
                    class="kp-mastery"
                    :style="{ color: masteryColor(masteryMap[point.id]) }"
                  >
                    {{ masteryLabel(masteryMap[point.id]) }} {{ masteryMap[point.id] }}%
                  </span>
                </div>
                <!-- mastery bar -->
                <div
                  v-if="masteryMap[point.id] !== undefined"
                  class="kp-mastery-bar"
                >
                  <div
                    class="kp-mastery-fill"
                    :style="{
                      width: masteryMap[point.id] + '%',
                      background: masteryColor(masteryMap[point.id]),
                    }"
                  />
                </div>
                <p v-if="point.description" class="kp-desc">
                  {{ point.description }}
                </p>
              </div>
              <div class="kp-actions">
                <el-button size="small" text @click="openDetail(point)">
                  详情
                </el-button>
                <el-button
                  size="small"
                  text
                  type="danger"
                  @click="handleDelete(point)"
                >
                  删除
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Parsing Progress Dialog -->
      <el-dialog
        v-model="parsingVisible"
        title="文档解析中"
        width="440px"
        :close-on-click-modal="false"
        :show-close="false"
      >
        <div class="parsing-body">
          <div class="parsing-file">
            <AppIcon name="scroll" :size="16" class="inline-icon" />
            {{ parsingFileName }}
          </div>
          <el-progress
            :percentage="parsingProgress"
            :status="parsingProgress === 100 ? 'success' : undefined"
            :stroke-width="16"
            :text-inside="true"
          />
          <p class="parsing-status">{{ parsingStatus }}</p>
          <p class="parsing-hint">文档解析由 AI 自动完成，请耐心等待</p>
        </div>
        <template #footer>
          <el-button @click="closeParsingDialog" :disabled="parsingProgress === 100">
            后台处理，稍后查看
          </el-button>
        </template>
      </el-dialog>

      <!-- Upload Dialog -->
      <el-dialog
        v-model="uploadVisible"
        title="上传文档"
        width="460px"
        :close-on-click-modal="false"
        destroy-on-close
      >
        <div class="upload-area">
          <p class="upload-hint">
            上传课程教材、课件等文档（支持 PDF、Word、PPT、TXT），系统将自动解析并提取知识点结构。
          </p>
          <el-upload
            ref="uploadRef"
            drag
            :auto-upload="false"
            :limit="1"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md"
            :on-change="onFileChange"
          >
            <div class="upload-box">
              <span class="upload-icon">
                <AppIcon name="folder" :size="36" />
              </span>
              <p class="upload-text">拖拽文件到此处，或点击选择</p>
              <p class="upload-sub">单文件上传，支持 PDF / Word / PPT / TXT</p>
            </div>
          </el-upload>
        </div>
        <template #footer>
          <el-button @click="uploadVisible = false">取消</el-button>
          <el-button
            type="primary"
            :loading="uploading"
            :disabled="!uploadFile"
            @click="handleUpload"
          >
            {{ uploading ? '上传解析中...' : '开始上传' }}
          </el-button>
        </template>
      </el-dialog>

      <!-- Document Detail Dialog -->
      <el-dialog
        v-model="docDetailVisible"
        title="文档详情"
        width="480px"
        destroy-on-close
      >
        <template v-if="selectedDocument">
          <div class="detail-grid">
            <div class="detail-item full">
              <span class="detail-label">文件名</span>
              <span class="detail-value">{{ selectedDocument.fileName }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">文件类型</span>
              <span class="detail-value">{{ selectedDocument.fileType || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">文件大小</span>
              <span class="detail-value">{{ formatFileSize(selectedDocument.fileSize) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">解析状态</span>
              <span class="detail-value">
                <el-tag :type="parseStatusType(selectedDocument.parseStatus)" size="small">
                  {{ parseStatusLabel(selectedDocument.parseStatus) }}
                </el-tag>
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">上传时间</span>
              <span class="detail-value">{{ formatDate(selectedDocument.createTime) }}</span>
            </div>
          </div>
        </template>
      </el-dialog>

      <!-- Detail Dialog -->
      <el-dialog
        v-model="detailVisible"
        title="知识点详情"
        width="480px"
        destroy-on-close
      >
        <template v-if="selectedPoint">
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">名称</span>
              <span class="detail-value">{{ selectedPoint.name }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">章节</span>
              <span class="detail-value">{{ selectedPoint.chapter }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">重要度</span>
              <span
                class="detail-value"
                :style="{ color: importanceColor(selectedPoint.importance) }"
              >
                {{ importanceLabel(selectedPoint.importance) || '-' }}
              </span>
            </div>
            <div class="detail-item full">
              <span class="detail-label">描述</span>
              <span class="detail-value">{{ selectedPoint.description || '暂无描述' }}</span>
            </div>
          </div>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.kp-page {
  max-width: 900px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  h1 {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 4px;
  }
  .sub {
    font-size: 13px;
    color: #999;
  }
  .back-link {
    color: #07c160;
    cursor: pointer;
    &:hover { text-decoration: underline; }
  }
}

.loading-area, .empty-area {
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
  p { font-size: 13px; color: #999; margin-bottom: 16px; }
}

/* course selector */
.course-selector {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selector-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  padding: 16px 20px;
  border-radius: 10px;
  border: 1px solid #eee;
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    transform: translateX(4px);
  }
  .sel-body { flex: 1; min-width: 0; }
  .sel-name { font-size: 15px; font-weight: 600; color: #333; }
  .sel-meta { font-size: 12px; color: #bbb; margin-top: 2px; }
  .sel-arrow { font-size: 18px; color: #ccc; }
}

/* documents */
.doc-section,
.tree-section-header {
  margin-bottom: 20px;
}

.doc-section-header,
.tree-section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: #333;
  }
}

.doc-count {
  font-size: 12px;
  color: #bbb;
}

.doc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  padding: 14px 18px;
  border-radius: 10px;
  border: 1px solid #eee;
  transition: background 0.15s;

  &:hover { background: #fafdfb; }

  .doc-main {
    min-width: 0;
    flex: 1;
  }

  .doc-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .doc-icon {
    color: #3d7a6a;
    flex-shrink: 0;
  }

  .doc-name {
    font-size: 14px;
    font-weight: 500;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .doc-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: 12px;
    color: #aaa;
  }

  .meta-dot {
    color: #ddd;
  }

  .doc-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
}

/* tree */
.tree-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chapter-group {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #eee;
  overflow: hidden;
}

.chapter-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
  &:hover { background: #f9fafb; }
  .chapter-arrow {
    font-size: 12px;
    color: #999;
    width: 16px;
    text-align: center;
  }
  .chapter-title {
    font-size: 15px;
    font-weight: 600;
    color: #333;
    flex: 1;
  }
  .chapter-count {
    font-size: 12px;
    color: #bbb;
  }
}

.kp-list {
  border-top: 1px solid #f5f5f5;
}

.kp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px 12px 42px;
  border-bottom: 1px solid #f9f9f9;
  transition: background 0.15s;
  &:hover { background: #fafdfb; }
  &:last-child { border-bottom: none; }

  .kp-main {
    min-width: 0;
    flex: 1;
    margin-right: 12px;
  }

  .kp-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .kp-name {
    font-size: 14px;
    font-weight: 500;
    color: #333;
  }

  .kp-mastery {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 3px;
    background: currentColor;
    opacity: 0.1;
    font-weight: 500;
  }

  .kp-mastery-bar {
    height: 4px;
    background: #f0f0f0;
    border-radius: 2px;
    margin-top: 6px;
    overflow: hidden;
  }

  .kp-mastery-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s ease;
    min-width: 2px;
  }

  .kp-importance {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 3px;
    background: currentColor;
    opacity: 0.1;
    font-weight: 500;
  }

  .kp-desc {
    font-size: 12px;
    color: #aaa;
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kp-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
}

/* detail */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.detail-item {
  &.full { grid-column: 1 / -1; }
}
.detail-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}
.detail-value {
  font-size: 14px;
  color: #333;
}

/* parsing progress */
.parsing-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid #d9f0e6;
  background: #f3fbf7;
  color: #3d7a6a;
  font-size: 13px;

  .inline-icon {
    flex-shrink: 0;
  }
}

.parsing-body {
  text-align: center;
  padding: 12px 0;
}
.parsing-file {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 500;
  color: #333;
  margin-bottom: 24px;
  .inline-icon { color: #3d7a6a; flex-shrink: 0; }
}
.parsing-status {
  font-size: 14px;
  color: #666;
  margin-top: 16px;
}
.parsing-hint {
  font-size: 12px;
  color: #bbb;
  margin-top: 8px;
}

/* upload dialog */
.upload-area {
  .upload-hint {
    font-size: 13px;
    color: #888;
    line-height: 1.6;
    margin-bottom: 16px;
  }
}
.upload-box {
  padding: 24px 0;
  text-align: center;
  .upload-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 10px;
    color: #3d7a6a;
  }
  .upload-text { font-size: 14px; color: #666; }
  .upload-sub { font-size: 11px; color: #bbb; margin-top: 4px; }
}
</style>
