import api from './index'
import type { KnowledgePointResponse, KnowledgeTreeResponse } from '@/types'

export function getTree(courseId: number, documentId?: number): Promise<KnowledgeTreeResponse> {
  const params = documentId != null ? { documentId } : undefined
  return api.get(`/knowledge-points/courses/${courseId}`, { params }).then((res) => res.data)
}

export function getById(id: number): Promise<KnowledgePointResponse> {
  return api.get(`/knowledge-points/${id}`).then((res) => res.data)
}

export function deletePoint(id: number): Promise<string> {
  return api.delete(`/knowledge-points/${id}`).then((res) => res.data)
}
