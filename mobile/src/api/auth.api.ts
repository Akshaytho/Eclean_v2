import { apiClient } from './client'
import type { User, AuthTokens } from '../types'

interface LoginResponse  { user: User; accessToken: string; refreshToken: string; expiresIn: number }
interface RegisterInput  { email: string; password: string; name: string; role: 'WORKER' | 'BUYER' | 'CITIZEN' }

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  register: (input: RegisterInput) =>
    apiClient.post<LoginResponse>('/auth/register', input).then((r) => r.data),

  me: () =>
    apiClient.get<{ user: User }>('/auth/me').then((r) => r.data.user),

  logout: () =>
    apiClient.post('/auth/logout'),

  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post('/auth/reset-password', { token, password }),

  saveDeviceToken: (token: string) =>
    apiClient.post('/notifications/device-token', { token }),
}
