# eClean v2 — Complete Verification Flow

> From image capture to AI verification to payment release.
> Every feature explained with the problem it solves.
> **Updated: March 31, 2026 — Post-review revision**

---

## THE BIG PICTURE

```
BUYER POSTS TASK          WORKER DOES WORK           SYSTEM VERIFIES            PAYMENT
     |                         |                          |                         |
  Post task              Accept task               Rule Engine (5ms)          AUTO_PASS → auto-release
  Set location           Navigate to spot          AI Vision (10-15s)           (24h dispute window)
  Take reference         Start work                GPS Trail Analysis         MANUAL_REVIEW → 72h
  photos (3-10)          Take matching photos       Motion + EnvDNA              auto-release
  Pay via Razorpay       Submit work                Fraud Detection            REJECT → buyer sees
                                                    Final Decision               reason + dispute option
```

---

## KEY DESIGN DECISIONS

### Why we keep ALL verification layers (not simplified for pilot)

An external reviewer suggested dropping motion tracking, EnvDNA, and zone intelligence
for the pilot. We disagree for one reason: **Indian fraud patterns.**

- Buyers WILL claim "work not done" to avoid paying → reference photos protect workers
- Workers WILL try to game the system → multiple verification layers protect buyers
- Both sides need protection from Day 1, not after fraud has already happened

**What we DROP:**
- Hidden verification points (confusing UX for workers who can't read well)
- Citizen mesh (not enough users yet to be useful)

**What we KEEP but as bonus-only (never penalizes):**
- Motion tracking (5 pts bonus, 0 pts if no data — NEVER negative)
- Environmental DNA (5 pts bonus, 0 pts if no data — NEVER negative)
- Zone intelligence (5 pts bonus, 0 pts if no data — NEVER negative)

**What we ADD:**
- Payment auto-release timeouts (24h AUTO_PASS, 72h MANUAL_REVIEW)
- Worker Grace system (GPS trail proves presence → soft pass after 12h)
- Geofence GPS retry mechanism (not hard block)
- Stricter buyer false rejection protection (1 warning, not 3)

---

## PHASE 1: BUYER POSTS TASK + REFERENCE PHOTOS

### Flow

```
Buyer opens app
    |
    v
[Post Task Screen — 4-step wizard]
    |
    |-- Step 1: Category
    |     Select: STREET_CLEANING / DRAIN_CLEANING / GARBAGE_COLLECTION / etc.
    |
    |-- Step 2: Details
    |     Title, description, dirty level (LIGHT/MEDIUM/HEAVY)
    |     System estimates rate from category + dirty level
    |
    |-- Step 3: Location
    |     Map picker + "Use My Location" button
    |     Reverse geocode → human-readable address
    |     GPS coordinates stored (lat/lng)
    |
    |-- Step 4: Reference Photos (3-10 photos)
    |     |
    |     v
    |   [CaptureCamera opens]
    |     |
    |     |-- Camera captures photo
    |     |-- Simultaneously captures:
    |     |     * GPS coordinates (expo-location)
    |     |     * Timestamp (ISO UTC)
    |     |     * Device ID
    |     |     * Photo hash (SHA-256)
    |     |
    |     |-- Photo saved to app-private gallery
    |     |     (NOT phone gallery — prevents reuse of old photos)
    |     |
    |     |-- Compressed to 1200px max, uploaded to Cloudinary
    |     |
    |     |-- Backend creates TaskReferencePoint record:
    |     |     { pointIndex, buyerImageUrl, buyerLat, buyerLng, photoHash }
    |     |
    |     v
    |   [Repeat for each dirty spot]
    |
    v
[Razorpay Payment]
    |
    v
[Task created with status: OPEN]
    |
    v
[Task visible to workers on map]
```

### Why Reference Photos? (3-10, non-negotiable)

**Problem:** In v1, buyers described the work in text ("clean the road near the park"). Workers could submit random cleaning photos from anywhere and claim they did the work.

**Solution:** Buyer takes photos of the actual dirty spots. Worker must photograph the SAME spots after cleaning.

**Why 3 minimum, not 2:**
- More buyer photos = more evidence for AND against the worker
- Protects BOTH sides: worker proves they cleaned, buyer can't falsely claim "not done"
- AI accuracy improves dramatically with more comparison pairs
- Indian buyers WILL try to claim work wasn't done to get free cleaning — more photos = more proof

**Why not reduce for "easier posting":**
- A buyer who won't take 3 photos of the dirty area isn't serious about getting it cleaned
- These photos are the foundation of the entire verification system
- Reducing them weakens protection for workers (the more vulnerable side)

---

## PHASE 2: WORKER ACCEPTS + DOES WORK

### Flow

```
Worker opens Find Work screen
    |
    v
[Map shows nearby OPEN tasks with pins]
    |-- Tasks filtered by: category, urgency, radius from worker
    |-- Each pin shows: title, rate, distance
    |
    v
[Worker taps task → TaskDetailScreen]
    |-- Shows: description, rate, location, reference photos
    |-- Worker sees WHAT needs to be cleaned BEFORE accepting
    |
    v
[Worker taps "Accept"]
    |-- Double-tap prevention (useRef guard)
    |-- 409 handled (another worker already accepted)
    |-- Status: OPEN → ACCEPTED
    |
    v
[Worker navigates to location]
    |-- "Navigate" button opens Google Maps directions
    |-- Distance shown: "1.2 km away"
    |
    v
[Worker arrives, taps "Start Work"]
    |-- Geofence check: within 500m of task location
    |-- GPS RETRY MECHANISM (new):
    |     If GPS shows >500m but worker claims they're there:
    |     "GPS signal is weak. Retrying..." (auto-retry 3 times over 15s)
    |     If still >500m after retries: "Move closer or check GPS settings"
    |     NOT a hard block — shows helpful guidance
    |-- Status: ACCEPTED → IN_PROGRESS
    |-- Server records startedAt timestamp
    |
    |===========================================================
    |  TRACKING STARTS (runs entire duration of work)
    |===========================================================
    |
    |-- GPS TRACKING (background, even phone locked)
    |     * expo-task-manager runs every 30 SECONDS (was 15s)
    |     * Reduced from 15s to save battery on budget phones
    |     * 30s still gives clear trail for analysis
    |     * socket.emit('worker:gps', { taskId, lat, lng, accuracy })
    |     * Backend stores in TaskLocationLog table
    |     * Buyer can see worker location in real-time (LiveTrackScreen)
    |
    |-- MOTION TRACKING (accelerometer, background)
    |     * Samples at 10 Hz (100ms intervals)
    |     * Every 30 seconds, classifies window:
    |     *   variance < 0.5        → STANDING
    |     *   z-peaks > 30, var 1-15 → WALKING
    |     *   var > 2.0, not walking → CLEANING
    |     *   max accel > 20        → VEHICLE
    |     * BONUS ONLY — never penalizes. 0% cleaning = 0 bonus pts
    |     * Data collected for future model training
    |
    |-- ENVIRONMENTAL DNA (sensor fingerprint, fire-and-forget)
    |     * Magnetometer XYZ (unique per location)
    |     * Barometric pressure (indoor/outdoor)
    |     * Ambient light level
    |     * Cell network type
    |     * BONUS ONLY — never penalizes. No match = 0 bonus pts
    |     * Data collected for future validation
    |
    |===========================================================
    |
    v
[Worker opens Reference Points screen]
    |
    |-- Shows ALL buyer's reference photos (sorted by pointIndex)
    |-- Each card shows:
    |     * Buyer's photo (what needs to be cleaned)
    |     * Label (if buyer added one: "Near the gate")
    |     * Distance from worker's current GPS to that point
    |     * "Go" button → opens walking navigation
    |
    |-- Progress bar: "3/4 captured"
    |-- NO hidden verification points (removed — confusing UX)
    |
    v
[Worker taps a reference point → Camera opens in SIDE-BY-SIDE mode]
    |
    |   +-------------------+-------------------+
    |   |                   |                   |
    |   |   BUYER'S PHOTO   |   WORKER'S CAMERA |
    |   |   (reference)     |   (live viewfinder)|
    |   |                   |                   |
    |   +-------------------+-------------------+
    |   |        GPS: 12m — at the spot          |
    |   +----------------------------------------+
    |
    |-- Worker matches the angle of buyer's photo
    |-- Proximity bar shows distance from exact spot
    |     Green (< 15m): "At the spot"
    |     Yellow (15-50m): "Getting closer"
    |     Red (> 50m): "Too far"
    |
    |-- On capture:
    |     * Photo + GPS + timestamp + hash captured
    |     * Uploaded as WorkerPointSubmission (mediaType: AFTER)
    |     * Backend computes locationMatchScore (0-100)
    |
    v
[All photos captured → "Review & Submit" button enabled]
    |
    v
[SubmitProofScreen — Review page]
    |-- Shows all before/after pairs side by side
    |-- Shows GPS match score per point
    |-- Summary: GPS trail points, time on site, earnings on approval
    |
    v
[Worker taps "Submit Work"]
```

### Why GPS Trail Every 30s (not 15s)?

**Problem (identified by reviewer):** GPS every 15 seconds + accelerometer at 10Hz + sensors on a budget ₹8,000-12,000 Redmi phone in direct sunlight = 20-30% battery drain per 45-min task. A worker taking 3 tasks/day has a dead phone by task 2.

**Solution:** GPS every 30 seconds. Still gives a clear movement trail. Halves the battery impact. For trail analysis (was worker there, did they leave), 30-second resolution is more than enough.

### Why No Hidden Verification Points?

**Problem (identified by reviewer):** Target workers — daily wage cleaners in Indian cities — often have limited literacy and aren't tech-savvy. Hidden UI elements that appear/disappear based on GPS proximity are confusing. On budget phones with 15-50m GPS drift in dense neighborhoods, the 50m reveal radius means points might never appear even when the worker is standing at the exact spot. Silent -20 point penalty for something outside their control feels deeply unfair and will cause app uninstalls.

**Solution:** Removed. All reference points are visible. The verification completeness layer (20 pts) is redistributed to GPS proximity (+5) and time on site (+5) which are more reliable signals.

### Why Motion + EnvDNA as BONUS ONLY?

**Problem (identified by reviewer):** Phone sitting on a wall while worker sweeps = "STANDING" in accelerometer. Magnetometer shifts when a metal vehicle passes 10m away. Barometric pressure changes with weather. These sensors are noisy on budget phones and produce false signals.

**Solution:** Keep collecting data (needed for future model training), but NEVER penalize. 0% cleaning activity + 0 env match = 0 bonus points, NOT negative score. When we have 200+ real tasks, we validate which sensor signals actually correlate with legitimate work vs fraud. Then we calibrate thresholds based on real data, not assumptions.

---

## PHASE 2.5: PRE-VERIFICATION FILTERS (before spending money on AI)

> Added: April 4, 2026 — these filters run BEFORE the AI call to save ₹1.5
> on obvious fakes. Both are backend-only, no mobile changes needed.

### Filter 1: Motion Activity Gate (₹0, instant)

```
[Check TaskMotionSummary — already sent by mobile on submit]
    |
    +-- durationSecs > 600 (10+ min of data)?
    |     |
    |     YES: Check activity breakdown
    |     |
    |     +-- cleaningPct < 5% AND standingPct > 80%?
    |     |     → REJECT: "Worker was stationary, no cleaning detected"
    |     |     → Skip rule engine + AI (save ₹1.5)
    |     |     → finalDecision = MANUAL_REVIEW
    |     |
    |     +-- vehiclePct > 50%?
    |     |     → REJECT: "Worker was driving, not cleaning"
    |     |     → Skip AI → finalDecision = REJECT
    |     |
    |     +-- Otherwise: PASS → continue to next filter
    |
    +-- NO (< 10 min data or no data): PASS → continue
         (don't penalize short tasks or missing sensor data)
```

**Why 10 min minimum?** Short tasks (< 10 min) have too few motion windows
for reliable classification. Budget phone accelerometers are noisy — we need
enough samples to be confident.

**Why not hard-reject on no motion data?** Some budget phones fail to deliver
accelerometer events (expo-sensors known issue on Redmi Go / Samsung A03).
Penalizing missing data punishes honest workers with cheap phones.

### Filter 2: Photo Similarity Gate (₹0, ~50ms)

```
[Download before/after images from Cloudinary at 64px grayscale]
    |
    +-- Compute perceptual hash (pHash) for each image
    |     - 8x8 grayscale → mean threshold → 64-bit hash
    |     - NOT SHA-256 (that catches exact duplicates, already in rule engine)
    |     - pHash catches VISUAL similarity — same scene, slightly different angle
    |
    +-- Hamming distance between before/after hashes per pair
    |     - Distance < 10 = images are >85% visually identical
    |
    +-- Majority of pairs suspicious (≥ 50%)?
          |
          YES → REJECT: "Before/after photos are X% identical"
          |     Skip AI (save ₹1.5)
          |     finalDecision = MANUAL_REVIEW
          |
          NO → PASS → continue to rule engine + AI
```

**What this catches:** Worker goes to spot, takes "before" photo, sits for
30 minutes doing nothing, takes "after" photo. Photos are nearly identical
because nothing was cleaned. Caught deterministically for ₹0.

**What this does NOT catch (AI still needed):**
- Worker takes completely different photos (table vs floor) — caught by AI
- Worker wets the floor (looks different but no real cleaning) — caught by AI
- Worker takes photos from very different angles — pHash won't match anyway

### Cost Savings

```
Before:  Every submission → AI call → ₹1.5
After:   Submission → Motion gate (₹0) → Photo hash (₹0) → only legit ones hit AI

Fake "sat and did nothing" submissions: ₹0 (caught by motion + photo hash)
Fake "random unrelated photos" submissions: ₹1.5 (need AI to detect)
Real submissions: ₹1.5 (AI confirms quality)

At 50% fake submission rate: AI costs cut in half
```

---

## PHASE 3: VERIFICATION (System — Automatic)

### Flow

```
Worker taps "Submit Work"
         |
         v
[Backend: submitTask()]
    |-- Validates: all required photos uploaded
    |-- Sets status: IN_PROGRESS → SUBMITTED
    |-- Records submittedAt, timeSpentSecs
    |-- Stops background GPS tracking
    |
    +---> [PRE-AI FILTERS — Synchronous, ~100ms]
    |         |-- Motion gate: stationary check (see Phase 2.5)
    |         |-- Photo similarity: pHash comparison (see Phase 2.5)
    |         |-- If either rejects → skip rule engine + AI
    |
    +---> [RULE ENGINE — Synchronous, ~5ms]
    |         |
    |         v
    |    Runs 9 scoring layers (see below)
    |    Produces: ruleEngineScore (0-100) + breakdown JSON
    |         |
    |         v
    |    Initial decision:
    |      ≥ 85 → "probably good"
    |      65-84 → "uncertain"
    |      < 65 → "probably bad"
    |
    +---> [AI VERIFICATION — Async BullMQ job, ~10-15s]
              |
              v
         Pre-check: ruleEngineScore < 40?
              |
         YES: Skip AI call (save money)
         |    Set aiScore=0.25, decision=MANUAL_REVIEW
         |    Reason: "Score too low, flagged for supervisor"
         |
         NO: Continue to AI
              |
              v
         [Send ALL photo pairs to AI]
              |-- ALL reference point before/after pairs
              |-- Sorted by GPS score (weakest first)
              |-- Typically 6-20 images (3-10 pairs)
              |
              v
         [Resize images to 1024px via Cloudinary URL]
              |
              v
         [Call OpenAI gpt-4.1 or gpt-5 — SINGLE merged call]
              |
              |  Sends to AI:
              |  - ALL buyer reference photos (before)
              |  - ALL worker after photos
              |  - Task metadata (title, category, dirty level)
              |  - GPS scores, time spent, motion data
              |
              |  AI checks 9 verification points:
              |  1. Photos match task description + category?
              |  2. Same angle and distance in before vs after?
              |  3. Area VISIBLY CLEANER in after?
              |  4. Before and after are DIFFERENT images?
              |  5. Evidence of cleaning (mop marks, removed trash)?
              |  6. Watermarks, screenshots, UI artifacts?
              |  7. Indoor/outdoor consistent with category?
              |  8. ALL pairs consistent? (same location, time, weather)
              |  9. Any single pair faked while others look real?
              |
              |  AI checks 5 fraud signals:
              |  1. GPS scores suspiciously low or identical?
              |  2. Time reasonable for task size?
              |  3. Motion data consistent with cleaning?
              |  4. Any statistical anomalies?
              |  5. Images from same session/device?
              |
              |  Returns JSON:
              |  {
              |    verification: { score: 0.85, label: "GOOD",
              |      reasoning: "...", recommendation: "APPROVE" },
              |    fraud: { probability: 0.1, anomalies: [] }
              |  }
              |
              v
         [FINAL DECISION COMPUTATION]
              |
              |  Three signals combined:
              |
              |  +------------------+
              |  | RULE ENGINE: 92  |  (metadata quality)
              |  +------------------+
              |  | AI SCORE: 0.85   |  (visual quality)
              |  +------------------+
              |  | FRAUD: 0.1       |  (anomaly detection)
              |  +------------------+
              |
              v
         [Decision Matrix]
```

### Decision Matrix

```
+============+==========+==========+==============+==================+
| Rule Score | AI Score | Fraud    | AI Says      | FINAL DECISION   |
+============+==========+==========+==============+==================+
|   >= 85    |  >= 0.75 |  < 0.3   | APPROVE      | AUTO_PASS        |
|            |          |          |              | (auto-release 24h|
+------------+----------+----------+--------------+------------------+
|   >= 85    |  >= 0.75 |  >= 0.8  | APPROVE      | MANUAL_REVIEW    |
|            |          |          |              | (fraud override) |
+------------+----------+----------+--------------+------------------+
|   60-84    |  >= 0.3  |  any     | any          | WORKER GRACE     |
|  + GPS     |          |          |              | (12h soft pass   |
|  trail OK  |          |          |              |  if GPS proves   |
|            |          |          |              |  presence)       |
+------------+----------+----------+--------------+------------------+
|   >= 70    |  >= 0.3  |  any     | any          | MANUAL_REVIEW    |
|            |          |          |              | (buyer decides)  |
+------------+----------+----------+--------------+------------------+
|   < 70     |  < 0.3   |  any     | any          | REJECT           |
|            |          |          |              | (both signals bad|
+------------+----------+----------+--------------+------------------+
|   < 70     |  >= 0.3  |  any     | any          | MANUAL_REVIEW    |
|            |          |          |              | (bad metadata,   |
|            |          |          |              |  ok photos)      |
+------------+----------+----------+--------------+------------------+
|   < 40     |  SKIPPED |  N/A     | N/A          | MANUAL_REVIEW    |
|            |          |          |              | (AI not called)  |
+------------+----------+----------+--------------+------------------+
|   any      |  API FAIL|  N/A     | N/A          | MANUAL_REVIEW    |
|            |          |          |              | (never auto-pass |
|            |          |          |              |  on failure)     |
+============+==========+==========+==============+==================+
```

### Worker Grace System (NEW)

**Problem (identified by reviewer):** A worker cleans for 40 minutes in 38°C heat. GPS drifted 18m on her budget Redmi phone, so some scores are lower. AI says 0.55 because angle was slightly different (parked auto in the way). Rule engine: 72. Final: MANUAL_REVIEW. Buyer glances, sees "flagged," rejects. Worker worked for ₹0. She uninstalls.

**Solution:** If a worker scores 60-84 (MANUAL_REVIEW zone) BUT their GPS trail clearly shows they were at the location the entire time, they enter "Worker Grace":
- Payment auto-releases after 12 hours UNLESS the buyer actively rejects with a reason
- Buyer gets notification: "Work completed, review within 12 hours or payment auto-releases"
- This protects honest workers who got unlucky with GPS/angles
- Buyer still has full power to reject — but they must actively do it, not just ignore

---

## RULE ENGINE — 9 Scoring Layers

```
+====================================================================+
|                    RULE ENGINE SCORING (0-100)                      |
+====================================================================+

CORE LAYERS (always active):
+-------------------------------+-----+-------------------------------+
| Layer                         | Max | What it measures              |
+-------------------------------+-----+-------------------------------+
| GPS Proximity                 |  35 | Avg GPS match across all      |
|                               |     | worker photos vs buyer GPS    |
|                               |     | (increased from 30 — absorbs  |
|                               |     |  pts from removed verification|
|                               |     |  completeness layer)          |
+-------------------------------+-----+-------------------------------+
| Photo Coverage                |  25 | % of reference points that    |
|                               |     | have AFTER submissions         |
+-------------------------------+-----+-------------------------------+
| Time on Site                  |  25 | Minutes at location vs        |
|                               |     | expected time for task size   |
|                               |     | (increased from 20 — absorbs  |
|                               |     |  pts from removed verification|
|                               |     |  completeness layer)          |
+-------------------------------+-----+-------------------------------+
| Duplicate Image Check         |  10 | Are worker photos unique?     |
|                               |     | Checks photoHash + URL match  |
+-------------------------------+-----+-------------------------------+
| GPS Fraud Flags               |  10 | Penalizes GPS matches < 25    |
|                               |     | 4 pts deducted per bad match  |
+-------------------------------+-----+-------------------------------+

BONUS LAYERS (only ADD points, never subtract):
+-------------------------------+-----+-------------------------------+
| Environmental DNA             |   5 | Magnetometer/barometer/light  |
|                               |     | match between start and submit|
|                               |     | 0 if no data — NEVER negative |
+-------------------------------+-----+-------------------------------+
| Zone Intelligence             |   5 | Cross-references zone dirty   |
|                               |     | score with task time          |
|                               |     | 0 if no data — NEVER negative |
+-------------------------------+-----+-------------------------------+
| Motion Signature              |   5 | Accelerometer cleaning %      |
|                               |     | > 50% = 5pts, else 0         |
|                               |     | 0 if no data — NEVER negative |
+-------------------------------+-----+-------------------------------+

REMOVED LAYERS:
+-------------------------------+-----+-------------------------------+
| Verification Completeness     |  -- | REMOVED — hidden verification |
|                               |     | points dropped. 20 pts       |
|                               |     | redistributed to GPS (+5)    |
|                               |     | and Time (+5)                |
+-------------------------------+-----+-------------------------------+
| Citizen Mesh                  |  -- | REMOVED — not enough users   |
|                               |     | yet. Will re-add when citizen|
|                               |     | base exists                  |
+-------------------------------+-----+-------------------------------+

SMART NORMALIZATION:
  Bonus layers with "no data" are EXCLUDED from max possible score.
  Core layers: 105 max. Bonus layers add up to 15 when data exists.
  
  Example: Core score 95/105. No motion, no env data.
  Max possible = 105. Normalized = 95/105 = 90.5%. → AUTO_PASS eligible.
  
  WHY: Without this, every worker scores ~75% during pilot
  (when sensor data is unavailable). System self-heals as
  more data layers become available.
```

---

## PHASE 4: PAYMENT RELEASE (Updated)

### Flow

```
[Task status: SUBMITTED, finalDecision computed]
         |
         +--- AUTO_PASS -----> Payment AUTO-RELEASES
         |                       |
         |                     Worker gets paid immediately
         |                     Buyer gets notification:
         |                       "AI verified ✓ — Score 92%"
         |                       "Payment released to worker"
         |                       [Dispute within 24h] button
         |                           |
         |                     If buyer disputes within 24h:
         |                       Must provide detailed reason
         |                       Admin reviews
         |                       Payment held pending resolution
         |                     If no dispute in 24h:
         |                       Payment is final
         |
         +--- WORKER GRACE --> Buyer gets notification:
         |    (60-84 + GPS      "Work completed — review within 12h"
         |     trail OK)        "Payment auto-releases in 12 hours"
         |                       [Approve] [Reject with reason]
         |                           |
         |                     If buyer approves → instant release
         |                     If buyer rejects (must give reason) → held
         |                     If buyer does nothing for 12h → auto-release
         |
         +--- MANUAL_REVIEW --> Buyer gets notification:
         |                       "Work submitted — needs your review"
         |                       AI score + reasoning shown
         |                       All photo pairs + GPS scores
         |                       [Approve] [Reject with reason]
         |                           |
         |                     PAYMENT TIMEOUT: 72 HOURS
         |                     If buyer doesn't respond in 72h:
         |                       Payment auto-releases to worker
         |                       Worker shouldn't wait forever
         |                           |
         |                     If buyer rejects AI-approved work (score >= 0.85):
         |                       FIRST TIME: Strong warning shown
         |                         "AI verified this work. Are you sure?"
         |                       SECOND TIME: Must write detailed justification
         |                       THIRD TIME: Account flagged for admin review
         |                       buyer.trustScore -= 10 per false rejection
         |
         +--- REJECT ---------> Buyer sees:
                                 "AI flagged issues"
                                 AI reasoning shown
                                 [Reject] button highlighted
                                 [Approve] button (still available)
                                     |
                                Worker can:
                                  [Dispute] → creates support ticket
                                  Admin resolves in admin panel
```

### Why Payment Auto-Release?

**Problem (identified by reviewer):** If AUTO_PASS requires buyer to tap "Approve," a busy buyer could just not open the app for 3 days. Worker is waiting for their ₹200 while the buyer forgot. Workers need payment predictability — "I'll get paid within X hours max" is what keeps them on the platform.

**Solution:** 
- AUTO_PASS: Payment releases IMMEDIATELY. Buyer has 24h dispute window.
- Worker Grace: Payment releases in 12h unless buyer actively rejects.
- MANUAL_REVIEW: Payment releases in 72h unless buyer actively rejects.
- REJECT: Buyer must act. Worker can dispute.

### Why Stricter Buyer False Rejection?

**Problem:** Original system allowed 3 false rejections before flagging. That's 3 workers who did real work and didn't get paid.

**Solution:**
- 1st false rejection (rejecting AI score >= 85%): **Strong warning** — "AI verified this work at 92%. Are you sure you want to reject?"
- 2nd: **Must write detailed justification** (min 50 chars) explaining why AI was wrong
- 3rd: **Account flagged for admin review.** All future rejections require admin approval.
- Trust score drops ₹10 per false rejection (affects buyer's ability to post tasks)

---

## PHASE 5: GPS TRAIL ANALYSIS

### What We Collect

```
TaskLocationLog table:
  { taskId, workerId, lat, lng, accuracy, timestamp }
  One entry every 30 seconds during IN_PROGRESS
```

### What We Extract (computed on submit)

```
GPS Trail Analysis:

[Timeline]
13:00  START -----> Worker arrives (within 100m)
13:00-13:08 ------> Worker moving within task area
                     Area coverage: 85% of task zone
                     Movement speed: 2.1 km/h (walking)
13:08-13:15 ------> Worker LEFT (GPS > 500m away)
                     Max distance: 1.2km
                     Duration away: 7 minutes
13:15 ------------> Worker RETURNED (within 100m)
13:15-13:25 ------> Worker at task area again
13:25  SUBMIT ----> Worker submits

[Computed Metrics]
timeAtLocation:     18 min (72% of 25 min total)
timeAway:           7 min (28%)
departures:         1 (left once, returned)
maxDistanceReached: 1.2 km
areaCoverage:       85% (moved across task zone)
movementSpeed:      2.1 km/h avg (walking speed)
gpsGaps:            0 (continuous tracking)
```

### GPS Trail Conditions

```
+============================+================+=============================+
| Condition                  | Score Impact   | Why It Matters              |
+============================+================+=============================+
| timeAtLocation >= 60%      | Enables Worker | Worker was actually there   |
|                            | Grace system   |                             |
| timeAway > 40%             | -10 to -20     | Spent more time away        |
| departures > 2             | Flag for review | Multiple trips = suspicious |
| maxDistance > 5km           | -15            | Went very far from task     |
| areaCoverage < 20%         | -10            | Stood in one spot           |
| movementSpeed > 10 km/h    | Flag as VEHICLE| Was driving, not cleaning   |
| gpsGaps > 5 min            | -5 per gap     | Turned off GPS?             |
| timeBetweenPhotos < 30s    | -10            | Before/after too quick      |
| taskTime < 30% expected    | -10            | Rushed through              |
+============================+================+=============================+
```

---

## FRAUD SCENARIOS vs WHAT CATCHES THEM

```
+==================================+====================================+
| FRAUD ATTEMPT                    | WHAT CATCHES IT                    |
+==================================+====================================+
| Random photos, wrong location    | GPS proximity: 0/35               |
|                                  | AI: photos don't match category   |
|                                  | Decision: REJECT                  |
+----------------------------------+------------------------------------+
| At location, didn't clean,       | Photo Hash: >85% identical → REJECT|
| took before/after of same dirt   | Motion Gate: >80% sitting → REJECT|
|                                  | AI: no visible improvement (backup)|
|                                  | Decision: REJECT (₹0 AI cost)    |
+----------------------------------+------------------------------------+
| Cleaned, but at wrong spot       | GPS proximity: low scores          |
| (cleaned home, claimed road)     | AI: indoor vs outdoor mismatch    |
|                                  | Decision: REJECT                  |
+----------------------------------+------------------------------------+
| Reused buyer's reference photos  | Duplicate image check: hash match |
| as "after" photos                | photoHash caught immediately      |
|                                  | Decision: REJECT                  |
+----------------------------------+------------------------------------+
| Used old photos from last week   | GPS timestamp mismatch            |
|                                  | EnvDNA: different readings (bonus)|
|                                  | Decision: MANUAL_REVIEW           |
+----------------------------------+------------------------------------+
| GPS spoofing (fake location app) | EnvDNA: magnetometer mismatch     |
|                                  | GPS fraud flags: identical coords |
|                                  | Decision: MANUAL_REVIEW           |
+----------------------------------+------------------------------------+
| Two workers colluding            | EnvDNA: different device env       |
| (one at location, one submits)   | Device ID mismatch                |
|                                  | Decision: MANUAL_REVIEW           |
+----------------------------------+------------------------------------+
| Photoshopped images              | AI: watermark/artifact detection  |
|                                  | photoHash: doesn't match capture  |
|                                  | Decision: REJECT                  |
+----------------------------------+------------------------------------+
| Accept task, wait at home,       | GPS trail: not at location         |
| rush to spot, quick photos       | Time analysis: most time away     |
|                                  | Decision: MANUAL_REVIEW           |
+----------------------------------+------------------------------------+
| Buyer rejects good work to get   | Buyer accountability:             |
| free cleaning                    | 1st: warning. 2nd: justify.      |
|                                  | 3rd: account flagged.            |
|                                  | Trust score -10 per rejection    |
+----------------------------------+------------------------------------+
| Buyer ignores task, worker waits | Payment timeout:                   |
| forever for payment              | AUTO_PASS: immediate release      |
|                                  | Worker Grace: 12h auto-release    |
|                                  | MANUAL_REVIEW: 72h auto-release   |
+==================================+====================================+
```

---

## AI VERIFICATION — COST ANALYSIS

```
Model: gpt-4.1 (or gpt-5 — testing both)
Detail: high
Resolution: 1024px via Cloudinary URL transform
Images: ALL reference point pairs (not just weakest)

Measured token usage (real test, 4 pairs = 8 images):
  Input:  ~6,700 tokens
  Output: ~300 tokens

gpt-4.1 pricing ($2.00 input, $8.00 output per 1M tokens):
  Input:  6,700 × $2.00/1M  = $0.0134
  Output: 300 × $8.00/1M    = $0.0024
  Total per call: $0.016 = ₹1.33

gpt-5 pricing ($1.25 input, $10.00 output per 1M tokens):
  Input:  6,700 × $1.25/1M  = $0.0084
  Output: 300 × $10.00/1M   = $0.003
  Total per call: $0.011 = ₹0.96

Budget: ₹5/task (deducted from buyer payment)
Actual cost: ₹1-2/task — well within budget

At scale (gpt-4.1):
  100 tasks/month:    ₹133
  1,000 tasks/month:  ₹1,330
  10,000 tasks/month: ₹13,300
  100,000 tasks/month: ₹1,33,000

Minimum task payment: ₹200
AI cost as % of task: 0.67%
```

---

## FUTURE: TRAINING FLYWHEEL (After 200+ Real Tasks)

```
Real tasks completed
        |
        v
[Labeled data accumulates automatically]
  - AUTO_PASS tasks = "legitimate work" (positive labels)
  - REJECTED tasks = "fraudulent/incomplete" (negative labels)
  - Buyer approve/reject = ground truth
        |
        v
[Raw sensor data collected per task]
  - Accelerometer + gyroscope (full duration)
  - GPS trail (every 30s)
  - Environmental DNA snapshots
  - Photo pairs with AI scores
        |
        v
[After 200 tasks: Validate sensor layers]
  |
  +-- Which motion patterns correlate with real cleaning?
  |     → Calibrate thresholds from real data, not assumptions
  |
  +-- Which EnvDNA signals are reliable on budget phones?
  |     → Keep reliable ones, drop noisy ones
  |
  +-- What's the actual GPS accuracy distribution?
  |     → Adjust geofence and scoring thresholds
  |
  v
[After 500 tasks: Train custom models]
  |
  +-- Motion Model (TFLite, ~200KB, on-device)
  |     Input: accelerometer windows
  |     Output: SWEEPING / MOPPING / SCRUBBING / STANDING / WALKING
  |
  +-- Time Estimation Model
  |     Input: category, dirty level, area size, reference points
  |     Output: expected completion time
  |
  +-- Worker Trust Model
        Input: history of scores, reject rate, dispute rate
        Output: trust level (affects verification strictness)

[After 5000 tasks: The moat]
  - Custom verification model fine-tuned on real eClean photos
  - No competitor has this labeled cleaning-specific dataset
  - Model improves with every task → better scores → faster payments
  - Faster payments → more workers → more data → better model
```

---

## SUMMARY: WHAT CHANGED AFTER REVIEW

```
REMOVED:
  ✗ Hidden verification points (confusing UX for low-literacy workers)
  ✗ Citizen mesh scoring (not enough users yet)
  ✗ Verification completeness layer (depended on hidden points)

CHANGED:
  ~ GPS tracking: 15s → 30s (save battery on budget phones)
  ~ AI model: gpt-4o-mini → gpt-4.1/gpt-5 (better accuracy, ₹5 budget)
  ~ AI images: weakest pair only → ALL pairs (₹1-2 cost, catches more fraud)
  ~ Image detail: low → high (better visual analysis)
  ~ Image resolution: 768px → 1024px
  ~ Motion/EnvDNA/Zone: scoring layers → BONUS ONLY (never negative)
  ~ Geofence: hard block → retry mechanism with guidance
  ~ Buyer false rejection: 3 strikes → 1 warning, 2 justify, 3 flagged
  ~ GPS proximity: 30 pts → 35 pts (absorbed verification pts)
  ~ Time on site: 20 pts → 25 pts (absorbed verification pts)

ADDED:
  + Payment auto-release: AUTO_PASS immediate, Grace 12h, Review 72h
  + Worker Grace system: 60-84 + GPS trail OK → 12h soft pass
  + Geofence GPS retry (3 retries over 15s, helpful messages)
  + AI cross-pair consistency checks (are ALL pairs consistent?)
  + AI session consistency check (same device/time across images?)

KEPT (non-negotiable):
  ✓ Reference photos 3-10 (protects both workers AND buyers)
  ✓ Motion tracking (data collection + bonus scoring)
  ✓ Environmental DNA (data collection + bonus scoring)
  ✓ Zone intelligence (bonus scoring when data exists)
  ✓ Side-by-side camera (best way to match reference photos)
  ✓ All fraud detection layers
```
