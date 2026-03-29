#!/usr/bin/env node
// Concurrent Stress Test v2 — Tests REAL race conditions
// Creates tasks sequentially, then tests concurrent operations on them

const API = 'https://ecleanfuture-production.up.railway.app/api/v1'
const BUYER  = { email: 'priya.sharma@eclean.test', password: 'Test@1234' }
const WORKER = { email: 'raju.kumar@eclean.test',   password: 'Test@1234' }

let buyerToken = ''
let workerToken = ''
let results = { passed: 0, failed: 0, errors: [] }

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { status: res.status, data }
}

async function login(creds) {
  const r = await api('POST', '/auth/login', creds)
  return r.data.accessToken
}

async function createTask(title) {
  const r = await api('POST', '/buyer/tasks', {
    title, description: 'Stress test task — auto-generated for concurrent testing',
    category: 'STREET_CLEANING', dirtyLevel: 'LIGHT', urgency: 'LOW',
  }, buyerToken)
  if (r.status !== 201) throw new Error(`Create failed: ${r.status} ${JSON.stringify(r.data)}`)
  return r.data.task?.id ?? r.data.id
}

function test(name, passed, detail) {
  if (passed) {
    results.passed++
    console.log(`  ✅ ${name}`)
  } else {
    results.failed++
    results.errors.push({ name, detail })
    console.log(`  ❌ ${name} — ${detail}`)
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── TEST 1: Two accept calls on same task ─────────────────────────────
async function test1_doubleAccept() {
  console.log('\n🔥 TEST 1: Two simultaneous accepts on same task')
  const taskId = await createTask('Double accept race test')

  const [r1, r2] = await Promise.allSettled([
    api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken),
    api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken),
  ])

  const s1 = r1.value?.status, s2 = r2.value?.status
  const bothOk = s1 === 200 && s2 === 200

  test('Only ONE accept succeeds (not both)', !bothOk,
    bothOk ? '🚨 RACE BUG: Both accepts returned 200!' : `Got ${s1} and ${s2} — correct`)

  // Check final state
  const final = await api('GET', `/buyer/tasks/${taskId}`, null, buyerToken)
  test('Task is ACCEPTED', final.data?.status === 'ACCEPTED' || final.data?.task?.status === 'ACCEPTED',
    `Status: ${final.data?.status ?? final.data?.task?.status}`)

  // cleanup
  await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'stress test cleanup' }, workerToken)
}

// ─── TEST 2: Cancel vs Accept race ─────────────────────────────────────
async function test2_cancelVsAccept() {
  console.log('\n🔥 TEST 2: Buyer cancels while worker accepts simultaneously')
  const taskId = await createTask('Cancel vs Accept race')

  const [cancelR, acceptR] = await Promise.allSettled([
    api('POST', `/buyer/tasks/${taskId}/cancel`, { reason: 'stress test race cleanup' }, buyerToken),
    api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken),
  ])

  const cs = cancelR.value?.status, as_ = acceptR.value?.status

  // Check final state
  await sleep(500)
  const final = await api('GET', `/buyer/tasks/${taskId}`, null, buyerToken)
  const status = final.data?.status ?? final.data?.task?.status

  test('Final state is either CANCELLED or ACCEPTED (not corrupted)',
    status === 'CANCELLED' || status === 'ACCEPTED',
    `Cancel=${cs}, Accept=${as_}, Final=${status}`)

  const consistent = (status === 'CANCELLED' && cs === 200) || (status === 'ACCEPTED' && as_ === 200)
  test('Winner matches final state', consistent,
    `Cancel=${cs}, Accept=${as_}, Final=${status}`)

  // Cleanup
  if (status === 'ACCEPTED') {
    await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'stress test cleanup' }, workerToken)
  }
}

// ─── TEST 3: Double cancel (double refund risk) ────────────────────────
async function test3_doubleCancel() {
  console.log('\n🔥 TEST 3: Buyer double-cancels same task')
  const taskId = await createTask('Double cancel refund race')

  const [r1, r2] = await Promise.allSettled([
    api('POST', `/buyer/tasks/${taskId}/cancel`, { reason: 'double cancel test attempt 1' }, buyerToken),
    api('POST', `/buyer/tasks/${taskId}/cancel`, { reason: 'double cancel test attempt 2' }, buyerToken),
  ])

  const s1 = r1.value?.status, s2 = r2.value?.status
  const bothOk = s1 === 200 && s2 === 200

  test('Only ONE cancel succeeds', !bothOk,
    bothOk ? '🚨 RACE BUG: Both cancels returned 200 — double refund risk!' : `Got ${s1} and ${s2}`)
}

// ─── TEST 4: Double approve (double payout risk) ───────────────────────
async function test4_doubleApprove() {
  console.log('\n🔥 TEST 4: Buyer double-approves same task')
  const taskId = await createTask('Double approve payout race')

  // Setup: accept → start → need to submit with media
  await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)
  await api('POST', `/worker/tasks/${taskId}/start`, { lat: 17.385, lng: 78.486 }, workerToken)

  // Try submit (may fail without media)
  const submitR = await api('POST', `/worker/tasks/${taskId}/submit`, {}, workerToken)
  if (submitR.status !== 200) {
    console.log(`  ⚠️  Cannot submit without media — skipping (expected)`)
    await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'stress test cleanup' }, workerToken)
    return
  }

  const [a1, a2] = await Promise.allSettled([
    api('POST', `/buyer/tasks/${taskId}/approve`, {}, buyerToken),
    api('POST', `/buyer/tasks/${taskId}/approve`, {}, buyerToken),
  ])

  const s1 = a1.value?.status, s2 = a2.value?.status
  const bothOk = s1 === 200 && s2 === 200

  test('Only ONE approve succeeds', !bothOk,
    bothOk ? '🚨 RACE BUG: Both approvals returned 200 — double payout!' : `Got ${s1} and ${s2}`)
}

// ─── TEST 5: 10 tasks, accept all at once ──────────────────────────────
async function test5_bulkAccept() {
  console.log('\n🔥 TEST 5: Worker accepts 10 tasks simultaneously')

  const taskIds = []
  for (let i = 0; i < 10; i++) {
    taskIds.push(await createTask(`Bulk accept #${i+1}`))
  }

  const accepts = await Promise.allSettled(
    taskIds.map(id => api('POST', `/worker/tasks/${id}/accept`, {}, workerToken))
  )

  const successes = accepts.filter(r => r.value?.status === 200).length
  const failures = accepts.filter(r => r.value?.status !== 200)

  // Worker has max 5 queued tasks limit (sequential queue model)
  test(`Accepted tasks (max 5 allowed)`, successes <= 5,
    successes > 5 ? `🚨 RACE BUG: ${successes} accepted, limit is 5!` : `${successes} accepted — correct`)

  // Check for any tasks stuck in bad state
  for (const id of taskIds) {
    const t = await api('GET', `/buyer/tasks/${id}`, null, buyerToken)
    const status = t.data?.status ?? t.data?.task?.status
    if (status !== 'OPEN' && status !== 'ACCEPTED') {
      test(`Task ${id.slice(0,8)} state valid`, false, `Unexpected state: ${status}`)
    }
  }

  // Cleanup — cancel accepted tasks as worker, open tasks as buyer
  let cleaned = 0
  for (const id of taskIds) {
    const t = await api('GET', `/buyer/tasks/${id}`, null, buyerToken)
    const status = t.data?.status ?? t.data?.task?.status
    if (status === 'ACCEPTED') {
      const r = await api('POST', `/worker/tasks/${id}/cancel`, { reason: 'stress test cleanup' }, workerToken)
      if (r.status === 200) cleaned++
    } else if (status === 'OPEN') {
      const r = await api('POST', `/buyer/tasks/${id}/cancel`, { reason: 'stress test cleanup' }, buyerToken)
      if (r.status === 200) cleaned++
    }
  }
  test(`All tasks cleaned up (${cleaned}/10)`, cleaned === 10, `Only ${cleaned} cleaned`)
}

// ─── TEST 6: Concurrent payment orders (Razorpay rate limit test) ──────
async function test6_paymentOrders() {
  console.log('\n🔥 TEST 6: 10 concurrent payment order creations')

  const promises = Array.from({ length: 10 }, (_, i) =>
    api('POST', '/buyer/payments/create-order', {
      amountCents: 6000, taskTitle: `Payment test #${i+1}`
    }, buyerToken)
  )

  const results_ = await Promise.allSettled(promises)
  const successes = results_.filter(r => r.value?.status === 200)
  const failures = results_.filter(r => r.value?.status !== 200)

  test(`Orders created: ${successes.length}/10`, successes.length >= 5,
    `${failures.length} failed — ${failures[0]?.value?.data?.error?.message ?? 'unknown'}`)

  // Check all order IDs unique
  const ids = successes.map(r => r.value.data.orderId)
  test('All order IDs unique', new Set(ids).size === ids.length,
    `${ids.length} orders, ${new Set(ids).size} unique`)
}

// ─── TEST 7: 100 concurrent reads ─────────────────────────────────────
async function test7_readHammer() {
  console.log('\n🔥 TEST 7: 100 concurrent GET requests')

  const start = Date.now()
  const promises = Array.from({ length: 100 }, () =>
    api('GET', '/auth/me', null, buyerToken)
  )
  const results_ = await Promise.allSettled(promises)
  const elapsed = Date.now() - start

  const ok = results_.filter(r => r.value?.status === 200).length

  test(`100 reads: ${ok}/100 ok in ${elapsed}ms`, ok === 100,
    `${100 - ok} failed`)
  test('Under 10 seconds', elapsed < 10000, `Took ${elapsed}ms`)
}

// ─── TEST 8: Concurrent task list + accept (stale read) ────────────────
async function test8_staleRead() {
  console.log('\n🔥 TEST 8: Read task list while accepting (stale data)')
  const taskId = await createTask('Stale read test')

  // Simultaneously: read open tasks + accept the task
  const [listR, acceptR] = await Promise.allSettled([
    api('GET', '/worker/tasks/open?page=1&limit=50', null, workerToken),
    api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken),
  ])

  const listOk = listR.value?.status === 200
  const acceptOk = acceptR.value?.status === 200

  test('Both requests succeed', listOk && acceptOk,
    `List: ${listR.value?.status}, Accept: ${acceptR.value?.status}`)

  // The list might show the task as OPEN even though it was just accepted
  // This is expected behavior (eventual consistency), not a bug
  if (listOk) {
    const tasks = listR.value.data?.tasks ?? listR.value.data ?? []
    const foundTask = tasks.find(t => t.id === taskId)
    if (foundTask) {
      console.log(`  ℹ️  Task in list as: ${foundTask.status} (may show OPEN due to read timing — expected)`)
    }
  }

  // Cleanup
  await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'stress test cleanup' }, workerToken)
}

// ─── TEST 9: Rapid accept-start-cancel cycle ───────────────────────────
async function test9_rapidCycle() {
  console.log('\n🔥 TEST 9: Rapid accept→start→cancel cycle (5 tasks)')

  for (let i = 0; i < 5; i++) {
    const taskId = await createTask(`Rapid cycle #${i+1}`)
    const accept = await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)
    if (accept.status !== 200) {
      test(`Cycle #${i+1}: accept`, false, `Status ${accept.status}`)
      continue
    }

    // Immediately start and cancel without waiting
    const [startR, cancelR] = await Promise.allSettled([
      api('POST', `/worker/tasks/${taskId}/start`, { lat: 17.38, lng: 78.48 }, workerToken),
      api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'rapid cycle cleanup test' }, workerToken),
    ])

    await sleep(300)
    const final = await api('GET', `/buyer/tasks/${taskId}`, null, buyerToken)
    const status = final.data?.status ?? final.data?.task?.status

    const valid = ['OPEN', 'IN_PROGRESS', 'ACCEPTED', 'CANCELLED'].includes(status)
    test(`Cycle #${i+1}: final state valid (${status})`, valid,
      `Start=${startR.value?.status}, Cancel=${cancelR.value?.status}, Final=${status}`)
  }
}

// ─── TEST 10: Worker wallet concurrent reads ───────────────────────────
async function test10_walletReads() {
  console.log('\n🔥 TEST 10: 30 concurrent wallet reads')

  const promises = Array.from({ length: 30 }, () =>
    api('GET', '/worker/wallet', null, workerToken)
  )

  const results_ = await Promise.allSettled(promises)
  const ok = results_.filter(r => r.value?.status === 200).length

  test(`30 wallet reads: ${ok}/30 ok`, ok === 30, `${30 - ok} failed`)

  // All should return same balance
  const balances = results_
    .filter(r => r.value?.status === 200)
    .map(r => r.value.data?.totalEarnedCents ?? r.value.data?.total)
  const unique = [...new Set(balances)]

  test('All return same balance (consistent)', unique.length <= 1,
    `Got ${unique.length} different balances: ${unique.join(', ')}`)
}

// ─── MAIN ──────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  eClean CONCURRENT STRESS TEST v2')
  console.log('  Target: ' + API)
  console.log('═══════════════════════════════════════════════════════')

  console.log('\n🔑 Logging in...')
  buyerToken = await login(BUYER)
  workerToken = await login(WORKER)
  console.log('  ✅ Both accounts logged in')

  const start = Date.now()

  await test1_doubleAccept()
  await test2_cancelVsAccept()
  await test3_doubleCancel()
  await test4_doubleApprove()
  await test5_bulkAccept()
  await test6_paymentOrders()
  await test7_readHammer()
  await test8_staleRead()
  await test9_rapidCycle()
  await test10_walletReads()

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log('\n═══════════════════════════════════════════════════════')
  console.log(`  RESULTS: ${results.passed} PASSED, ${results.failed} FAILED`)
  console.log(`  Total time: ${elapsed}s`)
  console.log('═══════════════════════════════════════════════════════')

  if (results.errors.length > 0) {
    console.log('\n🔴 BUGS FOUND:')
    results.errors.forEach(e => console.log(`  • ${e.name}: ${e.detail}`))
  } else {
    console.log('\n🟢 All tests passed!')
  }
  console.log('')
}

main().catch(console.error)
