import axios from 'axios'
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

// 后端统一响应格式
interface ResultEnvelope<T = unknown> {
  code: number
  message: string
  data: T
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 为 true 时不弹出全局错误 Toast（用于可选的次要请求） */
    silent?: boolean
  }
}

function extractErrorMessage(error: AxiosError): string {
  const data = error.response?.data as ResultEnvelope | { message?: string } | undefined
  if (data && typeof data === 'object' && 'message' in data && data.message) {
    return data.message
  }
  if (error.code === 'ECONNABORTED') {
    return '请求超时，请稍后重试'
  }
  if (!error.response) {
    return '网络连接失败，请检查网络'
  }
  return `请求失败 (${error.response.status})`
}

function shouldToast(config?: InternalAxiosRequestConfig): boolean {
  return !config?.silent
}

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor — attach token from localStorage / sessionStorage
api.interceptors.request.use(
  (config) => {
    const publicAuthPaths = ['/auth/login', '/auth/register']
    if (publicAuthPaths.includes(config.url || '')) {
      return config
    }
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor — unwrap backend Result<T> envelope
api.interceptors.response.use(
  (response) => {
    const body = response.data as ResultEnvelope | undefined
    if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
      if (body.code === 200) {
        response.data = body.data
      } else if (shouldToast(response.config)) {
        ElMessage.error(body.message || '请求失败')
        return Promise.reject(new Error(body.message || '请求失败'))
      } else {
        return Promise.reject(new Error(body.message || '请求失败'))
      }
    }
    return response
  },
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
      router.push('/login')
    } else if (shouldToast(error.config)) {
      ElMessage.error(extractErrorMessage(error))
    }
    return Promise.reject(error)
  },
)

export default api
