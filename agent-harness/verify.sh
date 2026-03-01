#!/usr/bin/env bash
# Progressive verification pipeline for agent changes.
# Usage: ./agent-harness/verify.sh <agent-id> [--full]
#
# Stages (exit early on failure by default):
#   1. typecheck  — parallel typecheck of common, backend, frontend
#   2. lint       — parallel lint of common, backend, frontend
#   3. test-unit  — backend (changed files only) + common + frontend tests
#   4. test-full  — (only with --full) full test suite via turbo
#   5. smoke      — (only with --full) health check on running instance
#
# Output: JSON to stdout, human-readable progress to stderr.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENT_ID="${1:?Usage: $0 <agent-id> [--full]}"
shift

FULL_MODE=false
for arg in "$@"; do
    case "$arg" in
        --full) FULL_MODE=true ;;
    esac
done

API_PORT=$((8000 + AGENT_ID * 10))

# --- JSON output helpers ---
STAGES="[]"
TOTAL_START=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")
OVERALL_STATUS="pass"

log() { echo "==> $*" >&2; }

add_stage() {
    local name="$1" status="$2" duration_ms="$3" first_error="${4:-}"
    local entry
    if [ -n "$first_error" ]; then
        # Escape special JSON characters in error message
        first_error=$(echo "$first_error" | head -1 | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g')
        entry="{\"name\":\"$name\",\"status\":\"$status\",\"duration_ms\":$duration_ms,\"first_error\":\"$first_error\"}"
    else
        entry="{\"name\":\"$name\",\"status\":\"$status\",\"duration_ms\":$duration_ms}"
    fi
    STAGES=$(echo "$STAGES" | sed "s/\]$/,$entry]/" | sed 's/\[,/[/')
}

now_ms() {
    date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))"
}

run_stage() {
    local name="$1"
    shift
    local start
    start=$(now_ms)

    log "Stage: $name"

    local output
    local exit_code=0
    output=$("$@" 2>&1) || exit_code=$?

    local end
    end=$(now_ms)
    local duration=$((end - start))

    if [ "$exit_code" -eq 0 ]; then
        log "  PASS ($duration ms)"
        add_stage "$name" "pass" "$duration"
    else
        log "  FAIL ($duration ms)"
        local first_error
        first_error=$(echo "$output" | grep -iE "(error|fail)" | head -1)
        [ -z "$first_error" ] && first_error=$(echo "$output" | tail -1)
        add_stage "$name" "fail" "$duration" "$first_error"
        OVERALL_STATUS="fail"
        return 1
    fi
}

# --- Stage 1: Typecheck ---
typecheck_stage() {
    local pids=() exit_codes=() outputs=()
    local tmpdir
    tmpdir=$(mktemp -d)

    (cd "$REPO_ROOT" && pnpm -F common typecheck > "$tmpdir/common" 2>&1) &
    pids+=($!)
    (cd "$REPO_ROOT" && pnpm -F backend typecheck > "$tmpdir/backend" 2>&1) &
    pids+=($!)
    (cd "$REPO_ROOT" && pnpm -F frontend typecheck > "$tmpdir/frontend" 2>&1) &
    pids+=($!)

    local failed=0
    for pid in "${pids[@]}"; do
        wait "$pid" || failed=1
    done

    if [ "$failed" -ne 0 ]; then
        cat "$tmpdir/common" "$tmpdir/backend" "$tmpdir/frontend"
        rm -rf "$tmpdir"
        return 1
    fi

    rm -rf "$tmpdir"
    return 0
}

# --- Stage 2: Lint ---
lint_stage() {
    local pids=() exit_codes=() outputs=()
    local tmpdir
    tmpdir=$(mktemp -d)

    (cd "$REPO_ROOT" && pnpm -F common lint > "$tmpdir/common" 2>&1) &
    pids+=($!)
    (cd "$REPO_ROOT" && pnpm -F backend lint > "$tmpdir/backend" 2>&1) &
    pids+=($!)
    (cd "$REPO_ROOT" && pnpm -F frontend lint > "$tmpdir/frontend" 2>&1) &
    pids+=($!)

    local failed=0
    for pid in "${pids[@]}"; do
        wait "$pid" || failed=1
    done

    if [ "$failed" -ne 0 ]; then
        cat "$tmpdir/common" "$tmpdir/backend" "$tmpdir/frontend"
        rm -rf "$tmpdir"
        return 1
    fi

    rm -rf "$tmpdir"
    return 0
}

# --- Stage 3: Unit tests ---
test_unit_stage() {
    local pids=()
    local tmpdir
    tmpdir=$(mktemp -d)

    (cd "$REPO_ROOT" && pnpm -F backend test:dev:nowatch > "$tmpdir/backend" 2>&1) &
    pids+=($!)
    (cd "$REPO_ROOT" && pnpm -F common test > "$tmpdir/common" 2>&1) &
    pids+=($!)

    local failed=0
    for pid in "${pids[@]}"; do
        wait "$pid" || failed=1
    done

    if [ "$failed" -ne 0 ]; then
        cat "$tmpdir/backend" "$tmpdir/common"
        rm -rf "$tmpdir"
        return 1
    fi

    rm -rf "$tmpdir"
    return 0
}

# --- Stage 4: Full tests (--full only) ---
test_full_stage() {
    cd "$REPO_ROOT" && pnpm test 2>&1
}

# --- Stage 5: Smoke test (--full only) ---
smoke_stage() {
    local health_url="http://localhost:$API_PORT/api/v1/health"
    curl -sf "$health_url" 2>&1
}

# --- Run stages ---
run_stage "typecheck" typecheck_stage || true
if [ "$OVERALL_STATUS" = "pass" ]; then
    run_stage "lint" lint_stage || true
fi
if [ "$OVERALL_STATUS" = "pass" ]; then
    run_stage "test-unit" test_unit_stage || true
fi
if [ "$FULL_MODE" = true ] && [ "$OVERALL_STATUS" = "pass" ]; then
    run_stage "test-full" test_full_stage || true
fi
if [ "$FULL_MODE" = true ] && [ "$OVERALL_STATUS" = "pass" ]; then
    run_stage "smoke" smoke_stage || true
fi

# --- Output JSON ---
TOTAL_END=$(now_ms)
TOTAL_DURATION=$((TOTAL_END - TOTAL_START))

cat <<EOF
{"status":"$OVERALL_STATUS","stages":$STAGES,"total_duration_ms":$TOTAL_DURATION}
EOF

# Exit with non-zero if any stage failed
if [ "$OVERALL_STATUS" != "pass" ]; then
    exit 1
fi
