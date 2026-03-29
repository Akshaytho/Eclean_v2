// eClean — Payment routes (buyer-facing)
//
// POST /api/v1/buyer/payments/create-order  — get Razorpay orderId for checkout
//
// The actual task creation (with payment verification) is in buyer.routes.ts.
// This module only handles the Razorpay order creation step.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { createOrderSchema, type CreateOrderInput } from './payment.schema'
import { createOrder } from './payment.service'

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = [authenticate, authorize(['BUYER'])]

  // POST /api/v1/buyer/payments/create-order
  fastify.post(
    '/create-order',
    { preHandler: [...auth, validate({ body: createOrderSchema })] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { amountCents, taskTitle } = req.body as CreateOrderInput
      const result = await createOrder(amountCents, req.user.id, taskTitle)
      return reply.send(result)
    },
  )
}
