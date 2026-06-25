import { ref } from 'vue'
import * as docApi from '@/api/document'
import * as questionApi from '@/api/question'
import type { CourseResponse, DocumentResponse } from '@/types'

export interface OnboardingStep {
  id: string
  title: string
  description: string
  done: boolean
  route: string
  actionLabel: string
}

export interface OnboardingState {
  steps: OnboardingStep[]
  completedCount: number
  allDone: boolean
  nextStep: OnboardingStep | null
}

export interface ContinueLearning {
  title: string
  description: string
  route: string
  actionLabel: string
}

function hasParsedDocuments(docs: DocumentResponse[]) {
  return docs.some((d) => d.parseStatus === 'SUCCESS')
}

function isParsingDocuments(docs: DocumentResponse[]) {
  return docs.some((d) => ['PENDING', 'PARSING', 'EXTRACTING'].includes(d.parseStatus))
}

export function buildOnboardingSteps(params: {
  courseCount: number
  documents: DocumentResponse[]
  questionCount: number
  hasExamRecord: boolean
  focusCourseId: number | null
}): OnboardingStep[] {
  const { courseCount, documents, questionCount, hasExamRecord, focusCourseId } = params
  const courseRoute = focusCourseId ? `/knowledge/${focusCourseId}` : '/courses'
  const questionRoute = '/questions'
  const examRoute = '/exam/start'

  return [
    {
      id: 'course',
      title: '创建课程',
      description: '添加一门你要学习的课程',
      done: courseCount > 0,
      route: '/courses',
      actionLabel: '去创建',
    },
    {
      id: 'upload',
      title: '上传文档',
      description: '上传课件或讲义，作为知识来源',
      done: documents.length > 0,
      route: courseRoute,
      actionLabel: '去上传',
    },
    {
      id: 'parse',
      title: '等待解析完成',
      description: 'AI 提取知识点并建立向量索引',
      done: hasParsedDocuments(documents) && !isParsingDocuments(documents),
      route: courseRoute,
      actionLabel: isParsingDocuments(documents) ? '查看进度' : '去查看',
    },
    {
      id: 'questions',
      title: '生成题目',
      description: '基于知识点 AI 生成练习题',
      done: questionCount > 0,
      route: questionRoute,
      actionLabel: '去生成',
    },
    {
      id: 'exam',
      title: '开始考试',
      description: '完成第一次测评，建立学习基线',
      done: hasExamRecord,
      route: examRoute,
      actionLabel: '去考试',
    },
  ]
}

export function buildContinueLearning(
  steps: OnboardingStep[],
  course: CourseResponse | null,
): ContinueLearning {
  const next = steps.find((s) => !s.done)
  if (!next) {
    return {
      title: course ? `继续学习「${course.courseName}」` : '继续学习',
      description: '已完成入门设置，开始新一轮练习吧',
      route: '/exam/start',
      actionLabel: '开始考试',
    }
  }
  return {
    title: next.title,
    description: next.description,
    route: next.route,
    actionLabel: next.actionLabel,
  }
}

export function useOnboardingLoader() {
  const loading = ref(false)
  const steps = ref<OnboardingStep[]>([])
  const questionCount = ref(0)

  async function load(params: {
    courses: CourseResponse[]
    focusCourseId: number | null
    hasExamRecord: boolean
  }) {
    loading.value = true
    try {
      const focusId = params.focusCourseId ?? params.courses[0]?.id ?? null
      let documents: DocumentResponse[] = []
      let qCount = 0

      if (focusId) {
        const [docs, questions] = await Promise.all([
          docApi.list(focusId).catch(() => [] as DocumentResponse[]),
          questionApi.listByCourse(focusId).catch(() => []),
        ])
        documents = docs
        qCount = questions.length
      }

      questionCount.value = qCount
      steps.value = buildOnboardingSteps({
        courseCount: params.courses.length,
        documents,
        questionCount: qCount,
        hasExamRecord: params.hasExamRecord,
        focusCourseId: focusId,
      })
    } finally {
      loading.value = false
    }
  }

  return { loading, steps, questionCount, load }
}
