import 'dotenv/config'
import {
  PrismaClient,
  Role,
  TaskStatus,
  TaskCategory,
  DirtyLevel,
  TaskUrgency,
  MediaType,
  PayoutStatus,
} from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const PASSWORD = 'Test@1234'
const BCRYPT_ROUNDS = 10  // lower for seed speed

// ── Bangalore coords ─────────────────────────────────────────────────────────
const LOCATIONS = [
  { lat: 12.9716, lng: 77.5946, address: 'MG Road, Bangalore' },
  { lat: 12.9352, lng: 77.6245, address: 'Koramangala, Bangalore' },
  { lat: 13.0358, lng: 77.5970, address: 'Hebbal, Bangalore' },
  { lat: 12.9698, lng: 77.7499, address: 'Whitefield, Bangalore' },
  { lat: 12.9784, lng: 77.6408, address: 'Indiranagar, Bangalore' },
]

async function main(): Promise<void> {
  console.log('🌱  Seeding eClean database...\n')

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS)

  // ── Users ─────────────────────────────────────────────────────────────────
  const [worker1, worker2, buyer1, buyer2, supervisor, citizen, admin] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'worker@eclean.test' },
      update: { passwordHash, name: 'Ravi Kumar' },
      create: { email: 'worker@eclean.test',  name: 'Ravi Kumar',       role: Role.WORKER,     passwordHash, isEmailVerified: true, phone: '+91 98765 43210' },
    }),
    prisma.user.upsert({
      where: { email: 'worker2@eclean.test' },
      update: { passwordHash, name: 'Suresh Yadav' },
      create: { email: 'worker2@eclean.test', name: 'Suresh Yadav',     role: Role.WORKER,     passwordHash, isEmailVerified: true, phone: '+91 98765 00001' },
    }),
    prisma.user.upsert({
      where: { email: 'buyer@eclean.test' },
      update: { passwordHash, name: 'Priya Sharma' },
      create: { email: 'buyer@eclean.test',   name: 'Priya Sharma',     role: Role.BUYER,      passwordHash, isEmailVerified: true, phone: '+91 87654 32109' },
    }),
    prisma.user.upsert({
      where: { email: 'buyer2@eclean.test' },
      update: { passwordHash, name: 'Ankit Jain' },
      create: { email: 'buyer2@eclean.test',  name: 'Ankit Jain',       role: Role.BUYER,      passwordHash, isEmailVerified: true, phone: '+91 87654 00002' },
    }),
    prisma.user.upsert({
      where: { email: 'supervisor@eclean.test' },
      update: { passwordHash, name: 'Test Supervisor' },
      create: { email: 'supervisor@eclean.test', name: 'Test Supervisor', role: Role.SUPERVISOR, passwordHash, isEmailVerified: true },
    }),
    prisma.user.upsert({
      where: { email: 'citizen@eclean.test' },
      update: { passwordHash, name: 'Test Citizen' },
      create: { email: 'citizen@eclean.test', name: 'Test Citizen',     role: Role.CITIZEN,    passwordHash, isEmailVerified: true },
    }),
    prisma.user.upsert({
      where: { email: 'admin@eclean.test' },
      update: { passwordHash, name: 'Test Admin' },
      create: { email: 'admin@eclean.test',   name: 'Test Admin',       role: Role.ADMIN,      passwordHash, isEmailVerified: true },
    }),
  ])

  // Worker profiles
  await Promise.all([
    prisma.workerProfile.upsert({ where: { userId: worker1.id }, update: {}, create: { userId: worker1.id, skills: ['street-cleaning', 'drain-cleaning'] } }),
    prisma.workerProfile.upsert({ where: { userId: worker2.id }, update: {}, create: { userId: worker2.id, skills: ['general-cleaning'] } }),
  ])

  // Buyer profiles
  await Promise.all([
    prisma.buyerProfile.upsert({ where: { userId: buyer1.id }, update: {}, create: { userId: buyer1.id } }),
    prisma.buyerProfile.upsert({ where: { userId: buyer2.id }, update: {}, create: { userId: buyer2.id } }),
  ])

  console.log('  ✅  Users seeded (7 users)')

  // ── Zone ─────────────────────────────────────────────────────────────────
  const zone = await prisma.zone.upsert({
    where: { id: 'zone-bangalore-central' },
    update: {},
    create: {
      id: 'zone-bangalore-central',
      name: 'Bangalore Central',
      city: 'Bangalore',
      supervisorId: supervisor.id,
      lat: 12.9716,
      lng: 77.5946,
      radiusMeters: 5000,
    },
  })
  console.log('  ✅  Zone seeded')

  // ── Clean up stale data from previous test runs ───────────────────────────
  // Delete payouts/media/events for seeded task IDs so tests start from clean state
  const SEED_TASK_IDS = ['task-open-1','task-open-2','task-open-3','task-accepted-1','task-inprogress-1','task-submitted-1','task-approved-1','task-rejected-1','task-disputed-1']
  await prisma.payout.deleteMany({ where: { taskId: { in: SEED_TASK_IDS } } })
  await prisma.taskMedia.deleteMany({ where: { taskId: { in: SEED_TASK_IDS } } })
  await prisma.taskEvent.deleteMany({ where: { taskId: { in: SEED_TASK_IDS } } })
  await prisma.taskLocationLog.deleteMany({ where: { taskId: { in: SEED_TASK_IDS } } })

  // ── Helper: create task + events ─────────────────────────────────────────
  async function makeTask(opts: {
    id: string
    title: string
    category: TaskCategory
    dirtyLevel: DirtyLevel
    urgency: TaskUrgency
    status: TaskStatus
    buyer: typeof buyer1
    worker?: typeof worker1
    locIdx?: number
    aiScore?: number
    aiReasoning?: string
    rejectionReason?: string
  }) {
    const loc = LOCATIONS[opts.locIdx ?? 0]
    const rateMap: Record<DirtyLevel, number> = { LIGHT: 60000, MEDIUM: 100000, HEAVY: 150000, CRITICAL: 200000 }
    const rate = rateMap[opts.dirtyLevel]

    const taskData = {
      title: opts.title,
      description: `Seeded test task — ${opts.title.toLowerCase()} in ${loc.address}. This is a detailed description that explains exactly what needs to be done, the expected quality, and any special instructions for the worker.`,
      category: opts.category,
      dirtyLevel: opts.dirtyLevel,
      urgency: opts.urgency,
      status: opts.status,
      rateCents: rate,
      buyerId: opts.buyer.id,
      workerId: opts.worker?.id ?? null,
      zoneId: zone.id,
      locationLat: loc.lat,
      locationLng: loc.lng,
      locationAddress: loc.address,
      aiScore: opts.aiScore ?? null,
      aiReasoning: opts.aiReasoning ?? null,
      rejectionReason: opts.rejectionReason ?? null,
      startedAt:   opts.status !== 'OPEN' && opts.status !== 'ACCEPTED' ? new Date(Date.now() - 3600_000) : null,
      submittedAt: ['SUBMITTED', 'APPROVED', 'REJECTED', 'DISPUTED', 'COMPLETED'].includes(opts.status) ? new Date(Date.now() - 1800_000) : null,
      completedAt: opts.status === 'APPROVED' || opts.status === 'COMPLETED' ? new Date(Date.now() - 900_000) : null,
    }

    const task = await prisma.task.upsert({
      where: { id: opts.id },
      update: taskData,
      create: { id: opts.id, ...taskData },
    })

    // Events
    const eventSeq: { event: string; actor: typeof buyer1; note?: string }[] = [
      { event: 'TASK_CREATED', actor: opts.buyer },
    ]
    if (opts.worker && opts.status !== 'OPEN') {
      eventSeq.push({ event: 'TASK_ACCEPTED', actor: opts.worker })
    }
    if (opts.status === 'IN_PROGRESS') eventSeq.push({ event: 'TASK_STARTED', actor: opts.worker! })
    if (['SUBMITTED','APPROVED','REJECTED','DISPUTED','COMPLETED'].includes(opts.status))
      eventSeq.push({ event: 'TASK_SUBMITTED', actor: opts.worker! })
    if (opts.status === 'APPROVED' || opts.status === 'COMPLETED')
      eventSeq.push({ event: 'TASK_APPROVED', actor: opts.buyer })
    if (opts.status === 'REJECTED')
      eventSeq.push({ event: 'TASK_REJECTED', actor: opts.buyer, note: opts.rejectionReason })
    if (opts.status === 'DISPUTED')
      eventSeq.push({ event: 'TASK_DISPUTED', actor: opts.worker! })

    for (const ev of eventSeq) {
      await prisma.taskEvent.create({
        data: { taskId: task.id, actorId: ev.actor.id, event: ev.event, meta: ev.note ? { note: ev.note } : undefined },
      }).catch(() => {})  // ignore dup if re-seeding
    }

    return task
  }

  // ── Tasks across all statuses ─────────────────────────────────────────────

  // 1. OPEN — visible on FindWork for workers
  const taskOpen1 = await makeTask({ id: 'task-open-1', title: 'Clean Drain on MG Road', category: TaskCategory.DRAIN_CLEANING, dirtyLevel: DirtyLevel.HEAVY, urgency: TaskUrgency.URGENT, status: TaskStatus.OPEN, buyer: buyer1, locIdx: 0 })
  const taskOpen2 = await makeTask({ id: 'task-open-2', title: 'Street Sweeping Koramangala', category: TaskCategory.STREET_CLEANING, dirtyLevel: DirtyLevel.MEDIUM, urgency: TaskUrgency.MEDIUM, status: TaskStatus.OPEN, buyer: buyer1, locIdx: 1 })
  const taskOpen3 = await makeTask({ id: 'task-open-3', title: 'Remove Graffiti from Bus Stop', category: TaskCategory.GRAFFITI_REMOVAL, dirtyLevel: DirtyLevel.LIGHT, urgency: TaskUrgency.LOW, status: TaskStatus.OPEN, buyer: buyer2, locIdx: 4 })

  // 2. ACCEPTED — worker has accepted but not started
  const taskAccepted = await makeTask({ id: 'task-accepted-1', title: 'Garbage Collection Hebbal', category: TaskCategory.GARBAGE_COLLECTION, dirtyLevel: DirtyLevel.MEDIUM, urgency: TaskUrgency.HIGH, status: TaskStatus.ACCEPTED, buyer: buyer1, worker: worker1, locIdx: 2 })

  // 3. IN_PROGRESS — worker is actively working
  const taskInProgress = await makeTask({ id: 'task-inprogress-1', title: 'Park Cleaning Indiranagar', category: TaskCategory.PARK_CLEANING, dirtyLevel: DirtyLevel.MEDIUM, urgency: TaskUrgency.MEDIUM, status: TaskStatus.IN_PROGRESS, buyer: buyer2, worker: worker2, locIdx: 4 })

  // Add GPS logs for IN_PROGRESS task
  const gpsPoints = [
    { lat: 12.9784, lng: 77.6408 },
    { lat: 12.9786, lng: 77.6412 },
    { lat: 12.9790, lng: 77.6418 },
    { lat: 12.9793, lng: 77.6415 },
  ]
  for (const pt of gpsPoints) {
    await prisma.taskLocationLog.create({
      data: { taskId: taskInProgress.id, workerId: worker2.id, lat: pt.lat, lng: pt.lng, accuracy: 8 },
    }).catch(() => {})
  }

  // 4. SUBMITTED with AI score — awaiting buyer review
  const taskSubmitted = await makeTask({
    id: 'task-submitted-1',
    title: 'Drain Cleaning Whitefield',
    category: TaskCategory.DRAIN_CLEANING,
    dirtyLevel: DirtyLevel.HEAVY,
    urgency: TaskUrgency.URGENT,
    status: TaskStatus.SUBMITTED,
    buyer: buyer1,
    worker: worker1,
    locIdx: 3,
    aiScore: 0.82,
    aiReasoning: 'Before and after photos clearly show significant improvement. Drain is fully cleared. Minor debris remains near the edges but overall work quality is acceptable.',
  })

  // Add photos to submitted task
  const photoTypes: MediaType[] = [MediaType.BEFORE, MediaType.AFTER, MediaType.PROOF]
  for (const type of photoTypes) {
    await prisma.taskMedia.create({
      data: {
        taskId: taskSubmitted.id,
        url: `https://picsum.photos/seed/${type}-${taskSubmitted.id}/400/300`,
        type,
        mimeType: 'image/jpeg',
        sizeBytes: 120000,
      },
    }).catch(() => {})
  }

  // 5. APPROVED — payment released
  const taskApproved = await makeTask({
    id: 'task-approved-1',
    title: 'Street Cleaning MG Road',
    category: TaskCategory.STREET_CLEANING,
    dirtyLevel: DirtyLevel.LIGHT,
    urgency: TaskUrgency.LOW,
    status: TaskStatus.APPROVED,
    buyer: buyer1,
    worker: worker1,
    locIdx: 0,
    aiScore: 0.91,
    aiReasoning: 'Excellent work. All areas thoroughly cleaned. Photos show clear before/after contrast.',
  })

  // Payout for approved task
  await prisma.payout.upsert({
    where: { taskId: taskApproved.id },
    update: {},
    create: {
      taskId: taskApproved.id,
      workerId: worker1.id,
      buyerId: buyer1.id,
      amountCents: 60000,
      platformFeeCents: 6000,
      workerAmountCents: 54000,
      status: PayoutStatus.COMPLETED,
      paidAt: new Date(Date.now() - 3600_000),
    },
  })

  // 6. REJECTED — worker can retry or dispute
  const taskRejected = await makeTask({
    id: 'task-rejected-1',
    title: 'Garbage Collection Koramangala',
    category: TaskCategory.GARBAGE_COLLECTION,
    dirtyLevel: DirtyLevel.MEDIUM,
    urgency: TaskUrgency.MEDIUM,
    status: TaskStatus.REJECTED,
    buyer: buyer1,
    worker: worker1,
    locIdx: 1,
    aiScore: 0.43,
    aiReasoning: 'After photo does not clearly show complete removal of waste. Several areas appear untouched. Recommend re-cleaning.',
    rejectionReason: 'Work incomplete — several garbage piles still visible in the after photo.',
  })

  // 7. DISPUTED — admin needs to resolve
  const taskDisputed = await makeTask({
    id: 'task-disputed-1',
    title: 'Public Toilet Cleaning Hebbal',
    category: TaskCategory.PUBLIC_TOILET,
    dirtyLevel: DirtyLevel.HEAVY,
    urgency: TaskUrgency.HIGH,
    status: TaskStatus.DISPUTED,
    buyer: buyer2,
    worker: worker2,
    locIdx: 2,
    aiScore: 0.67,
    aiReasoning: 'Photos show moderate improvement but some areas unclear due to low lighting.',
    rejectionReason: 'Photos are blurry and do not prove sufficient work.',
  })

  // Add photos to disputed task
  for (const type of photoTypes) {
    await prisma.taskMedia.create({
      data: {
        taskId: taskDisputed.id,
        url: `https://picsum.photos/seed/${type}-${taskDisputed.id}/400/300`,
        type,
        mimeType: 'image/jpeg',
        sizeBytes: 98000,
      },
    }).catch(() => {})
  }

  console.log('  ✅  Tasks seeded (7 tasks: OPEN×3, ACCEPTED, IN_PROGRESS, SUBMITTED, APPROVED, REJECTED, DISPUTED)')

  // ── Citizen reports ───────────────────────────────────────────────────────
  await prisma.citizenReport.createMany({
    skipDuplicates: true,
    data: [
      { id: 'report-1', reporterId: citizen.id, zoneId: zone.id, category: TaskCategory.DRAIN_CLEANING, urgency: TaskUrgency.HIGH, locationLat: 12.9716, locationLng: 77.5946, locationAddress: 'MG Road near Metro Station', description: 'Clogged drain overflowing onto footpath. Very bad smell. People avoiding the area.', status: 'REPORTED' },
      { id: 'report-2', reporterId: citizen.id, zoneId: zone.id, category: TaskCategory.GARBAGE_COLLECTION, urgency: TaskUrgency.MEDIUM, locationLat: 12.9352, locationLng: 77.6245, locationAddress: 'Koramangala 5th Block', description: 'Overflowing garbage bin near park entrance. Has not been cleared for 3 days.', status: 'REPORTED' },
      { id: 'report-3', reporterId: citizen.id, zoneId: zone.id, category: TaskCategory.GRAFFITI_REMOVAL, urgency: TaskUrgency.LOW, locationLat: 12.9784, locationLng: 77.6408, locationAddress: 'Indiranagar Bus Stop', description: 'Graffiti on bus shelter wall. Offensive content visible to commuters.', status: 'RESOLVED' },
    ],
  })
  console.log('  ✅  Citizen reports seeded (3 reports)')

  // ── Notifications ─────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    skipDuplicates: true,
    data: [
      { id: 'notif-w1-1', userId: worker1.id, type: 'TASK_ASSIGNED',    title: 'New task assigned',           body: 'You have been assigned "Street Cleaning MG Road"',             isRead: false },
      { id: 'notif-w1-2', userId: worker1.id, type: 'PAYMENT_RECEIVED', title: 'Payment received!',           body: 'Rs 540 credited to your wallet',                               isRead: true  },
      { id: 'notif-w1-3', userId: worker1.id, type: 'TASK_VERIFIED',    title: 'Task approved',               body: 'Your work on "Street Cleaning MG Road" was approved',          isRead: false },
      { id: 'notif-b1-1', userId: buyer1.id,  type: 'TASK_ASSIGNED',    title: 'Worker assigned',             body: 'Ravi Kumar accepted your task',                                isRead: false },
      { id: 'notif-b1-2', userId: buyer1.id,  type: 'TASK_SUBMITTED',   title: 'Work submitted for review',   body: 'Ravi Kumar submitted proof for "Drain Cleaning Whitefield"',   isRead: false },
      { id: 'notif-a1-1', userId: admin.id,   type: 'TASK_DISPUTED',    title: 'New dispute',                 body: 'Worker raised dispute on "Public Toilet Cleaning Hebbal"',     isRead: false },
    ],
  })
  console.log('  ✅  Notifications seeded')

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   eClean Seed Complete                       ║
╠══════════════════════════════════════════════════════════════╣
║  All passwords: Test@1234                                    ║
╠══════════════════════════════════════════════════════════════╣
║  WORKER     worker@eclean.test    (Ravi Kumar)               ║
║  WORKER 2   worker2@eclean.test   (Suresh Yadav)             ║
║  BUYER      buyer@eclean.test     (Priya Sharma)             ║
║  BUYER 2    buyer2@eclean.test    (Ankit Jain)               ║
║  SUPERVISOR supervisor@eclean.test                           ║
║  CITIZEN    citizen@eclean.test                              ║
║  ADMIN      admin@eclean.test                                ║
╠══════════════════════════════════════════════════════════════╣
║  Tasks seeded:                                               ║
║  ● OPEN (×3)   → visible in Worker > Find Work              ║
║  ● ACCEPTED    → Worker > ActiveTask (start button shown)   ║
║  ● IN_PROGRESS → Worker > ActiveTask (GPS + photos)         ║
║  ● SUBMITTED   → Buyer > Review (approve/reject shown)      ║
║  ● APPROVED    → Payout COMPLETED, wallet credited          ║
║  ● REJECTED    → Worker > SubmitProof (retry/dispute shown) ║
║  ● DISPUTED    → Admin > DisputeCenter                      ║
╚══════════════════════════════════════════════════════════════╝
`)
}

main()
  .catch((err: unknown) => {
    console.error('❌  Seed failed:', err)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
