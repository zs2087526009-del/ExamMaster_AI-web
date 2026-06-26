import api from './index'
import type { AxiosError } from 'axios'
import type {
  TutorAnswerRequest,
  TutorAnswerResponse,
  TutorChatRequest,
  TutorSessionDetailResponse,
  TutorSessionHistoryItem,
  TutorSessionResponse,
  TutorStartSessionRequest,
  PageResult,
} from '@/types'

export function startSession(data: TutorStartSessionRequest): Promise<TutorSessionResponse> {
  return api.post('/tutor/sessions', data).then((res) => res.data)
}

export function getActiveSession(courseId: number): Promise<TutorSessionDetailResponse | null> {
  return api
    .get('/tutor/sessions/active', { params: { courseId }, silent: true })
    .then((res) => res.data as TutorSessionDetailResponse)
    .catch((err: unknown) => {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as AxiosError<{ code?: number; message?: string }>
        const status = axiosErr.response?.status
        const code = axiosErr.response?.data?.code
        const message = axiosErr.response?.data?.message
        if (status === 404 || code === 404 || message?.includes('无活跃导师会话')) {
          return null
        }
      }
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('无活跃导师会话')) {
        return null
      }
      return Promise.reject(err)
    })
}

export function getSession(sessionId: string): Promise<TutorSessionResponse> {
  return api.get(`/tutor/sessions/${sessionId}`).then((res) => res.data)
}

export function submitAnswer(
  sessionId: string,
  data: TutorAnswerRequest,
): Promise<TutorAnswerResponse> {
  return api.post(`/tutor/sessions/${sessionId}/answer`, data).then((res) => res.data)
}

/** SSE 流式提交答案 */
export function submitAnswerStream(
  sessionId: string,
  data: TutorAnswerRequest,
  signal?: AbortSignal,
): Promise<Response> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  return fetch(`/api/tutor/sessions/${sessionId}/answer/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
    signal,
  })
}

/** 辅导中自由提问（SSE 流式） */
export function chatInSessionStream(
  sessionId: string,
  data: TutorChatRequest,
  signal?: AbortSignal,
): Promise<Response> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  return fetch(`/api/tutor/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
    signal,
  })
}

export function endSession(sessionId: string): Promise<{ message: string }> {
  return api.post(`/tutor/sessions/${sessionId}/end`, {}, { silent: true }).then((res) => res.data)
}

export function listHistory(params: {
  courseId: number
  page?: number
  size?: number
}): Promise<PageResult<TutorSessionHistoryItem>> {
  return api.get('/tutor/sessions/history', { params }).then((res) => res.data)
}

export function getSessionHistory(sessionId: string): Promise<TutorSessionDetailResponse> {
  return api.get(`/tutor/sessions/history/${sessionId}`).then((res) => res.data)
}

export function deleteSessionHistory(sessionId: string): Promise<void> {
  return api.delete(`/tutor/sessions/history/${sessionId}`).then(() => undefined)
}
