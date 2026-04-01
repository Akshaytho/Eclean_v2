%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#3B82F6', 'secondaryColor': '#10B981', 'tertiaryColor': '#F59E0B', 'primaryTextColor': '#1F2937', 'lineColor': '#6B7280', 'fontSize': '14px'}}}%%

flowchart TD

    %% ================================================================
    %% BUYER FLOW (Blue)
    %% ================================================================

    subgraph BUYER["🔵 BUYER FLOW — Task Creation"]
        direction TB
        B1["📝 Step 1: Choose Category<br/>Street | Drain | Wall | Park"]
        B2["📋 Step 2: Task Details<br/>Title + Description<br/>Urgency: LOW|MEDIUM|HIGH<br/>Area: SMALL|MEDIUM|LARGE<br/>Environment: INDOOR|OUTDOOR"]
        B3["📍 Step 3: Set Location<br/>Drop pin on map<br/>OR Use My GPS<br/>Auto-fill address"]
        B4["📸 Step 4: Document Area (NEW)<br/>┌───┐ ┌───┐ ┌───┐ ┌───┐<br/>│ 1 │ │ 2 │ │ 3 │ │ + │<br/>│📷│ │📷│ │📷│ │Add│<br/>└───┘ └───┘ └───┘ └───┘<br/>3-10 reference point photos<br/>Each: GPS + Label + SHA-256 hash<br/>Min 2 (small) / 3 (med) / 5 (large)"]
        B5["💳 Step 5: Pay via Razorpay<br/>Task Fee + Platform Fee (10%)"]

        B1 --> B2 --> B3 --> B4 --> B5
    end

    %% ================================================================
    %% TASK CREATION BACKEND
    %% ================================================================

    subgraph CREATE["⚙️ Task Creation Backend"]
        CR1["POST /api/v1/buyer/tasks<br/>Create task → get taskId"]
        CR2["Upload reference photos<br/>FOR EACH photo:<br/>POST /tasks/{id}/reference-points<br/>→ Cloudinary upload<br/>→ Create TaskReferencePoint<br/>→ GPS + label + hash stored"]
        CR3["🧬 Capture buyer's EnvDNA<br/>POST /tasks/{id}/environment<br/>WiFi + Cell + Magnetometer<br/>+ Barometer + Ambient Light"]
        CR4["Task status: OPEN<br/>totalReferencePoints = count<br/>Visible to workers"]

        CR1 --> CR2 --> CR3 --> CR4
    end

    B5 ==> CR1

    %% ================================================================
    %% WORKER DISCOVERY
    %% ================================================================

    subgraph DISCOVER["🟢 WORKER — Discovery & Acceptance"]
        direction TB
        W1["🔍 Browse Open Tasks<br/>Filter: distance, category, urgency<br/>See: title, ₹ amount, ref point count"]
        W2["👀 View Task Details<br/>Map + Description<br/>Preview reference photos<br/>Estimated time + earnings"]
        W3["👆 Accept Task<br/>POST /worker/tasks/{id}/accept"]

        W1 --> W2 --> W3
    end

    CR4 -->|"Task visible<br/>to workers"| W1

    %% ================================================================
    %% ACCEPTANCE BACKEND
    %% ================================================================

    subgraph ACCEPT_SYS["⚙️ Acceptance Backend"]
        AS1["Status: ACCEPTED"]
        AS2["🎲 selectVerificationPoints()<br/>Randomly pick 2 reference points<br/>Mark isVerificationPoint = true<br/>━━━━━━━━━━━━━━━━━━━━━━━<br/>⚠️ HIDDEN from worker<br/>Revealed only at < 50m GPS"]
        AS3["📥 Preload to device<br/>Download ALL buyer reference<br/>images to local storage<br/>Works offline after this"]

        AS1 --> AS2 --> AS3
    end

    W3 ==> AS1

    %% ================================================================
    %% WORKER TRAVEL + START
    %% ================================================================

    subgraph TRAVEL["🟢 WORKER — Travel & Start"]
        direction TB
        T1["🚶 Travel to task location<br/>Distance indicator updating"]
        T2{"Within<br/>500m?"}
        T3["▶️ 'Start Work' button ACTIVE"]
        T4["⛔ 'Too far' — button disabled"]
        T5["Worker taps 'Start Work'<br/>POST /worker/tasks/{id}/start<br/>Geofence verified: 500m"]

        T1 --> T2
        T2 -->|"Yes"| T3 --> T5
        T2 -->|"No"| T4 --> T1
    end

    AS3 --> T1

    %% ================================================================
    %% TASK START — SILENT ACTIVATION
    %% ================================================================

    subgraph START_SYS["⚙️ Task Start + Silent Layer Activation"]
        SS1["Status: IN_PROGRESS<br/>Timer starts from server time<br/>GPS tracking: socket.emit every 10s"]
        SS2["🧬 SILENT Layer 1: EnvDNA Capture<br/>━━━━━━━━━━━━━━━━━━━━━━━━━━━<br/>WiFi SSIDs + signal strengths<br/>Cell tower ID + signal strength<br/>Magnetometer XYZ (unique per building)<br/>Barometric pressure (altitude/floor)<br/>Ambient light level<br/>━━━━━━━━━━━━━━━━━━━━━━━━━━━<br/>Compared to buyer's fingerprint<br/>Match score: 0-100"]
        SS3["🏃 SILENT Layer 2: Motion Tracking<br/>━━━━━━━━━━━━━━━━━━━━━━━━━━━<br/>Accelerometer sampled at 10Hz<br/>Processed in 30-second windows<br/>Classification per window:<br/><br/>Sweeping: ╱╲╱╲╱╲╱╲ (0.5-2 Hz)<br/>Scrubbing: ⫿⫿⫿⫿⫿⫿ (2-5 Hz)<br/>Walking: ⋀_⋀_⋀_⋀_ (steps)<br/>Standing: ________ (no work)<br/>Vehicle: ~∿╱~∿╱ (driving)<br/>━━━━━━━━━━━━━━━━━━━━━━━━━━━<br/>Zero worker effort — runs in pocket"]

        SS1 --> SS2
        SS1 --> SS3
    end

    T5 ==> SS1

    %% ================================================================
    %% WORKER CAPTURE — REFERENCE POINT NAVIGATOR
    %% ================================================================

    subgraph NAVIGATE["🟢 WORKER — Reference Point Navigator"]
        direction TB
        NAV1["📍 Map View<br/>All reference points as pins<br/>Worker location (live GPS)<br/>Distance to each point"]
        NAV2["📋 Point List (sorted by distance)<br/>✅ Point 1 · Gate entrance · 12m<br/>⬜ Point 2 · Drain section · 8m<br/>⬜ Point 3 · Wall area · 45m<br/>⬜ Point 4 · Near tree · 120m"]
        NAV3["Progress: 1/4 after · 0/2 verified<br/>████░░░░░░░░░░░░ 25%"]
        NAV4["Worker taps a point to capture"]

        NAV1 --> NAV2 --> NAV3 --> NAV4
    end

    SS1 --> NAV1

    %% ================================================================
    %% PROXIMITY REVEAL
    %% ================================================================

    subgraph REVEAL["🔒 Verification Point Reveal"]
        RV1{"Worker GPS<br/>within 50m of<br/>this point?"}
        RV2["🔒 VERIFY badge appears<br/>'Verification point — match<br/>this exact angle to prove<br/>you are at this location'"]
        RV3["Regular point<br/>No special badge<br/>Still needs after photo"]

        RV1 -->|"Yes + isVerification"| RV2
        RV1 -->|"No or regular"| RV3
    end

    NAV4 --> RV1

    %% ================================================================
    %% SIDE-BY-SIDE CAMERA
    %% ================================================================

    subgraph CAMERA["📸 Side-by-Side Camera Capture"]
        direction TB
        CAM1["CaptureCamera opens<br/>referenceImage = buyer's photo<br/>referenceLabel = 'Near gate'<br/>pointIndex = 3 / totalPoints = 4"]
        CAM2["┌──────────────┐ ┌──────────────┐<br/>│ BUYER'S      │ │ YOUR CAMERA  │<br/>│ REFERENCE    │ │ (live view)  │<br/>│ [dirty area] │ │ [viewfinder] │<br/>└──────────────┘ └──────────────┘<br/><br/>GPS Proximity Bar:<br/>🟢 < 15m: 'At the spot ✅'<br/>🟡 15-50m: 'Walk closer'<br/>🔴 > 50m: 'Too far'"]
        CAM3["Worker taps 📸 Capture<br/>━━━━━━━━━━━━━━━━━━━━━━━<br/>Parallel execution:<br/>├── takePictureAsync (quality 0.92)<br/>├── getCurrentPositionAsync (HIGH)<br/>├── environmentalDNA.capture()<br/>└── SHA-256 hash computation"]
        CAM4["Preview with comparison:<br/>┌──────┐ → ┌──────┐<br/>│dirty │   │clean │<br/>└──────┘   └──────┘<br/>📍 GPS: 8m · 🔒 Hash: b4e2...<br/>⏱ 14:23 into task"]
        CAM5{"Retake<br/>or Use?"}
        CAM6["📤 Upload to backend<br/>POST /tasks/{id}/points/{ptId}/submit<br/>━━━━━━━━━━━━━━━━━━━━━━━<br/>FormData:<br/>file + mediaType (AFTER|VERIFICATION)<br/>capturedLat + capturedLng<br/>photoHash + deviceId<br/>envMagXYZ + envBarometer<br/>━━━━━━━━━━━━━━━━━━━━━━━<br/>Idempotency-Key header for retry safety"]

        CAM1 --> CAM2 --> CAM3 --> CAM4 --> CAM5
        CAM5 -->|"Retake"| CAM2
        CAM5 -->|"Use Photo"| CAM6
    end

    RV2 --> CAM1
    RV3 --> CAM1

    %% ================================================================
    %% PHOTO UPLOAD BACKEND
    %% ================================================================

    subgraph UPLOAD_SYS["⚙️ Photo Upload Backend"]
        UP1["Validate file (MIME, size 10MB max)"]
        UP2["Idempotency check<br/>Skip if same key processed"]
        UP3["Upload to Cloudinary<br/>quality: auto, format: auto"]
        UP4["Compute locationMatchScore<br/>haversine(workerGPS, buyerGPS)<br/>━━━━━━━━━━━━━━━━━━━━<br/>0-10m = 100 · 11-50m = 90<br/>51-100m = 75 · 101-200m = 50<br/>201-500m = 25 · 500m+ = 0"]
        UP5["Create WorkerPointSubmission<br/>imageUrl + GPS + hash + envDNA<br/>+ locationMatchScore"]
        UP6["Create AnalyticsPhotoMeta<br/>Flag if GPS > 500m from task"]
        UP7["Emit socket: task:photo_added"]

        UP1 --> UP2 --> UP3 --> UP4 --> UP5 --> UP6 --> UP7
    end

    CAM6 ==> UP1
    UP7 -->|"Update progress"| NAV2

    %% ================================================================
    %% REPEAT LOOP
    %% ================================================================

    LOOP{"More points<br/>to capture?"}
    NAV3 --> LOOP
    LOOP -->|"Yes"| NAV4
    LOOP -->|"All done"| READY

    %% ================================================================
    %% SUBMIT READINESS CHECK
    %% ================================================================

    subgraph READY_CHECK["✅ Submit Readiness"]
        READY["Check requirements:<br/>✓ ALL verification photos done<br/>✓ 70%+ regular points done<br/>✓ Minimum 3 after photos"]
        READY_YES["Submit button ACTIVE ✅"]
        READY_NO["Submit button DISABLED ⛔<br/>'Need 1 more verification photo'"]

        READY -->|"Met"| READY_YES
        READY -->|"Not met"| READY_NO
    end

    READY_NO -->|"Capture more"| NAV4

    %% ================================================================
    %% SUBMIT FLOW
    %% ================================================================

    subgraph SUBMIT_FLOW["🟢 WORKER — Submit Work"]
        direction TB
        SUB1["🏃 Send Motion Summary<br/>POST /tasks/{id}/motion-summary<br/>cleaningPct: 0.65<br/>walkingPct: 0.20<br/>standingPct: 0.10<br/>vehiclePct: 0.05"]
        SUB2["🧬 Send Final EnvDNA<br/>POST /tasks/{id}/environment<br/>captureType: WORKER_SUBMIT"]
        SUB3["📋 Review & Submit Screen<br/>━━━━━━━━━━━━━━━━━━━━━━━━━━<br/>Point 1 · Gate: [dirty]→[clean] ✅ 90<br/>Point 2 · Drain: [dirty]→[clean] 🔒 100<br/>Point 3 · Wall: [dirty]→[clean] ✅ 90<br/>Point 4 · Tree: [dirty]→[clean] 🔒 100<br/>━━━━━━━━━━━━━━━━━━━━━━━━━━<br/>✅ 4/4 after · ✅ 2/2 verified<br/>📍 34 GPS points · ⏱ 47 min<br/>💰 ₹500 earnings"]
        SUB4["Worker confirms → Submit<br/>POST /worker/tasks/{id}/submit"]

        SUB1 --> SUB2 --> SUB3 --> SUB4
    end

    READY_YES ==> SUB1

    %% ================================================================
    %% SUBMIT BACKEND VALIDATION
    %% ================================================================

    subgraph SUBMIT_SYS["⚙️ Submit Validation (Transaction)"]
        SV1["Verify task ownership + status"]
        SV2["Check: all verification submissions ✓"]
        SV3["Check: 70%+ after submissions ✓"]
        SV4["Check: minimum 3 after photos ✓"]
        SV5["Compute workDurationSecs<br/>from startedAt to now"]
        SV6["Status: IN_PROGRESS → SUBMITTED"]
        SV7["Clear worker's activeTaskId<br/>(can accept new tasks now)"]

        SV1 --> SV2 --> SV3 --> SV4 --> SV5 --> SV6 --> SV7
    end

    SUB4 ==> SV1

    %% ================================================================
    %% VERIFICATION ENGINE
    %% ================================================================

    subgraph VERIFY["🟠 VERIFICATION ENGINE"]
        direction TB

        subgraph RULE["⚡ Rule Engine (Instant — 5ms)"]
            RE1["1️⃣ Verification Completeness: /20<br/>verDone / verRequired × 20"]
            RE2["2️⃣ Photo Coverage: /25<br/>afterCount / totalPoints × 25"]
            RE3["3️⃣ GPS Proximity Average: /25<br/>avgLocationScore / 100 × 25"]
            RE4["4️⃣ Time on Site: /15<br/>actual / expected × 15"]
            RE5["5️⃣ No Fraud Flags: /15<br/>15 - (flaggedPhotos × 5)"]
            RE6["Subtotal: /100"]
            RE7["6️⃣ EnvDNA Bonus: +5<br/>matchScore > 80% → +5"]
            RE8["7️⃣ Motion Bonus: +5<br/>cleaningPct > 50% → +5<br/>redFlag → -10 penalty"]
            RE9["SCORE: 0-100"]
        end

        subgraph AI_V["🤖 AI Verifier (Async ~10s)"]
            AV1["Claude Sonnet 4.5<br/>Input: Paired before/after images"]
            AV2["Phase 1: Quick check<br/>2 verification pairs only<br/>Cost: ~$0.01"]
            AV3{"Score > 0.8?"}
            AV4["✅ Skip Phase 2<br/>Save 55% cost"]
            AV5["Phase 2: Full analysis<br/>ALL pairs<br/>Cost: ~$0.03-0.05"]
            AV6["Output:<br/>score: 0-1<br/>label: EXCELLENT|GOOD|UNCERTAIN|POOR<br/>workEvident: boolean<br/>recommendation: APPROVE|REVIEW|REJECT"]

            AV1 --> AV2 --> AV3
            AV3 -->|"Yes (80%)"| AV4 --> AV6
            AV3 -->|"No"| AV5 --> AV6
        end

        subgraph AI_A["🕵️ AI Adversary (Async ~15s)"]
            AA1["Claude Sonnet 4.5<br/>DIFFERENT prompt:<br/>'Find ANY reason this is fraud'"]
            AA2["Checks:<br/>├── Cloud/sky patterns across photos<br/>├── Shadow angles vs timestamp<br/>├── GPS path logic (no teleportation)<br/>├── EnvDNA buyer vs worker match<br/>├── Motion vs duration consistency<br/>├── AI generation artifacts<br/>└── Historical pattern matching"]
            AA3["Output:<br/>fraudProbability: 0-1<br/>anomalies: [{type, severity}]<br/>recommendation: PASS|FLAG|REJECT"]

            AA1 --> AA2 --> AA3
        end
    end

    SV7 ==> RE1
    SV7 ==> AV1
    AV6 -->|"After verifier"| AA1

    %% ================================================================
    %% DECISION MATRIX
    %% ================================================================

    subgraph DECISION["🎯 DECISION MATRIX"]
        DM1{"Rule Score +<br/>AI Verifier +<br/>AI Adversary"}
        DM2["✅ AUTO-APPROVE<br/>━━━━━━━━━━━━━━━━━<br/>Rule > 95<br/>Verifier: APPROVE<br/>Adversary: PASS<br/>━━━━━━━━━━━━━━━━━<br/>→ INSTANT PAYMENT<br/>No buyer review needed"]
        DM3["🔍 MANUAL REVIEW<br/>━━━━━━━━━━━━━━━━━<br/>AIs disagree<br/>OR Rule 65-94<br/>━━━━━━━━━━━━━━━━━<br/>→ Buyer/Supervisor decides"]
        DM4["❌ AUTO-REJECT<br/>━━━━━━━━━━━━━━━━━<br/>Rule < 65<br/>Both AIs reject<br/>━━━━━━━━━━━━━━━━━<br/>→ Worker notified<br/>Can dispute"]

        DM1 -->|"All PASS + high"| DM2
        DM1 -->|"Disagree / medium"| DM3
        DM1 -->|"All FAIL / low"| DM4
    end

    RE9 --> DM1
    AV6 --> DM1
    AA3 --> DM1

    %% ================================================================
    %% BUYER REVIEW (if needed)
    %% ================================================================

    subgraph BUYER_REVIEW["🔵 BUYER REVIEW (if Manual)"]
        BR1["Buyer sees:<br/>├── Paired before/after per point<br/>├── GPS match scores<br/>├── AI confidence + reasoning<br/>├── Time spent on site<br/>└── Motion activity summary"]
        BR2{"Approve<br/>or Reject?"}

        BR1 --> BR2
    end

    DM3 --> BR1

    %% ================================================================
    %% TASK COMPLETION
    %% ================================================================

    subgraph COMPLETE["⚙️ Task Completion"]
        CP1["Status: APPROVED"]
        CP2["💰 Create Payout<br/>Task amount - 10% platform fee<br/>Queue for worker's bank/UPI"]
        CP3["📊 Update Worker Stats<br/>completedTasks + 1<br/>totalEarnings + amount"]
        CP4["⭐ Update Trust Score<br/>+2 buyer approved<br/>+3 if AI score > 90<br/>+1 if envDNA match > 80<br/>+1 if motion clean > 60%"]
        CP5["📱 Notify worker<br/>'Task approved! ₹500 incoming'"]

        CP1 --> CP2 --> CP3 --> CP4 --> CP5
    end

    DM2 ==> CP1
    BR2 -->|"Approve"| CP1

    %% ================================================================
    %% REJECTION FLOW
    %% ================================================================

    subgraph REJECT_FLOW["❌ Rejection Flow"]
        RJ1["Status: REJECTED"]
        RJ2["⭐ Trust Score -5"]
        RJ3["Worker can dispute<br/>POST /worker/tasks/{id}/dispute<br/>Reason required"]
        RJ4["If disputed → Supervisor review"]

        RJ1 --> RJ2 --> RJ3 --> RJ4
    end

    DM4 --> RJ1
    BR2 -->|"Reject"| RJ1

    %% ================================================================
    %% CITIZEN MESH (Post-Task)
    %% ================================================================

    subgraph CITIZEN["🟣 CITIZEN MESH VERIFICATION"]
        direction TB
        CM1["⏰ Random delay: 1-48 hours<br/>citizen-verify-scheduler (BullMQ cron)<br/>Runs every hour"]
        CM2["🎯 Select citizens within 500m<br/>━━━━━━━━━━━━━━━━━━━━━━━━━<br/>Filters:<br/>✓ Active in 7 days<br/>✓ Notifications enabled<br/>✓ Not buyer/worker of task<br/>✓ Not notified in 24h<br/>━━━━━━━━━━━━━━━━━━━━━━━━━<br/>Count: 1 (< ₹500) / 2 (₹500-2k) / 3 (> ₹2k)"]
        CM3["📱 Push notification:<br/>'📸 Quick verify near Park Gate!<br/>Is this area clean? ₹5 reward'"]
        CM4["👤 Citizen opens app<br/>Sees worker's 'after' photo<br/>Takes current photo of area<br/>Rates: 😊 Clean | 😐 Partial | 😠 Dirty"]
        CM5{"Area still<br/>clean?"}
        CM6["✅ CLEAN CONFIRMED<br/>Worker trust: +1<br/>Citizen earns: ₹5"]
        CM7["❌ DIRTY FOUND<br/>Worker trust: -3<br/>Citizen earns: ₹10<br/>Escalate to supervisor"]
        CM8["No response in 24h?<br/>Try batch 2 (max 3 batches)<br/>Then mark 'unverified'"]

        CM1 --> CM2 --> CM3 --> CM4 --> CM5
        CM5 -->|"Clean"| CM6
        CM5 -->|"Dirty"| CM7
        CM3 -->|"No response"| CM8 -->|"Retry"| CM2
    end

    CP5 ==>|"Queue citizen mesh<br/>1-48 hour delay"| CM1

    %% ================================================================
    %% TRUST SCORE SYSTEM
    %% ================================================================

    subgraph TRUST["⭐ WORKER TRUST SCORE (0-100)"]
        TS1["TIERS:<br/>0-20: 🚫 BLOCKED — No tasks<br/>21-40: ⚠️ PROBATION — Limited tasks<br/>41-60: 🔵 STANDARD — Normal access<br/>61-80: 🟢 TRUSTED — Priority + fast pay<br/>81-100: ⭐ ELITE — Premium + instant pay"]
        TS2["INCREASES:<br/>+2 Buyer approved · +1 Citizen clean<br/>+3 AI > 90 · +5 Ten-task streak<br/>+1 EnvDNA match · +1 Motion clean"]
        TS3["DECREASES:<br/>-5 Buyer rejected · -3 Citizen dirty<br/>-10 AI fraud · -8 GPS flagged<br/>-15 Confirmed fraud"]
    end

    CM6 --> TRUST
    CM7 --> TRUST
    CP4 --> TRUST

    %% ================================================================
    %% ANTI-FRAUD COVERAGE
    %% ================================================================

    subgraph FRAUD["🛡️ ANTI-FRAUD: 8 Attacks → 8 Defenses"]
        FR1["🗺️ GPS Spoofing → EnvDNA + Motion"]
        FR2["🧹 No Cleaning → Motion + AI + Citizen"]
        FR3["🤖 AI Photos → Hash + Adversarial AI"]
        FR4["📍 Wrong Place → GPS + EnvDNA + Citizen"]
        FR5["½ Partial → Coverage + AI + Citizen"]
        FR6["📷 Old Photos → EnvDNA + Hash + Motion"]
        FR7["⏱️ Rushed → Motion + Time + AI"]
        FR8["👤 Identity → Motion + Trust History"]
    end

    %% ================================================================
    %% STYLING
    %% ================================================================

    style BUYER fill:#DBEAFE,stroke:#3B82F6,stroke-width:2px
    style CREATE fill:#E0E7FF,stroke:#6366F1,stroke-width:1px
    style DISCOVER fill:#D1FAE5,stroke:#10B981,stroke-width:2px
    style ACCEPT_SYS fill:#E0E7FF,stroke:#6366F1,stroke-width:1px
    style TRAVEL fill:#D1FAE5,stroke:#10B981,stroke-width:2px
    style START_SYS fill:#E0E7FF,stroke:#6366F1,stroke-width:1px
    style NAVIGATE fill:#D1FAE5,stroke:#10B981,stroke-width:2px
    style REVEAL fill:#FEF3C7,stroke:#F59E0B,stroke-width:2px
    style CAMERA fill:#D1FAE5,stroke:#10B981,stroke-width:2px
    style UPLOAD_SYS fill:#E0E7FF,stroke:#6366F1,stroke-width:1px
    style READY_CHECK fill:#D1FAE5,stroke:#10B981,stroke-width:1px
    style SUBMIT_FLOW fill:#D1FAE5,stroke:#10B981,stroke-width:2px
    style SUBMIT_SYS fill:#E0E7FF,stroke:#6366F1,stroke-width:1px
    style VERIFY fill:#FEF3C7,stroke:#F59E0B,stroke-width:2px
    style RULE fill:#FEF3C7,stroke:#F59E0B,stroke-width:1px
    style AI_V fill:#DBEAFE,stroke:#3B82F6,stroke-width:1px
    style AI_COST fill:#F3F4F6,stroke:#9CA3AF,stroke-width:1px
    style AI_A fill:#FEE2E2,stroke:#EF4444,stroke-width:1px
    style DECISION fill:#FEF3C7,stroke:#F59E0B,stroke-width:2px
    style BUYER_REVIEW fill:#DBEAFE,stroke:#3B82F6,stroke-width:2px
    style COMPLETE fill:#D1FAE5,stroke:#10B981,stroke-width:2px
    style REJECT_FLOW fill:#FEE2E2,stroke:#EF4444,stroke-width:2px
    style CITIZEN fill:#EDE9FE,stroke:#8B5CF6,stroke-width:2px
    style TRUST fill:#FEF3C7,stroke:#F59E0B,stroke-width:2px
    style FRAUD fill:#FEE2E2,stroke:#DC2626,stroke-width:2px

    style DM2 fill:#D1FAE5,stroke:#10B981,stroke-width:2px
    style DM3 fill:#FEF3C7,stroke:#F59E0B,stroke-width:2px
    style DM4 fill:#FEE2E2,stroke:#EF4444,stroke-width:2px
    style CM6 fill:#D1FAE5,stroke:#10B981
    style CM7 fill:#FEE2E2,stroke:#EF4444
