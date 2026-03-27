import { apiClient } from './client'
import type { CitizenReport, TaskCategory, TaskUrgency } from '../types'

export const citizenApi = {
  createReport: (input: {
    category: TaskCategory
    description: string
    urgency: TaskUrgency
    lat: number
    lng: number
    photoUrl?: string
  }) =>
    apiClient.post<{ report: CitizenReport }>('/citizen/reports', input).then((r) => r.data.report),

  listReports: () =>
    apiClient.get<{ reports: CitizenReport[] }>('/citizen/reports').then((r) => r.data.reports),
}
