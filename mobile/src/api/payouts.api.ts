import { apiClient } from './client'
import type { WalletData, PayoutStatus } from '../types'

// Payout list items include task/buyer info joined by the backend
export interface PayoutListItem {
  id:                string
  taskId:            string
  taskTitle:         string
  buyerName:         string
  amountCents:       number
  workerAmountCents: number
  platformFeeCents:  number
  status:            PayoutStatus
  razorpayPayoutId:  string | null
  paidAt:            string | null
  createdAt:         string
}

export interface PayoutsResponse {
  payouts: PayoutListItem[]
  total:   number
  page:    number
  limit:   number
}

export const payoutsApi = {
  getWallet: (): Promise<WalletData> =>
    apiClient.get<WalletData>('/worker/wallet').then((r) => r.data),

  getPayouts: (page = 1): Promise<PayoutsResponse> =>
    apiClient
      .get<PayoutsResponse>('/worker/payouts', { params: { page } })
      .then((r) => r.data),
}
