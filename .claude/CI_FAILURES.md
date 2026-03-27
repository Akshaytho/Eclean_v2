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

## ❌ FAILURE: 2026-03-27 16:56 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `fe49ca9` — fix: patch react-native-svg StyleSizeLength in CI (not fixed upstream even in 15.15.4)

react-native-svg still uses yoga::StyleSizeLength in all versions including
15.15.4. RN 0.76 renamed it to yoga::StyleLength. Since upstream hasn't
patched it, we sed-patch the file after npm install before the build.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23656942708
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 17:16 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `473d24f` — fix: correct APK copy path in CI (../../ → ../ from mobile/android)
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23657868292
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 18:17 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `31e6f4e` — fix: remove || true from Maestro flows — CI was silently swallowing failures

All 4 flows had || true meaning a green screen / crash would still show
CI as passing. Now tracks MAESTRO_FAILED flag across all flows and exits
with code 1 if any fail, while still running all flows first.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23660328953
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 18:52 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `13deb29` — revert: remove docs/ folder — CI Cinema needs a backend for AI, static HTML not useful
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23661695557
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 19:28 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `0f32671` — fix: resolve all Maestro flow failures

1. Remove timeout: property from all 10 flow files (not supported by Maestro)
2. Replace inline script with .github/scripts/run-maestro.sh — emulator-runner
   runs each script line as separate subprocess so if/fi and variables break
3. Fix upload path from absolute github.workspace to relative maestro-results/
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23663059551
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 19:55 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `1f593d1` — fix: add extendedWaitUntil 30s to Maestro flows + increase post-install sleep

All 4 flows were failing with 'Sign In not visible' because Maestro was
asserting immediately after launchApp — JS bundle takes 10-15s to load
on cold emulator. Added extendedWaitUntil timeout:30000 and increased
post-install sleep from 5s to 15s.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23664065499
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 20:05 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `4cf3c06` — fix: add Gradle/npm caching + fix Maestro flow timeouts

Caching changes:
- Cache node_modules (saves ~20s npm install)
- Cache Gradle deps (saves ~3-4min on subsequent builds)
- Cache Android .cxx build output (saves ~8min NDK compilation)

Expected build time: 25min first run → 3-5min after cache warms up

Maestro fixes:
- Add extendedWaitUntil 30s after launchApp in all 4 flows
- Increase post-install sleep to 15s for emulator cold start
- These fix: Assertion failed Sign In not visible within 20s
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23664390268
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 20:23 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `f6ef954` — fix: bundle JS into APK before Gradle build

Root cause found via Maestro screenshot: 'Unable to load script.
index.android.bundle is not packaged correctly.'

assembleDebug skips JS bundling (expects Metro server). For standalone
APK testing we must run expo export:embed first to generate the bundle,
then Gradle packages it into the APK.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23665055692
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 20:53 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `d38fa04` — fix: remove --no-install from expo prebuild

Root cause from logcat: 'Cannot find native module ExponentImagePicker'
expo prebuild --no-install was skipping native module linking.
Without it, expo-image-picker native bridge was never registered,
causing app crash before AppRegistry.registerComponent ran,
leaving splash screen stuck green forever.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23666168335
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 21:18 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `b8402f3` — fix: add expo-image-picker to app.json plugins

ExponentImagePicker native module not found because expo-image-picker
was in package.json but not registered in app.json plugins.
Expo SDK 53 new architecture requires plugins to be declared in
app.json for proper native module linking during prebuild.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23667125057
- **Status:** Unresolved — add fix description when fixed

## ❌ FAILURE: 2026-03-27 21:43 UTC
- **Workflow:** Maestro E2E Tests
- **Commit:** `feea39f` — fix: lazy load expo-image-picker to prevent startup crash

ExponentImagePicker native module causes 'main' not registered crash
on app startup. Dynamic import ensures the module loads only when
the camera feature is actually used, not at app boot time.

Also keeps expo-image-picker in app.json plugins for proper
permission handling when it does load.
- **Run:** https://github.com/Akshaytho/Eclean_v2/actions/runs/23668009451
- **Status:** Unresolved — add fix description when fixed
