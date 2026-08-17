#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/bin"

printf 'image:\n  tag: 1.2.3\n' >"$test_dir/values.yml"
cat >"$test_dir/bin/gh" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

if [[ "$*" == *'repos/example/upgrade-test --jq .default_branch'* ]]; then
    printf 'main\n'
    exit 0
fi

if [[ "$*" == *'repos/example/upgrade-test/pulls?'* ]]; then
    printf 'simulated pull-request lookup failure\n' >&2
    exit 1
fi

printf 'unexpected gh invocation: %s\n' "$*" >&2
exit 1
EOF
chmod +x "$test_dir/bin/gh"

cd "$test_dir"

set +e
output=$(PATH="$test_dir/bin:$PATH" \
    GITHUB_REPOSITORY=example/upgrade-test \
    INSTANCE_URL=https://example.test \
    BUMP_TARGET=values.yml#image.tag \
    VERIFY_WINDOW=1s \
    FREEZE_LABEL=upgrade-freeze \
    DEPLOY_RUN_URL=https://example.test/run/1 \
    DEPLOY_CONCLUSION=success \
    DEPLOYED_SHA=0000000000000000000000000000000000000000 \
    GH_TOKEN=test-token \
    "$root/examples/upgrade-automation/scripts/verify.sh" 2>&1)
status=$?
set -e

if [[ $status -eq 0 ]]; then
    printf 'expected a failed pull-request lookup to fail verification\n' >&2
    exit 1
fi

if [[ "$output" != *'Unable to list merged upgrade pull requests; refusing to skip verification.'* ]]; then
    printf 'expected a clear lookup failure, got:\n%s\n' "$output" >&2
    exit 1
fi

printf 'verify lookup failure test passed\n'

run_warning_test() {
    local warning=$1
    local expected_reason=$2
    local expected_sleeps=$3
    local scenario_dir
    scenario_dir=$(mktemp -d)
    mkdir -p "$scenario_dir/bin"
    printf 'image:\n  tag: 1.2.3\n' >"$scenario_dir/values.yml"
    printf '0\n' >"$scenario_dir/time"
    printf '0\n' >"$scenario_dir/sleeps"

    cat >"$scenario_dir/bin/gh" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

case "$*" in
    *'repos/example/upgrade-test --jq .default_branch'*) printf 'main\n' ;;
    *'api user --jq .login'*) printf 'test-user\n' ;;
    *'repos/example/upgrade-test/pulls?'*) printf '123\t0000000000000000000000000000000000000000\n' ;;
    *'pr view 123'*'--json body --jq .body'*) printf '```json\n{"coveredVersions":["1.2.3"],"direction":"forward","fromVersion":"1.2.2","minPreviousVersion":null,"missingRanges":[],"requiredStops":[],"safe":true,"toVersion":"1.2.3","verdict":true}\n```\n' ;;
    *'pr view 123'*'--json comments'*) printf 'false\n' ;;
    *'pr view 123'*'--json url'*) printf 'https://example.test/pr/123\n' ;;
    *'issue list'*) printf '\n' ;;
    *'pr comment 123'*)
        while [[ $# -gt 0 ]]; do
            if [[ "$1" == '--body-file' ]]; then
                cp "$2" "$TEST_SCENARIO_DIR/summary"
                break
            fi
            shift
        done
        ;;
    *'issue create'*) printf 'https://example.test/issues/1\n' ;;
    *) ;;
esac
EOF
    cat >"$scenario_dir/bin/git" <<'EOF'
#!/usr/bin/env bash

if [[ "$1" == 'merge-base' ]]; then
    exit 0
fi

exit 1
EOF
    cat >"$scenario_dir/bin/date" <<'EOF'
#!/usr/bin/env bash

cat "$TEST_SCENARIO_DIR/time"
EOF
    cat >"$scenario_dir/bin/sleep" <<'EOF'
#!/usr/bin/env bash

current=$(cat "$TEST_SCENARIO_DIR/time")
printf '%s\n' "$((current + $1))" >"$TEST_SCENARIO_DIR/time"
count=$(cat "$TEST_SCENARIO_DIR/sleeps")
printf '%s\n' "$((count + 1))" >"$TEST_SCENARIO_DIR/sleeps"
EOF
    cat >"$scenario_dir/bin/curl" <<EOF
#!/usr/bin/env bash

set -euo pipefail

output=
write_out=
while [[ \$# -gt 0 ]]; do
    case "\$1" in
        --output) output=\$2; shift 2 ;;
        --write-out) write_out=\$2; shift 2 ;;
        *) shift ;;
    esac
done

if [[ -n "\$write_out" ]]; then
    printf '%s\n' '{"status":"ready","warnings":["$warning"]}' >"\$output"
    printf '200'
else
    printf 'Lightdash-Version: 1.2.3\n' >"\$output"
fi
EOF
    chmod +x "$scenario_dir/bin"/*

    set +e
    output=$(cd "$scenario_dir" && PATH="$scenario_dir/bin:$PATH" \
        TEST_SCENARIO_DIR="$scenario_dir" \
        GITHUB_REPOSITORY=example/upgrade-test \
        INSTANCE_URL=https://example.test \
        BUMP_TARGET=values.yml#image.tag \
        VERIFY_WINDOW=60s \
        FREEZE_LABEL=upgrade-freeze \
        DEPLOY_RUN_URL=https://example.test/run/1 \
        DEPLOY_CONCLUSION=success \
        DEPLOYED_SHA=0000000000000000000000000000000000000000 \
        GH_TOKEN=test-token \
        "$root/examples/upgrade-automation/scripts/verify.sh" 2>&1)
    status=$?
    set -e

    if [[ $status -eq 0 ]]; then
        printf 'expected %s warning to fail verification, got:\n%s\n' "$warning" "$output" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if ! grep -Fq "Last readiness reason: \`$expected_reason\`" "$scenario_dir/summary"; then
        printf 'expected %s as the last readiness reason, got:\n' "$expected_reason" >&2
        cat "$scenario_dir/summary" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if [[ $(cat "$scenario_dir/sleeps") -ne $expected_sleeps ]]; then
        printf 'expected %s sleeps for %s, got %s\n' "$expected_sleeps" "$warning" "$(cat "$scenario_dir/sleeps")" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if grep -Fq 'Consecutive ready and version-matched polls: 3' "$scenario_dir/summary"; then
        printf 'expected %s warning not to count a successful poll\n' "$warning" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    rm -rf "$scenario_dir"
}

run_warning_test migration_parked migration_parked 0
run_warning_test migration_ledger_unavailable migration_ledger_unavailable 3

printf 'verify readiness warning tests passed\n'
