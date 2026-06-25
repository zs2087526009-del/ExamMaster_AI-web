import api from './index'
import type { StudyPlanResponse } from '@/types'

export function generateStudyPlan(courseId: number, examDate: string): Promise<StudyPlanResponse> {
  return api.post('/study-plans/generate', { courseId, examDate }).then((res) => res.data)
}
