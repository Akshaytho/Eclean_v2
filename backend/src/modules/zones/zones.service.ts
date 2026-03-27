import { prisma } from '../../lib/prisma'
import { NotFoundError } from '../../lib/errors'
import { DIRTY_LEVEL_PRICING } from '../tasks/tasks.schema'
import type { CreateZoneInput, InspectZoneInput, ListZonesQuery } from './zones.schema'

// ─── Create zone (ADMIN only) ─────────────────────────────────────────────────

export async function createZone(input: CreateZoneInput) {
  return prisma.zone.create({
    data: {
      name:         input.name,
      city:         input.city,
      lat:          input.lat,
      lng:          input.lng,
      radiusMeters: input.radiusMeters,
      dirtyLevel:   'LIGHT',  // default for all new zones
    },
  })
}

// ─── List zones with open task count ──────────────────────────────────────────

export async function listZones(query: ListZonesQuery) {
  const zones = await prisma.zone.findMany({
    where:   query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {},
    include: {
      _count: { select: { tasks: { where: { status: 'OPEN' } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return zones.map(({ _count, ...z }) => ({
    ...z,
    openTaskCount: _count.tasks,
  }))
}

// ─── Inspect zone (SUPERVISOR only) ───────────────────────────────────────────

export async function inspectZone(
  zoneId: string,
  _supervisorId: string,
  input: InspectZoneInput,
) {
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } })
  if (!zone) throw new NotFoundError('Zone not found')

  const updated = await prisma.zone.update({
    where: { id: zoneId },
    data: {
      dirtyLevel:      input.dirtyLevel,
      lastInspectedAt: new Date(),
    },
  })

  // Auto-create task when dirty level is MEDIUM, HEAVY, or CRITICAL
  // LIGHT → no auto-task
  const triggersTask = ['MEDIUM', 'HEAVY', 'CRITICAL'].includes(input.dirtyLevel)

  if (triggersTask) {
    await prisma.$transaction(async (tx) => {
      const existingOpen = await tx.task.findFirst({
        where: { zoneId, status: 'OPEN' },
      })

      if (!existingOpen) {
        const admin = await tx.user.findFirst({
          where: { role: 'ADMIN', isActive: true },
        })

        if (admin) {
          const rateCents = DIRTY_LEVEL_PRICING[input.dirtyLevel].default

          const task = await tx.task.create({
            data: {
              title:       'Cleaning required',
              description: input.note ?? `Zone inspection flagged ${input.dirtyLevel} dirty level in ${zone.name}`,
              category:    'STREET_CLEANING',
              dirtyLevel:  input.dirtyLevel,
              urgency:     input.dirtyLevel === 'CRITICAL' ? 'CRITICAL' : 'MEDIUM',
              rateCents,
              buyerId:     admin.id,
              zoneId,
              status:      'OPEN',
            },
          })

          const admins = await tx.user.findMany({
            where: { role: 'ADMIN', isActive: true },
          })

          await Promise.all(
            admins.map(a =>
              tx.notification.create({
                data: {
                  userId: a.id,
                  type:   'ZONE_INSPECTED',
                  title:  'Zone Inspection Alert — Task Auto-Created',
                  body:   `Zone "${zone.name}" in ${zone.city ?? 'unknown city'} flagged as ${input.dirtyLevel}. Task auto-created.`,
                  data:   { zoneId, taskId: task.id, dirtyLevel: input.dirtyLevel },
                },
              }),
            ),
          )
        }
      }
    })
  }

  return updated
}
