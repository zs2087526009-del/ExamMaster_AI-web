<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
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
  TutorStartSessionRequest,
  TutorTurnView,
} from '@/types'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import MarkdownContent from '@/components/chat/MarkdownContent.vue'
import ReferenceCards from '@/components/chat/ReferenceCards.vue'
import ScoreRing from '@/components/chat/ScoreRing.vue'
import { AppIcon, type IconName } from '@/components/icons'
import { CourseSeal } from '@/components/course'
import { useCourseScope } from '@/composables/useCourseScope'
import { parseQuestionContent } from '@/utils/questionContent'
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
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  kind?: 'rag' | 'rag_thinking' | 'tutor_question' | 'tutor_feedback' | 'tutor_thinking' | 'tutor_system'
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
const { courses, currentCourse, selectedCourseId, courseStore, ensureCourses } = useCourseScope()

const mode = ref<ChatMode>('rag')
const tutorSessionId = ref<string | null>(null)
const tutorFinished = ref(false)
const tutorStarting = ref(false)
const tutorProgress = ref({
  totalRounds: 0,
  maxRounds: 10,
  currentKnowledgePoint: null as TutorKnowledgePointView | null,
  masteryScore: null as number | null,
})

const quickPrompts = ref<string[]>([])
const tutorQuickActions = ref<{ label: string; run: () => void }[]>([])

const MODE_CACHE_KEY = 'exam_chat_mode_'
const MAX_RAG_MESSAGES = 50
const chatStorage = sessionStorage
let revertingMode = false

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

const inputPlaceholder = computed(() =>
  mode.value === 'tutor' ? '输入你的答案…' : '输入你的问题...',
)

const emptyHint = computed(() =>
  mode.value === 'tutor' ? '导师会按知识点逐题练习，也可点下方快捷入口' : '有什么学习问题尽管问我，或试试下方快捷提问',
)

const showQuickPrompts = computed(() =>
  !sending.value && !tutorStarting.value && messages.value.length === 0,
)

const canSend = computed(() => {
  if (!input.value.trim() || sending.value || tutorStarting.value) return false
  if (mode.value === 'tutor') {
    return !!tutorSessionId.value && !tutorFinished.value
  }
  return !!selectedCourseId.value
})

function formatTutorQuestionContent(content: TutorQuestionView['content']): string {
  if (!content) return ''
  if (typeof content === 'string') return parseQuestionContent(content).stem
  return parseQuestionContent(JSON.stringify(content)).stem
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
    references: m.references ?? undefined,
  }))
}

async function loadMessagesFromServer(courseId: number): Promise<Message[]> {
  try {
    const history = await ragApi.getHistory(courseId, MAX_RAG_MESSAGES)
    return mapHistoryToMessages(history.messages)
  } catch {
    return []
  }
}

function resetTutorProgress() {
  tutorProgress.value = {
    totalRounds: 0,
    maxRounds: 10,
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

function knowledgePointFromTurn(turn: TutorTurnView): TutorKnowledgePointView | undefined {
  if (!turn.knowledgePointId || !turn.knowledgePointName) return undefined
  return {
    id: turn.knowledgePointId,
    name: turn.knowledgePointName,
    masteryScore: null,
  }
}

function buildMessagesFromTutorDetail(detail: TutorSessionDetailResponse): Message[] {
  const { session, turns } = detail
  const msgs: Message[] = []

  if (session.openingComment) {
    msgs.push({
      role: 'assistant',
      content: session.openingComment,
      kind: 'tutor_system',
    })
  }

  for (const turn of turns) {
    const kp = knowledgePointFromTurn(turn)
    if (turn.question) {
      msgs.push({
        role: 'assistant',
        content: formatTutorQuestionContent(turn.question.content),
        kind: 'tutor_question',
        tutorMeta: {
          knowledgePoint: kp,
          questionType: turn.question.questionType,
          difficulty: turn.question.difficulty,
        },
      })
    }
    if (turn.userAnswer) {
      msgs.push({ role: 'user', content: turn.userAnswer })
    }
    msgs.push({
      role: 'assistant',
      content: turn.tutorComment ?? '',
      kind: 'tutor_feedback',
      tutorMeta: {
        score: turn.score ?? undefined,
        missingPoints: turn.feedback?.missingPoints,
        suggestions: turn.feedback?.suggestions,
      },
    })
  }

  if (session.phase !== 'FINISHED' && session.question) {
    msgs.push({
      role: 'assistant',
      content: formatTutorQuestionContent(session.question.content),
      kind: 'tutor_question',
      tutorMeta: {
        knowledgePoint: session.currentKnowledgePoint ?? undefined,
        questionType: session.question.questionType,
        difficulty: session.question.difficulty,
      },
    })
  }

  return msgs
}

async function restoreTutorSession(courseId: number): Promise<boolean> {
  try {
    const detail = await tutorApi.getActiveSession(courseId)
    if (!detail) return false
    applyTutorSessionSnapshot(detail.session)
    messages.value = buildMessagesFromTutorDetail(detail)
    scrollToBottom(true)
    return true
  } catch {
    return false
  }
}

async function hydrateChat(courseId: number) {
  if (mode.value === 'tutor') {
    const restored = await restoreTutorSession(courseId)
    if (!restored) {
      await startTutorSession()
    }
  } else {
    messages.value = await loadMessagesFromServer(courseId)
    scrollToBottom(true)
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

    const session = await tutorApi.startSession({ courseId, ...startOptions })
    applyTutorSessionSnapshot(session)

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
    if (selectedCourseId.value && !showSelector.value) {
      const restored = await restoreTutorSession(selectedCourseId.value)
      if (!restored) {
        await startTutorSession()
      }
    } else {
      messages.value = []
    }
  } else {
    await endTutorSessionSilently()
    resetTutorProgress()
    messages.value = courseId ? await loadMessagesFromServer(courseId) : []
  }

  await loadQuickPrompts()
  scrollToBottom(true)
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
    const restored = await restoreTutorSession(c.id)
    if (!restored) {
      await startTutorSession()
    }
  } else {
    messages.value = await loadMessagesFromServer(c.id)
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
          if (event.type === 'status' && event.content) {
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
          } else if (event.type === 'references' && event.references) {
            aiMsg.references = event.references
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
    case 'error':
      aiMsg.kind = 'tutor_feedback'
      aiMsg.content = event.content || '评分失败，请稍后重试'
      break
    default:
      break
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
      if (pending.closingComment) {
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
    scrollToBottom()
  }
}

async function send() {
  if (mode.value === 'tutor') {
    await sendTutor()
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
      <div class="page-header">
        <div class="header-main">
          <div class="header-course">
            <CourseSeal
              v-if="currentCourse"
              :name="currentCourse.courseName"
              :id="currentCourse.id"
              size="sm"
            />
            <div class="header-titles">
              <h1>{{ courseTitle }}</h1>
              <p class="sub">
                <span>{{ courseSubtitle }}</span>
                <a class="back-link" @click="showSelector = true">切换课程</a>
              </p>
              <p class="mode-status">{{ modeStatusLine }}</p>
            </div>
          </div>
          <div class="mode-switch">
            <el-radio-group v-model="mode" size="small" @change="onModeChange">
              <el-tooltip content="你问 AI 答，基于课程资料检索回答" placement="bottom">
                <el-radio-button value="rag">问答</el-radio-button>
              </el-tooltip>
              <el-tooltip content="AI 出题你答，按知识点逐题练习" placement="bottom">
                <el-radio-button value="tutor">导师</el-radio-button>
              </el-tooltip>
            </el-radio-group>
            <p class="mode-switch-hint">
              {{ mode === 'rag' ? '你问 AI 答' : 'AI 出题你答' }}
            </p>
          </div>
        </div>
      </div>

      <div class="chat-container">
        <div class="messages-wrap">
          <div ref="chatBox" class="chat-messages" @scroll="onChatScroll">
            <div class="chat-thread">
            <div v-if="messages.length === 0 && !tutorStarting" class="chat-empty">
              <AppIcon name="dialogue" :size="36" />
              <p>{{ emptyHint }}</p>
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
              <AppIcon name="dialogue" :size="36" />
              <p>正在启动导师会话…</p>
            </div>

            <template v-for="(msg, idx) in messages" :key="idx">
              <!-- system message: centered narrow bar -->
              <div v-if="msg.kind === 'tutor_system'" class="system-msg-row">
                <div class="system-msg-bar">{{ msg.content }}</div>
              </div>

              <div
                v-else
                class="chat-msg"
                :class="[msg.role, msg.kind ? `kind-${msg.kind}` : '']"
              >
                <div class="msg-avatar" :class="avatarRoleClass(msg)">
                  <AppIcon :name="avatarIcon(msg)" :size="18" />
                </div>
                <div class="msg-body">
                  <!-- tutor question -->
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

                  <!-- thinking / waiting (tutor & rag) -->
                  <template v-else-if="msg.kind === 'tutor_thinking' || msg.kind === 'rag_thinking'">
                    <div class="tutor-thinking-card">
                      <div class="thinking-dots" aria-hidden="true">
                        <span /><span /><span />
                      </div>
                      <p class="thinking-hint">{{ msg.tutorMeta?.thinkingHint }}</p>
                      <p class="thinking-reassure">
                        {{ msg.kind === 'rag_thinking' ? '请稍候，正在为你整理课程资料中的答案…' : '请稍候，导师正在认真批改你的答案…' }}
                      </p>
                    </div>
                  </template>

                  <!-- tutor feedback -->
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

                  <!-- user message -->
                  <template v-else-if="msg.role === 'user'">
                    <div class="msg-content">{{ msg.content }}</div>
                  </template>

                  <!-- rag / default assistant -->
                  <template v-else>
                    <div class="msg-content rag-bubble">
                      <MarkdownContent :content="msg.content" :streaming="msg.streaming" />
                    </div>
                    <ReferenceCards
                      v-if="msg.references && msg.references.length > 0 && !msg.streaming"
                      :references="msg.references"
                      :course-id="selectedCourseId"
                    />
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
            <div v-if="mode === 'tutor' && tutorFinished" class="tutor-restart-bar">
              <p>本轮导师练习已结束</p>
              <el-button type="primary" :loading="tutorStarting" @click="startTutorSession({ forceNew: true })">
                开始新一轮辅导
              </el-button>
            </div>
            <div v-else class="composer-box">
              <div class="input-row">
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
                <el-button
                  v-if="sending"
                  class="send-btn stop-btn"
                  type="danger"
                  @click="stopStreaming"
                >
                  <span class="send-label-desktop">停止</span>
                </el-button>
                <el-button
                  v-else
                  class="send-btn"
                  :class="{ 'send-btn--active': canSend }"
                  type="primary"
                  :disabled="!canSend"
                  :loading="tutorStarting"
                  @click="send"
                >
                  <span class="send-label-desktop">发送</span>
                  <Promotion class="send-icon-mobile" />
                </el-button>
              </div>
              <p class="input-hint">Enter 发送，Shift+Enter 换行</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.chat-page {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 112px);
  max-height: calc(100vh - 112px);
  overflow: hidden;
  min-height: 0;
}

.page-header {
  flex-shrink: 0;
  margin-bottom: 16px;
  h1 { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
  .sub {
    font-size: 13px;
    color: #999;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .mode-status {
    font-size: 12px;
    color: #3d7a6a;
    margin-top: 6px;
    font-weight: 500;
  }
  .back-link { color: #07c160; cursor: pointer; &:hover { text-decoration: underline; } }
}

.header-course {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.header-titles {
  min-width: 0;
}

.mode-switch {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.mode-switch-hint {
  font-size: 11px;
  color: #b0b0b0;
  margin: 0;
  text-align: right;
}

.header-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.selector-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sel-item {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  padding: 16px 20px;
  border-radius: 10px;
  border: 1px solid #eee;
  cursor: pointer;
  transition: all 0.2s;
  &:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.06); transform: translateX(4px); }
  .sel-name { font-size: 15px; font-weight: 500; color: #333; flex: 1; }
  .sel-arrow { font-size: 18px; color: #ccc; }
}

/* chat */
.chat-container {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #eee;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.messages-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* 消息与输入框共用同一列宽，保证水平对齐 */
.chat-thread {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 0 clamp(16px, 3vw, 28px);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px 0 12px;
  min-height: 0;
  overscroll-behavior: contain;
}

.scroll-anchor {
  height: 1px;
  flex-shrink: 0;
}

.scroll-bottom-btn {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: block;
  padding: 8px 16px;
  border: 1px solid #d4ebe3;
  border-radius: 20px;
  background: #fff;
  color: #3d7a6a;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transition: all 0.2s;
  pointer-events: auto;

  &:hover {
    background: #f0f7f4;
    border-color: #07c160;
  }
}

.system-msg-row {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.system-msg-bar {
  max-width: 28rem;
  padding: 8px 16px;
  font-size: 13px;
  color: #3d7a6a;
  background: #f0f7f4;
  border: 1px solid #d4ebe3;
  border-radius: 20px;
  text-align: center;
  font-style: italic;
  line-height: 1.5;
}

.tutor-restart-bar {
  text-align: center;
  padding: 20px 16px;
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 14px;

  p {
    font-size: 13px;
    color: #999;
    margin: 0 0 12px;
  }
}

.chat-composer {
  flex-shrink: 0;
  padding: 12px 0 18px;
  background: linear-gradient(to bottom, rgba(247, 248, 250, 0) 0%, #f7f8fa 24%);
  border-top: 1px solid #eef0f2;
}

.composer-box {
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 14px;
  padding: 12px 14px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus-within {
    border-color: #07c160;
    box-shadow: 0 2px 12px rgba(7, 193, 96, 0.12);
  }
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  gap: 12px;
  color: #9b8e80;
  p { color: #ccc; font-size: 14px; text-align: center; max-width: 28rem; }
}

.quick-prompts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
  max-width: 36rem;
}

.quick-chip {
  border: 1px solid #d4ebe3;
  background: #f7faf9;
  color: #3d7a6a;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1.4;

  &:hover {
    background: #eaf3ef;
    border-color: #07c160;
    transform: translateY(-1px);
  }

  &.tutor {
    border-color: #f0ecd0;
    background: #fdfcf0;
    color: #8a7a4a;

    &:hover {
      background: #faf6e8;
      border-color: #e6a23c;
    }
  }
}

.chat-msg {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  &.user { flex-direction: row-reverse; }
  &.assistant { padding-right: 0; }
}

.msg-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.avatar-assistant {
    background: #eaf3ef;
    color: #3d7a6a;
  }

  &.avatar-tutor {
    background: #faf0e6;
    color: #b45309;
  }

  &.avatar-user {
    background: #f3eee3;
    color: #6b5f52;
  }
}

.msg-body {
  flex: 1;
  min-width: 0;
  max-width: 100%;

  .assistant & {
    max-width: min(100%, 52rem);
  }

  .user & {
    max-width: min(100%, 40rem);
    text-align: right;
  }
}

.msg-content {
  display: block;
  max-width: 100%;
  padding: 12px 18px;
  border-radius: 12px;
  font-size: 15px;
  line-height: 1.7;
  word-break: break-word;
  text-align: left;

  .assistant & {
    width: 100%;
    background: #f7f8fa;
    color: #333;
  }

  .assistant &.rag-bubble {
    border: 1px solid #e8eaed;
    background: #fafbfc;
  }

  .user & {
    width: fit-content;
    margin-left: auto;
    background: #07c160;
    color: #fff;
    white-space: pre-wrap;
  }
}

.msg-type-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  background: #3d7a6a;
  color: #fff;

  &.feedback {
    background: #8a7a4a;
  }
}

.difficulty-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;

  &.diff-easy { background: #e8f8ef; color: #07c160; }
  &.diff-medium { background: #fdf6ec; color: #e6a23c; }
  &.diff-hard { background: #fef0f0; color: #e54d42; }
}

.tutor-system {
  display: none;
}

.tutor-question-card {
  text-align: left;
  background: #fffbf5;
  border-radius: 12px;
  padding: 14px 18px;
  border: 1px solid #f0e0c8;
  border-left: 4px solid #e6a23c;
  width: 100%;
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
  color: #3d7a6a;
  background: #eaf3ef;
  padding: 4px 10px;
  border-radius: 20px;
  margin-bottom: 10px;
}

.kp-score {
  font-weight: 400;
  color: #9b8e80;
}

.tutor-q-content {
  display: block;
  padding: 0;
  background: transparent;
  color: #333;
}

.tutor-feedback-card {
  text-align: left;
  background: #fdfcf0;
  border-radius: 12px;
  padding: 14px 18px;
  border: 1px solid #f0ecd0;
  border-left: 4px solid #e6a23c;
  width: 100%;
}

.feedback-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.feedback-section {
  margin-top: 10px;
  padding-top: 10px;

  ul {
    margin: 0;
    padding-left: 18px;
    li {
      font-size: 13px;
      color: #666;
      line-height: 1.5;
      margin-bottom: 4px;
    }
  }
}

.missing-points {
  border-top: 1px solid #f0ecd0;
}

.suggestions {
  border-top: 1px solid #d4ebe3;

  .section-title { color: #3d7a6a; }
  ul li { color: #3d7a6a; }
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #9b8e80;
  margin-bottom: 6px;
}

.tutor-thinking-card {
  text-align: left;
  background: linear-gradient(135deg, #f7faf9 0%, #f0f7f4 100%);
  border-radius: 12px;
  padding: 16px 18px;
  border: 1px solid #d4ebe3;
  width: 100%;
  max-width: 28rem;
}

.thinking-dots {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3d7a6a;
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
  font-size: 14px;
  font-weight: 500;
  color: #3d7a6a;
  margin: 0 0 6px;
  line-height: 1.5;
}

.thinking-reassure {
  font-size: 12px;
  color: #9b8e80;
  margin: 0;
  line-height: 1.4;
}

.score-badge {
  display: none;
}

.tutor-comment {
  font-size: 15px;
  line-height: 1.7;
  color: #333;
  margin-bottom: 4px;
}

.missing-title {
  display: none;
}

.missing-points ul {
  margin: 0;
}

.cursor {
  animation: blink 0.8s infinite;
  font-weight: 300;
}
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* input */
.input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.send-btn {
  flex-shrink: 0;
  opacity: 0.55;
  transition: opacity 0.2s, transform 0.15s;

  &--active {
    opacity: 1;
    box-shadow: 0 2px 8px rgba(7, 193, 96, 0.35);
  }
}

.send-icon-mobile {
  display: none;
  width: 18px;
  height: 18px;
}

.chat-textarea {
  flex: 1;
  border: none;
  border-radius: 8px;
  padding: 4px 6px;
  font-size: 15px;
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.6;
  background: transparent;
  min-height: 44px;
  max-height: 160px;
  overflow-y: auto;
}
.input-hint {
  font-size: 11px;
  color: #b0b0b0;
  margin: 8px 4px 0;
  text-align: center;
}

@media (max-width: 768px) {
  .chat-page {
    height: calc(100vh - 88px);
    max-height: calc(100vh - 88px);
  }

  .chat-thread {
    padding: 0 12px;
  }

  .chat-msg.assistant .msg-body,
  .chat-msg.user .msg-body {
    max-width: 100%;
  }

  .composer-box {
    padding: 10px 12px 8px;
  }

  .send-label-desktop {
    display: none;
  }

  .send-icon-mobile {
    display: block;
  }

  .send-btn {
    width: 42px;
    height: 42px;
    padding: 0;
    border-radius: 50%;
  }
}
</style>
