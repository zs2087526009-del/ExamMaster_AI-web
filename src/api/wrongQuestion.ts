import api from './index'
import type { PageResult, WrongQuestionResponse, PracticeRequest, ExamStartResponse, QuestionType, WrongQuestionExportFormat } from '@/types'

export function list(params: {
  courseId: number
  knowledgePointId?: number
  questionType?: QuestionType
  page?: number
  size?: number
}): Promise<PageResult<WrongQuestionResponse>> {
  return api.get('/wrong-questions', { params }).then((res) => res.data)
}

export function deleteOne(id: number): Promise<void> {
  return api.delete(`/wrong-questions/${id}`).then((res) => res.data)
}

export function practice(data: PracticeRequest): Promise<ExamStartResponse> {
  return api.post('/wrong-questions/practice', data).then((res) => res.data)
}

export type WrongQuestionExportFormat = 'pdf' | 'docx'

export async function exportWrongQuestions(params: {
  courseId: number
  knowledgePointId?: number
  questionType?: QuestionType
  format?: WrongQuestionExportFormat
}): Promise<{ blob: Blob; filename: string }> {
  const res = await api.get('/wrong-questions/export', {
    params,
    responseType: 'blob',
  })
  const blob = res.data as Blob
  const disposition = res.headers['content-disposition'] as string | undefined
  let filename = params.format === 'pdf' ? '错题本.pdf' : '错题本.docx'
  if (disposition) {
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
    if (match?.[1]) {
      filename = decodeURIComponent(match[1])
    }
  }
  return { blob, filename }
}
