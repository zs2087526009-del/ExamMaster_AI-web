import api from './index'
import type { QuestionResponse, GenerateQuestionRequest, GenerateQuestionResponse, PageResult } from '@/types'

export function list(params: {
  courseId?: number
  knowledgePointId?: number
  page?: number
  size?: number
}): Promise<PageResult<QuestionResponse>> {
  return api.get('/questions', { params }).then((res) => res.data)
}

export function listKnowledgePointIds(courseId: number): Promise<number[]> {
  return api.get('/questions/knowledge-point-ids', { params: { courseId } }).then((res) => res.data)
}

export function getById(id: number): Promise<QuestionResponse> {
  return api.get(`/questions/${id}`).then((res) => res.data)
}

export function generate(data: GenerateQuestionRequest): Promise<GenerateQuestionResponse> {
  return api.post('/questions/generate', data, { timeout: 600_000 }).then((res) => res.data)
}

export function deleteOne(id: number): Promise<string> {
  return api.delete(`/questions/${id}`).then((res) => res.data)
}

export function batchDelete(knowledgePointId: number): Promise<string> {
  return api.delete('/questions', { params: { knowledgePointId } }).then((res) => res.data)
}
