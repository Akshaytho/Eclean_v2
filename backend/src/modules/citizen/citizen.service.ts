import { prisma } from '../../lib/prisma'
import type { CreateReportInput, ListReportsQuery } from './citizen.schema'

// ─── Create citizen report ─────────────────────────────────────────────────────

export async function createReport(citizenId: string, input: CreateReportInput) {
  const report = await prisma.citizenReport.create({
    data: {
      reporterId:      citizenId,
      category:        input.category,
      description:     input.description,
      urgency:         input.urgency,
      locationLat:     input.lat ?? null,
      locationLng:     input.lng ?? null,
      locationAddress: input.locationAddress ?? null,
      photoUrl:        input.photoUrl ?? null,
      status:          'REPORTED',
    },
  })

  // Notify all SUPERVISOR and ADMIN users
  const recipients = await prisma.user.findMany({
    where:  { role: { in: ['SUPERVISOR', 'ADMIN'] }, isActive: true },
    select: { id: true },
  })

  await Promise.all(
    recipients.map(r =>
      prisma.notification.create({
        data: {
          userId: r.id,
          type:   'CITIZEN_REPORT_CREATED',
          title:  'New Citizen Report',
          body:   `Citizen report (${input.urgency}): ${input.description.slice(0, 80)}`,
          data:   { reportId: report.id, urgency: input.urgency, category: input.category },
        },
      }),
    ),
  )

  return report
}

// ─── List own reports (citizen sees only theirs) ──────────────────────────────

export async function listCitizenReports(citizenId: string, query: ListReportsQuery) {
  const [reports, total] = await Promise.all([
    prisma.citizenReport.findMany({
      where:   { reporterId: citizenId },
      orderBy: { createdAt: 'desc' },
      skip:    (query.page - 1) * query.limit,
      take:    query.limit,
    }),
    prisma.citizenReport.count({ where: { reporterId: citizenId } }),
  ])
  return { reports, total, page: query.page, limit: query.limit }
}
