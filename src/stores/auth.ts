import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/types'
import * as authApi from '@/api/auth'
import type { LoginRequest, RegisterRequest } from '@/types'
import { useCourseStore } from '@/stores/course'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(
    localStorage.getItem('token') || sessionStorage.getItem('token'),
  )
  const user = ref<UserInfo | null>(loadUser())

  function loadUser(): UserInfo | null {
    try {
      const raw = localStorage.getItem('user') || sessionStorage.getItem('user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  function saveSession() {
    if (token.value) {
      localStorage.setItem('token', token.value)
    }
    if (user.value) {
      localStorage.setItem('user', JSON.stringify(user.value))
    }
  }

  function clearSession() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    token.value = null
    user.value = null
  }

  const isLoggedIn = computed(() => !!token.value)
  const displayName = computed(() => user.value?.nickname || user.value?.username || '')

  async function loginAction(data: LoginRequest, rememberMe = false) {
    const res = await authApi.login(data)
    token.value = res.token
    user.value = {
      userId: res.userId,
      username: res.username,
      nickname: res.nickname,
    }
    if (rememberMe) {
      saveSession()
    } else {
      // Session-only: store in sessionStorage, clear localStorage
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      sessionStorage.setItem('token', res.token)
      sessionStorage.setItem('user', JSON.stringify(user.value))
    }
  }

  async function registerAction(data: RegisterRequest) {
    const res = await authApi.register(data)
    token.value = res.token
    user.value = {
      userId: res.userId,
      username: res.username,
      nickname: res.nickname,
    }
    saveSession()
  }

  async function logoutAction() {
    try {
      await authApi.logout()
    } catch {
      // backend may be unreachable — clear local session anyway
    }
    clearSession()
    useCourseStore().clear()
  }

  function updateUserInfo(patch: Partial<UserInfo>) {
    if (!user.value) return
    user.value = { ...user.value, ...patch }
    if (localStorage.getItem('token')) {
      localStorage.setItem('user', JSON.stringify(user.value))
    }
    if (sessionStorage.getItem('token')) {
      sessionStorage.setItem('user', JSON.stringify(user.value))
    }
  }

  return {
    token,
    user,
    isLoggedIn,
    displayName,
    login: loginAction,
    register: registerAction,
    logout: logoutAction,
    clearSession,
    updateUserInfo,
  }
})
