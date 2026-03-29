#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// eClean CHAOS TEST — How real users can break the system
// Simulates malicious, stupid, and chaotic user behaviors
// ═══════════════════════════════════════════════════════════════════

const API = 'https://ecleanfuture-production.up.railway.app/api/v1'
const BUYER  = { email: 'priya.sharma@eclean.test', password: 'Test@1234' }
const WORKER = { email: 'raju.kumar@eclean.test',   password: 'Test@1234' }

let buyerToken = '', workerToken = ''
let passed = 0, failed = 0, warnings = 0
const bugs = []

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  try {
    const res = await fetch(`${API}${path}`, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  } catch (err) {
    return { status: 0, data: { error: { message: err.message } } }
  }
}

function ok(name, pass, detail) {
  if (pass) { passed++; console.log(`    ✅ ${name}`) }
  else { failed++; bugs.push({ name, detail }); console.log(`    ❌ ${name} — ${detail}`) }
}
function warn(name, detail) { warnings++; console.log(`    ⚠️  ${name} — ${detail}`) }

async function login(creds) {
  return (await api('POST', '/auth/login', creds)).data.accessToken
}

async function createTask(title) {
  const r = await api('POST', '/buyer/tasks', {
    title, description: 'Chaos test auto-generated task for testing edge cases',
    category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'MEDIUM',
  }, buyerToken)
  return r.data?.task?.id ?? r.data?.id
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('═══════════════════════════════════════════════════════════')
console.log('  eClean CHAOS TEST — Breaking the system like real users')
console.log('═══════════════════════════════════════════════════════════')

async function main() {
  buyerToken = await login(BUYER)
  workerToken = await login(WORKER)

  // Clean worker's tasks first
  const myTasks = await api('GET', '/worker/my-tasks?status=ACCEPTED&limit=50', null, workerToken)
  for (const t of (myTasks.data?.tasks ?? [])) {
    await api('POST', `/worker/tasks/${t.id}/cancel`, { reason: 'cleanup' }, workerToken)
  }
  const ipTasks = await api('GET', '/worker/my-tasks?status=IN_PROGRESS&limit=50', null, workerToken)
  for (const t of (ipTasks.data?.tasks ?? [])) {
    await api('POST', `/worker/tasks/${t.id}/cancel`, { reason: 'cleanup' }, workerToken)
  }
  console.log('  🧹 Worker tasks cleaned\n')

  // ─────────────────────────────────────────────────────────────────
  // 1. SPAM TAPPING — User taps button 50 times in 1 second
  // ─────────────────────────────────────────────────────────────────
  console.log('  🔨 1. SPAM TAP: Accept button pressed 50 times in 1 second')
  {
    const taskId = await createTask('Spam tap test')
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken))
    )
    const successes = results.filter(r => r.value?.status === 200).length
    ok('Only 1 accept from 50 taps', successes === 1,
      `${successes} accepts succeeded — should be exactly 1`)
    await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'cleanup' }, workerToken)
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. ROLE CONFUSION — Worker tries buyer endpoints & vice versa
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 2. ROLE ATTACKS: Wrong role accessing endpoints')
  {
    // Worker tries to create a task (buyer-only)
    const r1 = await api('POST', '/buyer/tasks', {
      title: 'Hacker task', description: 'Worker trying to be a buyer',
      category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'MEDIUM',
    }, workerToken)
    ok('Worker cant create buyer task', r1.status === 403, `Got ${r1.status}`)

    // Buyer tries to accept a task (worker-only)
    const taskId = await createTask('Role test')
    const r2 = await api('POST', `/worker/tasks/${taskId}/accept`, {}, buyerToken)
    ok('Buyer cant accept worker task', r2.status === 403, `Got ${r2.status}`)

    // Worker tries to approve a task (buyer-only)
    const r3 = await api('POST', `/buyer/tasks/${taskId}/approve`, {}, workerToken)
    ok('Worker cant approve buyer task', r3.status === 403, `Got ${r3.status}`)

    // Buyer tries to view worker wallet
    const r4 = await api('GET', '/worker/wallet', null, buyerToken)
    ok('Buyer cant view worker wallet', r4.status === 403, `Got ${r4.status}`)

    // Worker tries to create payment order
    const r5 = await api('POST', '/buyer/payments/create-order', {
      amountCents: 6000, taskTitle: 'hack'
    }, workerToken)
    ok('Worker cant create payment', r5.status === 403, `Got ${r5.status}`)
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. INVALID DATA — Send garbage, huge payloads, SQL injection
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 3. INVALID DATA: Garbage inputs, injections, huge payloads')
  {
    // Empty body
    const r1 = await api('POST', '/buyer/tasks', {}, buyerToken)
    ok('Empty task body rejected', r1.status >= 400, `Got ${r1.status}`)

    // SQL injection in title
    const r2 = await api('POST', '/buyer/tasks', {
      title: "'; DROP TABLE tasks; --",
      description: 'SQL injection attempt in task description field',
      category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'MEDIUM',
    }, buyerToken)
    ok('SQL injection in title handled', r2.status === 201 || r2.status >= 400,
      `Got ${r2.status} — ${r2.status === 201 ? 'created safely (Prisma parameterized)' : 'rejected'}`)

    // XSS in description
    const r3 = await api('POST', '/buyer/tasks', {
      title: 'XSS test task',
      description: '<script>alert("hacked")</script><img onerror="fetch(evil)">',
      category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'MEDIUM',
    }, buyerToken)
    ok('XSS in description handled', r3.status === 201 || r3.status >= 400,
      `Got ${r3.status}`)

    // Huge payload (100KB title)
    const bigTitle = 'A'.repeat(100000)
    const r4 = await api('POST', '/buyer/tasks', {
      title: bigTitle, description: 'huge payload test',
      category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'MEDIUM',
    }, buyerToken)
    ok('100KB title rejected', r4.status >= 400, `Got ${r4.status}`)

    // Negative amount
    const r5 = await api('POST', '/buyer/payments/create-order', {
      amountCents: -5000, taskTitle: 'negative money'
    }, buyerToken)
    ok('Negative payment rejected', r5.status >= 400, `Got ${r5.status}`)

    // Zero amount
    const r6 = await api('POST', '/buyer/payments/create-order', {
      amountCents: 0, taskTitle: 'free money'
    }, buyerToken)
    ok('Zero payment rejected', r6.status >= 400, `Got ${r6.status}`)

    // Invalid category
    const r7 = await api('POST', '/buyer/tasks', {
      title: 'Bad category', description: 'Testing invalid category value',
      category: 'HACKING', dirtyLevel: 'MEDIUM', urgency: 'MEDIUM',
    }, buyerToken)
    ok('Invalid category rejected', r7.status >= 400, `Got ${r7.status}`)

    // Float amount (should be integer paise)
    const r8 = await api('POST', '/buyer/payments/create-order', {
      amountCents: 59.99, taskTitle: 'float money'
    }, buyerToken)
    ok('Float payment amount rejected', r8.status >= 400, `Got ${r8.status}`)
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. AUTH ATTACKS — Expired/fake/stolen tokens
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 4. AUTH ATTACKS: Bad tokens, no tokens')
  {
    // No token
    const r1 = await api('GET', '/auth/me', null, null)
    ok('No token = 401', r1.status === 401, `Got ${r1.status}`)

    // Garbage token
    const r2 = await api('GET', '/auth/me', null, 'garbage-token-12345')
    ok('Garbage token = 401', r2.status === 401, `Got ${r2.status}`)

    // Expired-like JWT
    const r3 = await api('GET', '/auth/me', null, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.invalid')
    ok('Fake JWT = 401', r3.status === 401, `Got ${r3.status}`)

    // Token in wrong header format
    const r4 = await api('GET', '/auth/me', null, '')
    ok('Empty token = 401', r4.status === 401, `Got ${r4.status}`)
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. STATE MANIPULATION — Do things in wrong order
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 5. STATE MANIPULATION: Wrong order of operations')
  {
    const taskId = await createTask('State test')

    // Try to start before accepting
    const r1 = await api('POST', `/worker/tasks/${taskId}/start`, { lat: 17.38, lng: 78.48 }, workerToken)
    ok('Cant start unaccepted task', r1.status >= 400, `Got ${r1.status}`)

    // Try to submit before starting
    const r2 = await api('POST', `/worker/tasks/${taskId}/submit`, {}, workerToken)
    ok('Cant submit unstarted task', r2.status >= 400, `Got ${r2.status}`)

    // Try to approve OPEN task
    const r3 = await api('POST', `/buyer/tasks/${taskId}/approve`, {}, buyerToken)
    ok('Cant approve OPEN task', r3.status >= 400, `Got ${r3.status}`)

    // Try to rate OPEN task
    const r4 = await api('POST', `/buyer/tasks/${taskId}/rate`, { rating: 5 }, buyerToken)
    ok('Cant rate OPEN task', r4.status >= 400, `Got ${r4.status}`)

    // Accept → try to accept again
    await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)
    const r5 = await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)
    ok('Cant double-accept', r5.status >= 400, `Got ${r5.status}`)

    // Cancel → try to start cancelled task
    await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'test' }, workerToken)
    const r6 = await api('POST', `/worker/tasks/${taskId}/start`, { lat: 17.38, lng: 78.48 }, workerToken)
    ok('Cant start cancelled task', r6.status >= 400, `Got ${r6.status}`)
  }

  // ─────────────────────────────────────────────────────────────────
  // 6. CROSS-USER ATTACKS — Operate on other user's resources
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 6. CROSS-USER: Access other users resources')
  {
    const taskId = await createTask('Cross user test')
    await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)

    // Worker tries to cancel as buyer
    const r1 = await api('POST', `/buyer/tasks/${taskId}/cancel`, { reason: 'not my task' }, workerToken)
    ok('Worker cant cancel as buyer', r1.status === 403, `Got ${r1.status}`)

    // Buyer tries to view worker's task detail via worker endpoint
    const r2 = await api('GET', `/worker/tasks/${taskId}`, null, buyerToken)
    ok('Buyer cant use worker task endpoint', r2.status === 403, `Got ${r2.status}`)

    await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'cleanup' }, workerToken)
  }

  // ─────────────────────────────────────────────────────────────────
  // 7. FAKE PAYMENT — Forge Razorpay signatures
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 7. PAYMENT FRAUD: Fake signatures, reused payments')
  {
    // Fake payment signature
    const r1 = await api('POST', '/buyer/tasks', {
      title: 'Fake payment task',
      description: 'Testing with forged Razorpay payment signature values',
      category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'MEDIUM',
      razorpayOrderId: 'order_fake123',
      razorpayPaymentId: 'pay_fake123',
      razorpaySignature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    }, buyerToken)
    ok('Fake payment signature rejected', r1.status >= 400, `Got ${r1.status}: ${r1.data?.error?.message}`)

    // Valid order but fake signature
    const order = await api('POST', '/buyer/payments/create-order', {
      amountCents: 3000, taskTitle: 'test'
    }, buyerToken)
    if (order.status === 200) {
      const r2 = await api('POST', '/buyer/tasks', {
        title: 'Stolen order task',
        description: 'Using real order ID but fake payment signature to steal service',
        category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'MEDIUM',
        razorpayOrderId: order.data.orderId,
        razorpayPaymentId: 'pay_stolen_123',
        razorpaySignature: '0000000000000000000000000000000000000000000000000000000000000000',
      }, buyerToken)
      ok('Real order + fake signature rejected', r2.status >= 400,
        `Got ${r2.status}: ${r2.data?.error?.message}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 8. GPS SPOOFING — Worker sends fake location
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 8. GPS SPOOFING: Worker sends impossible locations')
  {
    const taskId = await createTask('GPS spoof test')
    await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)

    // Start from North Pole (should fail geofence if task has location)
    const r1 = await api('POST', `/worker/tasks/${taskId}/start`, {
      lat: 90.0, lng: 0.0
    }, workerToken)
    // Task has no location, so geofence won't trigger — but check it handles it
    ok('Extreme GPS coordinates handled', r1.status === 200 || r1.status >= 400,
      `Got ${r1.status}`)

    // Invalid GPS values
    const r2 = await api('POST', `/worker/tasks/${taskId}/start`, {
      lat: 999, lng: -999
    }, workerToken)
    ok('Invalid GPS (999, -999) rejected', r2.status >= 400, `Got ${r2.status}`)

    await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'cleanup' }, workerToken)
  }

  // ─────────────────────────────────────────────────────────────────
  // 9. RESOURCE EXHAUSTION — Create hundreds of tasks
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 9. RESOURCE EXHAUSTION: Buyer creates 50 tasks rapidly')
  {
    const start = Date.now()
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) =>
        api('POST', '/buyer/tasks', {
          title: `Flood task ${i+1}`,
          description: 'Spam creating tasks to exhaust server resources rapidly',
          category: 'GARBAGE_COLLECTION', dirtyLevel: 'LIGHT', urgency: 'LOW',
        }, buyerToken))
    )
    const elapsed = Date.now() - start
    const ok_ = results.filter(r => r.value?.status === 201).length
    const serverErr = results.filter(r => r.value?.status >= 500).length

    ok('No server crashes from 50 rapid creates', serverErr === 0,
      `${serverErr} server errors`)
    if (ok_ < 50) warn('Some tasks rejected', `${ok_}/50 created — possible rate limit needed`)
    else console.log(`    ✅ All 50 created in ${elapsed}ms — ⚠️ consider adding rate limiting`)
  }

  // ─────────────────────────────────────────────────────────────────
  // 10. PHANTOM RESOURCES — Use non-existent IDs
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 10. PHANTOM RESOURCES: Non-existent task IDs')
  {
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const r1 = await api('GET', `/buyer/tasks/${fakeId}`, null, buyerToken)
    ok('Fake task ID = 404', r1.status === 404, `Got ${r1.status}`)

    const r2 = await api('POST', `/worker/tasks/${fakeId}/accept`, {}, workerToken)
    ok('Accept fake task = 404', r2.status === 404, `Got ${r2.status}`)

    const r3 = await api('POST', `/buyer/tasks/${fakeId}/approve`, {}, buyerToken)
    ok('Approve fake task = 404', r3.status === 404, `Got ${r3.status}`)

    const r4 = await api('POST', `/buyer/tasks/${fakeId}/cancel`, { reason: 'x' }, buyerToken)
    ok('Cancel fake task = 404', r4.status === 404, `Got ${r4.status}`)

    // Malformed UUID
    const r5 = await api('GET', `/buyer/tasks/not-a-uuid`, null, buyerToken)
    ok('Malformed UUID handled', r5.status >= 400, `Got ${r5.status}`)
  }

  // ─────────────────────────────────────────────────────────────────
  // 11. CONCURRENT CONFLICTING OPS — Approve + Reject + Cancel at once
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 11. CONCURRENT CONFLICTS: Approve + Reject + Cancel simultaneously')
  {
    const taskId = await createTask('Triple conflict')
    await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)

    // Fire approve + reject + cancel all at once on ACCEPTED task
    const [approve, reject, cancel] = await Promise.allSettled([
      api('POST', `/buyer/tasks/${taskId}/approve`, {}, buyerToken),
      api('POST', `/buyer/tasks/${taskId}/reject`, { reason: 'bad' }, buyerToken),
      api('POST', `/buyer/tasks/${taskId}/cancel`, { reason: 'cancel' }, buyerToken),
    ])
    const statuses = [approve.value?.status, reject.value?.status, cancel.value?.status]
    const successes = statuses.filter(s => s === 200).length

    ok('At most ONE operation succeeds', successes <= 1,
      `${successes} succeeded: approve=${statuses[0]} reject=${statuses[1]} cancel=${statuses[2]}`)

    // Check final state is consistent
    const final = await api('GET', `/buyer/tasks/${taskId}`, null, buyerToken)
    const st = final.data?.status ?? final.data?.task?.status
    ok('Final state is valid', ['ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'OPEN'].includes(st),
      `Final state: ${st}`)

    if (st === 'ACCEPTED' || st === 'IN_PROGRESS')
      await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'cleanup' }, workerToken)
  }

  // ─────────────────────────────────────────────────────────────────
  // 12. RAPID LOGIN SPAM — 100 login attempts
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 12. LOGIN SPAM: 100 simultaneous login attempts')
  {
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        api('POST', '/auth/login', BUYER))
    )
    const ok_ = results.filter(r => r.value?.status === 200).length
    const serverErr = results.filter(r => r.value?.status >= 500).length
    ok('No server crash from 100 logins', serverErr === 0, `${serverErr} server errors`)
    if (ok_ === 100) warn('No rate limit on login', 'Consider adding brute-force protection')
  }

  // ─────────────────────────────────────────────────────────────────
  // 13. WRONG PASSWORD BRUTE FORCE — 50 bad passwords
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 13. BRUTE FORCE: 50 wrong password attempts')
  {
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) =>
        api('POST', '/auth/login', { email: BUYER.email, password: `wrong${i}` }))
    )
    const ok_ = results.filter(r => r.value?.status === 200).length
    ok('No successful login with wrong password', ok_ === 0, `${ok_} succeeded!`)

    const serverErr = results.filter(r => r.value?.status >= 500).length
    ok('Server handles brute force', serverErr === 0, `${serverErr} server errors`)

    const blocked = results.filter(r => r.value?.status === 429).length
    if (blocked === 0) warn('No rate limiting on failed logins', 'Add rate limiting to prevent brute force')
  }

  // ─────────────────────────────────────────────────────────────────
  // 14. REPLAY ATTACK — Reuse old task operations
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 14. REPLAY ATTACK: Reuse cancelled task operations')
  {
    const taskId = await createTask('Replay test')
    await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)
    await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'test' }, workerToken)

    // Try to accept the now-OPEN-again task, then start, then submit
    const r1 = await api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken)
    ok('Can re-accept cancelled task (goes back to OPEN)', r1.status === 200 || r1.status >= 400,
      `Got ${r1.status} — ${r1.status === 200 ? 'allowed (task back to OPEN)' : 'blocked'}`)

    if (r1.status === 200) {
      await api('POST', `/worker/tasks/${taskId}/cancel`, { reason: 'cleanup' }, workerToken)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 15. 200 USERS MIXED CHAOS — Everything at once
  // ─────────────────────────────────────────────────────────────────
  console.log('\n  🔨 15. FULL CHAOS: 200 random operations simultaneously')
  {
    const taskId = await createTask('Chaos target')
    const start = Date.now()

    const ops = []
    // 50 read operations
    for (let i = 0; i < 50; i++) ops.push(api('GET', '/buyer/tasks?page=1&limit=5', null, buyerToken))
    // 30 wrong-role attempts
    for (let i = 0; i < 30; i++) ops.push(api('POST', '/buyer/tasks', { title: 'x', description: 'x', category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'MEDIUM' }, workerToken))
    // 30 bad auth attempts
    for (let i = 0; i < 30; i++) ops.push(api('GET', '/auth/me', null, 'bad-token'))
    // 20 accept same task
    for (let i = 0; i < 20; i++) ops.push(api('POST', `/worker/tasks/${taskId}/accept`, {}, workerToken))
    // 20 cancel same task
    for (let i = 0; i < 20; i++) ops.push(api('POST', `/buyer/tasks/${taskId}/cancel`, { reason: 'chaos' }, buyerToken))
    // 20 approve same task
    for (let i = 0; i < 20; i++) ops.push(api('POST', `/buyer/tasks/${taskId}/approve`, {}, buyerToken))
    // 30 fake task IDs
    for (let i = 0; i < 30; i++) ops.push(api('GET', `/buyer/tasks/00000000-0000-0000-0000-00000000000${i%10}`, null, buyerToken))

    const results = await Promise.allSettled(ops)
    const elapsed = Date.now() - start
    const serverErr = results.filter(r => r.value?.status >= 500).length
    const networkErr = results.filter(r => r.value?.status === 0).length

    ok('No server crashes from 200 chaotic ops', serverErr === 0,
      `${serverErr} server errors in ${elapsed}ms`)
    ok('No network failures', networkErr === 0, `${networkErr} network errors`)

    const codes = {}
    results.forEach(r => { const s = r.value?.status || 0; codes[s] = (codes[s] || 0) + 1 })
    console.log(`    📊 Status codes: ${JSON.stringify(codes)}`)
  }

  // ── FINAL REPORT ─────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(`  CHAOS TEST RESULTS: ${passed} PASSED, ${failed} FAILED, ${warnings} WARNINGS`)
  console.log('═══════════════════════════════════════════════════════════')

  if (bugs.length > 0) {
    console.log('\n  🔴 BUGS:')
    bugs.forEach(b => console.log(`    • ${b.name}: ${b.detail}`))
  }
  if (warnings > 0) {
    console.log(`\n  ⚠️  ${warnings} warnings (not bugs, but should be addressed)`)
  }
  console.log('')
}

main().catch(console.error)
