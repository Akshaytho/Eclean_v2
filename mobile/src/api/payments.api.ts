import { apiClient } from './client'

export interface CreateOrderResponse {
  orderId:  string
  amount:   number    // paise
  currency: string
  keyId:    string
}

export const paymentsApi = {
  createOrder: (amountCents: number, taskTitle: string) =>
    apiClient
      .post<CreateOrderResponse>('/buyer/payments/create-order', { amountCents, taskTitle })
      .then((r) => r.data),
}
