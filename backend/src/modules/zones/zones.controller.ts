import type { FastifyRequest, FastifyReply } from 'fastify'
import type { CreateZoneInput, InspectZoneInput, ListZonesQuery } from './zones.schema'
import * as svc from './zones.service'

export async function createZone(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const zone = await svc.createZone(req.body as CreateZoneInput)
  await reply.code(201).send(zone)
}

export async function listZones(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const zones = await svc.listZones(req.query as ListZonesQuery)
  await reply.send(zones)
}

export async function inspectZone(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = req.params as { id: string }
  const zone = await svc.inspectZone(id, req.user.id, req.body as InspectZoneInput)
  await reply.send(zone)
}
