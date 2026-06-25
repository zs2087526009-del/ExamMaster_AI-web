import api from './index'
import type { StatisticsResponse } from '@/types'

export function getOverview(silent = false): Promise<StatisticsResponse> {
  return api.get('/statistics/overview', { silent }).then((res) => res.data)
}

export function getCourseStatistics(courseId: number): Promise<StatisticsResponse> {
  return api.get('/statistics', { params: { courseId } }).then((res) => res.data)
}
