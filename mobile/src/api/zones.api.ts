import { apiClient } from './client'
import type { Zone, DirtyLevel } from '../types'

export const zonesApi = {
  list: (city?: string) =>
    apiClient.get<{ zones: Zone[] }>('/zones', { params: { city } }).then((r) => r.data.zones),

  inspect: (zoneId: string, dirtyLevel: DirtyLevel, note?: string) =>
    apiClient.patch(`/zones/${zoneId}/inspect`, { dirtyLevel, note }),
}
