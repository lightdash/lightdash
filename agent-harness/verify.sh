#!/usr/bin/env bash
# Progressive verification pipeline for agent changes.
# Runs typecheck, lint, and test stages. Exits early on failure by default.
#
# Usage: ./agent-harness/verify.sh <agent-id> [--full]
#   --full: also run full test suite and smoke test
#
# Output: JSON to stdout, human-readable progress to stderr
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENT_ID="${1:-${AGENT_ID:-}}"
FULL_MODE=false

for arg in "$@"; do
    case "$arg" in
        --full) FULL_MODE=true ;;
    esac
done

if [[ -z "$AGENT_ID" ]] || ! [[ "$AGENT_ID" =~ ^[1-5]$ ]]; then
    echo "Usage: $0 <agent-id> [--full]" >&2
    echo "  Or set AGENT_ID environment variable" >&2
    exit 1
fi

API_PORT=$((8000 + AGENT_ID * 10))

# ── JSON result builder ──────────────────────────────────────────────────
STAGES="[]"
OVERALL_STATUS="pass"
TOTAL_START=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')

add_stage() {
    local name="$1" status="$2" duration="$3" error="${4:-}"

    if [ -n "$error" ]; then
        # Escape JSON special characters
        error=$(echo "$error" | head -5 | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ')
        STAGES=$(echo "$STAGES" | node -e "
            const s = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
            s.push({name:'$name',status:'$status',duration_ms:$duration,first_error:'$error'});
            console.log(JSON.stringify(s));
        ")
    else
        STAGES=$(echo "$STAGES" | node -e "
            const s = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
            s.push({name:'$name',status:'$status',duration_ms:$duration});
            console.log(JSON.stringify(s));
        ")
    fi

    if [ "$status" = "fail" ]; then
        OVERALL_STATUS="fail"
    fi
}

log() { echo "==> [verify] $*" >&2; }

run_stage() {
    local name="$1"
    shift
    local stage_start
    stage_start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')

    log "Running stage: $name"

    local output
    local exit_code=0
    output=$("$@" 2>&1) || exit_code=$?

    local stage_end
    stage_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
    local duration=$((stage_end - stage_start))

    if [ "$exit_code" -eq 0 ]; then
        log "  PASS ($name) - ${duration}ms"
        add_stage "$name" "pass" "$duration"
    else
        log "  FAIL ($name) - ${duration}ms"
        add_stage "$name" "fail" "$duration" "$output"
        return 1
    fi
}

# ── Stage 1: Typecheck ───────────────────────────────────────────────────
run_parallel_stage() {
    local name="$1"
    shift
    local stage_start
    stage_start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')

    log "Running stage: $name (parallel)"

    local pids=()
    local tmpdir
    tmpdir=$(mktemp -d)
    local i=0

    for cmd in "$@"; do
        eval "$cmd" > "$tmpdir/out_$i" 2>&1 &
        pids+=($!)
        i=$((i + 1))
    done

    local exit_code=0
    local first_error=""
    i=0
    for pid in "${pids[@]}"; do
        if ! wait "$pid"; then
            exit_code=1
            if [ -z "$first_error" ]; then
                first_error=$(cat "$tmpdir/out_$i")
            fi
        fi
        i=$((i + 1))
    done

    local stage_end
    stage_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
    local duration=$((stage_end - stage_start))

    if [ "$exit_code" -eq 0 ]; then
        log "  PASS ($name) - ${duration}ms"
        add_stage "$name" "pass" "$duration"
    else
        log "  FAIL ($name) - ${duration}ms"
        add_stage "$name" "fail" "$duration" "$first_error"
    fi

    rm -rf "$tmpdir"
    return $exit_code
}

cd "$REPO_ROOT"

# Stage 1: Typecheck (parallel across packages)
run_parallel_stage "typecheck" \
    "pnpm -F common typecheck" \
    "pnpm -F backend typecheck" \
    "pnpm -F frontend typecheck" \
    || { OVERALL_STATUS="fail"; }

# Stage 2: Lint (parallel across packages) — only if typecheck passed
if [ "$OVERALL_STATUS" = "pass" ]; then
    run_parallel_stage "lint" \
        "pnpm -F common lint" \
        "pnpm -F backend lint" \
        "pnpm -F frontend lint" \
        || { OVERALL_STATUS="fail"; }
fi

# Stage 3: Unit tests — only if lint passed
if [ "$OVERALL_STATUS" = "pass" ]; then
    run_parallel_stage "test-unit" \
        "pnpm -F common test" \
        "pnpm -F backend test:dev:nowatch" \
        || { OVERALL_STATUS="fail"; }
fi

# Stage 4: Full tests (only with --full) — only if unit tests passed
if [ "$FULL_MODE" = true ] && [ "$OVERALL_STATUS" = "pass" ]; then
    run_stage "test-full" pnpm test || { OVERALL_STATUS="fail"; }
fi

# Stage 5: Smoke test (only with --full) — only if tests passed
if [ "$FULL_MODE" = true ] && [ "$OVERALL_STATUS" = "pass" ]; then
    HEALTH_URL="http://localhost:${API_PORT}/api/v1/health"
    run_stage "smoke" curl -sf "$HEALTH_URL" || { OVERALL_STATUS="fail"; }
fi

# ── Output JSON result ──────────────────────────────────────────────────
TOTAL_END=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
TOTAL_DURATION=$((TOTAL_END - TOTAL_START))

node -e "
    const result = {
        status: '$OVERALL_STATUS',
        stages: $STAGES,
        total_duration_ms: $TOTAL_DURATION
    };
    console.log(JSON.stringify(result, null, 2));
"

log ""
if [ "$OVERALL_STATUS" = "pass" ]; then
    log "All stages passed! (${TOTAL_DURATION}ms)"
else
    log "Verification FAILED. (${TOTAL_DURATION}ms)"
    exit 1
fi
