# eClean v2 — Image Capture Redesign & Silent Witness Protocol
# COMPLETE TECHNICAL SPECIFICATION & EXECUTION PLAN

**Version:** 2.0
**Date:** March 30, 2026
**Authors:** Akshay Thota, Claude Opus 4.6
**Classification:** CONFIDENTIAL — PATENT PENDING
**Repository:** github.com/Akshaytho/Eclean_v2
**Branch:** image_capture_workflow

---

# TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Current System Analysis](#2-current-system-analysis)
3. [PLAN A — Reference Point Image Capture (Original)](#3-plan-a)
4. [PLAN B — Silent Witness Protocol (Enhanced)](#4-plan-b)
5. [Merged Implementation — Final Architecture](#5-merged-implementation)
6. [Database Schema — Complete](#6-database-schema)
7. [Backend API Specification](#7-backend-api-specification)
8. [Mobile Screen Specifications](#8-mobile-screen-specifications)
9. [Workflow Diagrams](#9-workflow-diagrams)
10. [Anti-Fraud Deep Dive](#10-anti-fraud-deep-dive)
11. [AI Verification System](#11-ai-verification-system)
12. [Citizen Mesh Network](#12-citizen-mesh-network)
13. [Patent Strategy](#13-patent-strategy)
14. [Implementation Timeline](#14-implementation-timeline)
15. [Risk Analysis](#15-risk-analysis)
16. [Future Roadmap](#16-future-roadmap)

---

# 1. EXECUTIVE SUMMARY

## 1.1 What is eClean?

eClean is an AI-powered civic work verification platform. Workers clean public areas, upload before/after photos, Claude Vision AI verifies the work quality, and payment auto-releases upon verification. The platform serves 5 roles: WORKER, BUYER, SUPERVISOR, ADMIN, and CITIZEN.

## 1.2 The Problem

The current image capture system is flat and easily exploitable:
- One BEFORE photo, one AFTER photo, one PROOF photo per task
- No spatial pairing between buyer expectations and worker output
- Workers can photograph any clean area and claim it as their work
- GPS can be spoofed, photos can be taken at different times
- No proof that physical cleaning work actually occurred
- No mechanism for independent post-task verification

## 1.3 The Solution — Two Complementary Plans

**PLAN A (Reference Point System):** Buyer uploads 3-10 reference point photos documenting dirty areas. Worker must recreate each photo angle after cleaning. System randomly selects 2 points as "blind verification" spots. Per-point GPS matching scores location accuracy.

**PLAN B (Silent Witness Protocol):** Four invisible verification layers running in the background — Environmental DNA fingerprinting, Motion Signature classification, Citizen Mesh post-task auditing, and Adversarial dual-AI verification. Zero additional worker effort.

**MERGED PLAN:** Plan A provides the user-facing experience. Plan B provides invisible background verification. Together they create the most robust work verification system ever built.

## 1.4 Key Metrics

| Metric | Current System | After Implementation |
|--------|---------------|---------------------|
| Photos per task | 3 | Up to 23 |
| Location proof layers | 1 (GPS only) | 4 (GPS + WiFi + Cell + Magnetometer) |
| Fraud detection methods | 1 (AI photo check) | 6 (spatial + temporal + motion + environmental + citizen + adversarial AI) |
| Worker extra effort | 3 photos | Same or fewer manual steps (background verification is passive) |
| Time to verify | ~30 seconds (AI) | ~5 seconds (rule engine) + async AI |
| False approval rate | ~15% estimated | <2% target |
| Post-task audit | None | Citizen mesh continuous |

---

# 2. CURRENT SYSTEM ANALYSIS

## 2.1 Current Architecture

```
CURRENT FLOW (Simple 3-Photo Model):

BUYER                           WORKER                         BACKEND
  |                               |                              |
  |-- Create Task + Pay --------->|                              |
  |   (optional: 1 REFERENCE      |                              |
  |    photo)                      |                              |
  |                               |-- Accept Task ------------->|
  |                               |                              |
  |                               |-- Start Task (GPS check) -->|
  |                               |                              |
  |                               |-- Upload BEFORE photo ----->|
  |                               |   (CaptureCamera + GPS +    |-- Cloudinary upload
  |                               |    SHA-256 hash)             |-- AnalyticsPhotoMeta
  |                               |                              |-- Delete previous BEFORE
  |                               |                              |
  |                               |   [Worker does cleaning]     |
  |                               |                              |
  |                               |-- Upload AFTER photo ------>|
  |                               |   (same metadata capture)    |-- Same flow
  |                               |                              |
  |                               |-- Upload PROOF photo ------>|
  |                               |   (worker in frame or tool)  |-- Same flow
  |                               |                              |
  |                               |-- Submit Task ------------->|
  |                               |                              |-- Check: has BEFORE+AFTER+PROOF?
  |                               |                              |-- Status: SUBMITTED
  |                               |                              |-- Queue AI verification job
  |                               |                              |
  |                               |                              |-- AI: Send 3 URLs to Claude
  |                               |                              |-- AI: Get score + recommendation
  |                               |                              |-- Write aiScore to Task
  |                               |                              |
  |<-- Notification: "Review" ----|                              |
  |                               |                              |
  |-- Approve/Reject ------------>|                              |
  |                               |                              |-- Create Payout (if approved)
  |                               |                              |-- Update worker stats
```

## 2.2 Current Database Models

### TaskMedia (current — lines 233-245 of schema.prisma)

```
TaskMedia
├── id              String (UUID)
├── taskId          String (FK -> Task)
├── url             String (Cloudinary secure_url)
├── publicId        String? (Cloudinary deletion key)
├── mimeType        String? (image/jpeg, image/png, image/webp)
├── sizeBytes       Int?
├── type            MediaType (BEFORE | AFTER | PROOF | REFERENCE | REPORT | PROFILE)
├── idempotencyKey  String? (unique — prevents duplicate uploads)
├── createdAt       DateTime
└── task            Task (relation)
```

### AnalyticsPhotoMeta (current — lines 480-519 of schema.prisma)

```
AnalyticsPhotoMeta
├── id              String (UUID)
├── taskMediaId     String (FK -> TaskMedia)
├── taskId          String (FK -> Task)
├── exifLat         Float? (GPS from photo EXIF data)
├── exifLng         Float?
├── exifTimestamp   DateTime?
├── capturedLat     Float? (GPS from device sensor — more reliable)
├── capturedLng     Float?
├── capturedAt      DateTime?
├── deviceMake      String?
├── deviceModel     String?
├── imageWidth      Int?
├── imageHeight     Int?
├── photoHash       String? (SHA-256 of image bytes)
├── isFlagged       Boolean (true if >500m from task location)
├── createdAt       DateTime
└── taskMedia       TaskMedia (relation)
```

## 2.3 Current Media Upload Flow (media.service.ts)

```
uploadTaskMedia(params) {
  1. Validate file: MIME type must be jpeg/png/webp, max 10MB
  2. Permission check:
     - REFERENCE: buyer only
     - BEFORE/AFTER/PROOF: assigned worker, task IN_PROGRESS
  3. Idempotency check: skip if same key already processed
  4. DEDUPLICATION (lines 69-78): *** THIS IS THE KEY LIMITATION ***
     - Find existing TaskMedia of same type for this task
     - If found: delete from Cloudinary + delete from DB
     - Result: only ONE photo per type per task
  5. Extract EXIF (fire-and-forget, before Cloudinary strips it)
  6. Upload to Cloudinary (quality: auto, format: auto)
  7. Create TaskMedia record
  8. Create AnalyticsPhotoMeta (fraud detection)
     - Compare GPS to task location
     - Flag if >500m away
  9. Emit socket: task:photo_added
  10. Return media record
}
```

## 2.4 Current Submit Validation (tasks.service.ts, line 712-778)

```
submitTask(workerId, taskId) {
  1. Fetch task, verify ownership
  2. Verify status is IN_PROGRESS
  3. INSIDE TRANSACTION (SERIALIZABLE):
     a. Fetch all TaskMedia for this task
     b. Check: has BEFORE? has AFTER? has PROOF?
        - If missing any: throw BadRequestError
     c. Update task:
        - status: SUBMITTED
        - submittedAt: now
        - timeSpentSecs: computed from startedAt
     d. Clear worker's activeTaskId (allows new tasks)
  4. Queue AI verification job (3 attempts, exponential backoff)
  5. Send notifications
}
```

## 2.5 Current AI Verification (ai.service.ts)

```
verifyTaskSubmission(taskId) {
  1. Fetch task with media
  2. Find BEFORE, AFTER, PROOF media URLs
  3. Build Claude API request:
     - Model: claude-sonnet-4-5
     - Images: 3 Cloudinary URLs (type: 'url' — zero server RAM)
     - Prompt: Analyze BEFORE vs AFTER, check PROOF
  4. Parse JSON response:
     {
       score: 0-1,
       label: EXCELLENT | GOOD | UNCERTAIN | POOR,
       reasoning: string,
       workEvident: boolean,
       suspiciousActivity: boolean,
       recommendation: APPROVE | REVIEW | REJECT
     }
  5. Write to Task: aiScore, aiReasoning, aiModelVersion
}
```

## 2.6 Current Mobile Components

### CaptureCamera (mobile/src/components/camera/CaptureCamera.tsx)

```
Props: { taskId, photoType, onCapture, onClose }

Flow:
  1. Open camera with quality 0.92
  2. Parallel capture: takePicture() + getCurrentPosition()
  3. Compute SHA-256 hash of full image (expo-crypto)
  4. Build metadata: { lat, lng, timestamp, deviceId, taskId, photoHash }
  5. Show PhotoPreview component
  6. On confirm: saveToGallery() + trigger upload
```

### Gallery Service (mobile/src/services/galleryService.ts)

```
Storage: eclean_gallery/{taskId}/full/{id}.jpg + {id}.json
         eclean_gallery/{taskId}/thumbs/{id}_thumb.jpg

Functions:
  - saveToGallery(uri, taskId, type, metadata) -> GalleryPhoto
  - getTaskPhotos(taskId) -> GalleryPhoto[]
  - markUploaded(id, uploadedUri) -> void
  - cleanOldPhotos() -> deletes uploaded photos >30 days old
```

### ActiveTaskScreen (mobile/src/screens/worker/ActiveTaskScreen.tsx)

```
State:
  photos = {
    BEFORE:    { uri, uploading, uploaded },
    AFTER:     { uri, uploading, uploaded },
    PROOF:     { uri, uploading, uploaded },
    REFERENCE: { uri, uploading, uploaded },
  }

Features:
  - Timer from server startedAt (survives restart)
  - GPS tracking via socket.emit('worker:gps')
  - Geofence: 500m radius check
  - Upload progress per photo type
  - Submit enabled when all 3 photos uploaded
```

## 2.7 Identified Weaknesses

| # | Weakness | Severity | Exploitability |
|---|----------|----------|----------------|
| 1 | Only 1 photo per type — dedup deletes previous | HIGH | Worker can retake until they get a "good" fake |
| 2 | No spatial pairing — BEFORE and AFTER may show different areas | CRITICAL | Worker can photograph any pre-existing clean area |
| 3 | GPS can be spoofed via mock location apps | HIGH | Trivial on rooted Android devices |
| 4 | No proof of physical work — only proof of presence | CRITICAL | Worker can visit, take photos, leave without cleaning |
| 5 | No post-completion audit | HIGH | Once approved, fraud is never discovered |
| 6 | Single AI reviewer — no adversarial check | MEDIUM | AI can be fooled by clever angle choices |
| 7 | No motion analysis — no proof of cleaning activity | HIGH | Standing still for 5 min then taking photos |
| 8 | EXIF stripped by Cloudinary — relies on device-reported metadata | MEDIUM | Metadata can be fabricated |

---

# 3. PLAN A — Reference Point Image Capture (Original)

## 3.1 Core Concept

Replace the flat 3-photo model with a **spatial reference point system** where buyer photographs specific dirty spots, and worker must photograph those same spots after cleaning.

```
CURRENT:                          NEW:

Buyer: [1 optional ref photo]    Buyer: [3-10 reference point photos]
                                        Each with GPS + label
Worker: [BEFORE] [AFTER] [PROOF]        "Gate entrance" "Drain" "Wall"
        (unrelated locations)
                                  System: Randomly pick 2 as VERIFICATION

                                  Worker: [AFTER per reference point]
                                         Must match buyer's angle
                                         GPS proximity scored
                                         Verification points = proof of presence
```

## 3.2 Buyer Flow — Detailed

```
STEP 1: Choose Category
┌──────────────────────────────────────┐
│  What needs cleaning?                │
│                                      │
│  ┌──────────┐ ┌──────────┐          │
│  │ Street   │ │ Drain    │          │
│  │ Cleaning │ │ Cleaning │          │
│  └──────────┘ └──────────┘          │
│  ┌──────────┐ ┌──────────┐          │
│  │ Wall     │ │ Park     │          │
│  │ Cleaning │ │ Cleanup  │          │
│  └──────────┘ └──────────┘          │
│                                      │
│  [Next ->]                           │
└──────────────────────────────────────┘

STEP 2: Task Details
┌──────────────────────────────────────┐
│  Describe the task                   │
│                                      │
│  Title: [Street near park gate    ]  │
│                                      │
│  Description:                        │
│  [Garbage dumped near main gate.   ] │
│  [Drain blocked with plastic waste.] │
│                                      │
│  Urgency:  [LOW] [MEDIUM] [HIGH]     │
│  Area Size: [SMALL] [MEDIUM] [LARGE] │
│  Environment: [INDOOR] [OUTDOOR]     │
│                                      │
│  [Next ->]                           │
└──────────────────────────────────────┘

STEP 3: Set Location
┌──────────────────────────────────────┐
│  Where is the task?                  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │          MAP VIEW              │  │
│  │      📍 Pin dropped here       │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  📍 Use My Current Location          │
│                                      │
│  Address: [Auto-filled from GPS   ]  │
│                                      │
│  [Next ->]                           │
└──────────────────────────────────────┘

STEP 4: Document the Area (NEW)
┌──────────────────────────────────────┐
│  📸 Document the Area               │
│                                      │
│  Take photos of the dirty spots.     │
│  Workers will match these exact      │
│  locations after cleaning.           │
│                                      │
│  ┌───────┐ ┌───────┐ ┌───────┐     │
│  │  📷   │ │  📷   │ │  📷   │     │
│  │ Gate  │ │ Drain │ │ Wall  │     │
│  │  ✅   │ │  ✅   │ │  ✅   │     │
│  └───────┘ └───────┘ └───────┘     │
│  ┌───────┐ ┌───────┐               │
│  │  📷   │ │  ➕   │               │
│  │ Tree  │ │ Add   │               │
│  │  ✅   │ │ More  │               │
│  └───────┘ └───────┘               │
│                                      │
│  4/10 reference points captured      │
│  ✅ Minimum 3 required              │
│                                      │
│  Each photo captures:                │
│  • GPS coordinates (auto)            │
│  • Timestamp (auto)                  │
│  • SHA-256 hash (auto)              │
│  • Optional label (you type)         │
│                                      │
│  [Continue ->]                       │
└──────────────────────────────────────┘

STEP 5: Confirm & Pay
┌──────────────────────────────────────┐
│  Confirm Task                        │
│                                      │
│  Street near park gate               │
│  Category: Street Cleaning           │
│  Location: 12.9716° N, 77.5946° E   │
│  Reference Points: 4 photos          │
│  Urgency: MEDIUM                     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Task Fee:           ₹500      │  │
│  │ Platform Fee:       ₹50       │  │
│  │ Total:              ₹550      │  │
│  └────────────────────────────────┘  │
│                                      │
│  [Pay & Post Task]                   │
└──────────────────────────────────────┘
```

### Buyer Reference Point Capture — Technical Flow

```
BUYER TAPS "Add" on Step 4:

1. Open CaptureCamera with photoType='REFERENCE'

2. Camera captures photo + GPS simultaneously
   ├── Photo: quality 0.92, JPEG
   ├── GPS: expo-location getCurrentPositionAsync
   ├── Hash: SHA-256 of image bytes
   └── Timestamp: ISO 8601 UTC

3. Show PhotoPreview with label input:
   ┌──────────────────────────────────┐
   │  Reference Point 4               │
   │                                   │
   │  [FULL SCREEN PHOTO PREVIEW]     │
   │                                   │
   │  Label (optional):               │
   │  [Near the big tree            ] │
   │                                   │
   │  📍 Location verified            │
   │  🔒 Photo hash: a3f2...         │
   │                                   │
   │  [Retake]        [Use Photo]     │
   └──────────────────────────────────┘

4. On confirm: save to local state (NOT uploaded yet)
   referencePhotos.push({
     uri: '/path/to/photo.jpg',
     label: 'Near the big tree',
     lat: 12.9716,
     lng: 77.5946,
     metadata: { timestamp, deviceId, photoHash }
   })

5. After task creation + payment:
   - POST /api/v1/buyer/tasks (create task, get taskId)
   - FOR EACH reference photo:
     POST /api/v1/tasks/{taskId}/reference-points
     (multipart: file + pointIndex + label + GPS metadata)
   - Update task.totalReferencePoints = count

6. All uploads complete -> Task status = OPEN
   Workers can now see and accept this task
```

## 3.3 Worker Flow — Detailed

```
PHASE 1: DISCOVERY & ACCEPTANCE

Worker Home Screen:
┌──────────────────────────────────────┐
│  Available Tasks Near You            │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Street near park gate          │  │
│  │ 📍 1.2 km away · ₹500         │  │
│  │ 📸 4 reference points          │  │
│  │ ⚡ MEDIUM urgency              │  │
│  │ [View Details]                 │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Drain cleaning MG Road         │  │
│  │ 📍 3.5 km away · ₹800         │  │
│  │ 📸 7 reference points          │  │
│  │ ⚡ HIGH urgency                │  │
│  │ [View Details]                 │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘

Worker taps "View Details":
┌──────────────────────────────────────┐
│  Street near park gate               │
│                                      │
│  ┌────────────────────────────────┐  │
│  │           MAP VIEW             │  │
│  │     📍 Task location           │  │
│  └────────────────────────────────┘  │
│                                      │
│  📝 Description:                     │
│  Garbage dumped near main gate.      │
│  Drain blocked with plastic waste.   │
│                                      │
│  📸 Preview Reference Points:        │
│  ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ Gate │ │Drain │ │ Wall │        │
│  └──────┘ └──────┘ └──────┘        │
│  + 1 more                            │
│                                      │
│  💰 ₹500 · ⏱ Est. 45 min           │
│                                      │
│  [Accept Task]                       │
└──────────────────────────────────────┘

Worker taps "Accept Task":
  1. POST /api/v1/worker/tasks/{taskId}/accept
  2. Backend: selectVerificationPoints(taskId)
     - Fetch all reference points
     - Randomly pick 2 as isVerificationPoint = true
     - IMPORTANT: Do NOT tell mobile which ones are verification
  3. Backend: preload reference point data for offline
  4. Mobile: Download all buyer reference images to device
     - FileSystem.downloadAsync(imageUrl, localUri)
     - Store in eclean_gallery/{taskId}/ref_{pointIndex}.jpg
  5. Task status: ACCEPTED
  6. Worker navigates to task site
```

```
PHASE 2: START WORK & CAPTURE

Worker arrives at location:
┌──────────────────────────────────────┐
│  Task: Street near park gate         │
│  📍 You are 25m from task location   │
│                                      │
│  [Start Work]                        │
│                                      │
│  ⚠️ You must be within 500m to start │
└──────────────────────────────────────┘

Worker taps "Start Work":
  1. POST /api/v1/worker/tasks/{taskId}/start
  2. Geofence check: worker must be within 500m
  3. Task status: IN_PROGRESS
  4. Timer starts (from server startedAt)
  5. GPS tracking begins (socket.emit every 10s)
  6. [SILENT] Environmental DNA capture begins
  7. [SILENT] Motion signature recording begins

Reference Point Navigator (NEW SCREEN):
┌──────────────────────────────────────┐
│  Active Task · ⏱ 00:12:34           │
│  Street near park gate               │
│                                      │
│  ┌────────────────────────────────┐  │
│  │          MAP VIEW              │  │
│  │   📍1  📍2  📍3  📍4          │  │
│  │         🔵 You                 │  │
│  └────────────────────────────────┘  │
│                                      │
│  Reference Points:                   │
│                                      │
│  ✅ Point 1 · Gate entrance     12m  │
│  ✅ Point 2 · Drain section     8m   │
│  ⬜ Point 3 · Wall area         45m  │
│  ⬜ Point 4 · Near tree         120m │
│                                      │
│  Progress: 2/4 captured              │
│                                      │
│  [📸 Capture Point 3]               │
│                                      │
│  [Submit Work ->] (disabled)         │
└──────────────────────────────────────┘

NOTES:
- Points sorted by distance (nearest first)
- Distance updates in real-time from GPS
- ✅ = after photo captured for this point
- ⬜ = not yet captured
- "VERIFY" badge only appears when worker is within 50m
  (prevents them from knowing which ones to prioritize)
- Submit button disabled until:
  - All verification photos done
  - At least 70% of regular points done
```

```
PHASE 3: SIDE-BY-SIDE CAPTURE

Worker taps "Capture Point 3":

If Point 3 is a REGULAR point:
┌──────────────────────────────────────┐
│ [X]      POINT 3/4         [Flash]  │
│          "Wall area"                 │
│                                      │
│ ┌──────────────┐ ┌──────────────┐   │
│ │  BUYER'S     │ │  YOUR        │   │
│ │  REFERENCE   │ │  CAMERA      │   │
│ │              │ │  (live)      │   │
│ │  [dirty      │ │  [camera     │   │
│ │   wall       │ │   viewfinder]│   │
│ │   photo]     │ │              │   │
│ └──────────────┘ └──────────────┘   │
│                                      │
│  Match this angle after cleaning     │
│                                      │
│  📍 45m from this point              │
│     Walk closer for better match     │
│                                      │
│         [ 📸 Capture ]               │
│                                      │
└──────────────────────────────────────┘

If Point 3 is a VERIFICATION point (revealed at <50m):
┌──────────────────────────────────────┐
│ [X]      POINT 3/4         [Flash]  │
│          "Wall area" 🔒 VERIFY      │
│                                      │
│ ┌──────────────┐ ┌──────────────┐   │
│ │  BUYER'S     │ │  YOUR        │   │
│ │  REFERENCE   │ │  CAMERA      │   │
│ │              │ │  (live)      │   │
│ │  [dirty      │ │  [camera     │   │
│ │   wall       │ │   viewfinder]│   │
│ │   photo]     │ │              │   │
│ └──────────────┘ └──────────────┘   │
│                                      │
│  🔒 VERIFICATION POINT              │
│  Match this EXACT angle to prove     │
│  you are at this location            │
│                                      │
│  📍 8m from this point ✅            │
│                                      │
│         [ 📸 Capture ]               │
│                                      │
│  🔒 GPS + photo hash recorded       │
└──────────────────────────────────────┘

CAPTURE FLOW (same for both types):
  1. Worker positions camera to match buyer's reference
  2. Taps Capture
  3. Parallel execution:
     ├── Camera: takePictureAsync(quality: 0.92)
     ├── GPS: getCurrentPositionAsync(accuracy: HIGH)
     └── Hash: SHA-256 of image bytes
  4. Show preview with comparison:
     ┌────────────────────────────────┐
     │  ┌──────────┐ ┌──────────┐   │
     │  │ BUYER'S  │ │ YOUR     │   │
     │  │ [dirty]  │ │ [clean]  │   │
     │  └──────────┘ └──────────┘   │
     │                               │
     │  📍 GPS Match: 8m away ✅     │
     │  🔒 Hash: b4e2...            │
     │  ⏱ 14:23 into task           │
     │                               │
     │  [Retake]     [Use Photo]    │
     └────────────────────────────────┘
  5. On confirm:
     ├── Save to gallery locally
     ├── Upload: POST /tasks/{taskId}/points/{pointId}/submit
     │   Body: file + mediaType (AFTER or VERIFICATION) + GPS + hash
     ├── Backend computes locationMatchScore (haversine distance)
     └── Update progress in ReferencePointNavigator
```

```
PHASE 4: SUBMIT

All points captured -> Submit button becomes active:

Submit Proof Screen:
┌──────────────────────────────────────┐
│  Review & Submit                     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Point 1 · Gate entrance        │  │
│  │ ┌──────┐ → ┌──────┐           │  │
│  │ │dirty │   │clean │           │  │
│  │ └──────┘   └──────┘           │  │
│  │ ✅ GPS match · 12m · Score 90  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Point 2 · Drain section  🔒   │  │
│  │ ┌──────┐ → ┌──────┐           │  │
│  │ │dirty │   │clean │           │  │
│  │ └──────┘   └──────┘           │  │
│  │ ✅ Verified · 8m · Score 100   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Point 3 · Wall area           │  │
│  │ ┌──────┐ → ┌──────┐           │  │
│  │ │dirty │   │clean │           │  │
│  │ └──────┘   └──────┘           │  │
│  │ ✅ GPS match · 15m · Score 90  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Point 4 · Near tree    🔒     │  │
│  │ ┌──────┐ → ┌──────┐           │  │
│  │ │dirty │   │clean │           │  │
│  │ └──────┘   └──────┘           │  │
│  │ ✅ Verified · 5m · Score 100   │  │
│  └────────────────────────────────┘  │
│                                      │
│  Summary:                            │
│  ✅ 4/4 after photos                │
│  ✅ 2/2 verification photos         │
│  📍 GPS trail: 34 points            │
│  ⏱ Time on site: 47 minutes         │
│  💰 Earnings: ₹500                  │
│                                      │
│  [Go Back]        [Submit Work]      │
└──────────────────────────────────────┘

Worker taps "Submit Work":
  1. POST /api/v1/worker/tasks/{taskId}/submit
  2. Backend validation (INSIDE TRANSACTION):
     a. Check all verification points have submissions
     b. Check at least 70% of regular points have submissions
     c. Compute workDurationSecs
     d. Status: IN_PROGRESS -> SUBMITTED
     e. Clear worker's activeTaskId
  3. Queue AI verification job
  4. Queue rule-engine scoring
  5. Send notification to buyer
  6. Worker sees: "Submitted! Awaiting review."
```

## 3.4 Verification Point Selection Algorithm

```
selectVerificationPoints(taskId):

INPUT:  All reference points for a task (3-10)
OUTPUT: Exactly 2 points marked as isVerificationPoint = true

ALGORITHM:
  1. Fetch all reference points, sorted by pointIndex
  2. If fewer than 2 points: skip verification (too few to verify)
  3. If exactly 2 points: mark both (no randomness possible)
  4. If 3+ points:
     a. Create geographic clusters:
        - Group points within 20m of each other
     b. If 2+ clusters exist:
        - Pick 1 point from each of the 2 most distant clusters
        - This ensures verification covers different parts of the work area
     c. If all points in 1 cluster:
        - Random pick 2
     d. Prefer points that are NOT first or last in sequence
        (first and last are the most obvious, savvy fraudsters clean those)
  5. Mark selected points: isVerificationPoint = true
  6. Return (but do NOT tell mobile which are verification)

REVEAL LOGIC (mobile side):
  - GET /tasks/{taskId}/submission-progress returns isVerificationPoint for each point
  - BUT mobile only shows "VERIFY" badge when worker GPS is within 50m of that point
  - This prevents worker from pre-identifying verification points from a distance
```

## 3.5 GPS Location Match Scoring

```
computeLocationMatchScore(workerLat, workerLng, buyerLat, buyerLng):

Uses Haversine formula to compute distance in meters.

SCORING TABLE:
  Distance (meters)  |  Score  |  Meaning
  ─────────────────────────────────────────
  0 - 10             |  100    |  Exact match (same spot)
  11 - 50            |  90     |  Very close (correct area)
  51 - 100           |  75     |  Nearby (probably correct)
  101 - 200          |  50     |  Moderate (could be adjacent area)
  201 - 500          |  25     |  Far (suspicious)
  500+               |  0      |  Too far (likely fraud)

NOTES:
  - Returns null if either GPS is missing (not penalized, just unknown)
  - Indoor tasks may have higher tolerance (GPS less accurate indoors)
  - Score stored on WorkerPointSubmission.locationMatchScore
  - Used in rule engine confidence calculation
```

---

# 4. PLAN B — Silent Witness Protocol (Enhanced)

## 4.1 Core Philosophy

> "The best verification is invisible to the worker."

Every verification layer runs in the background. The worker's experience is identical to Plan A — take reference-matched photos. But underneath, four independent proof systems operate silently.

## 4.2 Layer 1: Environmental DNA Fingerprinting

### What It Captures

```
ENVIRONMENTAL FINGERPRINT (captured in ~2 seconds):

1. WiFi Signature (Android only):
   - List of visible WiFi SSIDs + BSSID (MAC) + signal strength (dBm)
   - Unique per ~10m radius in urban areas
   - Even without connecting to any network
   - Example: [{ssid:"JioCafe", bssid:"A4:B3:C2:D1", rssi:-45}, ...]

2. Cell Tower Signature:
   - Connected cell tower ID (CID) + Location Area Code (LAC)
   - Signal strength
   - Neighboring cell towers visible
   - Unique per ~200m radius

3. Magnetometer Reading:
   - XYZ magnetic field in microtesla
   - Unique per building due to rebar, wiring, metal structures
   - Even outdoor readings vary by location (underground pipes, nearby buildings)
   - Example: {x: 12.4, y: -23.1, z: 45.7}

4. Barometric Pressure:
   - Atmospheric pressure in hPa
   - Indicates altitude (floor level in buildings)
   - Indoor/outdoor detection
   - Example: 1013.25 hPa

5. Ambient Light Level:
   - Light sensor reading in lux
   - Indoor/outdoor indicator
   - Time-of-day consistency check
   - Example: 45000 lux (outdoor sunny) vs 300 lux (indoor)
```

### When It's Captured

```
BUYER SIDE:
  PostTaskScreen Step 4 ("Document Area")
  -> When buyer takes first reference photo
  -> Silently captures environmental DNA
  -> Uploaded with reference points
  -> Stored in TaskEnvironmentFingerprint table

WORKER SIDE:
  ActiveTaskScreen -> "Start Work" button tap
  -> Silently captures environmental DNA
  -> Sent to backend with start request
  -> Stored in WorkerEnvironmentCapture table

  Also captured at:
  -> Each photo capture (embedded in metadata)
  -> Task submission (final capture)
```

### Comparison Algorithm

```
compareEnvironmentalDNA(buyerDNA, workerDNA):

SCORING (out of 100):

1. WiFi Match (30 points):
   - Count common BSSIDs between buyer and worker scans
   - commonCount / max(buyerCount, workerCount) * 30
   - Signal strength difference within 15dBm = bonus points
   - Note: WiFi networks change over time, so only compare if
     captures are within 7 days of each other

2. Cell Tower Match (25 points):
   - Same primary cell tower = 15 points
   - Same Location Area Code = 10 points
   - Same neighboring towers = bonus 5 points

3. Magnetometer Proximity (25 points):
   - Compute Euclidean distance: sqrt((x1-x2)^2 + (y1-y2)^2 + (z1-z2)^2)
   - Distance < 5 uT = 25 points (same spot)
   - Distance < 15 uT = 15 points (same building/area)
   - Distance < 30 uT = 5 points (same neighborhood)
   - Distance > 30 uT = 0 points (different location)
   - Note: Magnetometer is affected by nearby phones/metal, so
     this is a soft signal, not a hard proof

4. Barometric Consistency (10 points):
   - Difference < 0.5 hPa = 10 points (same altitude/floor)
   - Difference < 2 hPa = 5 points (nearby altitude)
   - Difference > 2 hPa = 0 points (different floor/altitude)

5. Ambient Light Consistency (10 points):
   - Both outdoor (>5000 lux) or both indoor (<1000 lux) = 10 points
   - Mismatch = 0 points
   - Note: Time of day affects this — normalize for solar position

OVERALL:
  90-100: HIGH CONFIDENCE — very likely same location
  70-89:  MODERATE — probably same location
  50-69:  LOW — possibly different location
  0-49:   SUSPICIOUS — likely different location

LIMITATIONS:
  - WiFi not available on iOS (Apple restriction)
  - Magnetometer needs calibration (prompt user to wave phone in figure-8)
  - Barometer not present on all devices
  - NEVER used as sole fraud indicator — always combined with GPS + photos
```

### Implementation

```
MOBILE: useEnvironmentalDNA() hook

// mobile/src/hooks/useEnvironmentalDNA.ts
// ~60 lines of code

import { Magnetometer, Barometer } from 'expo-sensors'
import * as Brightness from 'expo-brightness'
import NetInfo from '@react-native-community/netinfo'

export function useEnvironmentalDNA() {
  const capture = async (): Promise<EnvironmentalDNA> => {
    const [mag, baro, netInfo, brightness] = await Promise.all([
      readMagnetometer(),      // expo-sensors: 1-second sample
      readBarometer(),         // expo-sensors: single reading
      NetInfo.fetch(),         // cell info
      Brightness.getBrightnessAsync(), // ambient light proxy
    ])

    return {
      magnetometer: { x: mag.x, y: mag.y, z: mag.z },
      barometer: baro?.pressure ?? null,
      cellType: netInfo.type,
      cellDetails: netInfo.details,
      ambientLight: brightness,
      capturedAt: new Date().toISOString(),
    }
  }

  return { capture }
}

BACKEND: New table + comparison function

// TaskEnvironmentFingerprint (buyer)
// WorkerEnvironmentCapture (worker)
// compareEnvironmentalDNA() function
// ~80 lines of code
```

## 4.3 Layer 2: Motion Signature Classification

### What It Captures

```
ACCELEROMETER DATA (phone in worker's pocket):

Raw data: {x, y, z} at 10 Hz (10 readings per second)
Processed in 30-second windows

MOTION PATTERNS:

Sweeping/Mopping:
  Characteristics: Rhythmic lateral (X-axis) oscillation
  Frequency: 0.5 - 2.0 Hz
  Amplitude: Moderate (2-8 m/s²)
  Duration: Extended (minutes)

  X: ╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲
  Y: ────────────────────────
  Z: ────────────────────────

Scrubbing:
  Characteristics: High-frequency, low-amplitude oscillation
  Frequency: 2.0 - 5.0 Hz
  Amplitude: Small (1-4 m/s²)
  Duration: Extended

  X: ⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿
  Y: ⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿⫿
  Z: ────────────────────────

Walking:
  Characteristics: Regular vertical (Z-axis) impulse
  Frequency: 1.5 - 2.5 Hz (steps)
  Amplitude: High Z-axis (8-15 m/s²)

  Z: ⋀_⋀_⋀_⋀_⋀_⋀_⋀_⋀_⋀_⋀_

Standing Still:
  Characteristics: Minimal variation in all axes
  Amplitude: Very low (<0.5 m/s² above gravity)

  X: ────────────────────────
  Y: ────────────────────────
  Z: ════════════════════════ (gravity only)

Vehicle/Transport:
  Characteristics: Irregular vibration + sudden velocity changes
  Frequency: Mixed (engine vibration + road bumps)
  High-amplitude spikes at stops/starts

  X: ~∿╱~∿╱~~╲∿~╱~~∿~~╲~~
  Y: ~╲∿~∿╱~~∿~╲∿~~╱∿~~∿~
  Z: ~∿~∿~⋀~~∿~∿~⋀~~∿~∿~~
```

### V1 Implementation (No ML — Simple Rules)

```
CLASSIFICATION RULES (v1 — threshold-based):

For each 30-second window:

1. Compute statistics:
   - variance_xyz = var(x) + var(y) + var(z)
   - dominant_freq = FFT peak frequency
   - step_count = count(z_peaks > threshold)
   - max_acceleration = max(magnitude(x,y,z))

2. Classify:
   IF variance_xyz < 0.5:
     -> STANDING (phone barely moving)

   ELIF step_count > 30 AND dominant_freq in [1.5, 2.5]:
     -> WALKING (regular stepping pattern)

   ELIF max_acceleration > 20 AND variance is irregular:
     -> VEHICLE (high acceleration + vibration)

   ELIF variance_xyz > 2.0 AND dominant_freq in [0.5, 5.0]:
     -> CLEANING (sustained rhythmic motion)

   ELSE:
     -> ACTIVE (generic movement, probably working)

3. Aggregate over full task duration:
   motionSummary = {
     cleaning: 65%,    // CLEANING + ACTIVE windows
     walking: 20%,     // WALKING windows
     standing: 10%,    // STANDING windows
     vehicle: 5%,      // VEHICLE windows
     totalWindows: 94, // 47 minutes / 30 seconds
   }
```

### Fraud Detection Rules

```
MOTION-BASED FRAUD SIGNALS:

RED FLAGS (high confidence fraud):
  - vehicle > 30%     → Worker spent significant time in a vehicle
  - standing > 70%    → Worker stood around, didn't clean
  - cleaning < 10% AND task duration > 20min → No cleaning activity detected
  - Task duration < 5 min for a MEDIUM/LARGE area → Impossibly fast

YELLOW FLAGS (suspicious, needs review):
  - standing > 40%    → Lots of idle time
  - cleaning < 30%    → Minimal cleaning activity
  - No WALKING detected at all → Didn't move around the area

GREEN (legitimate work pattern):
  - cleaning > 50%    → Majority of time spent cleaning
  - walking 10-30%    → Moving between areas (expected)
  - standing < 20%    → Normal rest breaks
  - cleaning + walking > 70% → Worker was active most of the time
```

### Implementation

```
MOBILE: Background accelerometer task

// Extends existing expo-task-manager background location task
// Add accelerometer sampling to the same background service

// mobile/src/services/motionTracker.ts
// ~100 lines of code

import { Accelerometer } from 'expo-sensors'

let motionBuffer: {x: number, y: number, z: number}[] = []
let motionWindows: MotionWindow[] = []

// Called by existing background location task
export function startMotionTracking() {
  Accelerometer.setUpdateInterval(100) // 10 Hz
  Accelerometer.addListener(({x, y, z}) => {
    motionBuffer.push({x, y, z})

    // Process every 30 seconds (300 samples at 10Hz)
    if (motionBuffer.length >= 300) {
      const window = classifyWindow(motionBuffer)
      motionWindows.push(window)
      motionBuffer = []
    }
  })
}

export function getMotionSummary(): MotionSummary {
  const total = motionWindows.length
  return {
    cleaning: motionWindows.filter(w => w.type === 'CLEANING' || w.type === 'ACTIVE').length / total,
    walking:  motionWindows.filter(w => w.type === 'WALKING').length / total,
    standing: motionWindows.filter(w => w.type === 'STANDING').length / total,
    vehicle:  motionWindows.filter(w => w.type === 'VEHICLE').length / total,
    totalWindows: total,
  }
}

BACKEND: New table + fraud rules
// MotionSummary stored on task submit
// Used in confidence scoring
// ~40 lines of code
```

## 4.4 Layer 5: Citizen Mesh Verification

### How It Works

```
TIMELINE:

T = 0:    Worker completes task, submits
T = 1-48h: Random delay (prevents gaming)
T = delay: System selects eligible citizens

CITIZEN SELECTION:
  1. Find citizens with app installed within 500m of task location
  2. Filter: must have verified account, not related to worker
  3. Filter: not already used for this task
  4. Filter: haven't been notified in last 24h (prevent spam)
  5. Select 1-3 citizens (more for higher-value tasks)

NOTIFICATION:
  "📸 Quick Verify near [area name]! Take a photo for ₹5"

CITIZEN FLOW:
┌──────────────────────────────────────┐
│  Verify Task #1234                   │
│                                      │
│  A worker cleaned this area.         │
│  Help us verify!                     │
│                                      │
│  Worker's "after" photo:             │
│  ┌────────────────────────────────┐  │
│  │  [Worker's after photo of      │  │
│  │   the cleaned area]            │  │
│  └────────────────────────────────┘  │
│                                      │
│  📸 Take a photo of this same area   │
│  right now:                          │
│                                      │
│  [Open Camera]                       │
│                                      │
│  Or quick rate:                      │
│  [😊 Clean] [😐 Partially] [😠 Dirty]│
│                                      │
│  Reward: ₹5 (₹10 if you find fraud) │
└──────────────────────────────────────┘

CITIZEN TAPS "Open Camera":
  1. CaptureCamera opens (standard mode, no side-by-side)
  2. Citizen takes photo of the area
  3. Photo uploaded with GPS + timestamp
  4. Backend compares:
     a. GPS proximity to task location
     b. AI visual comparison: citizen photo vs worker "after" photo
        - If area still looks clean: PASS
        - If area looks dirty: FAIL (worker may have faked it)

SCORING:
  Citizen photo confirms clean: Worker trust +1, Citizen earns ₹5
  Citizen photo shows dirty:    Worker flagged for review, Citizen earns ₹10
  Citizen only rates (no photo): Citizen earns ₹2 (lower reward, less evidence)
  Multiple citizens disagree:    Escalate to supervisor
```

### Trust Score System

```
WORKER TRUST SCORE:

Starts at: 50 (neutral)
Range: 0 - 100

EVENTS THAT INCREASE TRUST:
  +2: Task approved by buyer
  +1: Citizen mesh verification confirms work
  +3: AI confidence score > 90
  +5: 10 consecutive approved tasks (streak bonus)
  +1: Environmental DNA match > 90%
  +1: Motion signature shows > 60% cleaning activity

EVENTS THAT DECREASE TRUST:
  -5:  Task rejected by buyer
  -3:  Citizen mesh shows area still dirty
  -10: AI detects suspicious activity
  -8:  GPS flagged (>500m from task)
  -15: Confirmed fraud (multiple failed verifications)
  -2:  Motion signature shows < 10% cleaning activity

TRUST TIERS:
  0-20:   BLOCKED — Cannot accept tasks, account under review
  21-40:  PROBATION — Limited to low-value tasks, extra verification
  41-60:  STANDARD — Normal access
  61-80:  TRUSTED — Priority task access, faster payment
  81-100: ELITE — Premium tasks, instant payment, higher rates

WORKER SEES:
┌────────────────────────────────┐
│  Your Trust Score: 78 ⭐       │
│  Tier: TRUSTED                 │
│  ████████████████░░░░ 78/100   │
│                                │
│  Benefits:                     │
│  ✅ Priority task access       │
│  ✅ Payment within 2 hours     │
│  ⬜ Instant payment (need 81+) │
└────────────────────────────────┘
```

### Implementation

```
BACKEND: Citizen verification module

NEW ENDPOINTS:
  POST /api/v1/citizen/verify-tasks       → List tasks to verify near citizen
  POST /api/v1/citizen/verify/:taskId     → Submit verification photo/rating
  GET  /api/v1/citizen/verify-history     → Past verifications + earnings

NEW TABLE: CitizenVerification
  id, taskId, citizenId, photoUrl, rating,
  citizenLat, citizenLng, verifiedAt, rewardAmount, rewardPaid

NEW JOB: citizen-verify-scheduler
  - Runs every hour
  - Finds tasks completed 1-48 hours ago without citizen verification
  - Selects eligible citizens
  - Sends push notifications

MOBILE: New citizen screen
  CitizenVerifyScreen.tsx — shows task to verify + camera + rating

ESTIMATED CODE: ~200 lines backend, ~150 lines mobile
```

## 4.5 Layer 6: Adversarial Dual-AI Verification

### How It Works

```
AFTER WORKER SUBMITS:

STEP 1: Rule Engine (instant, ~5ms)
  Computes confidence score from:
  - Verification completeness (20 pts)
  - Photo coverage (25 pts)
  - GPS proximity average (25 pts)
  - Time on site (15 pts)
  - Fraud flags (15 pts)
  = Base score out of 100

STEP 2: Environmental + Motion Bonus (instant, ~5ms)
  - Environmental DNA match > 80% → +5 bonus points
  - Motion cleaning activity > 50% → +5 bonus points
  - Both → +10 bonus points
  = Adjusted score out of 110 (normalized to 100)

STEP 3: AI Verifier (async, ~10s)
  Model: claude-sonnet-4-5
  Input: Per-point buyer/worker image pairs
  Task: "Assess if cleaning was done for each pair"
  Output: {
    score: 0-1,
    label: EXCELLENT | GOOD | UNCERTAIN | POOR,
    reasoning: string,
    workEvident: boolean,
    recommendation: APPROVE | REVIEW | REJECT
  }

STEP 4: AI Adversary (async, ~15s)
  Model: claude-sonnet-4-5 (DIFFERENT system prompt)
  Input: ALL evidence — photos + GPS + environmental + motion + metadata
  Task: "Find ANY reason this might be fraudulent"
  Checks:
    a. Photo consistency:
       - Are "after" photos actually different from "before"?
       - Do any photos show signs of AI generation?
       - Are cloud/sky patterns consistent across photos?
       - Do shadow angles match the timestamp?
    b. GPS consistency:
       - Do photo GPS coordinates form a logical walking path?
       - Any teleportation (>100m in <30 seconds)?
       - GPS accuracy values — low accuracy = indoor or spoofed?
    c. Temporal consistency:
       - Are photo timestamps in order?
       - Is time between photos reasonable for the distance walked?
       - Does task duration match the number of photos taken?
    d. Environmental consistency:
       - Does environmental DNA match between start and end of task?
       - Does motion data show cleaning activity during the task?
       - Any long idle periods followed by burst of photos?
    e. Historical patterns:
       - Has this worker been flagged before?
       - Similar GPS trails to previously rejected tasks?
       - Unusual working hours or patterns?
  Output: {
    fraudProbability: 0-1,
    anomalies: [{type, description, severity}],
    recommendation: PASS | FLAG | REJECT
  }

STEP 5: Decision Matrix
  ┌──────────────┬──────────────┬──────────────────────┐
  │ AI Verifier  │ AI Adversary │ Decision             │
  ├──────────────┼──────────────┼──────────────────────┤
  │ APPROVE      │ PASS         │ AUTO-APPROVE         │
  │ APPROVE      │ FLAG         │ SUPERVISOR REVIEW    │
  │ APPROVE      │ REJECT       │ SUPERVISOR REVIEW    │
  │ REVIEW       │ PASS         │ SUPERVISOR REVIEW    │
  │ REVIEW       │ FLAG         │ SUPERVISOR REVIEW    │
  │ REVIEW       │ REJECT       │ AUTO-REJECT          │
  │ REJECT       │ PASS         │ SUPERVISOR REVIEW    │
  │ REJECT       │ FLAG         │ AUTO-REJECT          │
  │ REJECT       │ REJECT       │ AUTO-REJECT          │
  └──────────────┴──────────────┴──────────────────────┘

  ALSO: If rule engine score > 95 AND both AIs approve → INSTANT PAYMENT
        (no buyer review needed — full automation for high-confidence tasks)
```

### Implementation

```
BACKEND: Adversarial AI module

// backend/src/modules/ai/adversarial-ai.service.ts
// ~120 lines of code

export async function adversarialCheck(taskId: string): Promise<AdversarialResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      referencePoints: true,
      workerSubmissions: true,
      media: true,
    },
  })

  const environmentData = await prisma.workerEnvironmentCapture.findFirst({
    where: { taskId },
  })

  const motionData = await prisma.taskMotionSummary.findFirst({
    where: { taskId },
  })

  const prompt = buildAdversarialPrompt(task, environmentData, motionData)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: ADVERSARIAL_SYSTEM_PROMPT, // "Your job is to find fraud..."
    messages: [{ role: 'user', content: prompt }],
  })

  return parseAdversarialResponse(response)
}

NEW JOB: adversarial-verify.job.ts
  - Triggered after AI verifier completes
  - Runs adversarial check
  - Combines results into final decision
  - Updates task with final verdict
```

---

# 5. MERGED IMPLEMENTATION — Final Architecture

## 5.1 Complete System Flow

```
╔══════════════════════════════════════════════════════════════════════╗
║                    eCLEAN v2 — COMPLETE FLOW                       ║
╚══════════════════════════════════════════════════════════════════════╝

BUYER                          SYSTEM                        WORKER
─────                          ──────                        ──────

1. Create Task
   ├── Category
   ├── Details
   ├── Location (GPS)
   ├── Reference Points ──────→ Store in DB
   │   (3-10 photos with       ├── Upload to Cloudinary
   │    labels + GPS)          ├── Create TaskReferencePoint
   │                           ├── Capture buyer's EnvDNA
   │                           └── Set totalReferencePoints
   ├── Environment: OUTDOOR
   └── Pay via Razorpay ──────→ Task status: OPEN

                                                             2. Browse & Accept
                                                                ├── View reference photos
                                                                ├── See task on map
                               ←── Accept request ──────────────┘
                               ├── Status: ACCEPTED
                               ├── Select 2 verification pts
                               │   (random, hidden from worker)
                               ├── Preload images to device
                               └── Worker travels to site

                                                             3. Start Work
                                                                ├── Tap "Start Work"
                               ←── Start request ──────────────┘
                               ├── Geofence check (500m)
                               ├── Status: IN_PROGRESS
                               ├── Start timer
                               │
                               │   ┌─ SILENT LAYER 1 ─────────┐
                               │   │ Capture Environmental DNA │
                               │   │ (WiFi+Cell+Mag+Baro)      │
                               │   └───────────────────────────┘
                               │
                               │   ┌─ SILENT LAYER 2 ─────────┐
                               │   │ Start Motion Tracking     │
                               │   │ (Accelerometer 10Hz)      │
                               │   └───────────────────────────┘

                                                             4. Capture Photos
                                                                FOR EACH reference point:
                                                                ├── Open CaptureCamera
                                                                │   (side-by-side mode)
                                                                ├── See buyer's ref image
                                                                ├── Match angle + capture
                                                                ├── GPS + hash recorded
                               ←── Photo upload ───────────────┤
                               ├── Upload to Cloudinary        │
                               ├── Create WorkerPointSubmission│
                               ├── Compute locationMatchScore  │
                               ├── Create AnalyticsPhotoMeta   │
                               │                               │
                               │   [If verification point      │
                               │    revealed at <50m:           │
                               │    mediaType = VERIFICATION]  │
                               │                               └── (repeat for each point)

                                                             5. Submit Work
                                                                ├── Review all pairs
                                                                ├── See progress summary
                                                                ├── Tap "Submit"
                               ←── Submit request ─────────────┘
                               │
                               ├── VALIDATION:
                               │   ├── All verification photos? ✓
                               │   ├── 70%+ regular points?     ✓
                               │   └── Minimum 3 after photos?  ✓
                               │
                               ├── Status: SUBMITTED
                               │
                               │   ┌─ SILENT LAYER 2 END ─────┐
                               │   │ Stop Motion Tracking      │
                               │   │ Compute MotionSummary     │
                               │   │ Store: cleaning %, etc.   │
                               │   └───────────────────────────┘
                               │
                               ├── RULE ENGINE (instant):
                               │   ├── Verification: 20 pts
                               │   ├── Coverage:     25 pts
                               │   ├── GPS:          25 pts
                               │   ├── Time:         15 pts
                               │   ├── Fraud flags:  15 pts
                               │   ├── EnvDNA bonus: +5 pts
                               │   └── Motion bonus: +5 pts
                               │   = Confidence Score
                               │
                               ├── AI VERIFIER (async ~10s):
                               │   ├── Send paired images
                               │   ├── Score cleaning quality
                               │   └── Recommendation
                               │
                               ├── AI ADVERSARY (async ~15s):
                               │   ├── Check ALL evidence
                               │   ├── Find anomalies
                               │   └── Fraud probability
                               │
                               ├── DECISION:
                               │   ├── Both PASS + score>95 → AUTO-APPROVE
                               │   ├── Disagree → SUPERVISOR REVIEW
                               │   └── Both REJECT → AUTO-REJECT
                               │
6. Review (if needed)          │
   ├── See paired photos       │
   ├── See confidence score    │
   ├── See AI reasoning        │
   ├── Approve or Reject ──────→ Status: APPROVED/REJECTED
                               │
                               ├── If APPROVED:
                               │   ├── Create Payout (10% fee)
                               │   ├── Update worker stats
                               │   └── Update trust score
                               │
                               │   ┌─ SILENT LAYER 5 ─────────┐
                               │   │ 1-48 hours later:         │
                               │   │ Citizen Mesh Verification │
                               │   │ Random citizen nearby     │
                               │   │ takes photo to confirm    │
                               │   │ area is still clean       │
                               │   │ → Updates trust score     │
                               │   └───────────────────────────┘
```

## 5.2 Data Flow Per Photo

```
SINGLE PHOTO CAPTURE → UPLOAD → VERIFICATION:

CAPTURE (mobile, ~2 seconds):
  ┌──────────────────────────────────────────────┐
  │ CaptureCamera Component                      │
  │                                              │
  │ Promise.all([                                │
  │   camera.takePictureAsync({quality: 0.92}),  │
  │   Location.getCurrentPositionAsync(),        │
  │   environmentalDNA.capture(),   ← NEW        │
  │ ])                                           │
  │                                              │
  │ Then:                                        │
  │   photoHash = SHA256(imageBytes)             │
  │                                              │
  │ Output: {                                    │
  │   uri: '/path/to/photo.jpg',                 │
  │   lat: 12.9716,                              │
  │   lng: 77.5946,                              │
  │   timestamp: '2026-03-30T14:23:00Z',         │
  │   deviceId: 'Pixel_6',                       │
  │   photoHash: 'a3f2b4e5...',                  │
  │   envDNA: {mag, baro, cell, light},  ← NEW  │
  │ }                                            │
  └──────────────────────────────────────────────┘
           │
           ▼
COMPRESS (mobile, ~1 second):
  ┌──────────────────────────────────────────────┐
  │ expo-image-manipulator                       │
  │   resize: max 1200px                         │
  │   compress: 0.75 quality                     │
  │   format: JPEG                               │
  │                                              │
  │ Also: create 200px thumbnail for gallery     │
  └──────────────────────────────────────────────┘
           │
           ▼
UPLOAD (mobile → backend, ~3-5 seconds):
  ┌──────────────────────────────────────────────┐
  │ POST /api/v1/tasks/{taskId}/points/{pointId}/submit │
  │                                              │
  │ Headers:                                     │
  │   Content-Type: multipart/form-data          │
  │   Idempotency-Key: {taskId}-{pointId}-{hash} │
  │   Authorization: Bearer {token}              │
  │                                              │
  │ Body (FormData):                             │
  │   file: [compressed JPEG]                    │
  │   mediaType: AFTER | VERIFICATION            │
  │   capturedLat: 12.9716                       │
  │   capturedLng: 77.5946                       │
  │   capturedAt: 2026-03-30T14:23:00Z           │
  │   deviceId: Pixel_6                          │
  │   photoHash: a3f2b4e5...                     │
  │   envMagX: 12.4                      ← NEW  │
  │   envMagY: -23.1                     ← NEW  │
  │   envMagZ: 45.7                      ← NEW  │
  │   envBarometer: 1013.25              ← NEW  │
  │   envAmbientLight: 0.85             ← NEW  │
  │   envCellType: cellular              ← NEW  │
  └──────────────────────────────────────────────┘
           │
           ▼
BACKEND PROCESSING (~2-3 seconds):
  ┌──────────────────────────────────────────────┐
  │ 1. Validate file (MIME, size)                │
  │ 2. Idempotency check                        │
  │ 3. Permission check (worker owns task)       │
  │ 4. Extract EXIF (fire-and-forget)            │
  │ 5. Upload to Cloudinary                      │
  │    → Returns: secure_url, public_id          │
  │ 6. Compute locationMatchScore                │
  │    → haversine(workerGPS, buyerGPS)          │
  │ 7. Create WorkerPointSubmission record       │
  │ 8. Create AnalyticsPhotoMeta record          │
  │    → Flag if GPS > 500m from task            │
  │ 9. Store environmental data on submission    │
  │ 10. Emit socket: task:photo_added            │
  │ 11. Return submission record to mobile       │
  └──────────────────────────────────────────────┘
```

---

# 6. DATABASE SCHEMA — Complete

## 6.1 New Prisma Models

```prisma
// ============================================================
// ENUM UPDATES
// ============================================================

enum MediaType {
  BEFORE        // legacy — keep for backward compat
  AFTER         // worker's cleanup proof per reference point
  PROOF         // legacy — keep for backward compat
  REFERENCE     // buyer's reference point image (legacy, still used by TaskMedia)
  VERIFICATION  // worker recreates buyer's image at verification points (NEW)
  ARRIVAL       // optional worker arrival image (NEW)
  REPORT        // citizen report photos
  PROFILE       // profile pictures
}

// ============================================================
// NEW MODEL: TaskReferencePoint
// ============================================================
// Core table connecting buyer reference images to worker after images.
// Created when buyer uploads reference photos during task creation.

model TaskReferencePoint {
  id                 String    @id @default(uuid())
  taskId             String
  pointIndex         Int       // 1-10, order of capture
  label              String?   // buyer's note: "near gate", "drain corner"
  buyerImageUrl      String    // Cloudinary URL of buyer's reference photo
  buyerImagePublicId String?   // for Cloudinary deletion
  buyerLat           Float?    // GPS where buyer took the photo
  buyerLng           Float?
  buyerHeading       Float?    // compass direction (future use)
  isVerificationPoint Boolean  @default(false)  // true for 2 random spot-checks
  createdAt          DateTime  @default(now())

  task               Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  workerSubmissions  WorkerPointSubmission[]

  @@unique([taskId, pointIndex])
  @@index([taskId])
}

// ============================================================
// NEW MODEL: WorkerPointSubmission
// ============================================================
// Links each worker photo to a specific reference point.
// Created when worker uploads a photo for a reference point.

model WorkerPointSubmission {
  id                    String    @id @default(uuid())
  taskId                String
  referencePointId      String
  workerId              String
  mediaType             MediaType // AFTER or VERIFICATION
  imageUrl              String    // Cloudinary URL
  imagePublicId         String?   // for Cloudinary deletion
  workerLat             Float?
  workerLng             Float?
  workerHeading         Float?
  photoHash             String?   // SHA-256 of image bytes
  capturedAt            DateTime?
  deviceId              String?
  idempotencyKey        String?   @unique  // retry-safe uploads
  status                String    @default("UPLOADED") // PENDING | UPLOADING | UPLOADED | FAILED

  // Environmental DNA (captured with this photo)
  envMagX               Float?    // Magnetometer X
  envMagY               Float?    // Magnetometer Y
  envMagZ               Float?    // Magnetometer Z
  envBarometer          Float?    // Atmospheric pressure (hPa)
  envAmbientLight       Float?    // Light level (0-1)
  envCellType           String?   // cellular | wifi | none

  // Scoring (populated by rule engine)
  locationMatchScore    Float?    // GPS proximity to buyer point (0-100)
  visualSimilarityScore Float?    // future: image embedding comparison

  createdAt             DateTime  @default(now())

  task                  Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  referencePoint        TaskReferencePoint @relation(fields: [referencePointId], references: [id], onDelete: Cascade)

  @@index([taskId])
  @@index([referencePointId])
  @@index([workerId])
}

// ============================================================
// NEW MODEL: TaskEnvironmentFingerprint
// ============================================================
// Buyer's environmental DNA captured at task creation site.
// Compared against worker's captures for location verification.

model TaskEnvironmentFingerprint {
  id              String   @id @default(uuid())
  taskId          String   @unique

  // Magnetometer
  magX            Float?
  magY            Float?
  magZ            Float?

  // Barometer
  barometer       Float?   // hPa

  // Ambient light
  ambientLight    Float?   // 0-1 normalized

  // Cell info
  cellType        String?  // cellular | wifi
  cellCarrier     String?

  // WiFi (Android only — JSON array)
  wifiNetworks    String?  // JSON: [{ssid, bssid, rssi}]

  capturedAt      DateTime
  createdAt       DateTime @default(now())

  task            Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
}

// ============================================================
// NEW MODEL: WorkerEnvironmentCapture
// ============================================================
// Worker's environmental DNA captured at task start.

model WorkerEnvironmentCapture {
  id              String   @id @default(uuid())
  taskId          String
  workerId        String
  captureType     String   // START | PHOTO | SUBMIT

  magX            Float?
  magY            Float?
  magZ            Float?
  barometer       Float?
  ambientLight    Float?
  cellType        String?
  cellCarrier     String?
  wifiNetworks    String?  // JSON

  // Comparison result (computed on creation)
  matchScore      Float?   // 0-100 compared to buyer's fingerprint

  capturedAt      DateTime
  createdAt       DateTime @default(now())

  task            Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
  @@index([workerId])
}

// ============================================================
// NEW MODEL: TaskMotionSummary
// ============================================================
// Aggregated motion data from worker's task duration.
// Computed from accelerometer data on task submit.

model TaskMotionSummary {
  id              String   @id @default(uuid())
  taskId          String   @unique
  workerId        String

  // Percentages (0-1)
  cleaningPct     Float    // CLEANING + ACTIVE windows
  walkingPct      Float    // WALKING windows
  standingPct     Float    // STANDING windows
  vehiclePct      Float    // VEHICLE windows

  totalWindows    Int      // number of 30-second windows
  durationSecs    Int      // total tracking duration

  // Fraud flags
  hasRedFlag      Boolean  @default(false)  // vehicle>30% OR standing>70%
  hasYellowFlag   Boolean  @default(false)  // standing>40% OR cleaning<30%

  createdAt       DateTime @default(now())

  task            Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
}

// ============================================================
// NEW MODEL: CitizenVerification
// ============================================================
// Post-task verification by random citizen walking past.

model CitizenVerification {
  id              String    @id @default(uuid())
  taskId          String
  citizenId       String

  // Citizen's evidence
  photoUrl        String?   // Cloudinary URL (if photo taken)
  photoPublicId   String?
  rating          String    // CLEAN | PARTIALLY_CLEAN | DIRTY
  citizenLat      Float?
  citizenLng      Float?

  // Result
  matchesWorker   Boolean?  // AI comparison result

  // Reward
  rewardAmount    Int       // in paise (500 = ₹5, 1000 = ₹10)
  rewardPaid      Boolean   @default(false)

  verifiedAt      DateTime
  createdAt       DateTime  @default(now())

  task            Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
  @@index([citizenId])
}

// ============================================================
// UPDATED MODEL: Task (new fields only)
// ============================================================

model Task {
  // ... ALL existing fields remain unchanged ...

  // NEW: Reference point system
  indoorOutdoor         String?    @default("OUTDOOR") // INDOOR | OUTDOOR | MIXED
  totalReferencePoints  Int?       @default(0)
  areaSizeEstimate      String?    // SMALL | MEDIUM | LARGE

  // NEW: Worker timer (more precise)
  workStartedAt         DateTime?  // when worker pressed "Start Work"
  workDurationSecs      Int?       // total seconds worked

  // NEW: Device integrity
  deviceIntegrityStatus String?    // TRUSTED | SUSPICIOUS | UNKNOWN

  // NEW: Confidence scoring
  ruleEngineScore       Int?       // 0-100 from rule engine
  ruleEngineBreakdown   String?    // JSON: {verification: 20, coverage: 25, ...}
  adversarialScore      Float?     // 0-1 fraud probability from adversarial AI
  adversarialAnomalies  String?    // JSON: [{type, description, severity}]
  finalDecision         String?    // AUTO_APPROVE | SUPERVISOR_REVIEW | AUTO_REJECT

  // NEW: Environmental match
  envMatchScore         Float?     // 0-100

  // NEW: Motion summary
  motionCleaningPct     Float?     // 0-1
  motionHasRedFlag      Boolean?   @default(false)

  // NEW: Trust score impact
  trustScoreChange      Int?       // +/- change from this task

  // NEW: Relations
  referencePoints       TaskReferencePoint[]
  workerSubmissions     WorkerPointSubmission[]
  environmentFingerprint TaskEnvironmentFingerprint?
  workerEnvCaptures     WorkerEnvironmentCapture[]
  motionSummary         TaskMotionSummary?
  citizenVerifications  CitizenVerification[]

  // ... ALL existing relations remain unchanged ...
}
```

## 6.2 Migration SQL

```sql
-- ============================================================
-- MIGRATION: add_reference_point_system
-- ============================================================

-- 1. New enum values
ALTER TYPE "MediaType" ADD VALUE IF NOT EXISTS 'VERIFICATION';
ALTER TYPE "MediaType" ADD VALUE IF NOT EXISTS 'ARRIVAL';

-- 2. New Task fields
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "indoorOutdoor" TEXT DEFAULT 'OUTDOOR';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "totalReferencePoints" INTEGER DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "areaSizeEstimate" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "workStartedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "workDurationSecs" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "deviceIntegrityStatus" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "ruleEngineScore" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "ruleEngineBreakdown" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "adversarialScore" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "adversarialAnomalies" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "finalDecision" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "envMatchScore" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "motionCleaningPct" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "motionHasRedFlag" BOOLEAN DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "trustScoreChange" INTEGER;

-- 3. TaskReferencePoint
CREATE TABLE IF NOT EXISTS "TaskReferencePoint" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "pointIndex" INTEGER NOT NULL,
    "label" TEXT,
    "buyerImageUrl" TEXT NOT NULL,
    "buyerImagePublicId" TEXT,
    "buyerLat" DOUBLE PRECISION,
    "buyerLng" DOUBLE PRECISION,
    "buyerHeading" DOUBLE PRECISION,
    "isVerificationPoint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskReferencePoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaskReferencePoint_taskId_pointIndex_key"
  ON "TaskReferencePoint"("taskId", "pointIndex");
CREATE INDEX IF NOT EXISTS "TaskReferencePoint_taskId_idx"
  ON "TaskReferencePoint"("taskId");
ALTER TABLE "TaskReferencePoint" ADD CONSTRAINT "TaskReferencePoint_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE;

-- 4. WorkerPointSubmission
CREATE TABLE IF NOT EXISTS "WorkerPointSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "referencePointId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "workerLat" DOUBLE PRECISION,
    "workerLng" DOUBLE PRECISION,
    "workerHeading" DOUBLE PRECISION,
    "photoHash" TEXT,
    "capturedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "envMagX" DOUBLE PRECISION,
    "envMagY" DOUBLE PRECISION,
    "envMagZ" DOUBLE PRECISION,
    "envBarometer" DOUBLE PRECISION,
    "envAmbientLight" DOUBLE PRECISION,
    "envCellType" TEXT,
    "locationMatchScore" DOUBLE PRECISION,
    "visualSimilarityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerPointSubmission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkerPointSubmission_idempotencyKey_key"
  ON "WorkerPointSubmission"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "WorkerPointSubmission_taskId_idx"
  ON "WorkerPointSubmission"("taskId");
CREATE INDEX IF NOT EXISTS "WorkerPointSubmission_referencePointId_idx"
  ON "WorkerPointSubmission"("referencePointId");
CREATE INDEX IF NOT EXISTS "WorkerPointSubmission_workerId_idx"
  ON "WorkerPointSubmission"("workerId");
ALTER TABLE "WorkerPointSubmission" ADD CONSTRAINT "WorkerPointSubmission_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE;
ALTER TABLE "WorkerPointSubmission" ADD CONSTRAINT "WorkerPointSubmission_referencePointId_fkey"
  FOREIGN KEY ("referencePointId") REFERENCES "TaskReferencePoint"("id") ON DELETE CASCADE;

-- 5. TaskEnvironmentFingerprint
CREATE TABLE IF NOT EXISTS "TaskEnvironmentFingerprint" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "magX" DOUBLE PRECISION,
    "magY" DOUBLE PRECISION,
    "magZ" DOUBLE PRECISION,
    "barometer" DOUBLE PRECISION,
    "ambientLight" DOUBLE PRECISION,
    "cellType" TEXT,
    "cellCarrier" TEXT,
    "wifiNetworks" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEnvironmentFingerprint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaskEnvironmentFingerprint_taskId_key"
  ON "TaskEnvironmentFingerprint"("taskId");
ALTER TABLE "TaskEnvironmentFingerprint" ADD CONSTRAINT "TaskEnvironmentFingerprint_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE;

-- 6. WorkerEnvironmentCapture
CREATE TABLE IF NOT EXISTS "WorkerEnvironmentCapture" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "captureType" TEXT NOT NULL,
    "magX" DOUBLE PRECISION,
    "magY" DOUBLE PRECISION,
    "magZ" DOUBLE PRECISION,
    "barometer" DOUBLE PRECISION,
    "ambientLight" DOUBLE PRECISION,
    "cellType" TEXT,
    "cellCarrier" TEXT,
    "wifiNetworks" TEXT,
    "matchScore" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerEnvironmentCapture_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkerEnvironmentCapture_taskId_idx"
  ON "WorkerEnvironmentCapture"("taskId");
CREATE INDEX IF NOT EXISTS "WorkerEnvironmentCapture_workerId_idx"
  ON "WorkerEnvironmentCapture"("workerId");
ALTER TABLE "WorkerEnvironmentCapture" ADD CONSTRAINT "WorkerEnvironmentCapture_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE;

-- 7. TaskMotionSummary
CREATE TABLE IF NOT EXISTS "TaskMotionSummary" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "cleaningPct" DOUBLE PRECISION NOT NULL,
    "walkingPct" DOUBLE PRECISION NOT NULL,
    "standingPct" DOUBLE PRECISION NOT NULL,
    "vehiclePct" DOUBLE PRECISION NOT NULL,
    "totalWindows" INTEGER NOT NULL,
    "durationSecs" INTEGER NOT NULL,
    "hasRedFlag" BOOLEAN NOT NULL DEFAULT false,
    "hasYellowFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskMotionSummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaskMotionSummary_taskId_key"
  ON "TaskMotionSummary"("taskId");
ALTER TABLE "TaskMotionSummary" ADD CONSTRAINT "TaskMotionSummary_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE;

-- 8. CitizenVerification
CREATE TABLE IF NOT EXISTS "CitizenVerification" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "photoUrl" TEXT,
    "photoPublicId" TEXT,
    "rating" TEXT NOT NULL,
    "citizenLat" DOUBLE PRECISION,
    "citizenLng" DOUBLE PRECISION,
    "matchesWorker" BOOLEAN,
    "rewardAmount" INTEGER NOT NULL,
    "rewardPaid" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CitizenVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CitizenVerification_taskId_idx"
  ON "CitizenVerification"("taskId");
CREATE INDEX IF NOT EXISTS "CitizenVerification_citizenId_idx"
  ON "CitizenVerification"("citizenId");
ALTER TABLE "CitizenVerification" ADD CONSTRAINT "CitizenVerification_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE;
```

---

# 7. BACKEND API SPECIFICATION

## 7.1 New Endpoints — Reference Points

### POST /api/v1/tasks/:taskId/reference-points

```
PURPOSE: Buyer uploads a reference point image with metadata
AUTH: Bearer token (must be buyer who owns the task)
TASK STATUS: Must be OPEN (or DRAFT if we add that)

REQUEST:
  Content-Type: multipart/form-data
  Headers:
    Authorization: Bearer {token}
    Idempotency-Key: {taskId}-ref-{pointIndex}-{photoHash}

  Body:
    file:        [JPEG/PNG/WebP, max 10MB]
    pointIndex:  1-10 (integer)
    label:       "Near the gate" (optional string, max 100 chars)
    capturedLat: 12.9716 (optional float)
    capturedLng: 77.5946 (optional float)
    capturedAt:  2026-03-30T14:23:00Z (optional ISO string)
    photoHash:   a3f2b4e5... (optional SHA-256 hex)

    // Environmental DNA (optional)
    envMagX:     12.4
    envMagY:     -23.1
    envMagZ:     45.7
    envBarometer: 1013.25
    envAmbientLight: 0.85
    envCellType: cellular

RESPONSE (201):
  {
    "referencePoint": {
      "id": "uuid",
      "taskId": "uuid",
      "pointIndex": 1,
      "label": "Near the gate",
      "buyerImageUrl": "https://res.cloudinary.com/...",
      "buyerLat": 12.9716,
      "buyerLng": 77.5946,
      "isVerificationPoint": false,
      "createdAt": "2026-03-30T14:23:00Z"
    }
  }

ERRORS:
  400: Maximum 10 reference points allowed
  400: Can only add reference points to OPEN tasks
  400: Invalid file type (must be JPEG/PNG/WebP)
  400: File too large (max 10MB)
  403: Not your task
  404: Task not found
  409: Idempotency key already processed (returns existing)

VALIDATION (Zod):
  pointIndex: z.number().int().min(1).max(10)
  label: z.string().max(100).optional()
  capturedLat: z.number().min(-90).max(90).optional()
  capturedLng: z.number().min(-180).max(180).optional()
```

### GET /api/v1/tasks/:taskId/reference-points

```
PURPOSE: Get all reference points for a task
AUTH: Bearer token (buyer who owns task, assigned worker, supervisor, admin)

RESPONSE (200):
  {
    "referencePoints": [
      {
        "id": "uuid",
        "taskId": "uuid",
        "pointIndex": 1,
        "label": "Near the gate",
        "buyerImageUrl": "https://res.cloudinary.com/...",
        "buyerLat": 12.9716,
        "buyerLng": 77.5946,
        "isVerificationPoint": false,  // HIDDEN until worker is within 50m
        "createdAt": "2026-03-30T14:23:00Z",
        "workerSubmission": null  // or submission object if exists
      },
      // ... more points
    ],
    "totalPoints": 4,
    "verificationRequired": 2
  }

NOTE ON VERIFICATION POINT VISIBILITY:
  - For BUYER: always shows isVerificationPoint = true/false
  - For WORKER: shows isVerificationPoint = false ALWAYS in this endpoint
  - Worker discovers verification points via proximity check on mobile
  - This prevents worker from knowing which points to prioritize

  Alternative: Backend can check worker's current GPS (from recent socket emit)
  and reveal verification status only for points where worker is within 50m.
  This requires GET endpoint to accept optional lat/lng query params.
```

### DELETE /api/v1/tasks/:taskId/reference-points/:pointId

```
PURPOSE: Buyer removes a reference point before task is accepted
AUTH: Bearer token (must be buyer who owns task)
TASK STATUS: Must be OPEN (cannot delete after worker accepts)

RESPONSE (200):
  { "message": "Reference point deleted" }

SIDE EFFECTS:
  - Delete image from Cloudinary
  - Decrement task.totalReferencePoints
  - Re-index remaining points (optional — or allow gaps)

ERRORS:
  400: Cannot delete reference points after task is accepted
  403: Not your task
  404: Reference point not found
```

## 7.2 New Endpoints — Worker Submissions

### POST /api/v1/tasks/:taskId/points/:pointId/submit

```
PURPOSE: Worker submits a photo for a specific reference point
AUTH: Bearer token (must be assigned worker)
TASK STATUS: Must be IN_PROGRESS

REQUEST:
  Content-Type: multipart/form-data
  Headers:
    Authorization: Bearer {token}
    Idempotency-Key: {taskId}-{pointId}-{photoHash}

  Body:
    file:         [JPEG/PNG/WebP, max 10MB]
    mediaType:    AFTER | VERIFICATION
    capturedLat:  12.9718
    capturedLng:  77.5948
    capturedAt:   2026-03-30T14:35:00Z
    deviceId:     Pixel_6
    photoHash:    b4e2c3d1...

    // Environmental DNA
    envMagX:      12.5
    envMagY:      -23.0
    envMagZ:      45.8
    envBarometer: 1013.20
    envAmbientLight: 0.82
    envCellType:  cellular

RESPONSE (201):
  {
    "submission": {
      "id": "uuid",
      "taskId": "uuid",
      "referencePointId": "uuid",
      "workerId": "uuid",
      "mediaType": "AFTER",
      "imageUrl": "https://res.cloudinary.com/...",
      "workerLat": 12.9718,
      "workerLng": 77.5948,
      "locationMatchScore": 90,
      "status": "UPLOADED",
      "createdAt": "2026-03-30T14:35:00Z"
    }
  }

VALIDATION:
  - If mediaType is VERIFICATION, the point must be isVerificationPoint = true
  - If mediaType is AFTER, any point is valid
  - One submission per point per type (idempotency handles retries)

SIDE EFFECTS:
  - Upload to Cloudinary
  - Compute locationMatchScore (haversine)
  - Create AnalyticsPhotoMeta
  - Compare environmental DNA to buyer fingerprint
  - Emit socket: task:photo_added
```

### GET /api/v1/tasks/:taskId/submission-progress

```
PURPOSE: Get worker's capture progress for a task
AUTH: Bearer token (assigned worker, buyer, supervisor, admin)

QUERY PARAMS:
  workerLat: 12.9718 (optional — for verification point reveal)
  workerLng: 77.5948 (optional)

RESPONSE (200):
  {
    "totalPoints": 4,
    "verificationRequired": 2,
    "verificationCompleted": 1,
    "afterCompleted": 2,
    "canSubmit": false,  // true when all verification + 70% regular done
    "points": [
      {
        "id": "uuid",
        "pointIndex": 1,
        "label": "Near the gate",
        "buyerImageUrl": "https://res.cloudinary.com/...",
        "buyerLat": 12.9716,
        "buyerLng": 77.5946,
        "isVerificationPoint": false,
        "distanceFromWorker": 12,  // meters (if workerLat/Lng provided)
        "hasAfterSubmission": true,
        "hasVerificationSubmission": false,
        "afterSubmission": {
          "id": "uuid",
          "imageUrl": "https://...",
          "locationMatchScore": 90,
          "capturedAt": "..."
        }
      },
      {
        "id": "uuid",
        "pointIndex": 2,
        "label": "Drain section",
        "buyerImageUrl": "https://...",
        "buyerLat": 12.9720,
        "buyerLng": 77.5950,
        "isVerificationPoint": true,  // REVEALED because worker is 8m away
        "distanceFromWorker": 8,
        "hasAfterSubmission": false,
        "hasVerificationSubmission": false,
        "afterSubmission": null
      },
      // ... more points
    ],
    "summary": {
      "avgLocationScore": 85,
      "totalPhotos": 2,
      "elapsedMinutes": 23
    }
  }

VERIFICATION REVEAL LOGIC:
  For each point where isVerificationPoint = true:
    IF workerLat and workerLng are provided:
      distance = haversine(workerLat, workerLng, point.buyerLat, point.buyerLng)
      IF distance <= 50 meters:
        return isVerificationPoint = true  (REVEAL)
      ELSE:
        return isVerificationPoint = false (HIDE)
    ELSE:
      return isVerificationPoint = false (HIDE — no GPS means no reveal)
```

## 7.3 New Endpoints — Environmental DNA

### POST /api/v1/tasks/:taskId/environment

```
PURPOSE: Store buyer's environmental fingerprint during task creation
         OR worker's environmental capture during task execution
AUTH: Bearer token
TASK STATUS: OPEN (buyer) or IN_PROGRESS (worker)

REQUEST:
  {
    "captureType": "BUYER_CREATION" | "WORKER_START" | "WORKER_PHOTO" | "WORKER_SUBMIT",
    "magX": 12.4,
    "magY": -23.1,
    "magZ": 45.7,
    "barometer": 1013.25,
    "ambientLight": 0.85,
    "cellType": "cellular",
    "cellCarrier": "Jio",
    "wifiNetworks": [{"ssid":"JioCafe","bssid":"A4:B3:C2","rssi":-45}],
    "capturedAt": "2026-03-30T14:23:00Z"
  }

RESPONSE (201):
  {
    "id": "uuid",
    "matchScore": 82  // null for buyer (nothing to compare to yet)
  }
```

## 7.4 New Endpoints — Motion Summary

### POST /api/v1/tasks/:taskId/motion-summary

```
PURPOSE: Worker's phone sends aggregated motion data on task submit
AUTH: Bearer token (assigned worker)
TASK STATUS: IN_PROGRESS (sent just before submit)

REQUEST:
  {
    "cleaningPct": 0.65,
    "walkingPct": 0.20,
    "standingPct": 0.10,
    "vehiclePct": 0.05,
    "totalWindows": 94,
    "durationSecs": 2820
  }

RESPONSE (201):
  {
    "id": "uuid",
    "hasRedFlag": false,
    "hasYellowFlag": false
  }

NOTE: This is sent automatically by the mobile app, not manually by worker.
      The motion data is computed entirely on-device.
```

## 7.5 New Endpoints — Citizen Verification

### GET /api/v1/citizen/verify-tasks

```
PURPOSE: List tasks near citizen that need verification
AUTH: Bearer token (CITIZEN role)

QUERY PARAMS:
  lat: 12.9716 (required)
  lng: 77.5946 (required)
  radiusKm: 0.5 (optional, default 0.5)

RESPONSE (200):
  {
    "tasks": [
      {
        "id": "uuid",
        "title": "Street near park gate",
        "completedAt": "2026-03-30T15:00:00Z",
        "location": { "lat": 12.9716, "lng": 77.5946 },
        "distanceMeters": 120,
        "workerAfterImageUrl": "https://...",  // one representative photo
        "rewardAmount": 500  // paise = ₹5
      }
    ]
  }

NOTE: Only shows tasks completed 1-48 hours ago, not yet verified by citizen.
```

### POST /api/v1/citizen/verify/:taskId

```
PURPOSE: Citizen submits verification for a completed task
AUTH: Bearer token (CITIZEN role)

REQUEST:
  Content-Type: multipart/form-data
  Body:
    rating:      CLEAN | PARTIALLY_CLEAN | DIRTY
    file:        [optional JPEG photo]
    capturedLat: 12.9718
    capturedLng: 77.5948

RESPONSE (201):
  {
    "verification": {
      "id": "uuid",
      "rating": "CLEAN",
      "rewardAmount": 500,
      "rewardPaid": false,
      "message": "Thank you! ₹5 will be credited to your wallet."
    }
  }

SIDE EFFECTS:
  - If photo provided: upload to Cloudinary, AI compare to worker's after photo
  - Update worker trust score based on rating
  - Credit citizen reward (async via payout system)
```

## 7.6 Updated Endpoints

### POST /api/v1/worker/tasks/:taskId/submit (UPDATED)

```
CHANGES:
  - Old: Check for BEFORE + AFTER + PROOF in TaskMedia
  - New: Check WorkerPointSubmission completeness

NEW VALIDATION:
  1. Count reference points: total, verification
  2. Count worker submissions: after, verification
  3. Rules:
     a. ALL verification points must have VERIFICATION submissions
     b. At least 70% of all points must have AFTER submissions
     c. Minimum 3 AFTER submissions regardless of point count
  4. Receive and store motion summary (sent in same request or just before)
  5. Capture final environmental DNA

NEW PROCESSING AFTER SUBMIT:
  1. Status: IN_PROGRESS -> SUBMITTED
  2. Run rule engine (instant): compute confidence score
  3. Queue AI verifier job
  4. Queue adversarial AI job (after verifier completes)
  5. If rule engine score > 95 AND no red flags:
     → Mark as AUTO_APPROVE candidate (pending AI confirmation)
  6. Send notifications

BACKWARD COMPATIBILITY:
  If task has 0 reference points (legacy task):
    → Fall back to old 3-photo check (BEFORE + AFTER + PROOF)
    → This ensures existing tasks still work during migration
```

---

# 8. MOBILE SCREEN SPECIFICATIONS

## 8.1 Updated PostTaskScreen

```
FILE: mobile/src/screens/buyer/PostTaskScreen.tsx

CURRENT STEPS: 4 (Type -> Details -> Location -> Confirm)
NEW STEPS:     5 (Type -> Details -> Location -> Document Area -> Confirm)

NEW STEP 4 — "Document the Area":

STATE:
  referencePhotos: Array<{
    id: string           // temp ID for local management
    uri: string          // local file URI
    label: string        // buyer's description
    lat: number | null
    lng: number | null
    metadata: {
      timestamp: string
      deviceId: string
      photoHash: string
    }
    envDNA: EnvironmentalDNA | null
  }>

MINIMUM REQUIREMENTS (based on area size):
  SMALL:  minimum 2 reference photos
  MEDIUM: minimum 3 reference photos
  LARGE:  minimum 5 reference photos

MAXIMUM: 10 reference photos for all sizes

UI BEHAVIOR:
  - Grid of captured photos with labels
  - Tap photo to edit label or retake
  - Long press to delete
  - "Add" button opens CaptureCamera (photoType='REFERENCE')
  - After capture, prompt for label (optional)
  - Progress indicator: "3/10 reference points (min 3 required)"
  - "Continue" button disabled until minimum met
  - Environmental DNA captured silently with first photo

POST-CREATION UPLOAD FLOW:
  1. User taps "Pay & Post Task" on Step 5
  2. Create task via POST /api/v1/buyer/tasks
  3. Process payment via Razorpay
  4. Upload environmental DNA: POST /api/v1/tasks/{taskId}/environment
  5. Upload each reference photo sequentially:
     FOR i = 0 to referencePhotos.length:
       POST /api/v1/tasks/{taskId}/reference-points
       (file + pointIndex + label + GPS + photoHash)
  6. Update task: totalReferencePoints = count
  7. Show success screen with task summary

  ERROR HANDLING:
  - If photo upload fails: retry 3 times with exponential backoff
  - If some photos fail: show which ones failed, allow retry
  - Task is already created and paid — photos can be uploaded later
  - Add to offline queue if no network (offlineSync service)
```

## 8.2 New ReferencePointNavigator Screen

```
FILE: mobile/src/screens/worker/ReferencePointNavigator.tsx (NEW)

PURPOSE: Main worker screen during task execution. Shows reference points
         on map, tracks progress, opens camera for each point.

NAVIGATION: Accessible from ActiveTaskScreen after "Start Work"

PROPS:
  taskId: string

STATE:
  referencePoints: TaskReferencePoint[]    // from API
  submissions: WorkerPointSubmission[]      // from API
  workerLocation: { lat, lng } | null      // from GPS
  selectedPoint: TaskReferencePoint | null // currently selected
  cameraVisible: boolean                   // camera modal open
  progress: SubmissionProgress             // from API

HOOKS:
  useQuery('submission-progress', taskId)   // poll every 10s
  useSocket('worker:location')              // real-time GPS
  useEnvironmentalDNA()                     // passive capture
  useMotionTracker()                        // background accelerometer

LAYOUT:
  ┌──────────────────────────────────────┐
  │  [< Back]  Active Task  [⏱ 00:23:45]│
  │  Street near park gate               │
  │                                      │
  │  ┌────────────────────────────────┐  │
  │  │         MAP VIEW               │  │
  │  │  📍1(✅) 📍2(⬜) 📍3(⬜)      │  │
  │  │              📍4(⬜)           │  │
  │  │      🔵 Worker location        │  │
  │  │                                │  │
  │  │  [Zoom to fit all points]      │  │
  │  └────────────────────────────────┘  │
  │                                      │
  │  Reference Points:                   │
  │  ┌────────────────────────────────┐  │
  │  │ ✅ 1. Gate entrance      12m  │  │
  │  │    Score: 90 · After uploaded  │  │
  │  ├────────────────────────────────┤  │
  │  │ ⬜ 2. Drain section       8m  │  │
  │  │    🔒 VERIFY (within range)   │  │
  │  ├────────────────────────────────┤  │
  │  │ ⬜ 3. Wall area          45m  │  │
  │  │    Walk closer to capture     │  │
  │  ├────────────────────────────────┤  │
  │  │ ⬜ 4. Near tree         120m  │  │
  │  │    Walk closer to capture     │  │
  │  └────────────────────────────────┘  │
  │                                      │
  │  Progress: 1/4 after · 0/2 verified  │
  │  ████░░░░░░░░░░░░░░░░ 25%           │
  │                                      │
  │  [📸 Capture Next Point]            │
  │                                      │
  │  [Submit Work ->] (disabled)         │
  └──────────────────────────────────────┘

POINT TAP BEHAVIOR:
  Worker taps a point in the list:
    1. Scroll map to center on that point
    2. Show distance from worker to point
    3. If distance < 50m AND point is verification:
       Show "🔒 VERIFY" badge (was hidden before)
    4. Tap again (or tap "Capture") to open camera

CAMERA OPEN:
  Opens CaptureCamera in side-by-side mode:
    referenceImage: point.buyerImageUrl (or local cached URI)
    referenceLabel: point.label
    pointIndex: point.pointIndex
    totalPoints: referencePoints.length
    photoType: point.isVerificationPoint ? 'VERIFICATION' : 'AFTER'
    distanceFromPoint: computed meters

SUBMIT BUTTON:
  Disabled until:
    - All verification submissions complete
    - At least ceil(totalPoints * 0.7) after submissions
    - Minimum 3 after submissions

  Shows why disabled:
    "Need 1 more verification photo"
    "Need 2 more after photos"

ON SUBMIT TAP:
  1. Send motion summary: POST /tasks/{taskId}/motion-summary
  2. Send final env DNA: POST /tasks/{taskId}/environment
  3. Navigate to SubmitProofScreen for final review
```

## 8.3 Updated CaptureCamera — Side-by-Side Mode

```
FILE: mobile/src/components/camera/CaptureCamera.tsx (UPDATED)

NEW PROPS:
  interface CaptureCameraProps {
    taskId:         string | null
    photoType:      'BEFORE' | 'AFTER' | 'PROOF' | 'REFERENCE' | 'VERIFICATION' | 'GENERAL'
    onCapture:      (result: CaptureResult) => void
    onClose:        () => void

    // NEW: Reference point mode
    referenceImage?: string | null   // buyer's reference image URL/URI
    referenceLabel?: string | null   // "Near the gate"
    pointIndex?:     number | null   // which point (1-10)
    totalPoints?:    number | null   // total points in task
    distanceFromPoint?: number | null // meters from reference point GPS
  }

NEW CaptureResult:
  interface CaptureResult {
    uri:       string
    metadata:  CaptureMetadata
    envDNA?:   EnvironmentalDNA   // NEW: captured with photo
  }

LAYOUT WHEN referenceImage IS PROVIDED:

  ┌──────────────────────────────────────────┐
  │ [X]       POINT 3 / 7          [⚡Flash] │
  │           "Wall area"                     │
  │                                           │
  │ ┌─────────────────┐ ┌─────────────────┐  │
  │ │   REFERENCE     │ │   YOUR CAMERA   │  │
  │ │                 │ │   (live view)   │  │
  │ │   [buyer's      │ │   [camera       │  │
  │ │    dirty wall   │ │    viewfinder]  │  │
  │ │    photo with   │ │                 │  │
  │ │    semi-trans   │ │                 │  │
  │ │    overlay]     │ │                 │  │
  │ └─────────────────┘ └─────────────────┘  │
  │                                           │
  │  📍 15m from this point                   │
  │     ████████████░░░░░░░░ (proximity bar)  │
  │                                           │
  │  Match the reference angle                │
  │                                           │
  │           [ 📸 Capture ]                  │
  │                                           │
  │  🔒 GPS + Hash will be recorded           │
  └──────────────────────────────────────────┘

WHEN referenceImage IS NOT PROVIDED:
  Normal full-screen camera (existing behavior, unchanged)

PROXIMITY BAR:
  - Green (full):    < 15m  "You're at the spot ✅"
  - Yellow (partial): 15-50m "Walk closer"
  - Red (empty):     > 50m  "Too far — get closer"
  - Updates in real-time from GPS

CAPTURE FLOW (updated):
  1. Parallel execution:
     ├── camera.takePictureAsync({quality: 0.92})
     ├── Location.getCurrentPositionAsync({accuracy: HIGH})
     └── environmentalDNA.capture()   ← NEW
  2. Compute SHA-256 hash
  3. Build metadata + envDNA
  4. Show PhotoPreview with side-by-side comparison
  5. On confirm: return CaptureResult to parent
```

## 8.4 Updated SubmitProofScreen

```
FILE: mobile/src/screens/worker/SubmitProofScreen.tsx (UPDATED)

CURRENT: Shows 3-photo checklist (BEFORE, AFTER, PROOF)
NEW: Shows per-point progress with paired images

LAYOUT:
  ┌──────────────────────────────────────┐
  │  Review & Submit                     │
  │                                      │
  │  ┌────────────────────────────────┐  │
  │  │ Point 1 · Gate entrance        │  │
  │  │ ┌────────┐  →  ┌────────┐     │  │
  │  │ │ BEFORE │     │ AFTER  │     │  │
  │  │ │[buyer] │     │[worker]│     │  │
  │  │ └────────┘     └────────┘     │  │
  │  │ ✅ GPS: 12m · Score: 90       │  │
  │  └────────────────────────────────┘  │
  │                                      │
  │  ┌────────────────────────────────┐  │
  │  │ Point 2 · Drain section 🔒    │  │
  │  │ ┌────────┐  →  ┌────────┐     │  │
  │  │ │ BEFORE │     │ AFTER  │     │  │
  │  │ │[buyer] │     │[worker]│     │  │
  │  │ └────────┘     └────────┘     │  │
  │  │ ✅ Verified · 8m · Score: 100  │  │
  │  └────────────────────────────────┘  │
  │                                      │
  │  ... (scrollable list of all points) │
  │                                      │
  │  ┌────────────────────────────────┐  │
  │  │ Summary                        │  │
  │  │ ✅ 4/4 after photos            │  │
  │  │ ✅ 2/2 verification photos     │  │
  │  │ 📍 GPS trail: 34 points       │  │
  │  │ ⏱ Time on site: 47 min        │  │
  │  │ 💰 Earnings: ₹500             │  │
  │  └────────────────────────────────┘  │
  │                                      │
  │  ⚠️ Once submitted, your work will  │
  │  be verified by AI and the buyer.    │
  │                                      │
  │  [Go Back]        [Submit Work]      │
  └──────────────────────────────────────┘

BACKWARD COMPATIBILITY:
  If task has 0 reference points (legacy):
    Show old 3-photo checklist layout
    Check TaskMedia for BEFORE + AFTER + PROOF
```

## 8.5 New Mobile Types

```
FILE: mobile/src/types/index.ts (additions)

// Reference Point Types
export interface TaskReferencePoint {
  id: string
  taskId: string
  pointIndex: number
  label: string | null
  buyerImageUrl: string
  buyerLat: number | null
  buyerLng: number | null
  isVerificationPoint: boolean
  createdAt: string
  workerSubmission?: WorkerPointSubmission | null
  localImageUri?: string  // for offline cache
}

export interface WorkerPointSubmission {
  id: string
  taskId: string
  referencePointId: string
  workerId: string
  mediaType: 'AFTER' | 'VERIFICATION'
  imageUrl: string
  workerLat: number | null
  workerLng: number | null
  locationMatchScore: number | null
  status: string
  capturedAt: string | null
  createdAt: string
}

export interface SubmissionProgress {
  totalPoints: number
  verificationRequired: number
  verificationCompleted: number
  afterCompleted: number
  canSubmit: boolean
  points: Array<TaskReferencePoint & {
    distanceFromWorker: number | null
    hasAfterSubmission: boolean
    hasVerificationSubmission: boolean
    afterSubmission: WorkerPointSubmission | null
  }>
  summary: {
    avgLocationScore: number
    totalPhotos: number
    elapsedMinutes: number
  }
}

// Environmental DNA Types
export interface EnvironmentalDNA {
  magnetometer: { x: number; y: number; z: number } | null
  barometer: number | null
  ambientLight: number | null
  cellType: string | null
  cellCarrier: string | null
  wifiNetworks: Array<{ ssid: string; bssid: string; rssi: number }> | null
  capturedAt: string
}

// Motion Signature Types
export interface MotionSummary {
  cleaningPct: number  // 0-1
  walkingPct: number
  standingPct: number
  vehiclePct: number
  totalWindows: number
  durationSecs: number
}

export type MotionClassification = 'CLEANING' | 'WALKING' | 'STANDING' | 'VEHICLE' | 'ACTIVE'

// Citizen Verification Types
export interface CitizenVerifyTask {
  id: string
  title: string
  completedAt: string
  location: { lat: number; lng: number }
  distanceMeters: number
  workerAfterImageUrl: string
  rewardAmount: number  // paise
}

export interface CitizenVerificationResult {
  id: string
  rating: 'CLEAN' | 'PARTIALLY_CLEAN' | 'DIRTY'
  rewardAmount: number
  message: string
}

// Trust Score
export interface WorkerTrustScore {
  score: number         // 0-100
  tier: 'BLOCKED' | 'PROBATION' | 'STANDARD' | 'TRUSTED' | 'ELITE'
  recentChanges: Array<{
    taskId: string
    change: number
    reason: string
    date: string
  }>
}
```

## 8.6 New API Client

```
FILE: mobile/src/api/referencePoints.api.ts (NEW)

import { apiClient } from './client'
import { compressPhoto } from './media.api'
import type { TaskReferencePoint, WorkerPointSubmission, SubmissionProgress } from '../types'

export const referencePointsApi = {
  // Buyer uploads reference point
  upload: async (
    taskId: string,
    pointIndex: number,
    uri: string,
    label?: string,
    metadata?: { lat: number | null; lng: number | null; photoHash: string | null },
    envDNA?: EnvironmentalDNA | null,
  ): Promise<TaskReferencePoint> => {
    const compressedUri = await compressPhoto(uri)
    const formData = new FormData()
    formData.append('file', { uri: compressedUri, name: `ref_${pointIndex}.jpg`, type: 'image/jpeg' } as any)
    formData.append('pointIndex', String(pointIndex))
    if (label) formData.append('label', label)
    if (metadata?.lat != null) formData.append('capturedLat', String(metadata.lat))
    if (metadata?.lng != null) formData.append('capturedLng', String(metadata.lng))
    if (metadata?.photoHash) formData.append('photoHash', metadata.photoHash)
    if (envDNA?.magnetometer) {
      formData.append('envMagX', String(envDNA.magnetometer.x))
      formData.append('envMagY', String(envDNA.magnetometer.y))
      formData.append('envMagZ', String(envDNA.magnetometer.z))
    }
    if (envDNA?.barometer != null) formData.append('envBarometer', String(envDNA.barometer))
    if (envDNA?.ambientLight != null) formData.append('envAmbientLight', String(envDNA.ambientLight))

    const idempotencyKey = `${taskId}-ref-${pointIndex}-${metadata?.photoHash ?? Date.now()}`
    const res = await apiClient.post(`/tasks/${taskId}/reference-points`, formData, {
      headers: { 'Content-Type': 'multipart/form-data', 'Idempotency-Key': idempotencyKey },
      timeout: 30_000,
    })
    return res.data.referencePoint
  },

  // Get all reference points for a task
  list: (taskId: string): Promise<TaskReferencePoint[]> =>
    apiClient.get(`/tasks/${taskId}/reference-points`).then(r => r.data.referencePoints),

  // Delete a reference point (buyer only, before acceptance)
  remove: (taskId: string, pointId: string) =>
    apiClient.delete(`/tasks/${taskId}/reference-points/${pointId}`),

  // Worker submits point photo
  submitPoint: async (
    taskId: string,
    referencePointId: string,
    mediaType: 'AFTER' | 'VERIFICATION',
    uri: string,
    metadata?: { lat: number | null; lng: number | null; photoHash: string | null },
    envDNA?: EnvironmentalDNA | null,
  ): Promise<WorkerPointSubmission> => {
    const compressedUri = await compressPhoto(uri)
    const formData = new FormData()
    formData.append('file', { uri: compressedUri, name: `${mediaType.toLowerCase()}_${Date.now()}.jpg`, type: 'image/jpeg' } as any)
    formData.append('mediaType', mediaType)
    if (metadata?.lat != null) formData.append('capturedLat', String(metadata.lat))
    if (metadata?.lng != null) formData.append('capturedLng', String(metadata.lng))
    if (metadata?.photoHash) formData.append('photoHash', metadata.photoHash)
    if (envDNA?.magnetometer) {
      formData.append('envMagX', String(envDNA.magnetometer.x))
      formData.append('envMagY', String(envDNA.magnetometer.y))
      formData.append('envMagZ', String(envDNA.magnetometer.z))
    }
    if (envDNA?.barometer != null) formData.append('envBarometer', String(envDNA.barometer))

    const idempotencyKey = `${taskId}-${referencePointId}-${metadata?.photoHash ?? Date.now()}`
    const res = await apiClient.post(`/tasks/${taskId}/points/${referencePointId}/submit`, formData, {
      headers: { 'Content-Type': 'multipart/form-data', 'Idempotency-Key': idempotencyKey },
      timeout: 30_000,
    })
    return res.data.submission
  },

  // Get worker's progress
  progress: (taskId: string, workerLat?: number, workerLng?: number): Promise<SubmissionProgress> => {
    const params: Record<string, string> = {}
    if (workerLat != null) params.workerLat = String(workerLat)
    if (workerLng != null) params.workerLng = String(workerLng)
    return apiClient.get(`/tasks/${taskId}/submission-progress`, { params }).then(r => r.data)
  },

  // Send environmental DNA
  sendEnvironment: (taskId: string, captureType: string, envDNA: EnvironmentalDNA) =>
    apiClient.post(`/tasks/${taskId}/environment`, { captureType, ...envDNA }),

  // Send motion summary
  sendMotionSummary: (taskId: string, summary: MotionSummary) =>
    apiClient.post(`/tasks/${taskId}/motion-summary`, summary),
}
```

---

# 9. WORKFLOW DIAGRAMS

## 9.1 Complete Task Lifecycle

```
┌─────────┐     ┌──────────┐     ┌─────────────┐     ┌──────────────┐
│  BUYER   │     │  SYSTEM  │     │   WORKER    │     │   CITIZEN    │
│ Creates  │────>│  OPEN    │────>│  Browses    │     │              │
│ Task +   │     │          │     │  Accepts    │     │              │
│ Ref Pts  │     │          │     │             │     │              │
└─────────┘     └──────────┘     └─────────────┘     └──────────────┘
                      │                  │
                      ▼                  │
                ┌──────────┐             │
                │ ACCEPTED │<────────────┘
                │          │  Worker accepts
                │ Select 2 │  System picks verification
                │ verify   │  Preload images to device
                │ points   │
                └──────────┘
                      │
                      ▼  Worker arrives + starts
                ┌──────────────┐
                │ IN_PROGRESS  │
                │              │
                │ SILENT:      │
                │ ├─ EnvDNA    │  ← Captured on start
                │ ├─ Motion    │  ← Recording continuously
                │ └─ GPS trail │  ← Socket every 10s
                │              │
                │ WORKER:      │
                │ ├─ Cleans    │
                │ ├─ Photos    │  ← Per reference point
                │ └─ Verify    │  ← Revealed at <50m
                └──────────────┘
                      │
                      ▼  Worker submits
                ┌──────────────┐
                │  SUBMITTED   │
                │              │
                │ INSTANT:     │
                │ ├─ Rule eng  │  ← 5ms, confidence score
                │ └─ Motion    │  ← Fraud flags
                │              │
                │ ASYNC:       │
                │ ├─ AI Verify │  ← 10s, quality check
                │ └─ AI Advers │  ← 15s, fraud check
                │              │
                │ DECISION:    │
                │ ├─ Auto ✅   │  ← Score > 95 + both AIs pass
                │ ├─ Review 🔍 │  ← AIs disagree
                │ └─ Reject ❌ │  ← Both AIs reject
                └──────────────┘
                      │
              ┌───────┼───────┐
              ▼       ▼       ▼
         ┌────────┐ ┌─────┐ ┌────────┐
         │AUTO    │ │BUYER│ │AUTO    │
         │APPROVE │ │REVW │ │REJECT  │
         └────────┘ └─────┘ └────────┘
              │       │       │
              ▼       ▼       ▼
         ┌────────────────────────┐
         │  APPROVED / REJECTED   │
         │                        │
         │  If APPROVED:          │
         │  ├─ Create Payout      │
         │  ├─ Update trust score │
         │  └─ Queue citizen mesh │ ──────────┐
         └────────────────────────┘           │
                                              ▼  1-48 hours later
                                       ┌──────────────┐
                                       │   CITIZEN     │
                                       │   MESH        │
                                       │              │
                                       │ Citizen gets  │
                                       │ notification  │
                                       │ Takes photo   │
                                       │ Rates area    │
                                       │              │
                                       │ Result:       │
                                       │ ├─ Trust +1   │
                                       │ └─ Trust -3   │
                                       └──────────────┘
```

## 9.2 Rule Engine Scoring Breakdown

```
RULE ENGINE: computeTaskConfidence()

INPUT:
  ├── WorkerPointSubmissions[]
  ├── TaskReferencePoints[]
  ├── Task (duration, flags)
  ├── WorkerEnvironmentCapture (envDNA match)
  └── TaskMotionSummary (motion data)

SCORING:
  ┌───────────────────────────────────────────────────┐
  │                                                   │
  │  1. VERIFICATION COMPLETENESS          20 pts    │
  │     ═══════════════════════════                   │
  │     verDone / verRequired * 20                    │
  │     (2/2 = 20, 1/2 = 10, 0/2 = 0)               │
  │                                                   │
  │  2. PHOTO COVERAGE                     25 pts    │
  │     ═══════════════════════════                   │
  │     min(afterCount / totalPoints, 1) * 25         │
  │     (4/4 = 25, 3/4 = 18.75, 2/4 = 12.5)         │
  │                                                   │
  │  3. GPS PROXIMITY AVERAGE              25 pts    │
  │     ═══════════════════════════                   │
  │     avgLocationScore / 100 * 25                   │
  │     (avg 90 = 22.5, avg 75 = 18.75)             │
  │                                                   │
  │  4. TIME ON SITE                       15 pts    │
  │     ═══════════════════════════                   │
  │     min(actualMinutes / expectedMinutes, 1) * 15  │
  │     Expected = max(5, referencePoints * 3) min    │
  │     (47min for 4pts×3=12min expected = 15 full)  │
  │                                                   │
  │  5. NO FRAUD FLAGS                     15 pts    │
  │     ═══════════════════════════                   │
  │     15 - (flaggedPhotos * 5)                      │
  │     (0 flags = 15, 1 flag = 10, 3+ = 0)         │
  │                                                   │
  │  SUBTOTAL:                          /100 pts     │
  │                                                   │
  │  6. ENVIRONMENTAL DNA BONUS            +5 pts    │
  │     ═══════════════════════════                   │
  │     envMatchScore > 80% → +5                      │
  │                                                   │
  │  7. MOTION SIGNATURE BONUS             +5 pts    │
  │     ═══════════════════════════                   │
  │     cleaningPct > 50% → +5                        │
  │     (Also: redFlag → -10 penalty)                │
  │                                                   │
  │  FINAL SCORE: normalized to 0-100                │
  │                                                   │
  │  DECISION:                                        │
  │  ├── 85-100: AUTO_PASS (candidate for instant $) │
  │  ├── 65-84:  MANUAL_REVIEW (buyer/supervisor)    │
  │  └── 0-64:   REJECT (auto-reject)               │
  │                                                   │
  └───────────────────────────────────────────────────┘
```

## 9.3 Anti-Fraud Detection Layers

```
FRAUD ATTEMPT vs DETECTION LAYER:

FRAUD: "I'll spoof my GPS and take photos from home"
  └── CAUGHT BY: Environmental DNA (different WiFi, magnetic field, cell tower)
  └── CAUGHT BY: Motion signature (no walking/cleaning pattern)
  └── CAUGHT BY: GPS proximity mismatch on reference points

FRAUD: "I'll visit the site but not actually clean"
  └── CAUGHT BY: Motion signature (standing > 70%, cleaning < 10%)
  └── CAUGHT BY: AI verifier (before/after photos look the same)
  └── CAUGHT BY: Citizen mesh (citizen reports area still dirty)

FRAUD: "I'll use AI to generate clean versions of buyer's photos"
  └── CAUGHT BY: Adversarial AI (detects AI generation artifacts)
  └── CAUGHT BY: Environmental DNA changes (photos from different time/place)
  └── CAUGHT BY: Photo hash chain (hash doesn't match camera-captured image)

FRAUD: "I'll clean only the 2 verification spots and skip the rest"
  └── CAUGHT BY: Verification points hidden until proximity (can't plan ahead)
  └── CAUGHT BY: 70% coverage requirement (must do most points)
  └── CAUGHT BY: Citizen mesh (uncleaned areas reported)

FRAUD: "I'll send a friend to the location with my phone"
  └── CAUGHT BY: Device integrity check (if enabled)
  └── CAUGHT BY: Motion signature (friend won't clean, just stand + take photos)
  └── CAUGHT BY: Trust score history (pattern emerges over time)

FRAUD: "I'll take photos at a different clean location"
  └── CAUGHT BY: Side-by-side comparison (buyer's photo shows specific landmarks)
  └── CAUGHT BY: Environmental DNA (different building/area signature)
  └── CAUGHT BY: AI adversary (landmarks in after photo don't match reference)
```

---

# 10. ANTI-FRAUD DEEP DIVE

## 10.1 Defense-in-Depth Matrix

```
Each row is a fraud vector. Each column is a detection layer.
✅ = primary defense, 🟡 = secondary defense, ⬜ = not applicable

                    │ GPS  │ EnvDNA │ Motion │ Photo  │ AI    │ AI     │ Citizen │ Trust
FRAUD VECTOR        │ Match│ Match  │ Sig.   │ Hash   │ Verify│ Advers.│ Mesh    │ Score
────────────────────┼──────┼────────┼────────┼────────┼───────┼────────┼─────────┼──────
GPS spoofing        │  ⬜  │  ✅   │  🟡   │  ⬜   │  ⬜  │  🟡   │  ⬜    │  🟡
No actual cleaning  │  ⬜  │  ⬜   │  ✅   │  ⬜   │  ✅  │  🟡   │  ✅    │  🟡
AI-generated photos │  ⬜  │  🟡   │  ⬜   │  ✅   │  🟡  │  ✅   │  🟡    │  🟡
Wrong location      │  ✅  │  ✅   │  ⬜   │  ⬜   │  🟡  │  ✅   │  ✅    │  🟡
Partial cleaning    │  ⬜  │  ⬜   │  🟡   │  ⬜   │  ✅  │  🟡   │  ✅    │  ⬜
Old/stock photos    │  🟡  │  ✅   │  ✅   │  ✅   │  🟡  │  ✅   │  ⬜    │  🟡
Identity fraud      │  ⬜  │  ⬜   │  🟡   │  ⬜   │  ⬜  │  🟡   │  ⬜    │  ✅
Rushed job          │  ⬜  │  ⬜   │  ✅   │  ⬜   │  ✅  │  🟡   │  ✅    │  🟡

LAYERS DEFENDING:     2      4       5       2       4      7       4       6

Most robust layer: AI Adversary (catches 7/8 fraud types)
Most independent:  Motion Signature (requires no network, runs on-device)
Most delayed:      Citizen Mesh (catches fraud even after approval)
```

---

# 11. AI VERIFICATION SYSTEM

## 11.1 AI Verifier Prompt (Updated)

```
SYSTEM PROMPT:
You are an AI verification system for eClean, a civic work verification platform.
You will receive PAIRS of images — each pair consists of a buyer's "reference"
photo showing a dirty area, and a worker's "after" photo showing the same area
after cleaning.

Your job is to assess:
1. Is the "after" photo of the SAME location as the "reference"? (landmark matching)
2. Is the area visibly cleaner in the "after" photo?
3. Is there evidence of actual cleaning work (mop marks, wet surfaces, organized debris)?
4. Any suspicious activity (identical photos, AI-generated images, wrong location)?

Return ONLY valid JSON.

USER PROMPT (constructed per task):
Task: {task.title}
Category: {task.category}
Location: {task.location.address}
Points: {pairs.length} reference point pairs
Time spent: {task.workDurationSecs / 60} minutes

For each pair:
  Point {pair.pointIndex}: "{pair.label}"
  Reference image (buyer's dirty photo): [image]
  After image (worker's cleaned photo): [image]
  GPS distance between photos: {pair.locationMatchScore}m

Analyze all pairs and return:
{
  "overallScore": 0.0-1.0,
  "overallLabel": "EXCELLENT" | "GOOD" | "UNCERTAIN" | "POOR",
  "workEvident": true/false,
  "suspiciousActivity": false,
  "recommendation": "APPROVE" | "REVIEW" | "REJECT",
  "reasoning": "Brief explanation",
  "perPoint": [
    {
      "pointIndex": 1,
      "sameLocation": true/false,
      "cleaningVisible": true/false,
      "score": 0.0-1.0,
      "note": "Area looks clean, same wall visible"
    }
  ],
  "modelVersion": "claude-sonnet-4-5-20250514"
}
```

## 11.2 AI Adversary Prompt

```
SYSTEM PROMPT:
You are a FRAUD DETECTION AI for eClean. Your ONLY job is to find reasons
work might be fraudulent. You are skeptical by default. You look for anomalies,
inconsistencies, and patterns that suggest the worker didn't actually perform
the cleaning work.

You will receive:
- Paired before/after images
- GPS coordinates and timestamps
- Environmental sensor data
- Motion activity summary
- Worker's history summary

IMPORTANT: You are NOT judging cleaning quality. You are judging AUTHENTICITY.
A poorly cleaned area is still authentic work. A perfectly clean stock photo
is fraud.

USER PROMPT:
[All evidence provided]

Analyze and return:
{
  "fraudProbability": 0.0-1.0,
  "confidence": 0.0-1.0,
  "anomalies": [
    {
      "type": "GPS_INCONSISTENCY" | "PHOTO_MANIPULATION" | "TEMPORAL_ANOMALY" |
              "ENVIRONMENTAL_MISMATCH" | "MOTION_ANOMALY" | "PATTERN_MATCH",
      "description": "Photos 3 and 7 share identical cloud formations despite 23-minute gap",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    }
  ],
  "recommendation": "PASS" | "FLAG" | "REJECT",
  "reasoning": "Brief explanation of key findings"
}
```

## 11.3 Two-Phase AI Strategy (Cost Optimization)

```
PHASE 1: Quick check (2 images only — verification pairs)
  Cost: ~$0.01 per task
  Purpose: Pass/fail gate — catch obvious fraud early

  Send ONLY the 2 verification point pairs (4 images total)
  If AI says APPROVE with score > 0.8:
    → Skip Phase 2 for this task (save $0.03)
  If AI says REVIEW or REJECT:
    → Proceed to Phase 2

PHASE 2: Full analysis (all pairs)
  Cost: ~$0.03-0.05 per task
  Purpose: Detailed quality assessment

  Send ALL reference point pairs
  Full scoring + reasoning

COST ANALYSIS:
  Assumption: 1000 tasks/month
  Without optimization: 1000 × $0.04 = $40/month
  With Phase 1 gate (80% pass rate): 1000 × $0.01 + 200 × $0.04 = $18/month
  Savings: 55%
```

---

# 12. CITIZEN MESH NETWORK

## 12.1 Citizen Selection Algorithm

```
selectCitizensForVerification(task):

1. TIMING: Run 1-48 hours after task completion (random delay)
   - Random delay prevents gaming (worker can't predict when check happens)
   - Minimum 1 hour gives area time to "settle" (not immediately after cleanup)

2. GEOGRAPHIC FILTER:
   - Find all users with role=CITIZEN within 500m of task location
   - Must have valid device token (push notifications enabled)
   - Must have been active in app within last 7 days

3. EXCLUSION FILTER:
   - Cannot be the buyer or worker for this task
   - Cannot have already verified this task
   - Cannot have been notified in last 24 hours (prevent spam)
   - Cannot have more than 3 pending verifications
   - Cannot have trust score < 30 (unreliable citizen)

4. SELECTION:
   - For tasks with value < ₹500: select 1 citizen
   - For tasks with value ₹500-2000: select 2 citizens
   - For tasks with value > ₹2000: select 3 citizens
   - Prefer citizens closer to the task location
   - Prefer citizens who have verified before (experience)

5. NOTIFICATION:
   - Send push notification: "Quick verify near {area}! ₹5 reward"
   - Notification expires after 24 hours
   - If no citizen responds: try another batch after 12 hours
   - Maximum 3 batches per task (then mark as "unverified")

6. RESULT HANDLING:
   - If citizen says CLEAN: worker trust +1
   - If citizen says DIRTY: worker trust -3, escalate to supervisor
   - If multiple citizens: majority rules
   - If citizens disagree: escalate to supervisor
   - Photo evidence weighted more than rating-only
```

## 12.2 Citizen Rewards

```
REWARD STRUCTURE:

Quick rating only (no photo):     ₹2  (200 paise)
Rating + photo (area still clean): ₹5  (500 paise)
Rating + photo (found fraud):      ₹10 (1000 paise)
Bonus: 10th verification streak:   ₹20 (2000 paise)

PAYOUT:
  - Accumulated in citizen wallet
  - Minimum withdrawal: ₹50
  - Paid via UPI (same as worker payouts)

ANTI-GAMING:
  - Citizens can't verify the same area twice
  - Citizens can't verify tasks by friends/family (phone number check)
  - AI checks citizen photos for stock images / screenshots
  - Citizen trust score tracks accuracy over time
```

---

# 13. PATENT STRATEGY

## 13.1 Patent Portfolio

```
PATENT #1: "Silent Environmental Fingerprinting for Field Work Location Verification"
  CLAIM: Multi-sensor passive environmental signature capture (WiFi + cellular +
         magnetometer + barometric + ambient light) compared between task creator
         and task executor for location verification without GPS dependency.
  NOVELTY: No existing system combines these 5 passive sensors for gig work verification.

PATENT #2: "Motion Signature Classification for Physical Work Proof"
  CLAIM: Background accelerometer data processed in time windows, classified into
         work activity types (cleaning, walking, standing, vehicle), used as
         fraud detection signal in gig work verification.
  NOVELTY: Fitness apps classify exercise. No system classifies CLEANING WORK for verification.

PATENT #3: "Delayed Crowd-Sourced Verification Network for Completed Physical Tasks"
  CLAIM: Post-completion random citizen verification via geo-targeted push notifications
         with photo comparison and incentivized rating system, where timing is randomized
         to prevent gaming and citizen selection is proximity-based.
  NOVELTY: Waze does crowd-sourced traffic. No system does crowd-sourced WORK VERIFICATION.

PATENT #4: "Adversarial Dual-AI Verification System for Field Work Assessment"
  CLAIM: Two AI models with opposing objectives (one optimized for quality assessment,
         one optimized for fraud detection) cross-examining the same evidence set,
         with disagreement triggering human review.
  NOVELTY: GANs use adversarial training. No system uses adversarial AI for WORK VERIFICATION.

PATENT #5 (UMBRELLA): "Proof of Physical Work Protocol (PoPW)"
  CLAIM: Integrated multi-layer passive verification protocol combining:
         (a) spatial reference point matching with blind verification selection,
         (b) environmental DNA fingerprinting,
         (c) motion signature classification,
         (d) delayed citizen mesh verification,
         (e) adversarial dual-AI assessment,
         where the worker's verification burden is zero additional actions beyond
         standard task photography.
  NOVELTY: The combined protocol with ZERO extra worker effort is entirely unprecedented.
```

## 13.2 Filing Strategy

```
TIMELINE:

WEEK 1 (NOW):
  ├── File PROVISIONAL PATENT in India (₹1,600 for startup)
  │   Title: "Proof of Physical Work Protocol"
  │   Covers all 5 patents as one provisional
  │   Establishes priority date: March 30, 2026
  │
  └── File US PROVISIONAL PATENT ($320 for small entity)
      Same content, establishes US priority date

MONTH 6:
  ├── Convert India provisional → COMPLETE SPECIFICATION
  │   Cost: ₹50,000-80,000 (with patent agent)
  │   Deadline: 12 months from provisional
  │
  └── File PCT APPLICATION (international)
      Cost: ~₹2-3 lakh
      Covers 153 countries
      Deadline: 12 months from provisional

MONTH 18:
  └── Enter national phase in target countries:
      US, EU, India, UAE, Singapore
      Based on business traction

RECOMMENDED PATENT AGENT:
  Look for IP firms specializing in software/IoT patents in India:
  - Anand & Anand (Delhi)
  - K&S Partners (Bangalore)
  - Remfry & Sagar
  Search: "software patent attorney Hyderabad CRI guidelines 2025"
```

---

# 14. IMPLEMENTATION TIMELINE

## 14.1 Phase Breakdown

```
PHASE 1: DATABASE + SCHEMA (1 session, ~2 hours)
═══════════════════════════════════════════════
  ☐ Add VERIFICATION, ARRIVAL to MediaType enum
  ☐ Add TaskReferencePoint model
  ☐ Add WorkerPointSubmission model (with status + idempotencyKey + envDNA fields)
  ☐ Add TaskEnvironmentFingerprint model
  ☐ Add WorkerEnvironmentCapture model
  ☐ Add TaskMotionSummary model
  ☐ Add CitizenVerification model
  ☐ Add new Task fields (all listed above)
  ☐ Generate Prisma migration
  ☐ Apply migration to dev database
  ☐ Update mobile/src/types/index.ts with new types

PHASE 2: BACKEND — REFERENCE POINTS (2 sessions, ~4 hours)
═══════════════════════════════════════════════════════════
  ☐ Create backend/src/modules/reference-points/ directory
  ☐ reference-points.schema.ts (Zod validation)
  ☐ reference-points.service.ts (CRUD + Cloudinary upload)
  ☐ reference-points.routes.ts (POST, GET, DELETE)
  ☐ worker-submission.service.ts (submit point photo)
  ☐ worker-submission.routes.ts (POST submit, GET progress)
  ☐ Update tasks.service.ts: selectVerificationPoints() in acceptTask
  ☐ Update tasks.service.ts: submitTask() validation (new requirements)
  ☐ Remove media.service.ts dedup logic (lines 69-78)
  ☐ Add VERIFICATION, ARRIVAL to media.schema.ts TASK_MEDIA_TYPES
  ☐ Register new routes in app.ts
  ☐ Test all endpoints with Postman/curl

PHASE 3: BACKEND — VERIFICATION ENGINE (1 session, ~2 hours)
═════════════════════════════════════════════════════════════
  ☐ Create backend/src/modules/verification/rule-engine.ts
  ☐ computeTaskConfidence() with all scoring categories
  ☐ Environmental DNA comparison function
  ☐ Wire rule engine into submit flow
  ☐ Update ai.service.ts for paired image verification
  ☐ Create adversarial-ai.service.ts
  ☐ Create adversarial-verify.job.ts (BullMQ job)
  ☐ Decision matrix logic

PHASE 4: MOBILE — BUYER FLOW (2 sessions, ~4 hours)
════════════════════════════════════════════════════
  ☐ Create mobile/src/api/referencePoints.api.ts
  ☐ Create mobile/src/hooks/useEnvironmentalDNA.ts
  ☐ Update PostTaskScreen: add Step 4 "Document the Area"
  ☐ Multi-photo capture grid with labels
  ☐ Reference photo upload after task creation
  ☐ Environmental DNA capture with first photo
  ☐ Update BuyerTaskDetailScreen: show reference point pairs
  ☐ Test full buyer flow

PHASE 5: MOBILE — WORKER FLOW (2 sessions, ~4 hours)
═════════════════════════════════════════════════════
  ☐ Update CaptureCamera: side-by-side mode
  ☐ Add referenceImage, referenceLabel, pointIndex props
  ☐ GPS proximity indicator overlay
  ☐ Create ReferencePointNavigator.tsx screen
  ☐ Map with reference point markers
  ☐ Point list with distance + progress
  ☐ Update ActiveTaskScreen: integrate reference point flow
  ☐ Update SubmitProofScreen: per-point progress display
  ☐ Add ReferencePointNavigator to WorkerNavigator
  ☐ Task preloading (download reference images on accept)
  ☐ Test full worker flow

PHASE 6: MOBILE — SILENT LAYERS (1 session, ~2 hours)
═════════════════════════════════════════════════════
  ☐ Create mobile/src/services/motionTracker.ts
  ☐ Accelerometer sampling + classification (v1: threshold rules)
  ☐ Integrate with existing background location task
  ☐ Send motion summary on task submit
  ☐ Environmental DNA capture on start + each photo + submit
  ☐ Test silent layers don't affect performance/battery

PHASE 7: CITIZEN MESH (1 session, ~2 hours)
═══════════════════════════════════════════
  ☐ Backend: citizen verification endpoints
  ☐ Backend: citizen-verify-scheduler job (BullMQ cron)
  ☐ Backend: citizen selection algorithm
  ☐ Mobile: CitizenVerifyScreen.tsx
  ☐ Mobile: citizen notification handling
  ☐ Update CitizenNavigator with verify screen
  ☐ Test citizen flow

PHASE 8: INTEGRATION + POLISH (1 session, ~2 hours)
════════════════════════════════════════════════════
  ☐ End-to-end test: buyer → worker → submit → AI → citizen
  ☐ Backward compatibility: legacy tasks with 0 reference points
  ☐ Socket events for real-time submission progress
  ☐ Error handling + retry logic
  ☐ Offline queue for failed uploads
  ☐ Performance testing (battery, memory, network usage)
  ☐ Update CLAUDE.md, HANDOFF.md, SPRINTS.md
```

## 14.2 Session Estimates

```
TOTAL: ~10 sessions, ~22 hours of development

SESSION  │ PHASE  │ WHAT                          │ EST. TIME
─────────┼────────┼───────────────────────────────┼──────────
1        │ 1      │ Database schema + migration    │ 2 hours
2        │ 2a     │ Reference point CRUD APIs      │ 2 hours
3        │ 2b     │ Worker submission + submit flow│ 2 hours
4        │ 3      │ Rule engine + AI updates       │ 2 hours
5        │ 4a     │ Buyer PostTaskScreen + API     │ 2 hours
6        │ 4b     │ Buyer detail screen + env DNA  │ 2 hours
7        │ 5a     │ CaptureCamera side-by-side     │ 2 hours
8        │ 5b     │ ReferencePointNavigator        │ 2 hours
9        │ 6+7    │ Motion tracker + Citizen mesh  │ 3 hours
10       │ 8      │ Integration + E2E testing      │ 3 hours
```

---

# 15. RISK ANALYSIS

## 15.1 Technical Risks

```
RISK: Accelerometer drains battery too fast
  PROBABILITY: Medium
  IMPACT: Workers disable battery optimization → tracking stops
  MITIGATION: Sample at 5Hz instead of 10Hz. Use batch processing.
              Only track during active task (not 24/7).
              Show battery usage in settings. Target < 3% additional drain.

RISK: Environmental DNA varies between buyer and worker visits
  PROBABILITY: Medium (WiFi networks change, magnetometer drift)
  IMPACT: False positives on location mismatch
  MITIGATION: Use soft scoring (bonus points, not hard requirement).
              Never reject SOLELY based on envDNA mismatch.
              Weight GPS + photos more heavily.

RISK: Side-by-side camera is confusing for uneducated workers
  PROBABILITY: Low (design is simple: match what you see)
  IMPACT: Workers take wrong angles, lower match scores
  MITIGATION: Show buyer's photo with semi-transparent overlay on camera.
              Add simple Hindi/local language instructions.
              First-time walkthrough tutorial.

RISK: Citizen mesh doesn't get enough participation
  PROBABILITY: Medium (citizens may ignore notifications)
  IMPACT: No post-task verification
  MITIGATION: Start with ₹5 reward, increase if participation low.
              Gamify: "Top Verifier of the Month" leaderboard.
              Not a blocking requirement — mesh is BONUS verification.

RISK: Cloudinary costs increase with 23 images per task
  PROBABILITY: Low (images are compressed to ~100-300KB each)
  IMPACT: ~₹1-2 per task in storage
  MITIGATION: Already using quality:auto, format:auto.
              Total ~5-7MB per task. At 1000 tasks/month = 7GB = well within free tier.
              Auto-delete TaskMedia after 90 days (keep analytics only).

RISK: AI API costs with adversarial dual-AI
  PROBABILITY: Low (two-phase strategy reduces calls by 55%)
  IMPACT: $18-40/month at 1000 tasks
  MITIGATION: Phase 1 quick check gates Phase 2.
              High trust score workers skip adversarial check.
              Only run adversarial on first 10 tasks for new workers, then sample 20%.
```

## 15.2 Business Risks

```
RISK: Workers resist motion tracking (privacy concerns)
  MITIGATION: Only track DURING active task. No raw data stored — only summary percentages.
              Clear consent in onboarding. Show what's tracked in settings.
              "We track activity type, not your exact movements."

RISK: Competitors copy the reference point system
  MITIGATION: File provisional patents THIS WEEK.
              The COMBINATION (envDNA + motion + citizen mesh + adversarial AI) is the moat.
              Individual features are copyable. The protocol is not.

RISK: Buyers don't want to take 3-10 reference photos
  MITIGATION: Make it quick: open camera, snap, snap, snap (no labels required).
              Show value: "Workers will clean EXACTLY what you photograph."
              Minimum 2 photos for small tasks. Quick mode: 30 seconds.
```

---

# 16. FUTURE ROADMAP

## 16.1 Version 2 (3 months after launch)

```
☐ ML motion classifier (replace threshold rules with TFLite model)
  - Train on 50+ hours of cleaning motion data
  - Distinguish sweeping vs mopping vs scrubbing
  - 95%+ accuracy target

☐ Visual similarity scoring
  - Image embedding comparison (CLIP or similar)
  - Compute similarity between buyer reference and worker after
  - Replace human judgment with numeric similarity score

☐ Offline map tiles
  - Download OpenStreetMap tiles for task area
  - Worker can navigate without network

☐ AR overlay mode
  - Camera shows buyer's reference photo as semi-transparent overlay
  - Worker aligns real scene with overlay
  - Higher accuracy angle matching
```

## 16.2 Version 3 (6 months after launch)

```
☐ Trust Score portability
  - Worker's PoPW Trust Score as portable credential
  - Other gig platforms can query worker's trust score via API
  - Revenue: charge platforms per API call

☐ Insurance product
  - "Guaranteed Clean" — if citizen mesh finds area dirty, refund 2x
  - Possible because verification is provably robust
  - Revenue: premium on task fee (5-10%)

☐ City government dashboard
  - Real-time cleanliness map of the city
  - Historical trends per zone
  - Revenue: SaaS subscription for municipalities

☐ Protocol licensing
  - License PoPW to construction, delivery, healthcare platforms
  - Revenue: per-transaction fee + setup
```

---

# APPENDIX A: File List — All Files to Create/Modify

```
BACKEND — NEW FILES:
  backend/src/modules/reference-points/
    ├── reference-points.routes.ts
    ├── reference-points.service.ts
    ├── reference-points.schema.ts
    ├── worker-submission.service.ts
    └── worker-submission.routes.ts
  backend/src/modules/verification/
    ├── rule-engine.ts
    └── adversarial-ai.service.ts
  backend/src/modules/citizen/
    ├── citizen-verify.routes.ts
    ├── citizen-verify.service.ts
    └── citizen-verify-scheduler.job.ts
  backend/src/modules/environment/
    ├── environment.routes.ts
    └── environment.service.ts
  backend/src/jobs/
    └── adversarial-verify.job.ts

BACKEND — MODIFIED FILES:
  backend/prisma/schema.prisma
  backend/src/modules/media/media.service.ts
  backend/src/modules/media/media.schema.ts
  backend/src/modules/tasks/tasks.service.ts
  backend/src/modules/tasks/tasks.schema.ts
  backend/src/modules/ai/ai.service.ts
  backend/src/app.ts (register new routes)

MOBILE — NEW FILES:
  mobile/src/api/referencePoints.api.ts
  mobile/src/hooks/useEnvironmentalDNA.ts
  mobile/src/services/motionTracker.ts
  mobile/src/stores/taskPreloadStore.ts
  mobile/src/screens/worker/ReferencePointNavigator.tsx
  mobile/src/screens/citizen/CitizenVerifyScreen.tsx

MOBILE — MODIFIED FILES:
  mobile/src/types/index.ts
  mobile/src/components/camera/CaptureCamera.tsx
  mobile/src/screens/buyer/PostTaskScreen.tsx
  mobile/src/screens/buyer/BuyerTaskDetailScreen.tsx
  mobile/src/screens/worker/ActiveTaskScreen.tsx
  mobile/src/screens/worker/SubmitProofScreen.tsx
  mobile/src/navigation/WorkerNavigator.tsx
  mobile/src/navigation/CitizenNavigator.tsx
```

---

# APPENDIX B: Glossary

```
PoPW          Proof of Physical Work — the complete verification protocol
EnvDNA        Environmental DNA — multi-sensor location fingerprint
Motion Sig.   Motion Signature — accelerometer-based activity classification
Citizen Mesh  Network of citizens who verify completed tasks
Adversarial AI Second AI model that looks for fraud in evidence
Reference Pt  Buyer's photo of a specific dirty spot
Verification  Random reference point worker must recreate (proof of presence)
Trust Score   Worker's accumulated reliability rating (0-100)
Rule Engine   Instant scoring algorithm (no AI, pure math)
Haversine     Formula for calculating distance between GPS coordinates
Idempotency   Ensuring the same request produces the same result if retried
```

---

**END OF DOCUMENT**

*This document is the intellectual property of eClean / Akshay Thota.*
*Protected under provisional patent filing (pending).*
*Date: March 30, 2026*
