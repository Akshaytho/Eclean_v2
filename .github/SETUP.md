# GitHub Actions Setup

## Required Secrets

Go to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

| Secret | What it is | How to get it |
|--------|-----------|---------------|
| `EXPO_TOKEN` | Expo access token for EAS builds | expo.dev → Account → Access Tokens → Create |

## How it works

Every push to `main` triggers 2 jobs:

### Job 1: Jest Tests (2-3 mins)
Runs automatically, no setup needed:
- 32 unit tests (stores + API functions)
- 62 screen tests (component rendering + interactions)
- 15 integration tests (real Railway backend)

### Job 2: Maestro E2E (30-45 mins)
Requires `EXPO_TOKEN` secret:
1. Builds Android APK via EAS
2. Boots Android emulator (API 30, Pixel 4)
3. Installs APK
4. Runs 5 Maestro flows:
   - Smoke: all worker tabs
   - Smoke: all buyer tabs
   - Worker login
   - Worker register
   - Buyer post task

Screenshots saved as artifacts for 14 days.

## Viewing results

After each run:
- Go to Actions tab → click the workflow run
- Download `maestro-e2e-results` artifact for screenshots
- Test report shown inline in the PR/push

## Running manually

Actions tab → "Maestro E2E Tests" → "Run workflow" → Run
