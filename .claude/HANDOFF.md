# eClean — Session Handoff

> Updated at end of EVERY session. This is the source of truth for session continuity.

---

## Last Session: 2026-03-31 (Session 7 — Testing + AI Verification Architecture + Reviewer Feedback)

### Status: 229/229 tests passing, AI verification architecture finalized, deployed to Railway

### What was completed:

**Live Testing on iPhone (Expo Go):**
- Buyer flow tested: login → post task → 5 reference photos → pay → BuyerTaskDetail shows paired photos
- Worker flow tested: login → view reference photos → accept → start → submit
- Found and fixed: reference point 403 for workers (OPEN tasks), React hooks ordering, camera issues in Expo Go
- Found and fixed: work window blocking (disabled hardcoded window), start work alert noise
- Found and fixed: rating SQL ROUND cast error, payout status FAILED → PENDING

**AI Verification — Complete Architecture Rewrite:**
- Switched from Anthropic Claude (out of credits) to OpenAI gpt-4o-mini
- Provider abstraction: `verification.interface.ts` → swap AI providers with one config change
- Single merged call: verification + fraud detection in ONE API call (was two separate calls)
- 768px images via Cloudinary URL transform, detail:"auto" (~765 tokens/image)
- Cost: ~$0.0006/verification ($14 budget = ~23,000 verifications)
- Fallback: API failure after 2 retries → MANUAL_REVIEW, never auto-pass without AI

**AI Prompt — 7 Verification + 4 Fraud Checks:**
1. Photos match task description and category?
2. Same angle and distance in before vs after?
3. Area visibly cleaner?
4. Before/after are different images?
5. Cleaning evidence (mop marks, removed trash)?
6. Watermarks, screenshots, UI artifacts?
7. Indoor/outdoor consistent with task category?
+ Fraud: GPS anomalies, timing, motion, statistical patterns

**Decision Logic (finalized per reviewer feedback):**
- Rule ≥ 85 AND AI ≥ 0.75 AND fraud < 0.3 → AUTO_PASS
- AI < 0.3 AND rule < 70 → REJECT (both signals bad)
- AI < 0.3 AND rule ≥ 70 → MANUAL_REVIEW (bad photos, good metadata = buyer decides)
- Fraud ≥ 0.8 → forces MANUAL_REVIEW even if AUTO_PASS (buyer sees anomalies)
- Rule < 40 → HUMAN_REVIEW (skip AI, GPS drift possible)
- API failure → MANUAL_REVIEW (never auto-pass on failure)

**Rule Engine — Reweighted + Smart Normalization:**
- GPS proximity: 30pts (was 25)
- Photo coverage: 25pts (unchanged)
- Time on site: 20pts (was 15)
- Verification completeness: 20pts (unchanged)
- Duplicate image check: 10pts (was 15)
- GPS fraud flags: 10pts (unchanged)
- Bonus layers (EnvDNA, Zone Intelligence, Motion, Citizen): 5pts each
- Smart normalization: exclude no-data bonus layers from maxPossible
  (fixes: every worker hitting MANUAL_REVIEW during pilot when sensor data unavailable)

**Weakest Pair Selection:**
- AI receives the pair with LOWEST GPS score (most suspicious)
- Not random, not first — the weakest link gets AI scrutiny

**Tests — 229/229 Passing:**
- rule-engine.test.ts: 12 unit tests (human behavior scenarios)
- rule-engine-edge-cases.test.ts: 29 tests (boundaries, corruption, fraud, chaos)
- reference-points.test.ts: 22 integration tests (full lifecycle)
- reference-points-edge-cases.test.ts: 12 tests (concurrent accept, cancellation, limits)
- critical-gaps.test.ts: 13 tests (payment trigger, schema validation, buyer fraud, expiry)
- All existing tests: 141/141 (auth, tasks, wallet, admin, citizen, etc.)
- Test isolation fixed: cleanTestData in beforeAll, not afterAll

**New Feature — Task Expiry Job:**
- `task-expiry.job.ts`: BullMQ repeatable every 30 min
- Releases ACCEPTED tasks stuck 2+ hours
- Releases IN_PROGRESS tasks stuck 4+ hours
- Worker trust decremented, notification sent

**Duplicate Image Detection Layer:**
- Rule engine layer catches workers reusing buyer's reference photos
- URL match + photoHash match detection
- Found during live testing: identical photos scored 90% → now caught

**Buyer Accountability:**
- falseRejectionCount increments when buyer rejects AI-approved (≥0.85) work
- Auto-flags buyer at 3+ false rejections
- buyerTrustScore decrements by 5 per false rejection

### Production State:
- Railway deployed with all changes (latest: c7524a6)
- OpenAI API key configured on Railway (OPENAI_API_KEY)
- Docker Postgres + Redis running locally for tests
- 2 test tasks in production DB (Drain clean: APPROVED, Bathroom cleaning: REJECTED)

### What needs to happen next:

**Priority 1 — Before pilot:**
- Deploy latest code to Railway (`railway up`)
- Build dev client for iPhone (`npx expo run:ios`) — camera + sensors don't work in Expo Go
- Test full flow with dev client: reference photos → side-by-side camera → submit → AI scores
- Worker flow UI redesign (TaskDetailScreen, ActiveTaskScreen, ReferencePointNavigator)

**Priority 2 — Week 2 after pilot:**
- Perceptual hashing (pHash) for duplicate/recycled photo detection across ALL tasks
- Buyer feedback loop: after 200 tasks, correlate ruleEngineBreakdown with approve/reject outcomes
- Resolution ladder: 256px → 768px → full based on borderline score

**Priority 3 — After 200 real tasks:**
- Threshold recalibration from real outcome data
- MobileNet embedding layer for manipulated duplicate detection
- Citizen anti-collusion (different phone + 7-day account age)

**Priority 4 — After 5000 tasks:**
- Custom fine-tuned verification model from labeled data
- Training flywheel

### Key Architecture Decisions Made This Session:
1. AI provider abstracted behind interface (swap OpenAI/Anthropic/custom)
2. Single merged call (verification + fraud) not two separate calls
3. Anchoring bias acknowledged but irrelevant for pilot scale
4. Smart normalization (exclude no-data bonus layers) — self-healing as layers enable
5. Auto-reject requires BOTH AI AND rule engine agreement
6. Fraud score has teeth (≥0.8 overrides AUTO_PASS) but never auto-rejects alone
7. Cost optimization is solved ($0.0006/task) — focus on fraud resistance (moat), not cost

### Branch: image_capture_workflow (20+ commits)
### Latest commit: c7524a6

### New files this session:
- `backend/src/modules/ai/verification.interface.ts`
- `backend/src/modules/ai/openai.provider.ts`
- `backend/src/jobs/task-expiry.job.ts`
- `backend/tests/rule-engine-edge-cases.test.ts`
- `backend/tests/reference-points-edge-cases.test.ts`
- `backend/tests/critical-gaps.test.ts`
- `docs/test-documentation.md`
