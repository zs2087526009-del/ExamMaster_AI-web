import api from './index'
import type { ChatHistoryResponse, ChatRequest, PageResult, RagConversationSummary } from '@/types'

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

export function createConversation(courseId: number, title?: string): Promise<{ conversationId: number }> {
  return api.post('/rag/conversations', { courseId, title }).then((res) => res.data)
}

export function listConversations(params: {
  courseId: number
  page?: number
  size?: number
}): Promise<PageResult<RagConversationSummary>> {
  return api.get('/rag/conversations', { params }).then((res) => res.data)
}

export function getConversationMessages(conversationId: number, limit = 50): Promise<ChatHistoryResponse> {
  return api.get('/rag/history', { params: { conversationId, limit } }).then((res) => res.data)
}

export function deleteConversation(conversationId: number): Promise<void> {
  return api.delete(`/rag/conversations/${conversationId}`).then(() => undefined)
}

export function clearHistory(courseId: number): Promise<void> {
  return api.delete('/rag/history', { params: { courseId } }).then(() => undefined)
}
