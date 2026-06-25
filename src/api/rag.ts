import api from './index'
import type { ChatHistoryResponse, ChatRequest } from '@/types'

// SSE streaming — returns fetch Response for ReadableStream consumption
export function chat(data: ChatRequest): Promise<Response> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  return fetch('/api/rag/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  })
}

export function getHistory(courseId: number, limit = 50): Promise<ChatHistoryResponse> {
  return api.get('/rag/history', { params: { courseId, limit } }).then((res) => res.data)
}

export function clearHistory(courseId: number): Promise<void> {
  return api.delete('/rag/history', { params: { courseId } }).then(() => undefined)
}
