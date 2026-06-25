import api from './index'
import type { UserProfileResponse, UpdateProfileRequest, ChangePasswordRequest } from '@/types'

export function getProfile(): Promise<UserProfileResponse> {
  return api.get('/users/me').then((res) => res.data)
}

export function updateProfile(data: UpdateProfileRequest): Promise<UserProfileResponse> {
  return api.put('/users/me', data).then((res) => res.data)
}

export function changePassword(data: ChangePasswordRequest): Promise<void> {
  return api.put('/users/me/password', data).then((res) => res.data)
}
