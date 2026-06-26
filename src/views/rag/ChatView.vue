<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as ragApi from '@/api/rag'
import * as tutorApi from '@/api/tutor'
import * as knowledgePointApi from '@/api/knowledgePoint'
import * as knowledgeMasteryApi from '@/api/knowledgeMastery'
import type {
  ChatMessageVO,
  CourseResponse,
  KnowledgePointResponse,
  ReferenceVO,
  TutorAnswerStreamEvent,
  TutorKnowledgePointView,
  TutorNextAction,
  TutorQuestionView,
  TutorSessionDetailResponse,
  TutorSessionHistoryItem,
  TutorSessionSummary,
  TutorStartSessionRequest,
  RagConversationSummary,
} from '@/types'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import type { SidebarItem } from '@/components/chat/ChatSidebar.vue'
import MarkdownContent from '@/components/chat/MarkdownContent.vue'
import ScoreRing from '@/components/chat/ScoreRing.vue'
import { AppIcon, type IconName } from '@/components/icons'
import { CourseSeal } from '@/components/course'
import { useCourseScope } from '@/composables/useCourseScope'
import { buildTutorChatMessages, formatTutorQuestionContent } from '@/utils/tutorChatMessages'
import { Promotion } from '@element-plus/icons-vue'

type ChatMode = 'rag' | 'tutor'

interface TutorMeta {
  score?: number
  missingPoints?: string[]
  suggestions?: string[]
  masteryScore?: number
  knowledgePoint?: TutorKnowledgePointView
  questionType?: string
  difficulty?: string
  thinkingHint?: string
  sessionSummary?: TutorSessionSummary
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  kind?: 'rag' | 'rag_thinking' | 'tutor_question' | 'tutor_feedback' | 'tutor_thinking' | 'tutor_explain' | 'tutor_system' | 'tutor_summary'
  tutorMeta?: TutorMeta
  references?: ReferenceVO[]
}

const TOOL_STATUS_LABELS: Record<string, string> = {
  searchCourseKnowledge: '正在检索课程资料…',
  getKnowledgeMastery: '正在查询知识点掌握度…',
  listWrongQuestions: '正在查询错题本…',
  listKnowledgePoints: '正在获取知识点目录…',
  listMyCourses: '正在查询课程列表…',
  getCourseDetail: '正在查询课程详情…',
  createCourse: '正在创建课程…',
  updateCourse: '正在更新课程…',
  deleteCourse: '正在删除课程…',
}

function toolStatusLabel(toolName: string): string {
  return TOOL_STATUS_LABELS[toolName] || `正在调用 ${toolName}…`
}

const route = useRoute()
const router = useRouter()
const { courses, currentCourse, selectedCourseId, courseStore, ensureCourses } = useCourseScope()

const mode = ref<ChatMode>('rag')
const tutorSessionId = ref<string | null>(null)
const tutorFinished = ref(false)
const tutorStarting = ref(false)
const tutorProgress = ref({
  totalRounds: 0,
  maxRounds: 5,
  currentKnowledgePoint: null as TutorKnowledgePointView | null,
  masteryScore: null as number | null,
})

const quickPrompts = ref<string[]>([])
const tutorQuickActions = ref<{ label: string; run: () => void }[]>([])

const MODE_CACHE_KEY = 'exam_chat_mode_'
const RAG_CONV_CACHE_KEY = 'exam_rag_conv_'
const MAX_RAG_MESSAGES = 50
const chatStorage = sessionStorage
let revertingMode = false

const activeRagConversationId = ref<number | null>(null)
const tutorReadOnly = ref(false)
const tutorInputMode = ref<'answer' | 'ask'>('answer')
const sidebarCollapsed = ref(false)
const sidebarLoading = ref(false)
const ragConversations = ref<RagConversationSummary[]>([])
const tutorSessions = ref<TutorSessionHistoryItem[]>([])
const selectedTutorSessionId = ref<string | null>(null)

// course selector
const showSelector = ref(false)

// chat
const messages = ref<Message[]>([])
const input = ref('')
const sending = ref(false)
const chatBox = ref<HTMLElement | null>(null)
const bottomAnchor = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const showNewMessageBtn = ref(false)
const stickToBottom = ref(true)
let abortCtrl: AbortController | null = null
let tutorHintTimer: ReturnType<typeof setInterval> | null = null

const SCROLL_NEAR_THRESHOLD = 80
const TEXTAREA_MAX_HEIGHT = 160

const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: '简单',
  MEDIUM: '中等',
  HARD: '困难',
}

const TUTOR_WAITING_HINTS = [
  'AI导师正在仔细阅读你的答案…',
  '正在对照知识点与标准答案进行评分…',
  '别急，严谨的反馈值得多等几秒…',
  '正在分析你的表述是否完整、准确…',
  '好的导师从不错过任何一个细节…',
  '快好了，正在组织对你的点评…',
]

const RAG_WAITING_HINTS = [
  '正在检索课程资料…',
  '正在组织回答…',
]

const courseTitle = computed(() => currentCourse.value?.courseName ?? '未选择课程')

const courseSubtitle = computed(() => {
  const c = currentCourse.value
  if (!c) return 'AI 对话'
  const parts = [c.teacher, c.semester].filter(Boolean)
  return parts.length > 0 ? `AI 对话 · ${parts.join(' · ')}` : 'AI 对话'
})

const modeStatusLine = computed(() => {
  if (mode.value === 'rag') {
    return '基于本课程资料回答'
  }
  const p = tutorProgress.value
  const currentRound = p.totalRounds > 0
    ? p.totalRounds
    : (tutorSessionId.value && !tutorFinished.value ? 1 : 0)
  const round = currentRound > 0 ? `第 ${currentRound}/${p.maxRounds} 轮` : `导师模式 · 共 ${p.maxRounds} 轮`
  const kp = p.currentKnowledgePoint?.name
  const mastery = p.masteryScore != null ? `掌握度 ${p.masteryScore}` : null
  return [round, kp, mastery].filter(Boolean).join(' · ')
})

const inputPlaceholder = computed(() => {
  if (mode.value !== 'tutor') return '输入你的问题...'
  return tutorInputMode.value === 'ask' ? '有疑问？向导师提问…' : '输入你的答案…'
})

const emptyHint = computed(() =>
  mode.value === 'tutor'
    ? '导师会按知识点逐题练习；答题时可随时切换「向导师提问」'
    : '有什么学习问题尽管问我，或试试下方快捷提问',
)

const showQuickPrompts = computed(() =>
  !sending.value && !tutorStarting.value && messages.value.length === 0,
)

const canSend = computed(() => {
  if (!input.value.trim() || sending.value || tutorStarting.value) return false
  if (mode.value === 'tutor') {
    return !!tutorSessionId.value && !tutorFinished.value && !tutorReadOnly.value
  }
  return !!selectedCourseId.value
})

const sidebarActiveId = computed(() => {
  if (mode.value === 'tutor') {
    return tutorSessionId.value ?? selectedTutorSessionId.value
  }
  return activeRagConversationId.value
})

const sidebarItems = computed<SidebarItem[]>(() => {
  if (mode.value === 'tutor') {
    return tutorSessions.value.map((s) => ({
      id: s.sessionId,
      title: s.memorySummary || `辅导 ${formatSidebarTime(s.endedTime || s.createTime)}`,
      subtitle: `${s.totalRounds}/${s.maxRounds} 轮${s.avgScore != null ? ` · 均分 ${s.avgScore}` : ''}`,
      badge: s.status === 'ACTIVE' ? '进行中' : s.status === 'FINISHED' ? '已完成' : undefined,
      readOnly: s.status !== 'ACTIVE',
    }))
  }
  return ragConversations.value.map((c) => ({
    id: c.conversationId,
    title: c.title || '新对话',
    subtitle: `${c.messageCount} 条消息 · ${formatSidebarTime(c.updateTime)}`,
  }))
})

function formatSidebarTime(s: string | null) {
  return s ? s.replace('T', ' ').substring(0, 16) : ''
}

function ragConvCacheKey(courseId: number) {
  return `${RAG_CONV_CACHE_KEY}${courseId}`
}

function saveActiveRagConversation(courseId: number) {
  try {
    if (activeRagConversationId.value) {
      chatStorage.setItem(ragConvCacheKey(courseId), String(activeRagConversationId.value))
    } else {
      chatStorage.removeItem(ragConvCacheKey(courseId))
    }
  } catch { /* quota */ }
}

function loadActiveRagConversation(courseId: number): number | null {
  try {
    const raw = chatStorage.getItem(ragConvCacheKey(courseId))
    if (!raw) return null
    const id = Number(raw)
    return Number.isNaN(id) ? null : id
  } catch {
    return null
  }
}

function scoreColor(score: number): string {
  if (score < 60) return '#e54d42'
  if (score < 80) return '#e6a23c'
  return '#07c160'
}

function difficultyLabel(d?: string): string {
  return d ? (DIFFICULTY_LABELS[d] ?? d) : ''
}

function difficultyClass(d?: string): string {
  return d ? `diff-${d.toLowerCase()}` : ''
}

function avatarIcon(msg: Message): IconName {
  if (msg.role === 'user') return 'user'
  if (msg.kind?.startsWith('tutor')) return 'quill'
  return 'dialogue'
}

function avatarRoleClass(msg: Message): string {
  if (msg.role === 'user') return 'avatar-user'
  if (msg.kind?.startsWith('tutor')) return 'avatar-tutor'
  return 'avatar-assistant'
}

function isNearBottom(el = chatBox.value): boolean {
  if (!el) return true
  const { scrollTop, scrollHeight, clientHeight } = el
  return scrollHeight - scrollTop - clientHeight <= SCROLL_NEAR_THRESHOLD
}

function scrollToBottom(force = false) {
  if (!force && !stickToBottom.value) {
    if (sending.value || messages.value.some((m) => m.streaming)) {
      showNewMessageBtn.value = true
    }
    return
  }

  const run = () => {
    const el = chatBox.value
    if (!el) return
    el.scrollTop = el.scrollHeight
    showNewMessageBtn.value = false
    stickToBottom.value = true
  }

  nextTick(() => {
    requestAnimationFrame(() => {
      run()
      requestAnimationFrame(run)
    })
  })
}

function jumpToBottom() {
  stickToBottom.value = true
  showNewMessageBtn.value = false
  const run = () => {
    const el = chatBox.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  }
  run()
  requestAnimationFrame(() => {
    run()
    requestAnimationFrame(run)
  })
}

function onChatScroll() {
  const near = isNearBottom()
  stickToBottom.value = near
  if (near) {
    showNewMessageBtn.value = false
    return
  }
  if (sending.value || messages.value.some((m) => m.streaming)) {
    showNewMessageBtn.value = true
  }
}

function adjustTextareaHeight() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`
}


function modeCacheKey(courseId: number) {
  return `${MODE_CACHE_KEY}${courseId}`
}

function saveModePreference(courseId: number) {
  try {
    chatStorage.setItem(modeCacheKey(courseId), mode.value)
  } catch { /* quota */ }
}

function loadModePreference(courseId: number): ChatMode | null {
  try {
    const saved = chatStorage.getItem(modeCacheKey(courseId))
    return saved === 'rag' || saved === 'tutor' ? saved : null
  } catch {
    return null
  }
}

function mapHistoryToMessages(history: ChatMessageVO[]): Message[] {
  return history.map((m) => ({
    role: m.role,
    content: m.content,
    kind: 'rag' as const,
  }))
}

async function loadRagConversationMessages(conversationId: number) {
  const history = await ragApi.getConversationMessages(conversationId, MAX_RAG_MESSAGES)
  messages.value = mapHistoryToMessages(history.messages)
  scrollToBottom(true)
}

async function loadSidebar() {
  const courseId = selectedCourseId.value
  if (!courseId) {
    ragConversations.value = []
    tutorSessions.value = []
    return
  }
  sidebarLoading.value = true
  try {
    if (mode.value === 'rag') {
      const page = await ragApi.listConversations({ courseId, page: 1, size: 50 })
      ragConversations.value = page.records
    } else {
      const page = await tutorApi.listHistory({ courseId, page: 1, size: 50 })
      tutorSessions.value = page.records
    }
  } catch {
    ragConversations.value = []
    tutorSessions.value = []
  } finally {
    sidebarLoading.value = false
  }
}

async function hydrateRagChat(courseId: number) {
  await loadSidebar()
  const cachedId = loadActiveRagConversation(courseId)
  const targetId = cachedId && ragConversations.value.some((c) => c.conversationId === cachedId)
    ? cachedId
    : ragConversations.value[0]?.conversationId ?? null

  if (targetId) {
    activeRagConversationId.value = targetId
    saveActiveRagConversation(courseId)
    await loadRagConversationMessages(targetId)
  } else {
    activeRagConversationId.value = null
    messages.value = []
  }
}

async function selectRagConversation(id: string | number) {
  if (sending.value) return
  const convId = Number(id)
  if (Number.isNaN(convId)) return
  stopStreaming()
  activeRagConversationId.value = convId
  if (selectedCourseId.value) saveActiveRagConversation(selectedCourseId.value)
  await loadRagConversationMessages(convId)
}

async function selectTutorSession(id: string | number) {
  if (sending.value || tutorStarting.value) return
  const sessionId = String(id)
  const item = tutorSessions.value.find((s) => s.sessionId === sessionId)
  if (!item) return

  stopStreaming()

  if (item.status === 'ACTIVE') {
    tutorReadOnly.value = false
    selectedTutorSessionId.value = sessionId
    try {
      const detail = await tutorApi.getActiveSession(selectedCourseId.value!)
      if (detail && detail.session.sessionId === sessionId) {
        applyTutorSessionSnapshot(detail.session)
        messages.value = buildMessagesFromTutorDetail(detail)
        scrollToBottom(true)
        return
      }
    } catch { /* fall through */ }
  }

  tutorReadOnly.value = true
  tutorSessionId.value = null
  tutorFinished.value = true
  selectedTutorSessionId.value = sessionId
  try {
    const detail = await tutorApi.getSessionHistory(sessionId)
    messages.value = buildMessagesFromTutorDetail(detail)
    syncTutorProgressFromSession(detail.session)
    scrollToBottom(true)
  } catch {
    ElMessage.error('加载辅导记录失败')
  }
}

async function startNewChat() {
  stopStreaming()
  if (mode.value === 'rag') {
    activeRagConversationId.value = null
    messages.value = []
    if (selectedCourseId.value) saveActiveRagConversation(selectedCourseId.value)
    return
  }

  tutorReadOnly.value = false
  selectedTutorSessionId.value = null
  await startTutorSession({ forceNew: true })
  await loadSidebar()
}

async function deleteRagConversation(id: string | number) {
  const convId = Number(id)
  if (Number.isNaN(convId)) return
  try {
    await ElMessageBox.confirm('删除后无法恢复，是否继续？', '删除对话', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await ragApi.deleteConversation(convId)
    if (activeRagConversationId.value === convId) {
      activeRagConversationId.value = null
      messages.value = []
      if (selectedCourseId.value) saveActiveRagConversation(selectedCourseId.value)
    }
    await loadSidebar()
    ElMessage.success('已删除')
  } catch (err: any) {
    ElMessage.error(err.message || '删除失败')
  }
}

async function deleteTutorSession(id: string | number) {
  const sessionId = String(id)
  try {
    await ElMessageBox.confirm('删除后无法恢复，是否继续？', '删除辅导记录', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await tutorApi.deleteSessionHistory(sessionId)
    if (tutorSessionId.value === sessionId || selectedTutorSessionId.value === sessionId) {
      tutorSessionId.value = null
      selectedTutorSessionId.value = null
      tutorReadOnly.value = false
      tutorFinished.value = false
      messages.value = []
      resetTutorProgress()
    }
    await loadSidebar()
    ElMessage.success('已删除')
  } catch (err: any) {
    ElMessage.error(err.message || '删除失败')
  }
}

function resetTutorProgress() {
  tutorProgress.value = {
    totalRounds: 0,
    maxRounds: 5,
    currentKnowledgePoint: null,
    masteryScore: null,
  }
}

function syncTutorProgressFromSession(session: {
  totalRounds: number
  maxRounds: number
  currentKnowledgePoint?: TutorKnowledgePointView | null
}) {
  tutorProgress.value.totalRounds = session.totalRounds
  tutorProgress.value.maxRounds = session.maxRounds
  if (session.currentKnowledgePoint) {
    tutorProgress.value.currentKnowledgePoint = session.currentKnowledgePoint
    tutorProgress.value.masteryScore = session.currentKnowledgePoint.masteryScore
  }
}

async function loadQuickPrompts() {
  quickPrompts.value = []
  tutorQuickActions.value = []
  const courseId = selectedCourseId.value
  if (!courseId) return

  try {
    const [tree, masteryList] = await Promise.all([
      knowledgePointApi.getTree(courseId),
      knowledgeMasteryApi.listByCourse(courseId),
    ])

    const masteryMap = new Map(masteryList.map((m) => [m.knowledgePointId, m.masteryScore]))
    const allKps: KnowledgePointResponse[] = tree.chapters.flatMap((ch) => ch.knowledgePoints)

    if (mode.value === 'rag') {
      const prompts: string[] = []
      const firstChapter = tree.chapters[0]?.chapter
      if (firstChapter) {
        prompts.push(`总结「${firstChapter}」本章重点`)
      } else {
        prompts.push('总结本章重点')
      }

      const weakKps = [...allKps]
        .sort((a, b) => (masteryMap.get(a.id) ?? 100) - (masteryMap.get(b.id) ?? 100))
        .slice(0, 2)
      for (const kp of weakKps) {
        prompts.push(`${kp.name}的核心概念是什么？`)
      }

      if (allKps.length >= 2) {
        const [a, b] = allKps.slice(0, 2)
        prompts.push(`${a.name}和${b.name}的区别？`)
      }

      quickPrompts.value = prompts.slice(0, 4)
    } else {
      const actions: { label: string; run: () => void }[] = []
      const weakIds = [...allKps]
        .sort((a, b) => (masteryMap.get(a.id) ?? 100) - (masteryMap.get(b.id) ?? 100))
        .filter((kp) => (masteryMap.get(kp.id) ?? 0) < 70)
        .slice(0, 5)
        .map((kp) => kp.id)

      if (weakIds.length > 0) {
        actions.push({
          label: '开始薄弱点练习',
          run: () => { void startTutorSession({ forceNew: true, knowledgePointIds: weakIds }) },
        })
      }

      for (const ch of tree.chapters.slice(0, 2)) {
        const kpIds = ch.knowledgePoints.map((kp) => kp.id)
        if (kpIds.length === 0) continue
        actions.push({
          label: `只练「${ch.chapter}」`,
          run: () => { void startTutorSession({ forceNew: true, knowledgePointIds: kpIds }) },
        })
      }

      tutorQuickActions.value = actions.slice(0, 3)
    }
  } catch {
  /* silent — quick prompts are optional */
  }
}

function fillQuickPrompt(text: string) {
  input.value = text
  adjustTextareaHeight()
}

function pushTutorQuestion(
  question: TutorQuestionView,
  knowledgePoint?: TutorKnowledgePointView | null,
) {
  messages.value.push({
    role: 'assistant',
    content: formatTutorQuestionContent(question.content),
    kind: 'tutor_question',
    tutorMeta: {
      knowledgePoint: knowledgePoint ?? undefined,
      questionType: question.questionType,
      difficulty: question.difficulty,
    },
  })
}

async function endTutorSessionSilently() {
  const sid = tutorSessionId.value
  tutorSessionId.value = null
  tutorFinished.value = false
  if (!sid) return
  try {
    await tutorApi.endSession(sid)
  } catch {
    /* silent */
  }
}

function applyTutorSessionSnapshot(session: {
  sessionId: string
  phase: string
  totalRounds: number
  maxRounds: number
  currentKnowledgePoint?: TutorKnowledgePointView | null
}) {
  tutorSessionId.value = session.sessionId
  tutorFinished.value = session.phase === 'FINISHED'
  syncTutorProgressFromSession(session)
}

function buildMessagesFromTutorDetail(detail: TutorSessionDetailResponse): Message[] {
  return buildTutorChatMessages(detail) as Message[]
}

async function restoreTutorSession(courseId: number): Promise<boolean> {
  try {
    const detail = await tutorApi.getActiveSession(courseId)
    if (!detail) return false
    tutorReadOnly.value = false
    selectedTutorSessionId.value = detail.session.sessionId
    applyTutorSessionSnapshot(detail.session)
    messages.value = buildMessagesFromTutorDetail(detail)
    scrollToBottom(true)
    return true
  } catch {
    return false
  }
}

async function hydrateChat(courseId: number) {
  await loadSidebar()
  if (mode.value === 'tutor') {
    const restored = await restoreTutorSession(courseId)
    if (!restored) {
      tutorReadOnly.value = false
      tutorSessionId.value = null
      tutorFinished.value = false
      messages.value = []
      resetTutorProgress()
    }
  } else {
    await hydrateRagChat(courseId)
  }
}

async function startTutorSession(
  options: Partial<TutorStartSessionRequest> & { forceNew?: boolean } = {},
) {
  const { forceNew = false, ...startOptions } = options
  const courseId = startOptions.courseId ?? selectedCourseId.value
  if (!courseId || tutorStarting.value) return
  tutorStarting.value = true
  try {
    if (!forceNew) {
      const restored = await restoreTutorSession(courseId)
      if (restored) return
    } else {
      await endTutorSessionSilently()
    }

    messages.value = []
    resetTutorProgress()
    tutorInputMode.value = 'answer'

    const session = await tutorApi.startSession({ courseId, ...startOptions })
    applyTutorSessionSnapshot(session)
    selectedTutorSessionId.value = session.sessionId
    tutorReadOnly.value = false

    if (session.openingComment) {
      messages.value.push({
        role: 'assistant',
        content: session.openingComment,
        kind: 'tutor_system',
      })
    }
    if (session.question) {
      pushTutorQuestion(session.question, session.currentKnowledgePoint)
    }
    tutorReadOnly.value = false
    await loadSidebar()
    scrollToBottom(true)
  } catch (err: any) {
    ElMessage.error(err.message || '导师会话启动失败')
  } finally {
    tutorStarting.value = false
  }
}

async function applyModeSwitch(target: ChatMode, fromMode: ChatMode) {
  stopStreaming()
  const courseId = selectedCourseId.value

  if (target === 'tutor') {
    resetTutorProgress()
    tutorReadOnly.value = false
    if (selectedCourseId.value && !showSelector.value) {
      await loadSidebar()
      const restored = await restoreTutorSession(selectedCourseId.value)
      if (!restored) {
        messages.value = []
      }
    } else {
      messages.value = []
    }
  } else {
    await endTutorSessionSilently()
    resetTutorProgress()
    tutorReadOnly.value = false
    if (courseId) {
      await hydrateRagChat(courseId)
    } else {
      messages.value = []
    }
  }

  await loadQuickPrompts()
  scrollToBottom(true)
}

async function onModeTabClick(target: ChatMode) {
  if (target === mode.value || revertingMode) return
  mode.value = target
  await onModeChange(target)
}

async function onModeChange(newMode: string | number | boolean) {
  if (revertingMode) return
  const target = newMode as ChatMode
  const fromMode: ChatMode = target === 'rag' ? 'tutor' : 'rag'
  const hasActiveTutor = fromMode === 'tutor' && !!tutorSessionId.value && !tutorFinished.value
  const leavingTutorWithHistory = fromMode === 'tutor' && messages.value.length > 0

  if (hasActiveTutor || leavingTutorWithHistory) {
    try {
      await ElMessageBox.confirm(
        '切换模式将结束当前对话，是否继续？',
        '切换模式',
        { confirmButtonText: '继续', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      revertingMode = true
      mode.value = fromMode
      revertingMode = false
      return
    }
  }

  await applyModeSwitch(target, fromMode)
  if (selectedCourseId.value) {
    saveModePreference(selectedCourseId.value)
  }
}

async function fetchCourses() {
  await ensureCourses()
}

function initCourse() {
  const id = route.params.courseId
  if (id) {
    courseStore.setCourseId(Number(id))
    showSelector.value = false
    return
  }
  if (selectedCourseId.value) {
    showSelector.value = false
  } else {
    showSelector.value = true
  }
}

async function handleCourseChanged(content: string) {
  const colon = content.indexOf(':')
  if (colon < 0) return
  const action = content.slice(0, colon)
  const courseId = Number(content.slice(colon + 1))
  if (Number.isNaN(courseId)) return

  await courseStore.fetchCourses()

  if (action === 'deleted' && selectedCourseId.value === courseId) {
    messages.value = []
    if (courses.value.length > 0) {
      await selectCourse(courses.value[0])
    } else {
      courseStore.setCourseId(null)
      showSelector.value = true
    }
  }
}

async function selectCourse(c: CourseResponse) {
  await endTutorSessionSilently()
  resetTutorProgress()
  courseStore.setCourseId(c.id)
  showSelector.value = false
  const savedMode = loadModePreference(c.id)
  if (savedMode) {
    mode.value = savedMode
  }
  saveModePreference(c.id)
  if (mode.value === 'tutor') {
    await loadSidebar()
    const restored = await restoreTutorSession(c.id)
    if (!restored) {
      tutorReadOnly.value = false
      tutorSessionId.value = null
      messages.value = []
    }
  } else {
    await hydrateRagChat(c.id)
  }
  await loadQuickPrompts()
  scrollToBottom(true)
}

async function sendRag() {
  const text = input.value.trim()
  if (!text || !selectedCourseId.value || sending.value) return

  messages.value.push({ role: 'user', content: text, kind: 'rag' })
  input.value = ''
  adjustTextareaHeight()
  stickToBottom.value = true
  scrollToBottom(true)

  const aiMsg: Message = {
    role: 'assistant',
    content: '',
    streaming: true,
    kind: 'rag_thinking',
    tutorMeta: { thinkingHint: RAG_WAITING_HINTS[0] },
  }
  messages.value.push(aiMsg)
  sending.value = true

  try {
    abortCtrl = new AbortController()
    const response = await ragApi.chat({
      courseId: selectedCourseId.value,
      conversationId: activeRagConversationId.value,
      question: text,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      let errorMsg = `请求失败 (${response.status})`
      try {
        const errJson = JSON.parse(errorText)
        if (errJson.message) errorMsg = errJson.message
      } catch { /* not JSON */ }
      throw new Error(errorMsg)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('浏览器不支持流式读取')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const event = JSON.parse(data)
          if (event.type === 'conversation' && event.content) {
            const convId = Number(event.content)
            if (!Number.isNaN(convId)) {
              activeRagConversationId.value = convId
              if (selectedCourseId.value) saveActiveRagConversation(selectedCourseId.value)
              void loadSidebar()
            }
          } else if (event.type === 'status' && event.content) {
            if (aiMsg.tutorMeta) {
              aiMsg.tutorMeta.thinkingHint = event.content
            }
            await nextTick()
            scrollToBottom()
          } else if (event.type === 'tool_call' && event.content) {
            if (aiMsg.tutorMeta) {
              aiMsg.tutorMeta.thinkingHint = toolStatusLabel(event.content)
            }
            await nextTick()
            scrollToBottom()
          } else if (event.type === 'content' && event.content) {
            if (aiMsg.kind === 'rag_thinking') {
              aiMsg.kind = 'rag'
            }
            aiMsg.content += event.content
            await nextTick()
            scrollToBottom()
          } else if (event.type === 'course_changed' && event.content) {
            await handleCourseChanged(event.content)
          } else if (event.type === 'error') {
            aiMsg.kind = 'rag'
            aiMsg.content = event.content || '服务端错误，请稍后重试'
          }
        } catch { /* skip malformed */ }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // user cancelled — keep whatever content was received
    } else {
      aiMsg.content = aiMsg.content || `抱歉，${err.message || '请求失败，请稍后重试。'}`
    }
    if (err.name !== 'AbortError') {
      console.error('Chat error:', err)
    }
  } finally {
    if (aiMsg.kind === 'rag_thinking') {
      aiMsg.kind = 'rag'
    }
    aiMsg.streaming = false
    sending.value = false
    abortCtrl = null
    await loadSidebar()
    scrollToBottom()
  }
}

function clearTutorHintTimer() {
  if (tutorHintTimer) {
    clearInterval(tutorHintTimer)
    tutorHintTimer = null
  }
}

function startTutorHintRotation(aiMsg: Message) {
  clearTutorHintTimer()
  let hintIndex = 0
  tutorHintTimer = setInterval(() => {
    if (!aiMsg.streaming || aiMsg.kind !== 'tutor_thinking') {
      clearTutorHintTimer()
      return
    }
    hintIndex = (hintIndex + 1) % TUTOR_WAITING_HINTS.length
    if (aiMsg.tutorMeta) {
      aiMsg.tutorMeta.thinkingHint = TUTOR_WAITING_HINTS[hintIndex]
    }
    scrollToBottom()
  }, 2200)
}

function handleTutorStreamEvent(
  event: TutorAnswerStreamEvent,
  aiMsg: Message,
  pending: {
    nextAction?: TutorNextAction
    question?: TutorQuestionView
    knowledgePoint?: TutorKnowledgePointView
    closingComment?: string
    sessionSummary?: TutorSessionSummary
  },
) {
  switch (event.type) {
    case 'status':
      if (event.content && aiMsg.tutorMeta) {
        aiMsg.tutorMeta.thinkingHint = event.content
      }
      break
    case 'score':
      clearTutorHintTimer()
      aiMsg.kind = 'tutor_feedback'
      if (aiMsg.tutorMeta && event.score != null) {
        aiMsg.tutorMeta.score = event.score
      }
      break
    case 'comment':
      if (aiMsg.kind === 'tutor_thinking') {
        aiMsg.kind = 'tutor_feedback'
      }
      if (event.content) {
        aiMsg.content += event.content
      }
      break
    case 'feedback':
      if (aiMsg.tutorMeta && event.feedback) {
        aiMsg.tutorMeta.missingPoints = event.feedback.missingPoints
        aiMsg.tutorMeta.suggestions = event.feedback.suggestions
      }
      break
    case 'mastery':
      if (aiMsg.tutorMeta && event.masteryScore != null) {
        aiMsg.tutorMeta.masteryScore = event.masteryScore
        tutorProgress.value.masteryScore = event.masteryScore
      }
      break
    case 'next':
      if (event.nextAction) pending.nextAction = event.nextAction
      if (event.totalRounds != null) {
        tutorProgress.value.totalRounds = event.totalRounds
      }
      break
    case 'question':
      if (event.question) pending.question = event.question
      if (event.currentKnowledgePoint) {
        pending.knowledgePoint = event.currentKnowledgePoint
        tutorProgress.value.currentKnowledgePoint = event.currentKnowledgePoint
        if (event.currentKnowledgePoint.masteryScore != null) {
          tutorProgress.value.masteryScore = event.currentKnowledgePoint.masteryScore
        }
      }
      break
    case 'closing':
      if (event.content) pending.closingComment = event.content
      break
    case 'summary':
      if (event.sessionSummary) pending.sessionSummary = event.sessionSummary
      break
    case 'error':
      aiMsg.kind = 'tutor_feedback'
      aiMsg.content = event.content || '评分失败，请稍后重试'
      break
    default:
      break
  }
}

async function sendTutorAsk() {
  const text = input.value.trim()
  if (!text || !tutorSessionId.value || sending.value || tutorFinished.value) return

  messages.value.push({ role: 'user', content: text })
  input.value = ''
  adjustTextareaHeight()
  stickToBottom.value = true
  scrollToBottom(true)

  const aiMsg: Message = {
    role: 'assistant',
    content: '',
    kind: 'tutor_explain',
    streaming: true,
    tutorMeta: { thinkingHint: '正在检索资料并组织解答…' },
  }
  messages.value.push(aiMsg)
  sending.value = true
  scrollToBottom()

  try {
    abortCtrl = new AbortController()
    const response = await tutorApi.chatInSessionStream(
      tutorSessionId.value,
      { message: text },
      abortCtrl.signal,
    )

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      let errorMsg = `请求失败 (${response.status})`
      try {
        const errJson = JSON.parse(errorText)
        if (errJson.message) errorMsg = errJson.message
      } catch { /* not JSON */ }
      throw new Error(errorMsg)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('浏览器不支持流式读取')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const event = JSON.parse(data) as {
            type: string
            content?: string | null
            references?: ReferenceVO[] | null
          }
          if (event.type === 'status' && event.content && aiMsg.tutorMeta) {
            aiMsg.tutorMeta.thinkingHint = event.content
          } else if (event.type === 'content' && event.content) {
            aiMsg.content += event.content
          } else if (event.type === 'references' && event.references?.length) {
            aiMsg.references = event.references
          } else if (event.type === 'error') {
            aiMsg.content = event.content || '提问失败，请稍后重试'
          }
          await nextTick()
          scrollToBottom()
        } catch { /* skip malformed */ }
      }
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      ElMessage.error(err.message || '提问失败')
      aiMsg.content = aiMsg.content || `抱歉，${err.message || '提问失败，请稍后重试。'}`
    }
  } finally {
    aiMsg.streaming = false
    sending.value = false
    abortCtrl = null
    scrollToBottom()
  }
}

async function sendTutor() {
  const text = input.value.trim()
  if (!text || !tutorSessionId.value || sending.value || tutorFinished.value) return

  messages.value.push({ role: 'user', content: text })
  input.value = ''
  adjustTextareaHeight()
  stickToBottom.value = true
  scrollToBottom(true)

  const aiMsg: Message = {
    role: 'assistant',
    content: '',
    kind: 'tutor_thinking',
    streaming: true,
    tutorMeta: { thinkingHint: TUTOR_WAITING_HINTS[0] },
  }
  messages.value.push(aiMsg)
  startTutorHintRotation(aiMsg)
  sending.value = true
  scrollToBottom()

  const pending: {
    nextAction?: TutorNextAction
    question?: TutorQuestionView
    knowledgePoint?: TutorKnowledgePointView
    closingComment?: string
    sessionSummary?: TutorSessionSummary
  } = {}

  try {
    abortCtrl = new AbortController()
    const response = await tutorApi.submitAnswerStream(
      tutorSessionId.value,
      { answer: text },
      abortCtrl.signal,
    )

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      let errorMsg = `请求失败 (${response.status})`
      try {
        const errJson = JSON.parse(errorText)
        if (errJson.message) errorMsg = errJson.message
      } catch { /* not JSON */ }
      throw new Error(errorMsg)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('浏览器不支持流式读取')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const event = JSON.parse(data) as TutorAnswerStreamEvent
          handleTutorStreamEvent(event, aiMsg, pending)
          await nextTick()
          scrollToBottom()
        } catch { /* skip malformed */ }
      }
    }

    if (pending.nextAction === 'FINISHED') {
      tutorFinished.value = true
      if (pending.sessionSummary) {
        messages.value.push({
          role: 'assistant',
          content: pending.sessionSummary.encouragement,
          kind: 'tutor_summary',
          tutorMeta: { sessionSummary: pending.sessionSummary },
        })
      } else if (pending.closingComment) {
        messages.value.push({
          role: 'assistant',
          content: pending.closingComment,
          kind: 'tutor_system',
        })
      }
    } else if (pending.question) {
      pushTutorQuestion(pending.question, pending.knowledgePoint)
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      aiMsg.content = aiMsg.content || '已停止等待导师反馈'
    } else {
      ElMessage.error(err.message || '提交答案失败')
      aiMsg.kind = 'tutor_feedback'
      aiMsg.content = aiMsg.content || `抱歉，${err.message || '提交失败，请稍后重试。'}`
    }
  } finally {
    clearTutorHintTimer()
    aiMsg.streaming = false
    if (aiMsg.kind === 'tutor_thinking') {
      aiMsg.kind = 'tutor_feedback'
    }
    sending.value = false
    abortCtrl = null
    void loadSidebar()
    scrollToBottom()
  }
}

async function send() {
  if (mode.value === 'tutor') {
    if (tutorInputMode.value === 'ask') {
      await sendTutorAsk()
    } else {
      await sendTutor()
    }
  } else {
    await sendRag()
  }
}

function stopStreaming() {
  if (abortCtrl) {
    abortCtrl.abort()
    abortCtrl = null
  }
  clearTutorHintTimer()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (canSend.value) send()
  }
}

onMounted(async () => {
  await fetchCourses()
  initCourse()
  if (selectedCourseId.value && !showSelector.value) {
    const savedMode = loadModePreference(selectedCourseId.value)
    if (savedMode) {
      mode.value = savedMode
    }
    await hydrateChat(selectedCourseId.value)
    await loadQuickPrompts()
  }
  nextTick(() => adjustTextareaHeight())
})

watch(input, () => {
  adjustTextareaHeight()
})

watch(mode, () => {
  if (!showSelector.value && selectedCourseId.value) {
    void loadQuickPrompts()
  }
})

onBeforeUnmount(() => {
  stopStreaming()
  clearTutorHintTimer()
  if (selectedCourseId.value) {
    saveModePreference(selectedCourseId.value)
  }
})
</script>

<template>
  <div class="chat-page">
    <!-- Course Selector (no courseId) -->
    <template v-if="showSelector">
      <div class="page-header">
        <h1>AI 对话</h1>
        <p class="sub">选择课程，与 AI 探讨学习问题</p>
      </div>
      <div class="selector-list">
        <div
          v-for="c in courses"
          :key="c.id"
          class="sel-item"
          @click="selectCourse(c)"
        >
          <CourseSeal :name="c.courseName" :id="c.id" size="md" />
          <span class="sel-name">{{ c.courseName }}</span>
          <span class="sel-arrow">→</span>
        </div>
      </div>
      <EmptyBlock
        v-if="courses.length === 0"
        icon="dialogue"
        title="还没有课程"
        description="创建课程后即可使用 AI 对话"
      />
    </template>

    <!-- Chat -->
    <template v-else>
      <div class="chat-shell">
        <ChatSidebar
          :mode="mode"
          :items="sidebarItems"
          :active-id="sidebarActiveId"
          :loading="sidebarLoading"
          :collapsed="sidebarCollapsed"
          @new-chat="startNewChat"
          @select="mode === 'rag' ? selectRagConversation($event) : selectTutorSession($event)"
          @delete="mode === 'rag' ? deleteRagConversation($event) : deleteTutorSession($event)"
          @toggle="sidebarCollapsed = !sidebarCollapsed"
        />

        <div class="chat-main">
          <header class="chat-toolbar">
            <div class="toolbar-left">
              <CourseSeal
                v-if="currentCourse"
                :name="currentCourse.courseName"
                :id="currentCourse.id"
                size="sm"
              />
              <div class="toolbar-info">
                <h1 class="toolbar-title">{{ courseTitle }}</h1>
                <p class="toolbar-meta">{{ modeStatusLine }}</p>
              </div>
            </div>
            <div class="toolbar-right">
              <button type="button" class="link-btn" @click="showSelector = true">切换课程</button>
              <div class="mode-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  class="mode-tab"
                  :class="{ active: mode === 'rag' }"
                  :aria-selected="mode === 'rag'"
                  @click="onModeTabClick('rag')"
                >
                  问答
                </button>
                <button
                  type="button"
                  role="tab"
                  class="mode-tab"
                  :class="{ active: mode === 'tutor' }"
                  :aria-selected="mode === 'tutor'"
                  @click="onModeTabClick('tutor')"
                >
                  导师
                </button>
              </div>
            </div>
          </header>

          <div class="chat-body">
            <div class="messages-wrap">
              <div ref="chatBox" class="chat-messages" @scroll="onChatScroll">
                <div class="chat-thread">
                  <div v-if="messages.length === 0 && !tutorStarting" class="chat-empty">
                    <div class="empty-icon">
                      <AppIcon name="dialogue" :size="32" />
                    </div>
                    <h2 class="empty-title">{{ mode === 'tutor' ? '开始导师练习' : '开始提问' }}</h2>
                    <p class="empty-desc">{{ emptyHint }}</p>
                    <div v-if="showQuickPrompts && mode === 'rag' && quickPrompts.length > 0" class="quick-prompts">
                      <button
                        v-for="(prompt, qi) in quickPrompts"
                        :key="qi"
                        type="button"
                        class="quick-chip"
                        @click="fillQuickPrompt(prompt)"
                      >
                        {{ prompt }}
                      </button>
                    </div>
                    <div v-if="showQuickPrompts && mode === 'tutor' && tutorQuickActions.length > 0" class="quick-prompts">
                      <button
                        v-for="(action, ai) in tutorQuickActions"
                        :key="ai"
                        type="button"
                        class="quick-chip tutor"
                        @click="action.run()"
                      >
                        {{ action.label }}
                      </button>
                    </div>
                  </div>
                  <div v-if="tutorStarting" class="chat-empty">
                    <div class="empty-icon">
                      <AppIcon name="quill" :size="32" />
                    </div>
                    <p class="empty-desc">正在启动导师会话…</p>
                  </div>

                  <template v-for="(msg, idx) in messages" :key="idx">
                    <div v-if="msg.kind === 'tutor_system'" class="system-msg-row">
                      <div class="system-msg-bar">{{ msg.content }}</div>
                    </div>

                    <div v-else-if="msg.kind === 'tutor_summary' && msg.tutorMeta?.sessionSummary" class="chat-msg assistant kind-tutor_summary">
                      <div class="msg-avatar avatar-tutor">
                        <AppIcon name="quill" :size="16" />
                      </div>
                      <div class="msg-body">
                        <div class="tutor-summary-card">
                          <div class="summary-header">
                            <span class="msg-type-label summary">辅导总结</span>
                            <span v-if="msg.tutorMeta.sessionSummary.totalRounds > 0" class="summary-stats">
                              {{ msg.tutorMeta.sessionSummary.totalRounds }} 题 · 均分 {{ msg.tutorMeta.sessionSummary.avgScore }}
                            </span>
                          </div>
                          <p class="summary-encouragement">{{ msg.tutorMeta.sessionSummary.encouragement }}</p>
                          <div
                            v-if="msg.tutorMeta.sessionSummary.strongPoints.length > 0"
                            class="feedback-section strong-points"
                          >
                            <div class="section-title">掌握较好</div>
                            <ul>
                              <li v-for="(pt, pi) in msg.tutorMeta.sessionSummary.strongPoints" :key="pi">{{ pt }}</li>
                            </ul>
                          </div>
                          <div
                            v-if="msg.tutorMeta.sessionSummary.weakPoints.length > 0"
                            class="feedback-section missing-points"
                          >
                            <div class="section-title">仍需加强</div>
                            <ul>
                              <li v-for="(pt, pi) in msg.tutorMeta.sessionSummary.weakPoints" :key="pi">{{ pt }}</li>
                            </ul>
                          </div>
                          <div
                            v-if="msg.tutorMeta.sessionSummary.suggestedActions.length > 0"
                            class="feedback-section suggestions"
                          >
                            <div class="section-title">后续建议</div>
                            <ul>
                              <li v-for="(sg, si) in msg.tutorMeta.sessionSummary.suggestedActions" :key="si">{{ sg }}</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      v-else
                      class="chat-msg"
                      :class="[msg.role, msg.kind ? `kind-${msg.kind}` : '']"
                    >
                      <div class="msg-avatar" :class="avatarRoleClass(msg)">
                        <AppIcon :name="avatarIcon(msg)" :size="16" />
                      </div>
                      <div class="msg-body">
                        <template v-if="msg.kind === 'tutor_question'">
                          <div class="tutor-question-card">
                            <div class="tutor-q-header">
                              <span class="msg-type-label">题目</span>
                              <span
                                v-if="msg.tutorMeta?.difficulty"
                                class="difficulty-badge"
                                :class="difficultyClass(msg.tutorMeta.difficulty)"
                              >
                                {{ difficultyLabel(msg.tutorMeta.difficulty) }}
                              </span>
                            </div>
                            <div v-if="msg.tutorMeta?.knowledgePoint" class="kp-chip">
                              {{ msg.tutorMeta.knowledgePoint.name }}
                              <span
                                v-if="msg.tutorMeta.knowledgePoint.masteryScore != null"
                                class="kp-score"
                              >
                                掌握度 {{ msg.tutorMeta.knowledgePoint.masteryScore }}
                              </span>
                            </div>
                            <div class="msg-content tutor-q-content">{{ msg.content }}</div>
                          </div>
                        </template>

                        <template v-else-if="msg.kind === 'tutor_thinking' || msg.kind === 'rag_thinking'">
                          <div class="tutor-thinking-card">
                            <div class="thinking-dots" aria-hidden="true">
                              <span /><span /><span />
                            </div>
                            <p class="thinking-hint">{{ msg.tutorMeta?.thinkingHint }}</p>
                          </div>
                        </template>

                        <template v-else-if="msg.kind === 'tutor_feedback'">
                          <div class="tutor-feedback-card">
                            <div class="feedback-header">
                              <span class="msg-type-label feedback">评分</span>
                              <ScoreRing
                                v-if="msg.tutorMeta?.score != null"
                                :score="msg.tutorMeta.score"
                                :color="scoreColor(msg.tutorMeta.score)"
                              />
                            </div>
                            <div v-if="msg.content || msg.streaming" class="tutor-comment">
                              <MarkdownContent :content="msg.content" :streaming="msg.streaming" />
                            </div>
                            <div
                              v-if="!msg.streaming && msg.tutorMeta?.missingPoints && msg.tutorMeta.missingPoints.length > 0"
                              class="feedback-section missing-points"
                            >
                              <div class="section-title">遗漏要点</div>
                              <ul>
                                <li v-for="(pt, pi) in msg.tutorMeta.missingPoints" :key="pi">{{ pt }}</li>
                              </ul>
                            </div>
                            <div
                              v-if="!msg.streaming && msg.tutorMeta?.suggestions && msg.tutorMeta.suggestions.length > 0"
                              class="feedback-section suggestions"
                            >
                              <div class="section-title">改进建议</div>
                              <ul>
                                <li v-for="(sg, si) in msg.tutorMeta.suggestions" :key="si">{{ sg }}</li>
                              </ul>
                            </div>
                          </div>
                        </template>

                        <template v-else-if="msg.kind === 'tutor_explain'">
                          <div class="tutor-explain-card">
                            <span class="msg-type-label explain">导师解答</span>
                            <div v-if="msg.streaming && !msg.content" class="tutor-thinking-card compact">
                              <div class="thinking-dots" aria-hidden="true">
                                <span /><span /><span />
                              </div>
                              <p class="thinking-hint">{{ msg.tutorMeta?.thinkingHint }}</p>
                            </div>
                            <div v-if="msg.content" class="tutor-comment">
                              <MarkdownContent :content="msg.content" :streaming="msg.streaming" />
                            </div>
                          </div>
                        </template>

                        <template v-else-if="msg.role === 'user'">
                          <div class="msg-content user-bubble">{{ msg.content }}</div>
                        </template>

                        <template v-else>
                          <div class="msg-content rag-bubble">
                            <MarkdownContent :content="msg.content" :streaming="msg.streaming" />
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>
                </div>
                <div ref="bottomAnchor" class="scroll-anchor" aria-hidden="true" />
              </div>

              <button
                v-if="showNewMessageBtn"
                type="button"
                class="scroll-bottom-btn"
                @click="jumpToBottom"
              >
                ↓ 新消息
              </button>
            </div>

            <div class="chat-composer">
              <div class="chat-thread">
                <div v-if="mode === 'tutor' && tutorReadOnly" class="tutor-status-bar">
                  <span>正在查看历史辅导记录</span>
                  <el-button type="primary" size="small" :loading="tutorStarting" @click="startNewChat">
                    开始新辅导
                  </el-button>
                </div>
                <div v-else-if="mode === 'tutor' && tutorFinished" class="tutor-status-bar">
                  <span>本轮导师练习已结束</span>
                  <el-button type="primary" size="small" :loading="tutorStarting" @click="startTutorSession({ forceNew: true })">
                    开始新一轮
                  </el-button>
                </div>
                <div v-else class="composer-box">
                  <div v-if="mode === 'tutor' && tutorSessionId && !tutorFinished" class="tutor-input-mode">
                    <button
                      type="button"
                      class="mode-chip"
                      :class="{ active: tutorInputMode === 'answer' }"
                      @click="tutorInputMode = 'answer'"
                    >
                      提交答案
                    </button>
                    <button
                      type="button"
                      class="mode-chip"
                      :class="{ active: tutorInputMode === 'ask' }"
                      @click="tutorInputMode = 'ask'"
                    >
                      向导师提问
                    </button>
                  </div>
                  <textarea
                    ref="textareaRef"
                    v-model="input"
                    class="chat-textarea"
                    rows="1"
                    :placeholder="inputPlaceholder"
                    :disabled="sending || tutorStarting"
                    @keydown="handleKeydown"
                    @input="adjustTextareaHeight"
                  />
                  <div class="composer-actions">
                    <span class="input-hint">Enter 发送 · Shift+Enter 换行</span>
                    <el-button
                      v-if="sending"
                      class="send-btn stop-btn"
                      type="danger"
                      size="small"
                      round
                      @click="stopStreaming"
                    >
                      停止
                    </el-button>
                    <el-button
                      v-else
                      class="send-btn"
                      type="primary"
                      size="small"
                      round
                      :disabled="!canSend"
                      :loading="tutorStarting"
                      @click="send"
                    >
                      <span class="send-label-desktop">{{ mode === 'tutor' && tutorInputMode === 'ask' ? '提问' : '发送' }}</span>
                      <Promotion class="send-icon-mobile" />
                    </el-button>
                  </div>
                </div>
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

.chat-page {
  margin: -28px -32px;
  height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.page-header {
  flex-shrink: 0;
  margin-bottom: 20px;
  h1 {
    font-family: $font-display;
    font-size: 22px;
    font-weight: 700;
    color: $ink;
    margin-bottom: 6px;
  }
  .sub {
    font-size: 14px;
    color: $ink-muted;
  }
}

.selector-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.sel-item {
  display: flex;
  align-items: center;
  gap: 14px;
  background: $surface;
  padding: 18px 20px;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s;

  &:hover {
    box-shadow: $shadow-raised;
    border-color: lighten($celadon, 20%);
  }

  .sel-name {
    font-size: 15px;
    font-weight: 600;
    color: $ink;
    flex: 1;
  }

  .sel-arrow {
    font-size: 16px;
    color: $ink-muted;
  }
}

/* ── Chat shell ── */
.chat-shell {
  flex: 1;
  display: flex;
  min-height: 0;
  background: $surface;
  border: 1px solid $stone;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
  overflow: hidden;
}

.chat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid $stone;
  background: $surface;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.toolbar-info {
  min-width: 0;
}

.toolbar-title {
  font-family: $font-display;
  font-size: 16px;
  font-weight: 700;
  color: $ink;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-meta {
  font-size: 12px;
  color: $celadon;
  margin: 2px 0 0;
  font-weight: 500;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.link-btn {
  border: none;
  background: none;
  font-size: 13px;
  color: $ink-light;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: $radius-sm;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: $celadon;
    background: $celadon-pale;
  }
}

.mode-tabs {
  display: flex;
  padding: 3px;
  background: $paper-dark;
  border-radius: $radius-md;
  border: 1px solid $stone;
}

.mode-tab {
  border: none;
  background: transparent;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  color: $ink-muted;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover:not(.active) {
    color: $ink-light;
  }

  &.active {
    background: $surface;
    color: $celadon-deep;
    box-shadow: $shadow-card;
  }
}

.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: linear-gradient(180deg, $paper 0%, $surface 120px);
}

.messages-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.chat-thread {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0 20px 0 12px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 0 16px;
  min-height: 0;
  overscroll-behavior: contain;
}

.scroll-anchor {
  height: 1px;
  flex-shrink: 0;
}

.scroll-bottom-btn {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  padding: 7px 14px;
  border: 1px solid $stone;
  border-radius: 20px;
  background: $surface;
  color: $celadon;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: $shadow-raised;
  transition: all 0.15s;

  &:hover {
    border-color: $celadon;
    background: $celadon-pale;
  }
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  gap: 10px;
  text-align: center;
  padding: 32px 16px;
}

.empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: $celadon-pale;
  color: $celadon;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.empty-title {
  font-family: $font-display;
  font-size: 18px;
  font-weight: 700;
  color: $ink;
  margin: 0;
}

.empty-desc {
  font-size: 14px;
  color: $ink-muted;
  margin: 0;
  max-width: 24rem;
  line-height: 1.6;
}

.quick-prompts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  max-width: 32rem;
}

.quick-chip {
  border: 1px solid $stone;
  background: $surface;
  color: $ink-light;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.4;

  &:hover {
    border-color: $celadon;
    color: $celadon-deep;
    background: $celadon-pale;
  }

  &.tutor {
    border-color: lighten($gold, 20%);
    background: lighten($gold, 32%);
    color: darken($gold, 12%);

    &:hover {
      border-color: $gold;
      background: lighten($gold, 28%);
    }
  }
}

.system-msg-row {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.system-msg-bar {
  max-width: 28rem;
  padding: 8px 16px;
  font-size: 13px;
  color: $celadon;
  background: $celadon-pale;
  border-radius: 20px;
  text-align: center;
  line-height: 1.5;
}

.chat-msg {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;

  &.user {
    flex-direction: row-reverse;
    justify-content: flex-start;
  }
}

.msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;

  &.avatar-assistant {
    background: $celadon-pale;
    color: $celadon;
  }

  &.avatar-tutor {
    background: lighten($gold, 30%);
    color: darken($gold, 10%);
  }

  &.avatar-user {
    background: $paper-dark;
    color: $ink-light;
    border: 1px solid $stone;
  }
}

.msg-body {
  min-width: 0;
  max-width: 88%;

  .assistant & {
    max-width: min(100%, 52rem);
  }

  .user & {
    max-width: 70%;
  }
}

.msg-content {
  display: block;
  padding: 12px 16px;
  border-radius: $radius-lg;
  font-size: 15px;
  line-height: 1.7;
  word-break: break-word;
  text-align: left;

  &.user-bubble {
    background: $celadon;
    color: #fff;
    border-radius: $radius-lg $radius-lg 4px $radius-lg;
    white-space: pre-wrap;
  }

  &.rag-bubble {
    background: $surface;
    color: $ink;
    border: 1px solid $stone;
    border-radius: 4px $radius-lg $radius-lg $radius-lg;
    padding: 14px 18px;
  }
}

.msg-type-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 4px;
  background: $celadon;
  color: #fff;

  &.feedback {
    background: $gold;
  }
}

.difficulty-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;

  &.diff-easy { background: $celadon-pale; color: $celadon; }
  &.diff-medium { background: #fdf6ec; color: #d4933e; }
  &.diff-hard { background: $cinnabar-pale; color: $cinnabar; }
}

.tutor-question-card {
  background: lighten($gold, 32%);
  border-radius: $radius-lg;
  padding: 14px 18px;
  border: 1px solid lighten($gold, 22%);
  border-left: 3px solid $gold;
}

.tutor-q-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.kp-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: $celadon;
  background: $celadon-pale;
  padding: 3px 10px;
  border-radius: 20px;
  margin-bottom: 10px;
}

.kp-score {
  font-weight: 400;
  color: $ink-muted;
}

.tutor-q-content {
  padding: 0;
  background: transparent;
  color: $ink;
}

.tutor-summary-card {
  padding: 14px 16px;
  background: $paper;
  border: 1px solid lighten($gold, 25%);
  border-radius: $radius-lg;

  .summary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .summary-stats {
    font-size: 12px;
    color: $ink-light;
  }

  .summary-encouragement {
    margin: 0 0 12px;
    font-size: 15px;
    line-height: 1.7;
    color: $ink;
  }

  .msg-type-label.summary {
    color: darken($gold, 8%);
    background: lighten($gold, 32%);
  }
}

.tutor-feedback-card {
  background: lighten($gold, 34%);
  border-radius: $radius-lg;
  padding: 14px 18px;
  border: 1px solid lighten($gold, 22%);
  border-left: 3px solid $gold;
}

.feedback-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.feedback-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid lighten($gold, 22%);

  ul {
    margin: 0;
    padding-left: 18px;

    li {
      font-size: 13px;
      color: $ink-light;
      line-height: 1.6;
      margin-bottom: 4px;
    }
  }
}

.suggestions .section-title { color: $celadon; }
.suggestions ul li { color: $celadon-deep; }

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: $ink-muted;
  margin-bottom: 6px;
}

.tutor-thinking-card {
  background: $celadon-pale;
  border-radius: $radius-lg;
  padding: 14px 18px;
  border: 1px solid lighten($celadon, 30%);
  max-width: 24rem;
}

.thinking-dots {
  display: flex;
  gap: 5px;
  margin-bottom: 10px;

  span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: $celadon;
    animation: thinking-bounce 1.2s infinite ease-in-out;

    &:nth-child(2) { animation-delay: 0.15s; }
    &:nth-child(3) { animation-delay: 0.3s; }
  }
}

@keyframes thinking-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.thinking-hint {
  font-size: 13px;
  font-weight: 500;
  color: $celadon-deep;
  margin: 0;
  line-height: 1.5;
}

.tutor-comment {
  font-size: 15px;
  line-height: 1.7;
  color: $ink;
}

.chat-composer {
  flex-shrink: 0;
  padding: 12px 0 16px;
  border-top: 1px solid $stone;
  background: $surface;
}

.tutor-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: $paper-dark;
  border: 1px solid $stone;
  border-radius: $radius-lg;
  font-size: 13px;
  color: $ink-muted;
}

.composer-box {
  background: $surface;
  border: 1px solid $stone;
  border-radius: $radius-lg;
  padding: 12px 14px;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus-within {
    border-color: $celadon;
    box-shadow: 0 0 0 3px rgba($celadon, 0.1);
  }
}

.tutor-input-mode {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.mode-chip {
  border: 1px solid $stone;
  background: $paper-dark;
  color: $ink-muted;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s;

  &.active {
    background: rgba($celadon, 0.12);
    border-color: $celadon;
    color: $ink;
    font-weight: 600;
  }
}

.tutor-explain-card {
  .msg-type-label.explain {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    color: $celadon;
    margin-bottom: 8px;
  }

  .tutor-thinking-card.compact {
    padding: 8px 0;
  }
}

.chat-textarea {
  width: 100%;
  border: none;
  padding: 0 2px;
  font-size: 15px;
  resize: none;
  outline: none;
  font-family: $font-body;
  line-height: 1.6;
  background: transparent;
  min-height: 24px;
  max-height: 160px;
  overflow-y: auto;
  color: $ink;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 12px;
}

.input-hint {
  font-size: 11px;
  color: $ink-muted;
}

.send-btn {
  flex-shrink: 0;
}

.send-icon-mobile {
  display: none;
  width: 16px;
  height: 16px;
}

@media (max-width: 768px) {
  .chat-page {
    margin: -16px;
    height: calc(100vh - 56px);
  }

  .chat-toolbar {
    padding: 12px 14px;
    flex-wrap: wrap;
  }

  .toolbar-right {
    width: 100%;
    justify-content: space-between;
  }

  .link-btn {
    order: 2;
  }

  .chat-thread {
    padding: 0 14px;
  }

  .msg-body {
    max-width: 92%;

    .user & {
      max-width: 88%;
    }
  }

  .composer-actions .input-hint {
    display: none;
  }

  .send-label-desktop {
    display: none;
  }

  .send-icon-mobile {
    display: block;
  }

  .send-btn {
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
  }
}
</style>
