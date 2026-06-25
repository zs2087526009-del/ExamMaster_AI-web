import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCourseStore } from '@/stores/course'

/** 绑定全局当前课程，供各业务页复用 */
export function useCourseScope() {
  const courseStore = useCourseStore()
  const { courses, currentCourse } = storeToRefs(courseStore)

  const selectedCourseId = computed({
    get: () => courseStore.currentCourseId,
    set: (id: number | null) => courseStore.setCourseId(id),
  })

  async function ensureCourses() {
    if (courses.value.length === 0) {
      await courseStore.fetchCourses()
    }
    return courses.value
  }

  onMounted(() => {
    void ensureCourses()
  })

  return {
    courseStore,
    courses,
    currentCourse,
    selectedCourseId,
    ensureCourses,
  }
}
