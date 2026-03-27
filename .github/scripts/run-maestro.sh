#!/bin/bash
# Maestro E2E test runner
# Runs all flows and reports failures at the end

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
  local extra_args="${@:2}"

  echo ""
  echo "▶ Running: $flow_name"

  if maestro test "$flow_file" \
    --env WORKER_EMAIL="$WORKER_EMAIL" \
    --env BUYER_EMAIL="$BUYER_EMAIL" \
    --env PASSWORD="$PASSWORD" \
    --format junit \
    --output "$output_file" \
    $extra_args; then
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
sleep 5

# Run all flows
run_flow "09_smoke_all_tabs.yaml"
run_flow "10_smoke_buyer_tabs.yaml"
run_flow "01_worker_login.yaml"
run_flow "03_buyer_login_post_task.yaml"

# Report
echo ""
echo "================================"
if [ $MAESTRO_FAILED -eq 1 ]; then
  echo "❌ Failed flows: $FAILED_FLOWS"
  exit 1
else
  echo "✅ All Maestro flows passed!"
fi
