import api from './index'
import type { LoginRequest, RegisterRequest, AuthResponse } from '@/types'

export function login(data: LoginRequest): Promise<AuthResponse> {
  return api.post('/auth/login', data).then((res) => res.data)
}

export function register(data: RegisterRequest): Promise<AuthResponse> {
  return api.post('/auth/register', data).then((res) => res.data)
}

export function logout(): Promise<void> {
  return api.post('/auth/logout').then((res) => res.data)
}
