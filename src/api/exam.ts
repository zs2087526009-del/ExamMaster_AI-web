import api from './index'
import type {
  ExamRecordResponse,
  ExamSessionResponse,
  ExamStartRequest,
  ExamStartResponse,
  ExamSubmitRequest,
  ExamSubmitResponse,
  PageResult,
  QuestionType,
} from '@/types'

export function startExam(data: ExamStartRequest): Promise<ExamStartResponse> {
  return api.post('/exams/start', data).then((res) => res.data)
}

export function submitExam(data: ExamSubmitRequest): Promise<ExamSubmitResponse> {
  return api.post('/exams/submit', data).then((res) => res.data)
}

export function listHistory(params: {
  courseId: number
  questionType?: QuestionType
  page?: number
  size?: number
}): Promise<PageResult<ExamRecordResponse>> {
  return api.get('/exams/history', { params }).then((res) => res.data)
}

export function getHistoryById(id: number): Promise<ExamRecordResponse> {
  return api.get(`/exams/history/records/${id}`).then((res) => res.data)
}

export function listSessions(params: {
  courseId: number
  page?: number
  size?: number
}): Promise<PageResult<ExamSessionResponse>> {
  return api.get('/exams/history/sessions', { params }).then((res) => res.data)
}

export function getSession(params: {
  courseId: number
  submitTime: string
}): Promise<ExamSessionResponse> {
  return api.get('/exams/history/sessions/detail', { params }).then((res) => res.data)
}
