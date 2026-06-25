<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, View, Hide, Message, Tickets } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { AppIcon } from '@/components/icons'

const router = useRouter()
const authStore = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const passwordVisible = ref(false)
const confirmVisible = ref(false)

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  email: '',
})

const validateConfirm = (_rule: any, value: string, callback: any) => {
  if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 50, message: '用户名长度为 2-50 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 100, message: '密码长度为 6-100 个字符', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
  email: [
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' },
  ],
}

async function handleRegister() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await authStore.register({
      username: form.username,
      password: form.password,
      nickname: form.nickname || undefined,
      email: form.email || undefined,
    })
    ElMessage.success('注册成功')
    router.push('/dashboard')
  } catch (err: any) {
    const message = err?.response?.data?.message || '注册失败，请稍后重试'
    ElMessage.error(message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <!-- Left: Brand Panel -->
    <div class="brand-panel">
      <div class="brand-icon">
        <AppIcon name="seal" :size="40" />
      </div>
      <h1 class="brand-name">ExamMaster AI</h1>
      <p class="brand-tagline">AI 驱动的智能学习平台</p>
      <ul class="brand-features">
        <li>智能出题，精准测评</li>
        <li>AI 批改，即时反馈</li>
        <li>知识图谱，薄弱定位</li>
      </ul>
    </div>

    <!-- Right: Register Form -->
    <div class="form-panel">
      <div class="form-wrapper">
        <h2 class="form-title">创建账号</h2>
        <p class="form-subtitle">注册 ExamMaster AI，开始智能学习</p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @keyup.enter="handleRegister"
        >
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
              :prefix-icon="User"
              size="large"
              clearable
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              :type="passwordVisible ? 'text' : 'password'"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              size="large"
              clearable
            >
              <template #suffix>
                <el-icon
                  class="password-toggle"
                  @click="passwordVisible = !passwordVisible"
                >
                  <Hide v-if="passwordVisible" />
                  <View v-else />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              :type="confirmVisible ? 'text' : 'password'"
              placeholder="请再次输入密码"
              :prefix-icon="Lock"
              size="large"
              clearable
            >
              <template #suffix>
                <el-icon
                  class="password-toggle"
                  @click="confirmVisible = !confirmVisible"
                >
                  <Hide v-if="confirmVisible" />
                  <View v-else />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="昵称" prop="nickname">
            <el-input
              v-model="form.nickname"
              placeholder="请输入昵称（选填）"
              :prefix-icon="Tickets"
              size="large"
              clearable
            />
          </el-form-item>

          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model="form.email"
              placeholder="请输入邮箱（选填）"
              :prefix-icon="Message"
              size="large"
              clearable
            />
          </el-form-item>

          <el-form-item>
            <el-button
              class="submit-btn"
              type="primary"
              size="large"
              :loading="loading"
              @click="handleRegister"
            >
              {{ loading ? '注册中...' : '注 册' }}
            </el-button>
          </el-form-item>
        </el-form>

        <p class="form-footer">
          已有账号？<router-link to="/login">立即登录</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/auth.scss';

.password-toggle {
  cursor: pointer;
  color: #999;
  font-size: 16px;

  &:hover {
    color: #333;
  }
}
</style>
