<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, View, Hide } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { AppIcon } from '@/components/icons'

const router = useRouter()
const authStore = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const passwordVisible = ref(false)
const rememberMe = ref(false)

const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 50, message: '用户名长度为 2-50 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 100, message: '密码长度为 6-100 个字符', trigger: 'blur' },
  ],
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await authStore.login(
      {
        username: form.username,
        password: form.password,
      },
      rememberMe.value,
    )
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } catch (err: any) {
    const message = err?.response?.data?.message || '登录失败，请稍后重试'
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

    <!-- Right: Login Form -->
    <div class="form-panel">
      <div class="form-wrapper">
        <h2 class="form-title">用户登录</h2>
        <p class="form-subtitle">欢迎回来，请登录您的账号</p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @keyup.enter="handleLogin"
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

          <div class="form-extra">
            <el-checkbox v-model="rememberMe" size="small">记住我</el-checkbox>
            <a
              class="forgot-link"
              href="javascript:;"
              @click="ElMessage.info('请联系管理员重置密码')"
            >忘记密码？</a>
          </div>

          <el-form-item>
            <el-button
              class="submit-btn"
              type="primary"
              size="large"
              :loading="loading"
              @click="handleLogin"
            >
              {{ loading ? '登录中...' : '登 录' }}
            </el-button>
          </el-form-item>
        </el-form>

        <p class="form-footer">
          还没有账号？<router-link to="/register">立即注册</router-link>
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
