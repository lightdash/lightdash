#!/usr/bin/env bash
set -uo pipefail

: "${CHANGES:?}" "${FORK:?}" "${COLUMN_NAMES:?}" "${REAL_SCHEMA_TESTS:?}" "${PREVIOUS_RELEASE:?}"
SCHEMA="${SCHEMA:-}"
BACKEND="${BACKEND:-}"

if [ "$CHANGES" != success ]; then
    echo "Change detection ended with '$CHANGES', so no schema check can be trusted." >&2
    exit 1
fi

failed=0

check() {
    local name="$1"
    local result="$2"
    local must_run="$3"
    case "$result" in
        success) echo "$name: passed." ;;
        skipped)
            if [ "$must_run" = true ]; then
                echo "$name was skipped, but this change needs it." >&2
                failed=1
            else
                echo "$name: not needed for this change."
            fi
            ;;
        *)
            echo "$name ended with '$result'." >&2
            failed=1
            ;;
    esac
}

same_repository=true
[ "$FORK" = true ] && same_repository=false

schema_must_run=false
[ "$SCHEMA" = true ] && schema_must_run=true
backend_must_run=false
[ "$BACKEND" = true ] && [ "$same_repository" = true ] && backend_must_run=true
previous_must_run=false
[ "$SCHEMA" = true ] && [ "$same_repository" = true ] && previous_must_run=true

check "New column names" "$COLUMN_NAMES" "$schema_must_run"
check "Real-schema integration tests" "$REAL_SCHEMA_TESTS" "$backend_must_run"
check "Previous release against this schema" "$PREVIOUS_RELEASE" "$previous_must_run"

exit "$failed"
