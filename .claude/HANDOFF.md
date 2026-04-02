# eClean — Session Handoff

> Updated at end of EVERY session. This is the source of truth for session continuity.

---

## Last Session: 2026-04-01/02 (Session 9 — AI Model Testing + Prompt Engineering + Bug Fixes)

### Status: gpt-5 deployed with reasoning prompt, all backend TS errors fixed, UI improvements from user testing

### What was completed:

**AI Model Comparison (real test — toilet cleaning task):**
- gpt-4o (old prompt): 0.85 APPROVE — just saw "looks cleaner"
- gpt-5.1 (old prompt): 0.85 APPROVE — same, no reasoning about time
- gpt-5.1 (reasoning prompt): 0.30 REJECT — "stains remain, no mop marks"
- gpt-5 (reasoning prompt): 0.20 REJECT — strictest, cheapest, "4 min for CRITICAL = physically unlikely"
- **Winner: gpt-5 + reasoning prompt** — ₹0.96/task, catches incomplete work

**Prompt Engineering Breakthrough:**
- Old prompt: "Is area cleaner?" → AI only compared visuals
- New prompt: "Think step by step — is X minutes realistic for CRITICAL [category]?" 
- Added TIME vs DIFFICULTY check (4 min for CRITICAL toilet = impossible)
- Added REMAINING DIRT check (stains still visible = incomplete)
- Added "could photos be taken without actually cleaning?"
- Same model, same photos — prompt made 0.85 → 0.20 difference

**Backend Fixes:**
- `max_tokens` → `max_completion_tokens` (required by gpt-4.1+, gpt-5+)
- All TypeScript errors fixed (NotificationType enums, GPS trail timestamp→createdAt)
- Backend deployed and healthy on Railway
- expo-linking dependency installed for mobile deep linking

**User Testing Improvements (from file modifications):**
- PostSubmissionScreen: AI timeout fallback (10 min), verified/info icons, better step labels
- FindWorkScreen: query disabled without GPS (prevents fetching ALL tasks globally)
- TaskDetailScreen: status-aware footer (REJECTED→retry, SUBMITTED→awaiting, APPROVED→completed)
- ReportIssueScreen: photo evidence uploaded to server before cancel, "task returned to open"
- ReferencePointNavigator: single upload for AFTER+VERIFICATION (backend auto-creates both)
- WorkerHomeScreen: online/offline toggle, "Paid to bank" label, paidOutCents field
- worker-submission.service: AFTER upload on verification point auto-creates VERIFICATION record
- CaptureCamera: reverted to real file hash (SHA-256 of base64) for tamper detection
- app.json: added scheme "eclean" for deep linking, CORS origins from env
- payment-release.job: full payout creation with platform fee, uses notifyUser helper

### Production State:
- Railway deployed with gpt-5 + reasoning prompt
- AI model: gpt-5 (default, ₹0.96/task)
- Debug endpoint `/debug/reverify` still active (remove before launch)
- All changes pushed to `image_capture_workflow` branch

### Key Decisions This Session:
1. gpt-5 over gpt-5.1 — stricter (0.20 vs 0.30) AND cheaper ($1.25 vs $2.50/1M input)
2. Prompt engineering > model selection — reasoning prompt was the real breakthrough
3. `max_completion_tokens` required for all models gpt-4.1 and newer
4. Single upload for verification points — backend creates both AFTER + VERIFICATION records

### What needs to happen next:

**Priority 1 — Test & Fix:**
- Build new APK with all mobile changes (GitHub Actions)
- Full end-to-end test with real cleaning photos
- Remove `/debug/reverify` endpoint before production
- Test payment auto-release job timing (does it trigger correctly?)

**Priority 2 — Missing Screens:**
- RejectionDetailScreen (shows which photo failed + why + dispute option)
- Buyer UI redesign (same treatment as worker)
- BuyerTaskDetailScreen: wire StatusTimeline + AIScoreCard

**Priority 3 — Backend:**
- Weekly earnings API endpoint
- Worker level benefits in backend (priority queue, bonus %)
- Actual offline photo queue (MMKV-based)
- GPS trail analysis integration into rule engine scoring

### Branch: image_capture_workflow
### Latest commit: d881d3f
