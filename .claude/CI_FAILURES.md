# CI Failure Log

> Auto-updated by GitHub Actions on every failure.
> When fixed: add "✅ Fixed by commit `abc1234`" below the entry.

---

## ❌ FAILURE: 2026-03-27 12:36 UTC
- **Workflow:** Jest Tests (Unit + Screen + Integration)
- **Cause:** `cache-dependency-path: mobile/package-lock.json` — lock file not at repo root
- **Fix:** Removed `cache-dependency-path` from setup-node action
- ✅ Fixed by commit `7de0240`

## ❌ FAILURE: 2026-03-27 12:38 UTC
- **Workflow:** Jest Tests (Unit + Screen + Integration)
- **Cause:** `npm ci` requires package-lock.json, not committed to repo
- **Fix:** Switched to `npm install --legacy-peer-deps`
- ✅ Fixed by commit `4620752`

## ❌ FAILURE: 2026-03-27 (multiple) — Maestro E2E
- **Workflow:** Maestro E2E Tests
- **Cause 1:** `--output` flag only works for local builds, not EAS server builds
- **Cause 2:** Missing `checks: write` permission for test report publisher
- **Cause 3:** Missing EAS projectId in app.json
- **Cause 4:** Wrong `owner` field in app.json
- **Fix:** Removed `--output`, added `permissions: checks: write`, added projectId, removed owner field
- Status: Still resolving EAS build polling logic — monitor next run

## ❌ FAILURE: 2026-03-27 14:57 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `d60231c` — fix: remove --output flag from EAS build, add checks:write permission
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23651127621
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 15:19 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `90d3fb0` — fix: use EAS local build so APK is on runner when emulator boots

Emulator boots fine in ~26s on GitHub Actions.
Problem was APK not present — EAS server build wasn't downloading to runner.
Fix: eas build --local runs gradle on the runner itself, writes APK directly.
--output flag works for local builds (not server builds).
APK path passed via GITHUB_ENV to the emulator runner step.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23653456874
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 15:24 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `8f8573b` — feat: Sprint 3 complete — Buyer Flow + CI/CD + docs

Sprint 3 screens (all per PDF blueprint):
- BuyerTaskDetailScreen: StatusTimeline, AI score badge, photo grid+fullscreen,
  reject modal (min 10 chars), socket task:updated+task:photo_added, 30s refetch
- BuyerTasksScreen: search by title added
- LiveTrackScreen: worker info overlay, pulsing marker, time on site counter
- PostTaskScreen: Use My Location GPS button on Step 3

Backend fix:
- getBuyerTask includes worker {id,name,email}

GitHub Actions:
- jest-tests.yml: 109 tests on every push
- maestro-e2e.yml: Android emulator E2E after Jest passes
- ci-failure-tracker.yml: auto-opens issues on CI failure

Tests: 109/109 passing | TypeScript: 0 errors
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23652429218
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 15:31 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `3e4f00d` — feat: upload APK as artifact so it can be downloaded from Actions tab
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23653845209
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 15:40 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `22620f0` — fix: show full gradle error, split build steps for debugging
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23654206549
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 15:58 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `fdd0bd1` — fix: remove expo-camera (unused, breaks build) + pin react-native-maps@1.14.0

expo-camera causes compileDebugKotlin failure with RN 0.76.9 due to
barcodescanner/BarCodeScannerResult symbol not found.
We only use expo-image-picker for photos — expo-camera was never called.

react-native-maps codegen was SKIPPED causing 'cannot find symbol' errors.
1.14.0 is compatible with RN 0.76.x without codegen issues.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23654848923
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 16:20 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `9f13801` — fix: resolve all CI build issues from Maestro E2E log

- bump react-native-svg 15.8.0 → 15.15.4 (fixes yoga::StyleSizeLength C++ error on RN 0.76)
- fix react-dom 19.0.0 → 18.3.1 (align with react 18.3.1 peer dep)
- add NODE_ENV=production to expo prebuild step (fixes expo-constants warning)
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23655793799
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 16:34 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `e93bb14` — fix: regenerate package-lock.json with react-native-svg 15.15.4

CI uses npm install which respects the lockfile — old lockfile still
had 15.8.0 pinned despite package.json bump. Regenerated with
--package-lock-only to resolve the StyleSizeLength C++ build error.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23656353695
- **Status:** Unresolved — add fix description when fixed
