<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import * as courseApi from '@/api/course'
import type { CourseResponse, CourseRequest } from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import EmptyBlock from '@/components/common/EmptyBlock.vue'
import { CourseSeal } from '@/components/course'

// --- list ---
const loading = ref(true)
const courses = ref<CourseResponse[]>([])

async function fetchCourses() {
  loading.value = true
  try {
    courses.value = await courseApi.listCourses()
  } catch {
    // error handled by interceptor
  } finally {
    loading.value = false
  }
}

// --- dialog ---
const dialogVisible = ref(false)
const dialogTitle = ref('新建课程')
const editingId = ref<number | null>(null)
const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive<CourseRequest>({
  courseName: '',
  courseDescription: '',
  teacher: '',
  semester: '',
})

const rules: FormRules = {
  courseName: [
    { required: true, message: '请输入课程名称', trigger: 'blur' },
    { max: 100, message: '课程名称不能超过 100 个字符', trigger: 'blur' },
  ],
}

function openCreate() {
  editingId.value = null
  dialogTitle.value = '新建课程'
  form.courseName = ''
  form.courseDescription = ''
  form.teacher = ''
  form.semester = ''
  formRef.value?.resetFields()
  dialogVisible.value = true
}

function openEdit(course: CourseResponse) {
  editingId.value = course.id
  dialogTitle.value = '编辑课程'
  form.courseName = course.courseName
  form.courseDescription = course.courseDescription || ''
  form.teacher = course.teacher || ''
  form.semester = course.semester || ''
  formRef.value?.resetFields()
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (editingId.value) {
      await courseApi.updateCourse(editingId.value, { ...form })
      ElMessage.success('课程已更新')
    } else {
      await courseApi.createCourse({ ...form })
      ElMessage.success('课程已创建')
    }
    dialogVisible.value = false
    await fetchCourses()
  } catch {
    // error handled by interceptor
  } finally {
    submitting.value = false
  }
}

async function handleDelete(course: CourseResponse) {
  try {
    await ElMessageBox.confirm(
      `确定要删除课程「${course.courseName}」吗？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await courseApi.deleteCourse(course.id)
    ElMessage.success('课程已删除')
    await fetchCourses()
  } catch {
    // error handled by interceptor
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return dateStr.replace('T', ' ').substring(0, 16)
}

onMounted(fetchCourses)
</script>

<template>
  <div class="course-page">
    <div class="page-header">
      <div>
        <h1>课程管理</h1>
        <p class="sub">管理你的学习课程，上传资料后即可开始智能出题</p>
      </div>
      <el-button type="primary" :icon="Plus" size="large" @click="openCreate">
        新建课程
      </el-button>
    </div>

    <!-- Loading -->
    <LoadingBlock v-if="loading" />

    <!-- Empty -->
    <EmptyBlock
      v-else-if="courses.length === 0"
      icon="book"
      title="还没有课程"
      description="创建你的第一门课程，上传教材资料，开始 AI 智能学习"
    >
      <el-button type="primary" @click="openCreate">创建课程</el-button>
    </EmptyBlock>

    <!-- Course Grid -->
    <div v-else class="course-grid">
      <div
        v-for="course in courses"
        :key="course.id"
        class="course-card"
      >
        <div class="card-main">
          <CourseSeal
            :name="course.courseName"
            :id="course.id"
            size="lg"
          />
          <div class="card-body">
            <h3 class="card-title">{{ course.courseName }}</h3>
            <p v-if="course.courseDescription" class="card-desc">
              {{ course.courseDescription }}
            </p>
            <div class="card-meta">
              <span v-if="course.teacher">{{ course.teacher }}</span>
              <span v-if="course.semester">{{ course.semester }}</span>
              <span v-if="course.createTime" class="meta-time">
                {{ formatDate(course.createTime) }}
              </span>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <el-button size="small" text @click="openEdit(course)">编辑</el-button>
          <el-button size="small" text type="danger" @click="handleDelete(course)">
            删除
          </el-button>
        </div>
      </div>
    </div>

    <!-- Create / Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="500px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @keyup.enter="handleSubmit"
      >
        <el-form-item label="课程名称" prop="courseName">
          <el-input
            v-model="form.courseName"
            placeholder="请输入课程名称"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="课程描述" prop="courseDescription">
          <el-input
            v-model="form.courseDescription"
            type="textarea"
            :rows="3"
            placeholder="请输入课程描述（选填）"
          />
        </el-form-item>
        <el-form-item label="授课教师" prop="teacher">
          <el-input
            v-model="form.teacher"
            placeholder="请输入教师姓名（选填）"
          />
        </el-form-item>
        <el-form-item label="学期" prop="semester">
          <el-input
            v-model="form.semester"
            placeholder="如：2025-2026 第一学期（选填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ editingId ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.course-page {
  max-width: 1100px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;

  h1 {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 4px;
  }
  .sub {
    font-size: 13px;
    color: #999;
  }
}

.loading-area,
.empty-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 360px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #eee;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-area h3 {
  font-size: 17px;
  color: #333;
  margin-bottom: 8px;
}

.empty-area p {
  font-size: 13px;
  color: #999;
  margin-bottom: 20px;
}

.course-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}

.course-card {
  background: $surface;
  border-radius: $radius-lg;
  border: 1px solid $stone;
  overflow: hidden;
  transition: all 0.25s;
  display: flex;
  flex-direction: column;

  &:hover {
    border-color: rgba($celadon, 0.45);
    box-shadow: $shadow-raised;
    transform: translateY(-2px);
  }

  .card-main {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 18px 18px 12px;
  }

  .card-body {
    flex: 1;
    min-width: 0;
  }

  .card-title {
    font-family: $font-display;
    font-size: 16px;
    font-weight: 600;
    color: $ink;
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-desc {
    font-size: 12px;
    color: $ink-muted;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 10px;
    min-height: 18px;
  }

  .card-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: $ink-muted;

    span + span::before {
      content: '·';
      margin-right: 8px;
      color: $stone;
    }

    .meta-time {
      color: lighten($ink-muted, 8%);
    }
  }

  .card-actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    padding: 0 12px 12px;
    margin-top: auto;
  }
}

@media (max-width: 900px) {
  .course-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .course-grid {
    grid-template-columns: 1fr;
  }
  .page-header {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
