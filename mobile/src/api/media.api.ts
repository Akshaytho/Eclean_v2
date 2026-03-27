import { apiClient } from './client'
import type { TaskMedia, MediaType } from '../types'

export const mediaApi = {
  upload: async (taskId: string, uri: string, mediaType: MediaType): Promise<TaskMedia> => {
    const formData = new FormData()

    // React Native FormData accepts { uri, name, type }
    formData.append('file', {
      uri,
      name: `${mediaType.toLowerCase()}_${Date.now()}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob)

    formData.append('mediaType', mediaType)

    const res = await apiClient.post<{ media: TaskMedia }>(
      `/tasks/${taskId}/media`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return res.data.media
  },

  list: (taskId: string) =>
    apiClient.get<{ media: TaskMedia[] }>(`/tasks/${taskId}/media`).then((r) => r.data.media),
}
