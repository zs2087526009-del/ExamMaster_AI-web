import api from './index'
import type { KnowledgeMasteryResponse } from '@/types'

export function listByCourse(courseId: number): Promise<KnowledgeMasteryResponse[]> {
  return api.get('/knowledge-mastery', { params: { courseId }, silent: true }).then((res) => res.data)
}
