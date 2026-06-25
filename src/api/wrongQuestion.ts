import api from './index'
import type { PageResult, WrongQuestionResponse, PracticeRequest, ExamStartResponse, QuestionType } from '@/types'

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
