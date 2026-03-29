import { z } from 'zod'

// POST /buyer/payments/create-order
export const createOrderSchema = z.object({
  amountCents: z.number().int().positive().min(100, 'Minimum ₹1'),
  taskTitle:   z.string().min(1).max(200),
})

// Sent by mobile after Razorpay Checkout completes
export const paymentVerificationSchema = z.object({
  razorpayOrderId:   z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
})

export type CreateOrderInput       = z.infer<typeof createOrderSchema>
export type PaymentVerificationInput = z.infer<typeof paymentVerificationSchema>
