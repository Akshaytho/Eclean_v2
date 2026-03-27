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
