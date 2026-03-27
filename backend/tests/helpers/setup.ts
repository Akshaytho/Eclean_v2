import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app'
import { prisma } from '../../src/lib/prisma'
import { signAccessToken } from '../../src/lib/jwt'

export const DOMAIN = '@eclean.test'

// ── App singleton ─────────────────────────────────────────────────────────────

let _app: FastifyInstance | null = null

export async function getApp(): Promise<FastifyInstance> {
  if (!_app) {
    _app = await buildApp()
    await _app.ready()
  }
  return _app
}

export async function closeApp(): Promise<void> {
  if (_app) {
    await _app.close()
    _app = null
  }
}

// ── DB cleanup — delete all rows seeded by tests ──────────────────────────────

export async function cleanTestData(): Promise<void> {
  const isTest = (email: string) => email.endsWith(DOMAIN)
  const userWhere = { user: { email: { endsWith: DOMAIN } } }
  const buyerWhere = { buyer: { email: { endsWith: DOMAIN } } }
  const taskViaWhere = { task: { buyer: { email: { endsWith: DOMAIN } } } }

  // Delete leaf rows first, then parent rows
  await prisma.chatMessage.deleteMany({ where: { sender: { email: { endsWith: DOMAIN } } } })
  await prisma.taskEvent.deleteMany({ where: taskViaWhere })
  await prisma.notification.deleteMany({ where: { user: { email: { endsWith: DOMAIN } } } })
  await prisma.taskLocationLog.deleteMany({ where: taskViaWhere })
  await prisma.taskMedia.deleteMany({ where: taskViaWhere })
  await prisma.payout.deleteMany({ where: buyerWhere })
  await prisma.citizenReport.deleteMany({ where: { reporter: { email: { endsWith: DOMAIN } } } })
  await prisma.task.deleteMany({ where: { buyer: { email: { endsWith: DOMAIN } } } })
  await prisma.workerProfile.deleteMany({ where: userWhere })
  await prisma.buyerProfile.deleteMany({ where: userWhere })
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })

  void isTest // keep import used
}

// ── User factories ────────────────────────────────────────────────────────────

export const TEST_PASSWORD = 'Password1'

/** Register via HTTP endpoint and return parsed body */
export async function registerUser(
  app: FastifyInstance,
  role: 'BUYER' | 'WORKER' | 'CITIZEN',
  tag: string,
) {
  const email = `test_${role.toLowerCase()}_${tag}${DOMAIN}`
  const res = await app.inject({
    method:  'POST',
    url:     '/api/v1/auth/register',
    payload: { email, name: `Test ${role} ${tag}`, password: TEST_PASSWORD, role },
  })
  const body = JSON.parse(res.payload)
  return { email, statusCode: res.statusCode, ...body }
}

/** Create ADMIN user directly in DB (self-service registration disallows ADMIN role) */
export async function createAdminUser(tag: string) {
  const email = `test_admin_${tag}${DOMAIN}`
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
  const user = await prisma.user.create({
    data: { email, name: `Test Admin ${tag}`, role: 'ADMIN', passwordHash },
  })
  const { token: accessToken } = signAccessToken(user.id, 'ADMIN', user.email)
  return { user, accessToken }
}

// ── Multipart helper ──────────────────────────────────────────────────────────

/** Build a multipart/form-data Buffer for app.inject() */
export function buildMultipart(
  boundary: string,
  fields: Record<string, string>,
  file: { fieldname: string; filename: string; mimetype: string; data: Buffer },
): Buffer {
  const parts: Buffer[] = []

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
    )
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.mimetype}\r\n\r\n`,
    ),
  )
  parts.push(file.data)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  return Buffer.concat(parts)
}

// Minimal 1×1 JPEG for upload tests (actual bytes don't matter — Cloudinary is mocked)
export const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
])
