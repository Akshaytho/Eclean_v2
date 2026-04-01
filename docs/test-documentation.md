# eClean v2 — Test Documentation
# Image Capture Redesign: Unit Tests + Integration Tests

**Date:** March 31, 2026
**Branch:** image_capture_workflow
**Total Tests:** 181/181 PASSING
**New Tests Added:** 34 (12 unit + 22 integration)

---

# PART 1: UNIT TESTS — Rule Engine (12 Tests)

**File:** `backend/tests/rule-engine.test.ts`
**What it tests:** The pluggable scoring pipeline — pure functions, no database needed.
**Run time:** ~20ms (instant)

These tests simulate real human behavior by feeding different combinations of reference points, worker submissions, GPS scores, and time data into the rule engine, then verifying the score and decision.

---

## Test 1: Perfect Honest Worker

**What it does:**
Simulates a worker who does everything right — completes all 5 reference points, both verification photos, good GPS match (90-100), spends 45 minutes on a 15-minute expected task.

**What it checks:**
- Score >= 85 (AUTO_PASS threshold)
- Decision is AUTO_PASS
- Verification completeness: 20/20
- Photo coverage: 25/25
- Duplicate image check: 15/15 (all unique photos)
- No fraud flags

**Why this matters:**
Ensures honest workers aren't penalized. If this test fails, good workers would get sent to manual review unnecessarily.

---

## Test 2: Worker Skips Some Points (Partial Coverage)

**What it does:**
Worker captures only 3 out of 5 reference points. Both verification photos are done, but 2 regular points are missing.

**What it checks:**
- Photo coverage score drops to 15/25 (3/5 coverage)
- Overall score < 85 (won't AUTO_PASS)
- Decision is MANUAL_REVIEW

**Why this matters:**
Workers who do partial work shouldn't auto-pass. The buyer should review and decide.

---

## Test 3: Low Coverage Flag

**What it does:**
Worker captures only 2 out of 6 reference points (33% coverage).

**What it checks:**
- LOW_COVERAGE flag is raised
- Score significantly reduced

**Why this matters:**
Extremely low coverage should be flagged visibly so supervisors can prioritize review.

---

## Test 4: Rushed Job (3 Minutes for 5-Point Task)

**What it does:**
Worker completes all photos but only spends 3 minutes on a task that should take at least 15 minutes.

**What it checks:**
- Time on site score < 5/15
- LOW_TIME_ON_SITE flag is raised

**Why this matters:**
A worker who finishes a 5-point task in 3 minutes either rushed through without proper cleaning or submitted pre-taken photos.

---

## Test 5: GPS Mismatch (Possible Fraud)

**What it does:**
Worker submits photos with very low GPS match scores (0-15 out of 100) — meaning they're 200-500+ meters from the buyer's reference point locations.

**What it checks:**
- GPS proximity score < 5/25
- Fraud flags score < 10
- LOW_GPS_MATCH flag raised
- Decision is REJECT

**Why this matters:**
If the worker is photographing from a completely different location, they're likely not at the job site. This is the most common fraud vector.

---

## Test 6: Legacy Task (0 Reference Points)

**What it does:**
Tests a task created before the reference point system existed — no reference points, no worker submissions.

**What it checks:**
- Verification completeness: 20/20 (N/A = full marks)
- Photo coverage: 25/25 (no points to cover = full marks)
- GPS: 0/25 (no submissions)
- Time: 15/15 (enough time spent)
- Duplicate check: 15/15 (no submissions = no duplicates)
- Fraud flags: 10/10

**Why this matters:**
Old tasks must still work correctly. The reference point system must be backward compatible.

---

## Test 7: Missing Verification Photos

**What it does:**
Worker submits AFTER photos for all 3 points but skips both VERIFICATION photos (the 2 randomly selected proof-of-presence points).

**What it checks:**
- Verification completeness: 0/20 (0 out of 2 verification photos)

**Why this matters:**
Verification photos are mandatory — they prove the worker physically visited the exact spots the buyer photographed. Skipping them is a strong fraud signal.

---

## Test 8: Environmental DNA Bonus (High Match)

**What it does:**
Tests the EnvDNA bonus layer with environmentMatch = 92% (high match between buyer and worker sensor readings).

**What it checks:**
- env_dna score: 5/5 (bonus awarded)
- Total score is higher than without EnvDNA

**Why this matters:**
Environmental DNA (magnetometer, barometer, WiFi) provides location proof independent of GPS. A high match means the worker was at the same physical location as the buyer.

---

## Test 9: Environmental DNA (Low Match — No Penalty)

**What it does:**
Tests EnvDNA with match = 45% (low match).

**What it checks:**
- env_dna score: 0/5 (no bonus)
- Score is NOT reduced below what it would be without EnvDNA

**Why this matters:**
EnvDNA is bonus-only, never penalizes. Low match could mean sensor drift, different time of day, or device differences — not necessarily fraud.

---

## Test 10: Motion Signature Bonus (Active Cleaning)

**What it does:**
Tests motion data showing 65% cleaning activity, 20% walking, 10% standing, 5% vehicle.

**What it checks:**
- motion_signature score: 5/5 (cleaning > 50% = bonus)

**Why this matters:**
Accelerometer data proves the worker was physically doing cleaning work (rhythmic motion) rather than just standing or driving.

---

## Test 11: Motion Signature (Low Activity — No Penalty)

**What it does:**
Tests motion data showing 10% cleaning, 80% standing, 5% walking, 5% vehicle.

**What it checks:**
- motion_signature score: 0/5 (no bonus, but no penalty)

**Why this matters:**
Low cleaning activity might mean the worker was hand-sorting garbage (low accelerometer variance) — a valid cleaning method. We don't penalize, just don't give bonus.

---

## Test 12: Decision Thresholds

**What it does:**
Verifies the configured decision thresholds are correct.

**What it checks:**
- AUTO_PASS threshold: 85
- MANUAL_REVIEW threshold: 65
- Below 65: REJECT

**Why this matters:**
These thresholds determine which tasks get auto-approved, which need human review, and which get rejected. If they change accidentally, the system behavior changes.

---

# PART 2: INTEGRATION TESTS — Full Task Lifecycle (22 Tests)

**File:** `backend/tests/reference-points.test.ts`
**What it tests:** Complete buyer-to-worker-to-citizen flow against real PostgreSQL database.
**Run time:** ~3 seconds
**Dependencies:** PostgreSQL + Redis running, Cloudinary mocked, BullMQ mocked

These tests simulate the ENTIRE task lifecycle as real users would experience it — buyer creates task with reference photos, worker accepts and captures photos at each point, system verifies and scores, citizen validates.

---

## Test 1: Buyer Uploads 4 Reference Points with Labels and GPS

**What it does:**
Buyer creates a task, then uploads 4 reference point photos using multipart form data (same format as the mobile app). Each photo includes pointIndex, label, GPS coordinates.

**What it checks:**
- Each upload returns 201
- Each returned point has correct pointIndex and label
- task.totalReferencePoints updates to 4

**Simulates:** Buyer standing at a dirty location, taking 4 photos of different dirty spots and labeling them.

---

## Test 2: Rejects Duplicate pointIndex

**What it does:**
Tries to upload a reference point with pointIndex=1 when one already exists.

**What it checks:**
- Returns 400 Bad Request

**Simulates:** Mobile app bug that sends the same photo twice.

---

## Test 3: Worker Cannot Upload Reference Points

**What it does:**
Worker tries to upload a reference point photo.

**What it checks:**
- Returns 403 Forbidden

**Simulates:** A malicious worker trying to inject their own reference photos.

---

## Test 4: Lists All Reference Points

**What it does:**
Buyer requests all reference points for the task.

**What it checks:**
- Returns 4 reference points
- totalPoints = 4

---

## Test 5: Buyer Can Delete Reference Point Before Acceptance

**What it does:**
Buyer adds a 5th point, then deletes it. Checks the count goes back to 4.

**What it checks:**
- Delete returns 200
- totalReferencePoints goes back to 4
- Cloudinary image deleted

**Simulates:** Buyer accidentally photographed the wrong spot and wants to remove it.

---

## Test 6: Buyer Environmental DNA Captured

**What it does:**
Sends buyer's environmental fingerprint (magnetometer, barometer, ambient light, cell type) via the environment endpoint.

**What it checks:**
- Returns 201 with an ID

**Simulates:** Phone silently capturing sensor data when buyer takes reference photos.

---

## Test 7: Worker Accepts Task and Verification Points Selected

**What it does:**
Worker accepts the task. System randomly selects 2 of 4 reference points as verification points.

**What it checks:**
- Accept returns 200
- Exactly 2 points marked as isVerificationPoint = true (in database)

**Simulates:** Worker browsing open tasks, deciding to take this job. System secretly marks which spots they must photograph to prove presence.

---

## Test 8: Buyer Cannot Delete After Acceptance

**What it does:**
Buyer tries to delete a reference point after the worker has accepted.

**What it checks:**
- Returns 400 with message containing "accepted"

**Simulates:** Buyer trying to change the task scope after a worker committed to it.

---

## Test 9: Worker Sees Verification Flags Hidden

**What it does:**
Worker requests the reference points list.

**What it checks:**
- ALL points show isVerificationPoint = false

**Simulates:** The core anti-fraud mechanism — worker can't know which points are verification until they're physically close (within 50m GPS). Prevents gaming.

---

## Test 10: Worker Starts Task with GPS

**What it does:**
Worker starts the task (sends GPS coordinates).

**What it checks:**
- Task status transitions to IN_PROGRESS

**Simulates:** Worker arriving at the job site and pressing "Start Work".

---

## Test 11: Worker Environment Capture with Match Score

**What it does:**
Worker's phone sends environmental fingerprint on task start.

**What it checks:**
- Returns 201
- matchScore > 0 (compared to buyer's fingerprint from Test 6)

**Simulates:** Silent sensor capture when worker opens the task screen. Phone reads magnetometer, barometer, light level — compared to buyer's readings to verify same location.

---

## Test 12: Worker Captures AFTER Photos for Each Point

**What it does:**
Worker uploads a photo for each of the 4 reference points. For verification points, submits as both AFTER and VERIFICATION.

**What it checks:**
- Each upload returns 201
- locationMatchScore >= 0 (GPS distance calculated)
- Verification points get VERIFICATION media type

**Simulates:** Worker going to each dirty spot, opening the side-by-side camera, matching the buyer's angle, and capturing a clean photo.

---

## Test 13: Cannot Submit VERIFICATION for Non-Verification Point

**What it does:**
Worker tries to submit a VERIFICATION photo for a point that wasn't randomly selected as a verification point.

**What it checks:**
- Returns 400 with "not a verification point"

**Simulates:** A worker trying to game the system by marking all their photos as "verification" to bypass checks.

---

## Test 14: Idempotent Upload Returns Same Submission

**What it does:**
Uploads the same photo twice with the same Idempotency-Key header.

**What it checks:**
- Both return 201
- Both return the same submission ID

**Simulates:** Mobile app retrying a failed upload (network timeout). Without idempotency, the same photo would be counted twice.

---

## Test 15: Submission Progress Shows Correct Counts

**What it does:**
Fetches the submission progress endpoint after all photos are uploaded.

**What it checks:**
- totalPoints = 4
- verificationRequired = 2
- verificationCompleted = 2
- afterCompleted = 4
- canSubmit = true

**Simulates:** Worker checking their progress on the ReferencePointNavigator screen to see if they can submit.

---

## Test 16: Verification Points Revealed at Close GPS

**What it does:**
Fetches progress with workerLat/workerLng that exactly matches a verification point's GPS.

**What it checks:**
- That specific point shows isVerificationPoint = true

**Simulates:** Worker walking to within 50m of a verification point — the app reveals "VERIFY" badge, telling them this is a spot-check point.

---

## Test 17: Motion Summary Saved (Honest Pattern)

**What it does:**
Sends motion summary: 65% cleaning, 20% walking, 10% standing, 5% vehicle.

**What it checks:**
- Returns 201
- hasRedFlag = false
- hasYellowFlag = false

**Simulates:** Worker's phone background accelerometer data showing a healthy cleaning work pattern.

---

## Test 18: Motion Summary Flags Suspicious Data

**What it does:**
Creates a motion summary with 80% standing, 5% cleaning.

**What it checks:**
- hasRedFlag = true (standing > 70%)
- hasYellowFlag = true (standing > 40%)

**Simulates:** Worker who stood around for most of the task — likely took photos without actually cleaning.

---

## Test 19: Worker Submits Successfully

**What it does:**
Worker submits the task after all verification + after photos are captured.

**What it checks:**
- Returns 200
- Task status = SUBMITTED
- Rule engine score > 0
- finalDecision is set

**Simulates:** Worker pressing "Submit Work" after capturing all reference point photos. Backend validates completeness, runs rule engine scoring.

---

## Test 20: Citizen Submits CLEAN Verification

**What it does:**
First approves the task as buyer, then a citizen submits a "CLEAN" rating.

**What it checks:**
- Returns 201
- Rating = CLEAN
- Reward amount = 200 paise (Rs 2, no photo)
- Message contains reward amount

**Simulates:** A random citizen walking past the cleaned area 24 hours later, confirming it's still clean. They earn Rs 2 for the rating.

---

## Test 21: Citizen Cannot Verify Same Task Twice

**What it does:**
Same citizen tries to verify the same task again.

**What it checks:**
- Returns 400 with "already verified"

**Simulates:** Prevents citizens from spamming verifications to earn multiple rewards.

---

## Test 22: Buyer Cannot Verify Own Task

**What it does:**
Buyer tries to submit a citizen verification for their own task.

**What it checks:**
- Returns 403 (buyer role doesn't have CITIZEN access)

**Simulates:** Prevents buyers from gaming the citizen mesh by verifying their own tasks.

---

# SCORING SUMMARY

## Rule Engine Layer Weights (Total: 125 max)

| Layer | Max Points | Category | What it measures |
|-------|-----------|----------|-----------------|
| Verification Completeness | 20 | Core | Did worker capture all verification spot-check photos? |
| Photo Coverage | 25 | Core | What % of reference points have after photos? |
| GPS Proximity | 25 | Core | Average distance between worker and buyer GPS per point |
| Time on Site | 15 | Core | Did worker spend reasonable time for this task size? |
| Duplicate Image Check | 15 | Core | Are worker photos different from buyer reference photos? |
| GPS Fraud Flags | 10 | Core | Any photos from very far away (>500m)? |
| Environmental DNA | 5 | Bonus | Do sensor readings match between buyer and worker? |
| Motion Signature | 5 | Bonus | Does accelerometer show cleaning activity? |
| Citizen Mesh | 5 | Bonus | Did citizens confirm area is clean? |

## Decision Thresholds

| Normalized Score | Decision | What happens |
|-----------------|----------|-------------|
| >= 85% | AUTO_PASS | Instant payment (requires AI confirmation too) |
| 65-84% | MANUAL_REVIEW | Buyer/supervisor reviews paired photos |
| < 65% | REJECT | Auto-rejected with explanation |
