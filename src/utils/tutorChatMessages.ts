import type {
  TutorKnowledgePointView,
  TutorQuestionView,
  TutorSessionDetailResponse,
  TutorTurnView,
} from '@/types'
import { parseQuestionContent } from '@/utils/questionContent'

export interface TutorChatMessage {
  role: 'user' | 'assistant'
  content: string
  kind?: 'tutor_question' | 'tutor_feedback' | 'tutor_system'
  tutorMeta?: {
    score?: number
    missingPoints?: string[]
    suggestions?: string[]
    knowledgePoint?: TutorKnowledgePointView
    questionType?: string
    difficulty?: string
  }
}

export function formatTutorQuestionContent(content: TutorQuestionView['content']): string {
  if (!content) return ''
  if (typeof content === 'string') return parseQuestionContent(content).stem
  return parseQuestionContent(JSON.stringify(content)).stem
}

function knowledgePointFromTurn(turn: TutorTurnView): TutorKnowledgePointView | undefined {
  if (!turn.knowledgePointId || !turn.knowledgePointName) return undefined
  return {
    id: turn.knowledgePointId,
    name: turn.knowledgePointName,
    masteryScore: null,
  }
}

export function buildTutorChatMessages(detail: TutorSessionDetailResponse): TutorChatMessage[] {
  const { session, turns } = detail
  const msgs: TutorChatMessage[] = []

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
