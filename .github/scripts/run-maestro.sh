#!/bin/bash
# Maestro E2E test runner

set -e

WORKSPACE="${GITHUB_WORKSPACE:-$(pwd)}"
RESULTS_DIR="$WORKSPACE/maestro-results"
mkdir -p "$RESULTS_DIR"

MAESTRO_FAILED=0
FAILED_FLOWS=""

run_flow() {
  local flow_name="$1"
  local flow_file="$WORKSPACE/maestro/flows/$flow_name"
  local output_file="$RESULTS_DIR/${flow_name%.yaml}.xml"

  echo ""
  echo "▶ Running: $flow_name"

  if maestro test "$flow_file" \
    --env WORKER_EMAIL="$WORKER_EMAIL" \
    --env BUYER_EMAIL="$BUYER_EMAIL" \
    --env PASSWORD="$PASSWORD" \
    --format junit \
    --output "$output_file"; then
    echo "✅ PASSED: $flow_name"
  else
    echo "❌ FAILED: $flow_name"
    MAESTRO_FAILED=1
    FAILED_FLOWS="$FAILED_FLOWS $flow_name"
  fi
}

# Install APK
echo "Installing APK..."
adb install -r "$WORKSPACE/mobile/eclean.apk"

# Start logcat in background to capture app logs
echo "Starting logcat..."
adb logcat -c
adb logcat *:E ReactNativeJS:V > "$RESULTS_DIR/logcat.txt" 2>&1 &
LOGCAT_PID=$!

echo "Waiting for app to settle on emulator..."
sleep 15

# Launch app once to check it starts
echo "Launching app to verify it starts..."
adb shell am start -n com.eclean.app/.MainActivity
sleep 10

echo "=== App startup logcat ==="
cat "$RESULTS_DIR/logcat.txt" | head -50

# Run all flows
run_flow "09_smoke_all_tabs.yaml"
run_flow "10_smoke_buyer_tabs.yaml"
run_flow "01_worker_login.yaml"
run_flow "03_buyer_login_post_task.yaml"

# Stop logcat
kill $LOGCAT_PID 2>/dev/null || true

# Report
echo ""
echo "================================"
if [ $MAESTRO_FAILED -eq 1 ]; then
  echo "❌ Failed flows: $FAILED_FLOWS"
  echo ""
  echo "=== Final logcat ==="
  tail -50 "$RESULTS_DIR/logcat.txt"
  exit 1
else
  echo "✅ All Maestro flows passed!"
fi
