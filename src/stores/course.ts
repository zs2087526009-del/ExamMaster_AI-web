import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CourseResponse } from '@/types'
import * as courseApi from '@/api/course'

const STORAGE_KEY = 'currentCourseId'

function loadStoredCourseId(): number | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const id = Number(raw)
  return Number.isNaN(id) ? null : id
}

export const useCourseStore = defineStore('course', () => {
  const currentCourseId = ref<number | null>(loadStoredCourseId())
  const courses = ref<CourseResponse[]>([])

  const currentCourse = computed(() =>
    courses.value.find((c) => c.id === currentCourseId.value) ?? null,
  )

  function setCourseId(id: number | null) {
    currentCourseId.value = id
    if (id) {
      sessionStorage.setItem(STORAGE_KEY, String(id))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  function validateStoredCourse() {
    if (
      currentCourseId.value
      && courses.value.length > 0
      && !courses.value.some((c) => c.id === currentCourseId.value)
    ) {
      setCourseId(null)
    }
  }

  async function fetchCourses() {
    const list = await courseApi.listCourses()
    courses.value = list
    validateStoredCourse()
    if (!currentCourseId.value && list.length === 1) {
      setCourseId(list[0].id)
    }
    return list
  }

  function clear() {
    setCourseId(null)
    courses.value = []
  }

  return {
    currentCourseId,
    courses,
    currentCourse,
    setCourseId,
    fetchCourses,
    clear,
  }
})
