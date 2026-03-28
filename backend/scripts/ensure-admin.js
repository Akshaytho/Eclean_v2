// backend/scripts/ensure-admin.js
// Runs on every container start AFTER prisma migrate deploy.
// Creates admin@eclean.test if it doesn't exist. Idempotent.

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

async function main() {
  const prisma = new PrismaClient()
  try {
    const hash = await bcrypt.hash('Test@1234', 10)
    await prisma.user.upsert({
      where: { email: 'admin@eclean.test' },
      update: { passwordHash: hash, isActive: true, role: 'ADMIN' },
      create: {
        email: 'admin@eclean.test',
        name: 'eClean Admin',
        role: 'ADMIN',
        passwordHash: hash,
        isEmailVerified: true,
        isActive: true,
      },
    })
    console.log('Admin user ready: admin@eclean.test / Test@1234')
  } catch (err) {
    console.error('Admin seed failed (non-fatal):', err.message)
  } finally {
    await prisma.$disconnect()
  }
}

main()
