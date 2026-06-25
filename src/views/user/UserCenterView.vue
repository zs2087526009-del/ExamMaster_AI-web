<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import * as userApi from '@/api/user'
import * as statisticsApi from '@/api/statistics'
import * as courseApi from '@/api/course'
import type { UserProfileResponse } from '@/types'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import { AppIcon } from '@/components/icons'
import { calcAccuracy, formatAccuracyPercent } from '@/utils/accuracy'

const authStore = useAuthStore()

const loading = ref(true)
const profile = ref<UserProfileResponse | null>(null)
const profileSaving = ref(false)
const passwordSaving = ref(false)

const profileFormRef = ref<FormInstance>()
const passwordFormRef = ref<FormInstance>()

const profileForm = reactive({
  nickname: '',
  email: '',
})

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const accountStats = ref({
  courseCount: 0,
  totalAnswers: 0,
  accuracyRate: '-',
})

const profileRules: FormRules = {
  nickname: [{ max: 50, message: '昵称不能超过 50 个字符', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' }],
}

const validateConfirmPassword = (_rule: unknown, value: string, callback: (err?: Error) => void) => {
  if (value !== passwordForm.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const passwordRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 50, message: '新密码长度为 6-50 个字符', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' },
  ],
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchData() {
  loading.value = true
  try {
    const [p, stats, courses] = await Promise.all([
      userApi.getProfile(),
      statisticsApi.getOverview(true).catch(() => null),
      courseApi.listCourses().catch(() => []),
    ])
    profile.value = p
    profileForm.nickname = p.nickname || ''
    profileForm.email = p.email || ''
    accountStats.value = {
      courseCount: courses.length,
      totalAnswers: stats?.totalCount ?? 0,
      accuracyRate: stats ? formatAccuracyPercent(calcAccuracy(stats)) : '-',
    }
  } catch {
    ElMessage.error('加载用户资料失败')
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  const valid = await profileFormRef.value?.validate().catch(() => false)
  if (!valid) return

  profileSaving.value = true
  try {
    const updated = await userApi.updateProfile({
      nickname: profileForm.nickname || undefined,
      email: profileForm.email || undefined,
    })
    profile.value = updated
    authStore.updateUserInfo({
      nickname: updated.nickname,
      email: updated.email || undefined,
    })
    ElMessage.success('资料已更新')
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message || '更新失败，请稍后重试'
    ElMessage.error(message)
  } finally {
    profileSaving.value = false
  }
}

async function savePassword() {
  const valid = await passwordFormRef.value?.validate().catch(() => false)
  if (!valid) return

  passwordSaving.value = true
  try {
    await userApi.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    })
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    passwordFormRef.value?.resetFields()
    ElMessage.success('密码修改成功')
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message || '密码修改失败，请检查原密码'
    ElMessage.error(message)
  } finally {
    passwordSaving.value = false
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="user-page">
    <div class="page-header">
      <div>
        <h1>用户中心</h1>
        <p class="sub">管理个人资料与账号安全</p>
      </div>
    </div>

    <LoadingBlock v-if="loading" text="加载用户资料..." />

    <template v-else-if="profile">
      <!-- Profile Hero -->
      <div class="profile-hero">
        <div class="avatar">{{ (profile.nickname || profile.username).charAt(0) }}</div>
        <div class="hero-info">
          <h2>{{ profile.nickname || profile.username }}</h2>
          <p class="username">@{{ profile.username }}</p>
          <p class="joined">注册于 {{ formatDateTime(profile.createTime) }}</p>
        </div>
      </div>

      <!-- Account Stats -->
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-value">{{ accountStats.courseCount }}</span>
          <span class="stat-label">课程数</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ accountStats.totalAnswers }}</span>
          <span class="stat-label">总答题数</span>
        </div>
        <div class="stat-card">
          <span class="stat-value accent">{{ accountStats.accuracyRate }}</span>
          <span class="stat-label">正确率</span>
        </div>
      </div>

      <div class="content-grid">
        <!-- Profile Form -->
        <section class="panel">
          <div class="panel-header">
            <AppIcon name="user" :size="18" />
            <h3>基本资料</h3>
          </div>
          <el-form
            ref="profileFormRef"
            :model="profileForm"
            :rules="profileRules"
            label-position="top"
            class="profile-form"
          >
            <el-form-item label="用户名">
              <el-input :model-value="profile.username" disabled />
            </el-form-item>
            <el-form-item label="昵称" prop="nickname">
              <el-input v-model="profileForm.nickname" placeholder="设置显示昵称" maxlength="50" />
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="profileForm.email" placeholder="your@email.com" />
            </el-form-item>
            <el-button type="primary" :loading="profileSaving" @click="saveProfile">
              保存资料
            </el-button>
          </el-form>
        </section>

        <!-- Password Form -->
        <section class="panel">
          <div class="panel-header">
            <AppIcon name="seal" :size="18" />
            <h3>修改密码</h3>
          </div>
          <el-form
            ref="passwordFormRef"
            :model="passwordForm"
            :rules="passwordRules"
            label-position="top"
            class="password-form"
          >
            <el-form-item label="原密码" prop="oldPassword">
              <el-input
                v-model="passwordForm.oldPassword"
                type="password"
                show-password
                placeholder="输入当前密码"
              />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input
                v-model="passwordForm.newPassword"
                type="password"
                show-password
                placeholder="6-50 个字符"
              />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirmPassword">
              <el-input
                v-model="passwordForm.confirmPassword"
                type="password"
                show-password
                placeholder="再次输入新密码"
              />
            </el-form-item>
            <el-button type="primary" plain :loading="passwordSaving" @click="savePassword">
              修改密码
            </el-button>
          </el-form>
        </section>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/variables' as *;

.user-page {
  max-width: 900px;
}

.page-header {
  margin-bottom: 24px;

  h1 {
    font-family: $font-display;
    font-size: 22px;
    font-weight: 700;
    color: $ink;
    margin-bottom: 4px;
    letter-spacing: 1px;
  }

  .sub {
    font-size: 13px;
    color: $ink-muted;
  }
}

.profile-hero {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 28px;
  background: linear-gradient(135deg, $celadon-pale 0%, lighten($celadon-pale, 2%) 100%);
  border: 1px solid lighten($celadon, 28%);
  border-radius: $radius-lg;
  margin-bottom: 20px;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: $celadon;
  color: #fff;
  font-family: $font-display;
  font-size: 30px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba($celadon, 0.25);
}

.hero-info {
  h2 {
    font-family: $font-display;
    font-size: 24px;
    font-weight: 700;
    color: $ink;
    margin-bottom: 4px;
  }

  .username {
    font-size: 14px;
    color: $ink-muted;
    margin-bottom: 6px;
  }

  .joined {
    font-size: 12px;
    color: $ink-muted;
  }
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}

.stat-card {
  background: $surface;
  border: 1px solid $stone;
  border-radius: $radius-md;
  padding: 18px 20px;
  text-align: center;

  .stat-value {
    display: block;
    font-family: $font-display;
    font-size: 26px;
    font-weight: 700;
    color: $ink;
    line-height: 1.2;

    &.accent { color: $celadon-deep; }
  }

  .stat-label {
    font-size: 12px;
    color: $ink-muted;
    margin-top: 4px;
  }
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.panel {
  background: $surface;
  border: 1px solid $stone;
  border-radius: $radius-lg;
  padding: 24px;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  color: $celadon;

  h3 {
    font-size: 15px;
    font-weight: 600;
    color: $ink;
  }
}

@media (max-width: 720px) {
  .content-grid { grid-template-columns: 1fr; }
  .stats-row { grid-template-columns: 1fr; }
  .profile-hero { flex-direction: column; text-align: center; }
}
</style>
