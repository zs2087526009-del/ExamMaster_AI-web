import api from './index'
import type { QuestionResponse, GenerateQuestionRequest, GenerateQuestionResponse } from '@/types'

export function listByKnowledgePoint(knowledgePointId: number): Promise<QuestionResponse[]> {
  return api.get('/questions', { params: { knowledgePointId } }).then((res) => res.data)
}

export function listByCourse(courseId: number): Promise<QuestionResponse[]> {
  return api.get('/questions', { params: { courseId } }).then((res) => res.data)
}

export function getById(id: number): Promise<QuestionResponse> {
  return api.get(`/questions/${id}`).then((res) => res.data)
}

export function generate(data: GenerateQuestionRequest): Promise<GenerateQuestionResponse> {
  return api.post('/questions/generate', data).then((res) => res.data)
}

export function deleteOne(id: number): Promise<string> {
  return api.delete(`/questions/${id}`).then((res) => res.data)
}

export function batchDelete(knowledgePointId: number): Promise<string> {
  return api.delete('/questions', { params: { knowledgePointId } }).then((res) => res.data)
}
