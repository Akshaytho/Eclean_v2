# eClean — Feature Design Document

---

## HOW TO USE THIS DOCUMENT (Read this first — every session)

This document is the single source of truth for eClean feature design.

When Akshay says "let's work on [feature name]", do the following:
1. Read the relevant feature section in this document
2. Understand the full flow, edge cases, and test cases before touching any code
3. When redesigning the UI, implement the flow exactly as described here
4. When testing, run BOTH the individual feature tests AND the combined scenario tests at the bottom
5. If Akshay describes a change to a feature during the session, update this document before ending the session

Features are designed here BEFORE they are built. Do not build anything not described here without discussing with Akshay first.

---

## Feature List

1. **Auth & User Verification** (Splash → Onboarding → Register → Login)
2. Worker Task Flow (GPS-locked, state machine)
3. AI Verification System (Triple-lock: GPS + Timestamp + AI)
4. Structured Job Posting (Buyer side)
5. Payment & Dispute Flow
6. Worker Task Preview & Scope Lock
7. Checklist-Based Sub-Tasks

---

## Feature 1: Auth & User Verification

### Description
The complete auth journey from first open to reaching a role-specific home page. Covers new user registration, returning user login, and all edge cases in between. UI uses the calm gradient design system (Nunito + Plus Jakarta Sans fonts, floating blobs, pill buttons).

### Screens & Routes

| Screen | Route | Who Sees It |
|--------|-------|-------------|
| Splash | `/` (unauthenticated) | Everyone, every time |
| Onboarding | `/onboarding` | New users (from Get Started button) |
| Register — Role | `/register` step 1 | New user picks role |
| Register — Email | `/register` step 2 | New user enters email |
| Register — Profile | `/register` step 3 | New user sets name + password |
| Register — Welcome | `/register` step 4 | Success screen before role home |
| Login | `/login` | Returning users |
| Forgot Password | `/forgot-password` | User who forgot password |
| Reset Password | `/reset-password?token=xyz` | Via email link |
| Verify Email | `/verify-email?token=xyz` | Via email link |

### Full Registration Flow

```
Open app → Splash (logo animation, 2.2s) → buttons appear
  → "Get Started Free" → /onboarding
      Slide 1: Civic Impact (swipe or tap arrow)
      Slide 2: AI Powered
      Slide 3: Fast Earnings → taps arrow → /register

  /register — Step 1: Role Selection
    → Pick WORKER / BUYER / CITIZEN
    → Card highlights with color glow on selection
    → "Continue →" → Step 2

  Step 2: Email Entry
    → Shows selected role pill at top
    → Enter email address (validated format)
    → Green tick appears when valid
    → "Continue →" → Step 3

  Step 3: Profile Setup
    → Shows role pill + email at top
    → Enter full name
    → Create password (min 6 chars)
    → Password strength bar (4 segments: weak/fair/good/strong)
    → T&C notice
    → "Create My Account →" → calls POST /auth/register API
    → On success → Step 4

  Step 4: Welcome Screen
    → Animated success ring (popIn animation)
    → "Welcome, [FirstName] 🎉"
    → Role-specific perks list (3 items)
    → "Let's Get Started →" → navigates to role home
      WORKER → /worker
      BUYER  → /buyer
      CITIZEN → /citizen
```

### Full Login Flow

```
Open app → Splash → "I have an account" → /login

  /login
    → Enter email + password
    → Show/hide password toggle
    → "Forgot password?" link → /forgot-password
    → "Sign In →" → calls POST /auth/login API
    → On success → navigate to role home based on user.role
    → "Create new account" outline button → /register
```

### Role-Based Redirect (Already Authenticated)

```
User opens app at "/" with valid token → immediately navigate to role home
BUYER      → /buyer
WORKER     → /worker
SUPERVISOR → /supervisor
ADMIN      → /admin
CITIZEN    → /citizen
```

### Password Reset Flow

```
/forgot-password → enter email → POST /auth/forgot-password → "check your inbox" screen
User clicks email link → /reset-password?token=xyz
  → enter new password → POST /auth/reset-password → redirect to /login
```

### Design System (DO NOT change these without updating this doc)

- **Fonts**: Nunito (headings, buttons) + Plus Jakarta Sans (body, inputs)
- **Background**: `GRAD.calm = linear-gradient(160deg, #EEF4FF 0%, #F0EDFF 50%, #E6FAF4 100%)` for all inner screens
- **Splash background**: `GRAD.hero = linear-gradient(160deg, #0f1a2e 0%, #162240 50%, #1a2f5a 100%)`
- **Animations**: fadeUp, scaleUp, floatY (blobs), popIn (welcome check), waveIn (slide card)
- **Buttons**: pill-shaped (borderRadius 99), gradient fill, white text, blue glow shadow
- **Inputs**: borderRadius 16, focus ring `rgba(74,142,245,.18)`, error ring `rgba(239,68,68,.15)`
- **Role colors**: WORKER=mint(#34C896), BUYER=sky(#4A8EF5), CITIZEN=lav(#9B87F5)

### Edge Cases

- User already logged in opens `/` → redirect to role home immediately (no splash)
- User taps "Get Started" on splash → onboarding. User taps "I have an account" → login directly
- User on onboarding taps "Skip →" → /login
- User on onboarding taps "Sign in" link → /login
- Email already registered → backend returns error, shown in profile step with ⚠️ alert
- Weak password → strength bar shows red "Too weak", but does NOT block submission (min 6 chars is the only hard rule)
- Back button on each register step goes to previous step (not browser back)
- Back button on login goes to `/` (splash)
- Network error during register → error shown in profile step, user can retry without re-entering data
- Token expired when user opens app → ProtectedRoute redirects to /login

### Test Cases (Individual)

- [ ] Splash logo animates in (phase 0 → 1 at 700ms)
- [ ] Splash buttons appear at 2.2s (phase 2)
- [ ] "Get Started" → navigates to /onboarding
- [ ] "I have an account" → navigates to /login
- [ ] Onboarding slides advance on arrow tap
- [ ] Onboarding slides advance on right swipe
- [ ] Onboarding slides go back on left swipe
- [ ] "Skip →" on any slide → /login
- [ ] Last slide arrow → /register
- [ ] Role cards highlight with correct color on selection
- [ ] "Continue →" disabled until a role is selected
- [ ] Email validation: invalid email shows error, valid shows green tick
- [ ] Continue on email step disabled until valid email
- [ ] Name validation: empty or 1 char shows error
- [ ] Password < 6 chars shows error
- [ ] Password strength bar shows correct color for each level
- [ ] API error from register shows ⚠️ message in profile step
- [ ] Successful register navigates to correct role home
- [ ] Welcome screen shows correct first name
- [ ] Welcome perks match the selected role
- [ ] Login with wrong credentials shows error
- [ ] Login with correct credentials navigates to role home
- [ ] Show/hide password toggle works on login
- [ ] "Forgot password?" navigates to /forgot-password
- [ ] Authenticated user at "/" redirects to role home without showing splash
- [ ] ProtectedRoute redirects unauthenticated user to /login

---

## Feature 2: Worker Task Flow

### Description
When a worker accepts a task, they follow a locked step-by-step flow. Each step is gated — the next step cannot begin until the current one is complete. Everything is logged with GPS + timestamp.

### State Machine
```
ACCEPTED
  → NAVIGATING        (worker opens route to job location)
  → ARRIVED           (GPS auto-detects worker within 200m of job)
  → WORKING           (worker clicks "Start Work")
  → PHOTOS_SUBMITTED  (before + after photos uploaded)
  → AI_REVIEW         (AI scores the work)
  → COMPLETED         (score ≥ 65, payment releases in 24h)
  → DISPUTED          (buyer raises dispute with counter-evidence)
```

### Step-by-Step Flow

**Step 1: Task Accepted (next day job)**
- Worker sees task card with: job type, location, pay, checklist, buyer photos, time window
- Worker can message buyer from this screen
- Only button enabled: "Navigate to Location" (opens Google Maps / Apple Maps)

**Step 2: Navigating**
- Route map opens in native maps app
- App runs background GPS check every 30 seconds
- When worker is within 200m of job location → auto-triggers ARRIVED state
- Notification: "You've arrived at the job location"

**Step 3: Arrived**
- Worker is not forced to start immediately
- Enabled: "Message Buyer", task details, checklist view
- Enabled: "Start Work" button
- Not yet enabled: camera for photos

**Step 4: Start Work clicked**
- Logs: work_started_at (timestamp + GPS)
- GPS coordinates locked to session — all subsequent photos must match this location
- Before-photo camera opens immediately
- Worker must upload at least minimum required before-photos (based on job type) before proceeding

**Step 5: Before Photos**
- Camera is GPS-tagged and timestamp-locked
- Worker cannot upload from gallery — must take live photo
- AI pre-checks: before photo must show uncleaned/dirty state (rejects if it looks already clean)
- After minimum before-photos are uploaded → checklist items unlock

**Step 6: Do the Work**
- Worker completes each checklist item
- Can take additional notes or message buyer mid-task
- After-photo camera is locked until minimum time has passed (based on job type)

**Step 7: After Photos**
- Same GPS + timestamp lock as before photos
- Must be taken at same location as before photos
- AI pre-checks: after photo must show improvement over before photo
- After all after-photos uploaded → "Submit for Review" button unlocks

**Step 8: Submit**
- Worker reviews all before + after photos
- Confirms checklist items completed
- Submits — triggers AI_REVIEW state

### Minimum Work Duration (per job type)
| Job Type | Minimum Duration Before After-Photos Unlock |
|----------|---------------------------------------------|
| Basic sweep / tidy | 10 minutes |
| Regular clean (1-2 rooms) | 20 minutes |
| Deep clean (apartment) | 45 minutes |
| Deep clean (house/office) | 90 minutes |
| Drain / outdoor | 30 minutes |
| Post-construction | 120 minutes |

If worker submits under minimum: not blocked, but flagged for human review.

### Data Logged Per Task
```
task_id, worker_id, buyer_id
accepted_at: timestamp
navigation_started_at: timestamp + worker_location
arrived_at: timestamp + gps_coords
work_started_at: timestamp + gps_coords
before_photos: [{ url, gps_lat, gps_lng, timestamp, exif_data }]
after_photos: [{ url, gps_lat, gps_lng, timestamp, exif_data }]
work_duration_minutes: (work_started_at → photos_submitted_at)
checklist_completed: [{ item_id, completed_at }]
ai_score: 0-100
ai_flags: []
submitted_at: timestamp
auto_release_at: submitted_at + 24h
final_status: COMPLETED / DISPUTED
```

### Edge Cases
- GPS signal weak (basement/indoors): App shows warning, asks worker to move to open area. If still weak after 60s, allows manual confirm with flagging note on record.
- Worker arrives but buyer is not available: Worker can wait, message buyer. If buyer doesn't respond in 30 min, worker can cancel without penalty.
- Worker starts work but realizes job is different from description: Worker clicks "Report Scope Change", messages buyer. Buyer must confirm or update task. Worker is not penalized for canceling at this point.
- Job takes much longer than expected: No hard stop. Worker can continue. System logs total duration.
- Network drops mid-task: Photos saved locally, uploaded when connection restores. Timestamps are from photo capture time, not upload time.
- Worker accidentally submits before finishing: Can recall submission within 5 minutes if buyer hasn't reviewed yet.

### Test Cases (Individual)
- [ ] Worker cannot open camera until "Start Work" is clicked
- [ ] Worker cannot upload after-photos before before-photos
- [ ] Worker cannot submit without minimum required photos
- [ ] Photos taken outside 200m radius are rejected
- [ ] Gallery photos (no live EXIF) are rejected
- [ ] Work_duration_minutes is calculated correctly
- [ ] Fast submission (under minimum duration) gets flagged, not blocked
- [ ] GPS weak fallback works and adds flag to record
- [ ] State cannot go backwards (WORKING cannot revert to ARRIVED)

---

## Feature 3: AI Verification System

### Description
After photos are submitted, the AI analyses the before/after pairs and produces a cleanliness score (0-100). The score determines whether payment auto-releases, whether the task needs more evidence, or whether it goes to human review.

### Triple-Lock Verification
All 3 must pass for work to be considered verified:
1. **GPS Lock** — photos taken at job location (within 200m)
2. **Time Lock** — photos timestamped within task window
3. **AI Lock** — before/after comparison shows improvement

### Scoring Thresholds
| Score | Result |
|-------|--------|
| 65–100 | Auto-approved. Payment releases in 24h unless buyer disputes. |
| 40–64 | Flagged. Worker gets one retry: 30-minute window to add more photos. |
| 0–39 | Rejected. Worker notified with specific feedback. Buyer notified. |

### AI Verification Page (Worker View)
Shows in real time:
- Location verified ✓ / ✗
- Photos timestamped correctly ✓ / ✗
- Before state detected ✓ / ✗
- After improvement detected ✓ / ✗
- Final score: XX/100
- Status: Approved / Needs more photos / Rejected
- If retry: which areas need more evidence (specific checklist items)

### Photo Requirements (Dynamic by Job Type)
| Job Type | Minimum Before Photos | Minimum After Photos |
|----------|----------------------|---------------------|
| Single room | 3 | 3 |
| 2-4 rooms | 1 per room | 1 per room |
| Large area / floor | Zone-mapped: 1 per zone | 1 per zone |
| Outdoor | GPS-route + 1 photo per 10 min of work | Same |
| Checklist-based | 1 per checklist item | 1 per checklist item |
| High-value (> ₹2000) | Standard + 60-sec video walkthrough | — |

### Human Review Queue
- Score 40–64 after retry → goes to eClean human review
- Any task flagged by GPS / timestamp checks → human review
- Worker submits under minimum duration → human review
- Resolution target: within 4 hours during business hours

### Edge Cases
- Before photo looks already clean (worker didn't capture dirty state): AI flags this. Worker asked to confirm and re-upload.
- After photo looks same as before (no improvement detected): Score penalized. Worker gets specific feedback.
- Multiple photos but only some areas improved: Score reflects percentage of checklist items visibly completed.
- AI confident but wrong (worker disputes rejection): Worker can request human review within 24h.
- High-value task video is too dark / blurry: Worker asked to re-record.

### Test Cases (Individual)
- [ ] Score ≥ 65 triggers 24h payment release timer
- [ ] Score 40–64 opens retry window with specific feedback
- [ ] Score < 40 sends rejection notification to worker
- [ ] Retry after additional photos recalculates score
- [ ] Tasks flagged by GPS/timestamp go to human review queue
- [ ] Human review decision is logged and visible to both parties
- [ ] Worker can request human review within 24h of AI rejection

---

## Feature 4: Structured Job Posting (Buyer)

### Description
Buyers cannot post free-form task descriptions. They must fill a structured form. The form ensures workers have complete information before accepting, and ensures AI has enough context to verify.

### Mandatory Fields
1. Job category (dropdown): deep clean / regular clean / drain / outdoor / post-construction / other
2. Location type: apartment / house / office / retail / public space
3. Number of rooms / zones (number input)
4. Approximate area in sqft
5. Specific problem areas (multi-select checklist): bathroom / kitchen / living room / balcony / drain / etc.
6. Minimum 2 photos of problem areas (upload required — listing cannot go live without this)
7. Equipment available on-site: yes / no (if yes, what: mop / vacuum / cleaning supplies / etc.)
8. Hazardous materials present: yes / no
9. Access instructions (text, max 200 chars): key with security / call on arrival / door is open / etc.
10. Preferred time window
11. Budget (fixed or open to negotiation)

### Listing Goes Live Only When
- All mandatory fields filled
- Minimum 2 photos uploaded
- Budget is set

### Edge Cases
- Buyer posts incorrect area size: Worker can flag mismatch on arrival. Becomes a scope dispute.
- Buyer's photos don't match actual condition on arrival (much worse): Worker can report, task paused for buyer response.
- Buyer changes details after worker accepts: Not allowed. Scope is locked on acceptance.

### Test Cases
- [ ] Listing form cannot be submitted without 2 photos
- [ ] Listing form cannot be submitted without all mandatory fields
- [ ] Listing is visible to workers only after all fields are complete
- [ ] Buyer cannot edit job details after worker accepts

---

## Feature 5: Payment & Dispute Flow

### Description
Payment is held in escrow from the moment a worker starts the task. AI is the primary arbiter of payment release. Buyers can dispute but cannot unilaterally reject verified work.

### Payment Flow
```
Buyer posts task → Payment held in escrow
Worker completes + submits → AI scores
Score ≥ 65 → 24h timer starts → Auto-releases to worker
Score < 65 → Flagged (see Feature 2)
```

### Dispute Flow (Buyer)
- Buyer can raise a dispute within 24h of submission
- Dispute requires: at least 2 counter-photos showing what's wrong + written description
- Dispute pauses the 24h auto-release timer
- eClean mediator reviews: all worker photos, AI score, buyer counter-evidence
- Resolution: worker paid in full / partial refund / full refund
- Timeline: resolved within 48h

### Strike System (Buyers)
- Dispute overturned in worker's favor → 1 strike on buyer account
- 3 strikes → account under review
- 5 strikes → account suspended, existing tasks cancelled, refunds issued

### Partial Completion
- If checklist-based task: payment proportional to items verified complete
- Example: 8/10 checklist items verified → worker paid 80% of agreed amount

### Edge Cases
- Buyer raises dispute after 24h (payment already released): Can file a complaint but payment is not reversed. Goes to review for future account action.
- Worker disputes AI rejection: Worker requests human review, 4h resolution window.
- Network failure during escrow release: Retry mechanism, payment eventually releases.
- Buyer account has insufficient funds at payment time: Task is blocked at posting stage — payment must be pre-authorized.

### Test Cases
- [ ] Payment is held in escrow at task posting
- [ ] Score ≥ 65 starts 24h auto-release timer
- [ ] Timer pauses when buyer raises dispute
- [ ] Dispute without counter-photos is rejected
- [ ] Overturned dispute adds strike to buyer account
- [ ] 3 strikes triggers account review notification
- [ ] Partial payment calculated correctly from checklist completion
- [ ] Pre-authorization check runs at task posting

---

## Feature 6: Worker Task Preview & Scope Lock

### Description
Before accepting a task, workers see the full job details. After accepting, the scope is locked — buyers cannot add requirements.

### Worker Preview Screen (Before Accepting)
Shows:
- Job category + location type
- All buyer-uploaded photos (full size, swipeable)
- Checklist of required areas/items
- Area size + number of rooms
- Equipment available on-site
- Access instructions
- Estimated time (calculated from job type + area)
- Pay amount
- Buyer rating + dispute history

### Pre-Accept Question
- Worker can send 1 clarifying question to buyer before accepting
- Buyer has 2 hours to respond
- If no response: worker can accept anyway or skip task
- Question and answer are logged and visible to eClean

### Scope Lock
- Once worker accepts, job details are frozen
- Buyer cannot add rooms, areas, or checklist items
- Buyer cannot reduce pay
- If buyer tries to add scope during task: worker receives notification, can accept new scope as a separate task or ignore

### Edge Cases
- Worker accepts based on photos but actual condition is much worse on arrival: Worker can report mismatch, task paused. eClean reviews. Worker not penalized for refusing to proceed.
- Buyer adds a small reasonable request mid-task (e.g., "can you also wipe the shelf?"): Worker's choice, no obligation. If worker does it, no extra pay unless agreed via message.
- Worker asks question, buyer gives misleading answer: Worker can raise this in dispute with message log as evidence.

### Test Cases
- [ ] Worker sees all buyer photos before accepting
- [ ] Worker can send question, buyer receives notification
- [ ] Buyer cannot edit task after worker accepts
- [ ] Worker receives notification if buyer attempts to edit after acceptance
- [ ] Pre-accept question + answer is visible in task history

---

## Feature 7: Checklist-Based Sub-Tasks

### Description
Complex jobs are broken into a checklist of sub-tasks at posting time. Each sub-task requires its own before/after photo. This enables partial payment and precise AI verification.

### How It Works
- Buyer defines checklist items when posting (e.g., "Clean bathroom", "Mop kitchen", "Clear drain")
- Each item has: description, optional reference photo, minimum 1 before + 1 after photo required
- Worker checks off items as they complete them
- AI verifies each item independently
- Payment is proportional to verified items (unless buyer set "all or nothing")

### Checklist Item States
```
PENDING → IN_PROGRESS → PHOTOS_UPLOADED → AI_VERIFIED → PAID
                                        → AI_REJECTED → RETRY / DISPUTED
```

### Edge Cases
- Worker cannot complete 1 item (e.g., broken equipment on site): Worker marks item as "blocked", adds reason + photo of blocker. Not penalized if blocker is genuine.
- Buyer marks all items as mandatory but worker completes 9/10: Full dispute process for the 1 uncompleted item. 9/10 payment auto-releases.
- Two workers on same task (large job): Each worker has their own checklist subset. Separate verification per worker.

### Test Cases
- [ ] Checklist items appear in worker view after "Start Work"
- [ ] Each item requires before + after photos independently
- [ ] AI scores each item separately
- [ ] Partial payment calculated per verified item
- [ ] Blocked item with photo evidence does not penalize worker
- [ ] "All or nothing" flag holds full payment until all items verified

---

## Combined Scenario Tests

These test how features work together across buyer + worker + AI + admin.

### Scenario 0: New User Registration → First Task (Auth + Worker Task Flow)
1. New user opens app → sees Splash animation
2. Taps "Get Started Free" → Onboarding (3 slides)
3. Taps arrow on slide 3 → Register: picks WORKER role
4. Enters email, sets name + password → account created
5. Sees Welcome screen with worker perks → taps "Let's Get Started"
6. Lands on /worker home — sees available tasks nearby
7. Taps a task → previews job details + buyer photos → accepts
8. Next morning: opens task, taps "Navigate" → GPS route opens
9. Arrives at location → "Start Work" unlocks
10. Completes work, uploads before + after photos
11. AI scores 72/100 → approved → payment releases in 24h

Expected: Smooth first-time user journey. No errors. User reaches role home immediately after welcome.

### Scenario 0b: Returning User Login → Post Task (Auth + Buyer Task Flow)
1. Returning buyer opens app → sees Splash
2. Taps "I have an account" → /login
3. Enters email + password → lands on /buyer home
4. Taps "Post Task" → fills structured job form with 2 photos
5. Task goes live → worker accepts → work completed → buyer approves

Expected: Login takes <5s. Buyer immediately lands on correct role home with no redirect loop.

### Scenario 0c: Wrong Role After Login
1. User registered as WORKER but tries to access /buyer manually
2. RoleRoute detects role mismatch → redirects to /worker home
3. No error page shown — silent redirect to correct home

Expected: Role enforcement works silently. User lands on their correct home.

### Scenario 1: Normal Happy Path
1. Buyer posts structured job with 3 photos and checklist
2. Worker previews, asks 1 question, buyer responds, worker accepts
3. Worker navigates, GPS detects arrival
4. Worker starts work, uploads before photos
5. Worker completes checklist, uploads after photos
6. AI scores 78/100 — approved
7. Buyer does nothing — 24h passes — payment auto-releases
8. Both accounts updated: buyer spent, worker earned

Expected: No human intervention required. Full audit log saved.

### Scenario 2: Buyer Bad Faith Rejection
1. Worker completes job — AI scores 81/100
2. Buyer raises dispute without counter-photos
3. Dispute rejected (no evidence)
4. Buyer tries again with 2 photos showing "issue"
5. eClean mediator reviews — AI score + worker photos win
6. Buyer gets strike, payment releases to worker

Expected: Worker paid. Buyer strike logged. Dispute resolution within 48h.

### Scenario 3: Worker Submits Fake Photos
1. Worker takes photos outside job location
2. GPS lock rejects photos (location mismatch)
3. Worker cannot proceed past photo upload
4. Task remains in WORKING state
5. Worker misses task deadline → task auto-cancelled
6. Worker gets a strike (1 failed task)

Expected: Buyer refunded. Worker penalized. Log shows GPS rejection.

### Scenario 4: Partial Completion
1. 10-item checklist job
2. Worker completes 8 items with verified photos
3. 2 items blocked (drain — equipment not available on site)
4. Worker marks 2 items blocked with photos of clogged drain tool
5. AI verifies 8 items at 74/100 average
6. 80% payment releases after 24h
7. Buyer receives 20% refund

Expected: Partial payment correct. Blocked items documented. No penalty on worker.

### Scenario 5: GPS Signal Lost Mid-Task
1. Worker starts task, GPS confirmed at location
2. During task, GPS signal drops (basement job)
3. Worker takes after photos — GPS weak warning shown
4. Worker confirms location manually
5. Task flagged for human review (GPS gap noted)
6. Human reviewer checks start GPS + photos — confirms legit
7. Payment releases (delayed by review time, ~4h)

Expected: Worker not penalized for genuine GPS issue. Review resolves correctly.

### Scenario 6: Buyer Cancels After Worker Arrives
1. Worker navigates and arrives at job location
2. Buyer cancels task after worker arrival
3. Worker receives cancellation fee (X% of task value for wasted travel)
4. Task marked CANCELLED_BY_BUYER
5. Buyer account notes cancellation (3 late cancellations = strike)

Expected: Worker compensated for travel. Buyer accountability tracked.

---

## Version History
- 2026-03-26: Initial document created. Features 1–6 designed. Combined scenarios written.
- 2026-03-26: Added Feature 1 (Auth & User Verification). Renumbered all features. Added auth combined scenarios (0, 0b, 0c). Auth UI built and deployed.

---

*This document is maintained by Akshay (founder) and updated every session where features are discussed or changed.*
