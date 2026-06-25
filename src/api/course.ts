import api from './index'
import type { CourseRequest, CourseResponse } from '@/types'

export function listCourses(): Promise<CourseResponse[]> {
  return api.get('/courses').then((res) => res.data)
}

export function getCourse(id: number): Promise<CourseResponse> {
  return api.get(`/courses/${id}`).then((res) => res.data)
}

export function createCourse(data: CourseRequest): Promise<CourseResponse> {
  return api.post('/courses', data).then((res) => res.data)
}

export function updateCourse(id: number, data: CourseRequest): Promise<CourseResponse> {
  return api.put(`/courses/${id}`, data).then((res) => res.data)
}

export function deleteCourse(id: number): Promise<string> {
  return api.delete(`/courses/${id}`).then((res) => res.data)
}
