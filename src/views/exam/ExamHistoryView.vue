<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as examApi from '@/api/exam'
import type { ExamSessionResponse, PageResult } from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import { AppIcon } from '@/components/icons'
import { useCourseScope } from '@/composables/useCourseScope'
import { calcAccuracy, formatAccuracyPercent } from '@/utils/accuracy'

const router = useRouter()
const route = useRoute()
const { courses, selectedCourseId, courseStore, ensureCourses } = useCourseScope()

const page = ref(1)
const pageSize = 10
const pageResult = ref<PageResult<ExamSessionResponse> | null>(null)
const loading = ref(false)
const loadError = ref(false)
let historyPollTimer: ReturnType<typeof setInterval> | null = null

function hasUngradedSessions() {
  return pageResult.value?.records.some((s) => s.ungradedCount > 0) ?? false
}

function stopHistoryPoll() {
  if (historyPollTimer) {
    clearInterval(historyPollTimer)
    historyPollTimer = null
  }
}

function syncHistoryPoll() {
  stopHistoryPoll()
  if (!selectedCourseId.value || !hasUngradedSessions()) return

  historyPollTimer = setInterval(async () => {
    if (!selectedCourseId.value) {
      stopHistoryPoll()
      return
    }
    try {
      pageResult.value = await examApi.listSessions({
        courseId: selectedCourseId.value,
        page: page.value,
        size: pageSize,
      })
      if (!hasUngradedSessions()) {
        stopHistoryPoll()
      }
    } catch {
      stopHistoryPoll()
    }
  }, 3000)
}

async function fetchList() {
  if (!selectedCourseId.value) { pageResult.value = null; return }
  loading.value = true
  loadError.value = false
  try {
    pageResult.value = await examApi.listSessions({
      courseId: selectedCourseId.value,
      page: page.value,
      size: pageSize,
    })
  } catch {
    pageResult.value = null
    loadError.value = true
  }
  finally { loading.value = false }
  syncHistoryPoll()
}

function onCourseChange() {
  page.value = 1
  fetchList()
}

function onPageChange(p: number) {
  page.value = p
  fetchList()
}

function formatDate(s: string) {
  return s ? s.replace('T', ' ').substring(0, 16) : ''
}

function sessionAccuracy(session: ExamSessionResponse) {
  return calcAccuracy(session)
}

function sessionAccuracyPercent(session: ExamSessionResponse) {
  return formatAccuracyPercent(sessionAccuracy(session))
}

function openSession(session: ExamSessionResponse) {
  router.push({
    path: '/exam/history/session',
    query: {
      courseId: String(session.courseId),
      submitTime: session.submitTime,
    },
  })
}

function applyCourseFromQuery() {
  const q = Number(route.query.courseId)
  if (!Number.isNaN(q) && q > 0) {
    courseStore.setCourseId(q)
    page.value = 1
    fetchList()
    return true
  }
  return false
}

async function initPage() {
  try {
    await ensureCourses()
    if (!applyCourseFromQuery() && selectedCourseId.value) {
      page.value = 1
      fetchList()
    }
  } catch {
    loadError.value = true
  }
}

onMounted(initPage)

onUnmounted(stopHistoryPoll)

watch(() => route.query.courseId, () => {
  applyCourseFromQuery()
})
</script>

<template>
  <div class="history-page">
    <div class="page-header">
      <div>
        <h1>考试历史</h1>
        <p class="sub">按考试场次查看完整答题详情</p>
      </div>
      <el-button size="large" @click="router.push('/exam/start')">
        <AppIcon name="quill" :size="16" class="btn-icon" />
        开始考试
      </el-button>
    </div>

    <div class="filter-bar">
      <el-select
        v-model="selectedCourseId"
        placeholder="选择课程"
        size="large"
        style="width: 220px"
        clearable
        @change="onCourseChange"
      >
        <el-option v-for="c in courses" :key="c.id" :label="c.courseName" :value="c.id" />
      </el-select>
    </div>

    <EmptyBlock
      v-if="!selectedCourseId"
      icon="inbox"
      title="选择课程"
      description="选择一个课程查看考试历史"
    />

    <LoadingBlock v-else-if="loading" />

    <EmptyBlock
      v-else-if="loadError"
      icon="inbox"
      title="加载失败"
      description="无法获取考试历史，请检查网络后重试"
    >
      <el-button type="primary" @click="fetchList">重试</el-button>
    </EmptyBlock>

    <EmptyBlock
      v-else-if="!pageResult || pageResult.records.length === 0"
      icon="inbox"
      title="暂无考试记录"
      description="完成考试后，历史记录将按场次显示在这里"
    >
      <el-button type="primary" @click="router.push('/exam/start')">去考试</el-button>
    </EmptyBlock>

    <div v-else class="session-list">
      <div
        v-for="session in pageResult.records"
        :key="session.submitTime"
        class="session-card"
        @click="openSession(session)"
      >
        <div class="session-main">
          <div class="session-time">{{ formatDate(session.submitTime) }}</div>
          <div class="session-stats">
            <span>共 {{ session.totalCount }} 题</span>
            <span class="dot">·</span>
            <span class="green">正确 {{ session.correctCount }}</span>
            <span class="dot">·</span>
            <span class="red">错误 {{ session.wrongCount }}</span>
            <span v-if="session.ungradedCount > 0" class="dot">·</span>
            <span v-if="session.ungradedCount > 0" class="orange">待批改 {{ session.ungradedCount }}</span>
          </div>
        </div>
        <div class="session-right">
          <div class="accuracy-block">
            <div class="accuracy" :class="{ good: (sessionAccuracy(session).percent ?? 0) >= 60 }">
              {{ sessionAccuracyPercent(session) }}
            </div>
            <div class="accuracy-meta">{{ sessionAccuracy(session).label }}</div>
          </div>
          <span class="arrow">→</span>
        </div>
      </div>

      <div v-if="pageResult.pages > 1" class="pagination-wrap">
        <el-pagination
          layout="prev, pager, next"
          :total="pageResult.total"
          :page-size="pageSize"
          :current-page="page"
          @current-change="onPageChange"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.history-page { max-width: 800px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  h1 {
    font-family: $font-display;
    font-size: 22px;
    font-weight: 700;
    color: $ink;
    margin-bottom: 4px;
    letter-spacing: 1px;
  }
  .sub { font-size: 13px; color: $ink-muted; }
}

.filter-bar { margin-bottom: 20px; }

.session-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.session-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 18px 20px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: $celadon;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
    transform: translateX(4px);
  }
}

.session-time {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 6px;
}

.session-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  color: #888;

  .green { color: #07c160; }
  .red { color: #e74c3c; }
  .orange { color: #f59e0b; }
  .dot { color: #ddd; }
}

.session-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.accuracy-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.accuracy-meta {
  font-size: 11px;
  color: #aaa;
}

.accuracy {
  font-size: 22px;
  font-weight: 700;
  color: #e74c3c;
  &.good { color: #07c160; }
}

.arrow {
  font-size: 18px;
  color: #ccc;
}

.pagination-wrap {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}
</style>
