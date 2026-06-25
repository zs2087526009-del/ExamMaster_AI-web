import api from './index'
import type { DocumentResponse, DocumentUploadResponse } from '@/types'

export function upload(courseId: number, file: File): Promise<DocumentUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return api.post('/documents/upload', formData, {
    params: { courseId },
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // 2 min for parsing
  }).then((res) => res.data)
}

export function list(courseId: number): Promise<DocumentResponse[]> {
  return api.get('/documents', { params: { courseId } }).then((res) => res.data)
}

export function getById(id: number): Promise<DocumentResponse> {
  return api.get(`/documents/${id}`).then((res) => res.data)
}

export function deleteOne(id: number): Promise<void> {
  return api.delete(`/documents/${id}`).then(() => undefined)
}

export function retryParse(id: number): Promise<void> {
  return api.post(`/documents/${id}/retry-parse`).then(() => undefined)
}
