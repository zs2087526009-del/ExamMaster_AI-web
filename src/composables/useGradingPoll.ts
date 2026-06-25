import { ref, onUnmounted } from 'vue'
import * as examApi from '@/api/exam'
import type { ExamSessionResponse } from '@/types'

export function useGradingPoll() {
  let timer: ReturnType<typeof setInterval> | null = null
  const polling = ref(false)

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    polling.value = false
  }

  function start(params: {
    courseId: number
    submitTime: string
    onUpdate: (session: ExamSessionResponse) => void
    intervalMs?: number
    maxPolls?: number
  }) {
    stop()
    polling.value = true
    let pollCount = 0
    const maxPolls = params.maxPolls ?? 60
    const intervalMs = params.intervalMs ?? 2000

    const poll = async () => {
      pollCount++
      try {
        const session = await examApi.getSession({
          courseId: params.courseId,
          submitTime: params.submitTime,
        })
        params.onUpdate(session)
        if (session.ungradedCount === 0 || pollCount >= maxPolls) {
          stop()
        }
      } catch {
        if (pollCount >= maxPolls) {
          stop()
        }
      }
    }

    void poll()
    timer = setInterval(poll, intervalMs)
  }

  onUnmounted(stop)

  return { polling, start, stop }
}
