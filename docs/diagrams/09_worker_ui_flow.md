# Worker UI Redesign — Task Discovery to Submission

> **Version 2 — Post-review with Ravi Test applied**
> Every screen now answers: "What does Ravi do when this doesn't work?"

## Context
The current worker UI was built screen-by-screen across sprints without a unified UX vision. Screens are slow (5 API calls on mount), camera preview takes 5 seconds, and the flow between screens feels disconnected. Target users are daily wage cleaners in Indian cities using ₹8,000-12,000 budget phones — they know Ola, Zomato, Rapido. The UI must be that simple.

**The Ravi Test (from reviewer):** Every screen must be designed for a worker named Ravi in Kondapur — budget Redmi phone, 38C heat, sweaty hands, barely visible screen in sunlight. The happy path gets downloads. The unhappy path gets retention.

---

## Design Principles

| Principle | Why | Example App |
|-----------|-----|-------------|
| **Map-first, text-last** | Workers think in locations, not lists | Ola/Uber driver app |
| **Big touch targets (48px+)** | Sweaty hands, outdoor sunlight, moving | Rapido |
| **Color = meaning, not decoration** | Green = money/go, Red = stop, Orange = waiting | Zomato order tracking |
| **Progress bar always visible** | "Where am I in this process?" reduces anxiety | Blinkit delivery |
| **One action per screen** | Don't make them choose between 5 things | Rapido accept screen |
| **Bottom sheet > new screen** | Keeps context, faster, feels lighter | Google Maps |
| **Skeleton loading, not spinners** | Feels faster even if it's not | Instagram |
| **Design for failure first** | Empty states, offline, GPS drift, battery death | **NEW** |
| **Transparent data exchange** | Tell worker WHY you collect data, what they get | **NEW** |
| **Build identity, not just income** | Levels, streaks, progression = retention | Swiggy/Rapido |

---

## SCREEN 1: WORKER HOME

**Redesign: "Rapido driver home" — one card, one action**

```
┌─────────────────────────────────────┐
│ eClean               🔔 3          │  App header + notification bell
├─────────────────────────────────────┤
│                                     │
│   Good morning, Ravi                │  Time-based greeting
│   🥉 Bronze Worker • 23 days       │  ← NEW: Level + days on platform
│                                     │
│  ┌─ THIS WEEK ─────────────────────┐│
│  │                                 ││
│  │  ₹4,800                        ││  ← Weekly earnings (not daily)
│  │  ━━━━━━━━━━━━━░░░ ₹6,000 goal  ││  ← Progress bar to weekly target
│  │                                 ││
│  │  In your account    Coming soon ││  ← Only 2 states (not 3)
│  │       ₹3,200          ₹1,600   ││     "Available" + "Pending+Processing"
│  └─────────────────────────────────┘│
│                                     │
│  ┌─ ACTIVE TASK ───────────────────┐│  Shows ONLY if task exists
│  │ 🟢 Road Cleaning               ││
│  │    Kondapur  •  1.2 km away     ││
│  │    ₹200  •  ⏱ 12:34 elapsed    ││
│  │                                 ││
│  │  ┌──────────────────────────┐   ││
│  │  │    CONTINUE TASK  →      │   ││  Big green button
│  │  └──────────────────────────┘   ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─ FIND WORK ─────────────────────┐│  Shows ONLY if NO active task
│  │  🔍  8 tasks within 5 km       ││
│  │                                 ││
│  │  ┌──────────────────────────┐   ││
│  │  │    FIND WORK  →          │   ││  Big green button
│  │  └──────────────────────────┘   ││
│  └─────────────────────────────────┘│
│                                     │
│  ╔═ EMPTY STATE (0 tasks) ═════════╗│  ← NEW: When no tasks exist
│  ║                                 ║│
│  ║  No tasks right now             ║│
│  ║  We'll notify you when work     ║│
│  ║  appears within 5 km.           ║│
│  ║                                 ║│
│  ║  📊 Tomorrow forecast:          ║│  ← Based on last week's data
│  ║  ~3-5 tasks expected in your    ║│     Gives reason to come back
│  ║  area (based on last week)      ║│
│  ║                                 ║│
│  ║  ⚙ Expand search to 10 km?     ║│  ← Action, not dead end
│  ╚═════════════════════════════════╝│
│                                     │
│  ┌─ YOUR PROGRESS ────────────────┐│  ← NEW: Not just stats, a story
│  │  ⭐ 4.8 rating                  ││
│  │  ✅ 47 tasks (94% approved)     ││  ← Approval RATE, not just count
│  │  🥉→🥈 12 more tasks to Silver  ││  ← Progress to next level
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
│  🏠    🔍    📋    👤              │
│  Home  Find  Tasks  Profile         │
```

**Changes from v1:**
- Weekly earnings with target bar (not daily snapshot)
- Only 2 money states: "In your account" + "Coming soon" (not Available/Pending/Processing)
- Empty state with forecast + expand radius action (not dead end)
- Worker level + progression ("12 more tasks to Silver")
- Approval rate shown (94%) — builds confidence

---

## SCREEN 2: FIND WORK

**"Uber driver nearby rides" — map with earnings on pins**

```
┌─────────────────────────────────────┐
│         ← Find Work    ⊕ Filter     │
├─────────────────────────────────────┤
│                                     │
│     ┌───────────────────────┐       │
│     │                       │       │
│     │      MAP VIEW         │       │
│     │                       │       │
│     │   📍₹200  📍₹150     │       │  Pins show PRICE
│     │       📍₹300          │       │  Color = dirty level
│     │            📍₹180     │       │  Green/Orange/Red
│     │    🔵 (you)           │       │
│     │                       │       │
│     │   ───── 5 km ─────   │       │
│     └───────────────────────┘       │
│                                     │
│  ┌─ NEAREST TASKS ─────── 8 found ┐│  Bottom sheet (draggable)
│  │                                 ││
│  │  ┌──── Task Card ─────────────┐││
│  │  │ Road Cleaning         ₹200 │││  Rate on right
│  │  │ 📍 Kondapur • 1.2 km      │││  Distance
│  │  │ 🟠 MEDIUM • 4 photos      │││  Dirty level + photo count
│  │  │ ⏰ 7:00 AM - 11:30 AM     │││  Work window
│  │  └────────────────────────────┘││
│  │                                 ││
│  └─────────────────────────────────┘│
│                                     │
│  ╔═ EMPTY STATE ═══════════════════╗│  ← NEW
│  ║  No tasks in 5 km range         ║│
│  ║                                 ║│
│  ║  ┌──────────────────────────┐  ║│
│  ║  │  Expand to 10 km         │  ║│  Action button
│  ║  └──────────────────────────┘  ║│
│  ║                                 ║│
│  ║  🔔 Get notified when tasks    ║│  Notification opt-in
│  ║     appear in your area         ║│
│  ╚═════════════════════════════════╝│
└─────────────────────────────────────┘
```

**Key:** Empty state is NOT a dead end — expand radius or get notified.

---

## SCREEN 3: TASK DETAIL

**"Swiggy restaurant page" — hero image, key info, one CTA**

```
┌─────────────────────────────────────┐
│  ←                                  │  Back button
│                                     │
│  ┌─────────────────────────────────┐│
│  │                                 ││
│  │     BUYER'S REFERENCE PHOTOS    ││  Horizontal swipeable gallery
│  │     (what needs cleaning)       ││
│  │     ◉ ○ ○ ○                     ││  Dot indicators
│  │                                 ││
│  └─────────────────────────────────┘│
│                                     │
│  Road Cleaning                      │  Title
│  📍 Kondapur, Hyderabad            │  Address
│  ⭐ Priya Buyer                     │  Buyer name
│                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │  ₹200  │ │ 🟠     │ │ 📷 4   │  │  3 info chips
│  │ Earning│ │ MEDIUM │ │ Photos │  │
│  └────────┘ └────────┘ └────────┘  │
│                                     │
│  Description                        │
│  Remove all garbage along the road  │
│  from school to temple...           │
│                                     │
│  ┌─ WORK DETAILS ─────────────────┐│
│  │ Category    Street Cleaning     ││
│  │ Urgency     Medium              ││
│  │ Window      7:00 AM - 11:30 AM ││
│  │ Location    1.2 km from you     ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │                                 ││
│  │    ACCEPT TASK — EARN ₹200     ││  BIG green button
│  │                                 ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

## SCREEN 4: ACTIVE TASK — ACCEPTED (Navigate to location)

**"Ola driver navigating to pickup"**

```
┌─────────────────────────────────────┐
│                                     │
│     ┌───────────────────────┐       │
│     │                       │       │
│     │      FULL MAP         │       │
│     │                       │       │
│     │   📍 Task location    │       │  Task pin
│     │       🔵 You          │       │  Worker location
│     │                       │       │
│     └───────────────────────┘       │
│                                     │
│  ┌─────────────────────────────────┐│
│  │  Road Cleaning              ₹200││
│  │  📍 Kondapur                    ││
│  │                                 ││
│  │  ┌────────────┐ ┌────────────┐ ││
│  │  │ 📍 1.2 km  │ │ ⏱ ~8 min  │ ││  Distance + ETA
│  │  │  away      │ │  to reach  │ ││
│  │  └────────────┘ └────────────┘ ││
│  │                                 ││
│  │  ┌──────────────────────────┐  ││
│  │  │ 🗺  NAVIGATE             │  ││  Opens Google Maps
│  │  └──────────────────────────┘  ││
│  │                                 ││
│  │  ┌──────────────────────────┐  ││  Green when within 500m
│  │  │ ▶  START WORK            │  ││  Gray + "Get closer" when far
│  │  └──────────────────────────┘  ││  Shows "Retrying GPS (2/3)" during retry
│  │                                 ││
│  └─────────────────────────────────┘│
│                                     │
│  ⚠ Report Issue    ╳ Cancel Task   │  ← NEW: Report Issue next to Cancel
└─────────────────────────────────────┘
```

**Changes:**
- "Report Issue" button added next to Cancel (reviewer feedback #7)
- Report leads to: photo + category picker ("Site blocked", "Safety hazard", "Doesn't match photos")
- Protects worker's rating when task is genuinely impossible

---

## SCREEN 5: ACTIVE TASK — IN PROGRESS (Doing the work)

**"Zomato order tracking" — progress steps + mini-map**

```
┌─────────────────────────────────────┐
│  ← Active Task          ⏱ 12:34   │  Header with live timer
├─────────────────────────────────────┤
│  ┌─ MINI MAP ─────────────────────┐│  ← NEW: Small map strip (not removed)
│  │  🔵 ← 15m → 📍4               ││  Worker dot + arrow to next point
│  │  (tap to expand full map)       ││  Tappable for full map view
│  └─────────────────────────────────┘│
│                                     │
│  ┌─ PROGRESS ──────────────────────┐│
│  │  ████████████░░░░  3/4 photos   ││  Progress bar
│  │                                 ││
│  │  ✅ Started work                ││  Done (green check)
│  │  ✅ Photo 1 captured            ││  Done
│  │  ✅ Photo 2 captured            ││  Done
│  │  ✅ Photo 3 captured            ││  Done
│  │  ⬜ Photo 4 — "Near the gate"  ││  Next (highlighted)
│  │     📍 15m  ↗ (direction arrow) ││  ← NEW: Direction arrow, not just distance
│  │  ⬜ Submit work                 ││  Locked until done
│  └─────────────────────────────────┘│
│                                     │
│  ┌─ NEXT: Point 4 ────────────────┐│  Highlighted action card
│  │                                 ││
│  │  ┌──────────┐                   ││
│  │  │ Buyer's  │  "Near the gate"  ││  Reference photo + label
│  │  │  photo   │   📍 15m  ↗      ││  Distance + direction
│  │  │          │                   ││
│  │  └──────────┘                   ││
│  │                                 ││
│  │  ┌──────────────────────────┐  ││
│  │  │  📷  CAPTURE THIS SPOT  │  ││  BIG capture button
│  │  └──────────────────────────┘  ││
│  │                                 ││
│  │  ┌──────────────────────────┐  ││
│  │  │  🗺  WALK TO THIS SPOT  │  ││  Walking directions
│  │  └──────────────────────────┘  ││
│  └─────────────────────────────────┘│
│                                     │
│  📱 Motion tracking active          │  ← NEW: Transparent, not a "tip"
│     Helps verify your work faster   │     Honest about what it does
│                                     │
│  📡 Offline — photos saved locally  │  ← NEW: Shows when offline
│     Will sync when connected        │     (hidden when online)
│                                     │
│  💬 Message    ⚠ Report    ╳ Cancel│  Footer actions
└─────────────────────────────────────┘
```

**Changes from v1:**
- **Mini-map strip** at top (not fully removed) — shows worker dot + next point with direction arrow
- **Direction arrow** (↗) on distance — "15m that way" not just "15m" (reviewer #4)
- **"Motion tracking active"** — transparent, honest, not disguised as tip (reviewer #3)
- **Offline indicator** — shows when connection lost, reassures photos saved (reviewer #8)
- **Report Issue** button in footer (reviewer #7)

---

## SCREEN 6: CAMERA (Side-by-side capture)

**Works well. Minor tweaks.**

```
┌─────────────────────────────────────┐
│  ╳              POINT 3/4       ⚡  │  Close, counter, flash
│                "Near the gate"      │  Reference label
├──────────────────┬──────────────────┤
│                  │                  │
│   BUYER'S PHOTO  │  YOUR CAMERA    │  Side-by-side
│                  │                  │
│   (reference)    │  (live feed)    │
│                  │                  │
├──────────────────┴──────────────────┤
│   ████████████████  GPS: 8m ✅     │  Proximity bar
├─────────────────────────────────────┤
│                                     │
│   Match the angle of the photo      │  Hint text
│                                     │
│          🔄    ⭕    (empty)        │  Flip, Shutter
│                                     │
│   🔒 Verified capture              │
└─────────────────────────────────────┘
```

No changes from v1 — camera UX is solid.

---

## SCREEN 7: SUBMIT PROOF (Review before submit)

```
┌─────────────────────────────────────┐
│  ←  Review & Submit                 │
├─────────────────────────────────────┤
│                                     │
│  Road Cleaning  •  ₹200            │  Task name + earning
│                                     │
│  ┌─ YOUR WORK ────────────────────┐│
│  │                                 ││
│  │  Point 1        ✅ GPS: 98%    ││  Photo pairs with GPS score
│  │  ┌──────┐ → ┌──────┐          ││
│  │  │Before│   │After │          ││
│  │  └──────┘   └──────┘          ││
│  │                                 ││
│  │  Point 2        ✅ GPS: 100%   ││
│  │  ┌──────┐ → ┌──────┐          ││
│  │  │Before│   │After │          ││
│  │  └──────┘   └──────┘          ││
│  │  ... (all points)              ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─ SUMMARY ──────────────────────┐│
│  │  📍 GPS trail      42 points   ││
│  │  📷 Photos         4/4         ││
│  │  ⏱  Time on site   18 min      ││
│  │  📱 Motion          Active ✅   ││  ← NEW: Shows motion was tracked
│  │  💰 You'll earn    ₹200        ││  GREEN, prominent
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │    ✅  SUBMIT WORK             ││  BIG green button
│  └─────────────────────────────────┘│
│                                     │
│  ← Go Back                         │  Small text link
└─────────────────────────────────────┘
```

---

## SCREEN 8: POST-SUBMISSION (Verification tracking)

**"Zomato order placed" — this is the money screen**

```
┌─────────────────────────────────────┐
│                                     │
│          ✅                         │
│     Work Submitted!                 │  Big green checkmark
│                                     │
│  ┌─ VERIFICATION IN PROGRESS ─────┐│
│  │                                 ││
│  │  ✅ Photos uploaded             ││  Done instantly
│  │  ✅ GPS verified                ││  Done instantly
│  │  ✅ Motion verified             ││  ← NEW: Shows motion was checked
│  │  🔄 AI checking your work...   ││  Spinning (10-15 sec)
│  │  ⬜ Payment decision            ││  Pending
│  │                                 ││
│  │  Usually takes < 1 min          ││  Reassurance
│  └─────────────────────────────────┘│
│                                     │
│  ┌─ WHAT HAPPENS NEXT ───────────┐ │
│  │                                 ││
│  │  If AI approves:               ││
│  │  💰 ₹200 released instantly    ││
│  │                                 ││
│  │  If review needed:             ││
│  │  ⏱ Buyer reviews in 12-72h    ││
│  │  💰 Auto-released if no action ││  ← Trust builder
│  │                                 ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌──────────────────────────────┐   │
│  │    🔍 FIND MORE WORK         │   │  Find next task
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │    📋 VIEW MY TASKS          │   │  Check status later
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## NEW SCREENS (from reviewer feedback)

### SCREEN 9: REJECTION DETAIL (When AI or buyer rejects)

**Problem (reviewer #5):** Cryptic "Verification failed" with no explanation = worker uninstalls.

```
┌─────────────────────────────────────┐
│  ←  Task Update                     │
├─────────────────────────────────────┤
│                                     │
│          ❌                         │
│   Work Needs Improvement            │  ← NOT "Rejected" — softer language
│                                     │
│  ┌─ WHAT HAPPENED ────────────────┐│
│  │                                 ││
│  │  AI found issues with your      ││
│  │  photos:                        ││
│  │                                 ││
│  │  ⚠ Point 2: Photo angle doesn't││  ← SPECIFIC: which point failed
│  │    match the reference photo    ││     and WHY
│  │                                 ││
│  │  ⚠ Point 4: No visible cleaning││  ← Another specific issue
│  │    improvement detected         ││
│  │                                 ││
│  │  ┌──────┐ → ┌──────┐          ││  ← Shows the problematic pair
│  │  │Buyer │   │Yours │          ││
│  │  └──────┘   └──────┘          ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─ WHAT YOU CAN DO ──────────────┐│
│  │                                 ││
│  │  ┌──────────────────────────┐  ││
│  │  │  🔄 DISPUTE THIS         │  ││  ← Dispute button (prominent)
│  │  │  Add a photo or comment  │  ││     Opens dispute flow
│  │  └──────────────────────────┘  ││
│  │                                 ││
│  │  This won't affect your rating  ││  ← Reassurance
│  │  if the dispute is resolved     ││
│  │  in your favor.                 ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─ TIPS FOR NEXT TIME ──────────┐ │
│  │  📷 Match the buyer's angle    ││  ← Constructive, not punishing
│  │  🧹 Make sure cleaning is      ││
│  │     visible in the photo       ││
│  │  📍 Stay close to reference    ││
│  │     point location             ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌──────────────────────────────┐   │
│  │    🔍 FIND MORE WORK         │   │  Don't let rejection = dead end
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

### SCREEN 10: REPORT ISSUE (Task can't be completed)

**Problem (reviewer #7):** Worker arrives, drain is flooded, road blocked. Needs to cancel without penalty.

```
┌─────────────────────────────────────┐
│  ←  Report Issue                    │
├─────────────────────────────────────┤
│                                     │
│  What's the problem?                │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 🚧 Site blocked / inaccessible ││  ← Tap to select
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ⚠️  Safety hazard               ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ 📷 Photos don't match reality   ││  ← Buyer uploaded wrong photos
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ 🌧 Weather makes work unsafe    ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ❓ Other reason                  ││
│  └─────────────────────────────────┘│
│                                     │
│  Take a photo of the issue:         │
│  ┌──────────────────────────────┐   │
│  │  📷 TAKE PHOTO               │   │  Opens camera
│  └──────────────────────────────┘   │
│  (optional but helps your case)     │
│                                     │
│  ┌─────────────────────────────────┐│
│  │                                 ││
│  │  SUBMIT REPORT                  ││  Green button
│  │  (task cancelled, no penalty)   ││  ← Makes it clear: no penalty
│  │                                 ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

### SCREEN 11: OFFLINE MODE INDICATOR (Overlay, not a screen)

**Problem (reviewer #8):** Phone loses connectivity mid-task.

```
Not a separate screen — an overlay bar that appears on Screen 5:

┌─────────────────────────────────────┐
│  📡 Offline — don't worry!          │  ← Yellow bar, top of screen
│  Photos saved locally. Will sync    │     Appears when NetInfo = offline
│  automatically when connected.      │     Disappears when back online
│  ┌──────────────────────────────┐   │
│  │ 3 photos queued for upload   │   │  Shows queue count
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘

When connection returns:

┌─────────────────────────────────────┐
│  ✅ Back online! Syncing 3 photos...│  ← Green bar, auto-dismisses
└─────────────────────────────────────┘
```

Also needed: if phone dies mid-task and worker reopens app:
- Active task persists (stored in Zustand + MMKV)
- "Resume Task" card on home screen
- Photos already captured are still in local gallery
- Worker can continue capturing remaining points

---

## WORKER LEVELS SYSTEM (NEW)

**Problem (reviewer #6):** Stats are snapshots, not stories. Workers need progression.

```
┌────────────────────────────────────────┐
│  LEVEL SYSTEM                          │
│                                        │
│  🥉 Bronze Worker    0-25 tasks        │
│     Standard task access               │
│                                        │
│  🥈 Silver Worker    25-100 tasks      │
│     Priority in task queue             │
│     (sees tasks 5 min before Bronze)   │
│                                        │
│  🥇 Gold Worker      100-500 tasks     │
│     Priority + 5% earning bonus        │
│     "Gold Worker" badge visible to     │
│     buyers (builds trust)              │
│                                        │
│  💎 Diamond Worker   500+ tasks        │
│     Priority + 10% bonus              │
│     Featured worker for buyers        │
│     Faster payment (AUTO_PASS at 80   │
│     instead of 85 for trusted workers)│
│                                        │
│  Progression shown on home screen:     │
│  "🥉→🥈 12 more tasks to Silver"     │
│                                        │
│  Requirements:                         │
│  - Approval rate >= 80%                │
│  - Rating >= 4.0                       │
│  - No account flags                    │
└────────────────────────────────────────┘
```

---

## WHAT WE REMOVE

| Element | Why |
|---|---|
| Daily tip | Clutter |
| Trust badges | Marketing, not utility |
| Recently completed on home | Move to My Tasks tab |
| Availability toggle | Premature — no matching system |
| Legacy 3-photo flow | Replaced by reference points |
| Photo source picker (Camera/Gallery) | Always camera — gallery defeats evidence |
| DashboardCamera "Quick Capture" | Confusing destination |
| "Pending" vs "Processing" states | Worker doesn't understand the difference |

## WHAT WE ADD

| Element | Why | Source |
|---|---|---|
| ₹ on map pins | Workers scan for money first | v1 design |
| Progress tracker | "Where am I?" anxiety killer | v1 design |
| Post-submission tracking | "What's happening with my work?" | v1 design |
| **Empty state with forecast** | Zero-task morning shouldn't be a dead end | Reviewer #1 |
| **Weekly earnings + target bar** | Workers think in weeks, not days | Reviewer #2 |
| **"In account" / "Coming soon"** | Only 2 money states they understand | Reviewer #2 |
| **Transparent motion tracking msg** | Honest about data collection, not a trick | Reviewer #3 |
| **Mini-map + direction arrow** | Worker needs direction between points | Reviewer #4 |
| **Rejection detail screen** | Show WHAT failed and WHY, not cryptic error | Reviewer #5 |
| **Worker levels + progression** | Build identity, not just income | Reviewer #6 |
| **Report Issue flow** | Cancel without penalty when task is impossible | Reviewer #7 |
| **Offline mode indicator** | Reassure worker during connectivity loss | Reviewer #8 |
| **Resume task after phone death** | Don't lose work because battery died | Reviewer #8 |

---

## IMPLEMENTATION ORDER

1. **WorkerHomeScreen** — weekly earnings, empty state, worker level
2. **FindWorkScreen** — ₹ on pins, empty state with expand radius
3. **TaskDetailScreen** — swipeable gallery, "EARN ₹X" CTA
4. **ActiveTaskScreen ACCEPTED** — navigation card + Report Issue
5. **ActiveTaskScreen IN_PROGRESS** — mini-map, progress tracker, direction arrows, offline bar, transparent motion msg
6. **Camera** — minor tweaks (point counter, proximity text)
7. **SubmitProofScreen** — photo pairs + motion status in summary
8. **PostSubmissionScreen** (NEW) — verification tracking
9. **RejectionDetailScreen** (NEW) — specific failure reasons + dispute
10. **ReportIssueScreen** (NEW) — cancel without penalty
11. **Wire unused components** — TaskCard, TaskTimer, StatusTimeline, AIScoreCard
12. **Worker levels system** — backend + frontend progression
