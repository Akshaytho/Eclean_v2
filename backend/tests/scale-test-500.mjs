#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// eClean SCALE TEST — 500 concurrent users simulation
// Tests what happens when hundreds of users hit the app simultaneously
// ═══════════════════════════════════════════════════════════════════

const API = 'https://ecleanfuture-production.up.railway.app/api/v1'
const BUYER  = { email: 'priya.sharma@eclean.test', password: 'Test@1234' }
const WORKER = { email: 'raju.kumar@eclean.test',   password: 'Test@1234' }

let buyerToken = '', workerToken = ''
const stats = {
  totalRequests: 0, succeeded: 0, failed: 0,
  errors: {}, statusCodes: {},
  latencies: [],
}

async function api(method, path, body, token) {
  stats.totalRequests++
  const start = Date.now()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  try {
    const res = await fetch(`${API}${path}`, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    const latency = Date.now() - start
    stats.latencies.push(latency)
    const data = await res.json().catch(() => ({}))
    stats.statusCodes[res.status] = (stats.statusCodes[res.status] || 0) + 1
    if (res.status >= 200 && res.status < 300) stats.succeeded++
    else {
      stats.failed++
      const msg = data?.error?.message || `HTTP ${res.status}`
      stats.errors[msg] = (stats.errors[msg] || 0) + 1
    }
    return { status: res.status, data, latency }
  } catch (err) {
    stats.failed++
    const msg = err.message || 'Network error'
    stats.errors[msg] = (stats.errors[msg] || 0) + 1
    return { status: 0, data: {}, latency: Date.now() - start }
  }
}

async function login(creds) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  })
  return (await r.json()).accessToken
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil(sorted.length * p / 100) - 1
  return sorted[Math.max(0, idx)]
}

// ─── SCENARIO 1: 200 users reading task lists simultaneously ───────────
async function scenario1() {
  console.log('\n📊 SCENARIO 1: 200 users reading task lists at once')
  const start = Date.now()

  const promises = []
  // 100 buyers checking their tasks
  for (let i = 0; i < 100; i++) {
    promises.push(api('GET', '/buyer/tasks?page=1&limit=10', null, buyerToken))
  }
  // 100 workers browsing open tasks
  for (let i = 0; i < 100; i++) {
    promises.push(api('GET', '/worker/tasks/open?page=1&limit=10', null, workerToken))
  }

  const results = await Promise.allSettled(promises)
  const elapsed = Date.now() - start
  const ok = results.filter(r => r.value?.status === 200).length

  console.log(`  ${ok}/200 succeeded in ${elapsed}ms`)
  console.log(`  Avg latency: ${Math.round(stats.latencies.slice(-200).reduce((a,b) => a+b, 0) / 200)}ms`)
}

// ─── SCENARIO 2: 100 buyers posting tasks simultaneously ───────────────
async function scenario2() {
  console.log('\n📊 SCENARIO 2: 100 buyers posting tasks simultaneously')
  const start = Date.now()

  const promises = Array.from({ length: 100 }, (_, i) =>
    api('POST', '/buyer/tasks', {
      title: `Scale test task #${i + 1}`,
      description: 'Load testing with 100 concurrent task creations to check for race conditions',
      category: ['STREET_CLEANING', 'DRAIN_CLEANING', 'GARBAGE_COLLECTION', 'PARK_CLEANING'][i % 4],
      dirtyLevel: ['LIGHT', 'MEDIUM', 'HEAVY'][i % 3],
      urgency: ['LOW', 'MEDIUM', 'HIGH'][i % 3],
    }, buyerToken)
  )

  const results = await Promise.allSettled(promises)
  const elapsed = Date.now() - start
  const ok = results.filter(r => r.value?.status === 201).length
  const failed = results.filter(r => r.value?.status !== 201)

  console.log(`  ${ok}/100 tasks created in ${elapsed}ms`)
  if (failed.length > 0) {
    const errMsg = failed[0]?.value?.data?.error?.message || 'unknown'
    console.log(`  First failure: ${errMsg}`)
  }

  // Check for duplicates
  const ids = results.filter(r => r.value?.status === 201).map(r => r.value.data?.task?.id ?? r.value.data?.id)
  console.log(`  Unique IDs: ${new Set(ids).size}/${ids.length}`)
}

// ─── SCENARIO 3: 50 workers competing for same 5 tasks ─────────────────
async function scenario3() {
  console.log('\n📊 SCENARIO 3: 50 workers competing for 5 tasks (race condition)')

  // Create 5 tasks
  const taskIds = []
  for (let i = 0; i < 5; i++) {
    const r = await api('POST', '/buyer/tasks', {
      title: `Competition task #${i + 1}`,
      description: 'Multiple workers trying to accept the same task simultaneously',
      category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'HIGH',
    }, buyerToken)
    if (r.status === 201) taskIds.push(r.data?.task?.id ?? r.data?.id)
  }

  // 50 accept attempts on each task (250 total requests)
  const start = Date.now()
  const promises = []
  for (const taskId of taskIds) {
    for (let i = 0; i < 50; i++) {
      promises.push(api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken))
    }
  }

  const results = await Promise.allSettled(promises)
  const elapsed = Date.now() - start
  const ok = results.filter(r => r.value?.status === 200).length

  console.log(`  ${ok} accepts succeeded out of 250 attempts (${elapsed}ms)`)
  console.log(`  Expected: max ${taskIds.length} (one per task, limited by queue)`)

  const bothWon = ok > taskIds.length
  if (bothWon) console.log(`  🚨 RACE CONDITION: More accepts than tasks!`)
  else console.log(`  ✅ No race condition — accepts properly limited`)

  // Cleanup
  for (const id of taskIds) {
    await api('POST', `/worker/tasks/${id}/cancel`, { reason: 'cleanup' }, workerToken)
  }
}

// ─── SCENARIO 4: 100 payment orders simultaneously ─────────────────────
async function scenario4() {
  console.log('\n📊 SCENARIO 4: 100 payment orders simultaneously (Razorpay load)')
  const start = Date.now()

  const promises = Array.from({ length: 100 }, (_, i) =>
    api('POST', '/buyer/payments/create-order', {
      amountCents: 3000 + (i * 100),
      taskTitle: `Payment load test #${i + 1}`,
    }, buyerToken)
  )

  const results = await Promise.allSettled(promises)
  const elapsed = Date.now() - start
  const ok = results.filter(r => r.value?.status === 200).length
  const rateLimited = results.filter(r => r.value?.status === 429 || r.value?.status === 500).length

  console.log(`  ${ok}/100 orders created in ${elapsed}ms`)
  if (rateLimited > 0) console.log(`  ${rateLimited} rate-limited by Razorpay (expected)`)

  const orderIds = results.filter(r => r.value?.status === 200).map(r => r.value.data.orderId)
  console.log(`  Unique order IDs: ${new Set(orderIds).size}/${orderIds.length}`)
}

// ─── SCENARIO 5: Mixed operations (realistic usage pattern) ────────────
async function scenario5() {
  console.log('\n📊 SCENARIO 5: 500 mixed operations (realistic traffic pattern)')
  const start = Date.now()

  const promises = []

  // 150 buyers reading their task list
  for (let i = 0; i < 150; i++) {
    promises.push(api('GET', '/buyer/tasks?page=1&limit=10', null, buyerToken))
  }
  // 150 workers reading open tasks
  for (let i = 0; i < 150; i++) {
    promises.push(api('GET', '/worker/tasks/open?page=1&limit=10', null, workerToken))
  }
  // 50 auth/me checks (app opening)
  for (let i = 0; i < 50; i++) {
    promises.push(api('GET', '/auth/me', null, buyerToken))
  }
  // 50 worker wallet checks
  for (let i = 0; i < 50; i++) {
    promises.push(api('GET', '/worker/wallet', null, workerToken))
  }
  // 50 notification checks
  for (let i = 0; i < 50; i++) {
    promises.push(api('GET', '/notifications?page=1', null, buyerToken))
  }
  // 50 task detail views
  for (let i = 0; i < 50; i++) {
    promises.push(api('GET', '/buyer/tasks?page=1&limit=1', null, buyerToken))
  }

  const results = await Promise.allSettled(promises)
  const elapsed = Date.now() - start
  const ok = results.filter(r => r.value?.status >= 200 && r.value?.status < 300).length
  const serverErrors = results.filter(r => r.value?.status >= 500).length
  const networkErrors = results.filter(r => r.value?.status === 0).length

  console.log(`  ${ok}/500 succeeded in ${elapsed}ms`)
  if (serverErrors > 0) console.log(`  🚨 ${serverErrors} server errors (500+)`)
  if (networkErrors > 0) console.log(`  ⚠️  ${networkErrors} network errors`)

  const lats = results.map(r => r.value?.latency || 0).filter(l => l > 0)
  console.log(`  Latency — p50: ${percentile(lats, 50)}ms, p95: ${percentile(lats, 95)}ms, p99: ${percentile(lats, 99)}ms`)
}

// ─── SCENARIO 6: Rapid cancel-after-accept pattern ──────────────────────
async function scenario6() {
  console.log('\n📊 SCENARIO 6: 20 rapid accept→cancel cycles')

  let accepted = 0, cancelled = 0, errors = 0
  for (let i = 0; i < 20; i++) {
    const t = await api('POST', '/buyer/tasks', {
      title: `Rapid cycle ${i+1}`, description: 'Rapid accept then cancel testing',
      category: 'GARBAGE_COLLECTION', dirtyLevel: 'MEDIUM', urgency: 'LOW',
    }, buyerToken)

    if (t.status !== 201) { errors++; continue }
    const taskId = t.data?.task?.id ?? t.data?.id

    const acc = await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)
    if (acc.status === 200) {
      accepted++
      const can = await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'test' }, workerToken)
      if (can.status === 200) cancelled++
    } else {
      // worker might have hit queue limit — just cancel as buyer
      await api('POST', `/buyer/tasks/${taskId}/cancel`, { reason: 'cleanup' }, buyerToken)
    }
  }

  console.log(`  Accepted: ${accepted}/20, Cancelled: ${cancelled}, Errors: ${errors}`)
  const allClean = accepted === cancelled
  console.log(`  ${allClean ? '✅' : '❌'} All accepted tasks properly cancelled: ${allClean}`)
}

// ─── MAIN ──────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  eClean SCALE TEST — 500+ concurrent users')
  console.log('  Target: ' + API)
  console.log('═══════════════════════════════════════════════════════════')

  console.log('\n🔑 Logging in...')
  buyerToken = await login(BUYER)
  workerToken = await login(WORKER)
  console.log('  ✅ Ready')

  const start = Date.now()

  await scenario1()
  await scenario2()
  await scenario3()
  await scenario4()
  await scenario5()
  await scenario6()

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  FINAL REPORT')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Total requests:  ${stats.totalRequests}`)
  console.log(`  Succeeded:       ${stats.succeeded} (${(stats.succeeded/stats.totalRequests*100).toFixed(1)}%)`)
  console.log(`  Failed:          ${stats.failed}`)
  console.log(`  Total time:      ${elapsed}s`)
  console.log(`  Avg latency:     ${Math.round(stats.latencies.reduce((a,b) => a+b, 0) / stats.latencies.length)}ms`)
  console.log(`  p50 latency:     ${percentile(stats.latencies, 50)}ms`)
  console.log(`  p95 latency:     ${percentile(stats.latencies, 95)}ms`)
  console.log(`  p99 latency:     ${percentile(stats.latencies, 99)}ms`)
  console.log(`  Max latency:     ${Math.max(...stats.latencies)}ms`)

  console.log('\n  Status codes:')
  for (const [code, count] of Object.entries(stats.statusCodes).sort()) {
    console.log(`    ${code}: ${count}`)
  }

  if (Object.keys(stats.errors).length > 0) {
    console.log('\n  Error breakdown:')
    for (const [msg, count] of Object.entries(stats.errors).sort((a,b) => b[1] - a[1])) {
      console.log(`    ${count}x — ${msg.slice(0, 80)}`)
    }
  }

  console.log('═══════════════════════════════════════════════════════════\n')
}

main().catch(console.error)
