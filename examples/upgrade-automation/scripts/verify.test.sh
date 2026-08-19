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

run_version_comparison_test() {
    local running_version=$1
    local pinned_version=$2
    local expected_status=$3
    local expected_outcome=$4
    local expected_reason=$5
    local expect_issue_create=$6
    local test_name=$7
    local scenario_dir
    scenario_dir=$(mktemp -d)
    mkdir -p "$scenario_dir/bin"
    printf 'image:\n  tag: %s\n' "$pinned_version" >"$scenario_dir/values.yml"
    printf '0\n' >"$scenario_dir/time"
    : >"$scenario_dir/gh.log"

    cat >"$scenario_dir/bin/gh" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" >>"$TEST_SCENARIO_DIR/gh.log"

case "$*" in
    *'repos/example/upgrade-test --jq .default_branch'*) printf 'main\n' ;;
    *'api user --jq .login'*) printf 'test-user\n' ;;
    *'repos/example/upgrade-test/pulls?'*) printf '123\t0000000000000000000000000000000000000000\n' ;;
    *'pr view 123'*'--json body --jq .body'*) printf '```json\n{"coveredVersions":["%s"],"direction":"forward","fromVersion":"1.2.2","minPreviousVersion":null,"missingRanges":[],"requiredStops":[],"safe":true,"toVersion":"%s","verdict":true}\n```\n' "$TEST_PINNED_VERSION" "$TEST_PINNED_VERSION" ;;
    *'pr view 123'*'--json comments'*) printf 'false\n' ;;
    *'pr view 123'*'--json url'*) printf 'https://example.test/pr/123\n' ;;
    *'issue list'*) printf '\n' ;;
    *'issue create'*) printf 'https://example.test/issues/1\n' ;;
    *'pr comment 123'*)
        while [[ $# -gt 0 ]]; do
            if [[ "$1" == '--body-file' ]]; then
                cp "$2" "$TEST_SCENARIO_DIR/summary"
                break
            fi
            shift
        done
        ;;
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
EOF
    cat >"$scenario_dir/bin/curl" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

output=
write_out=
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output) output=$2; shift 2 ;;
        --write-out) write_out=$2; shift 2 ;;
        *) shift ;;
    esac
done

if [[ -n "$write_out" ]]; then
    printf '%s\n' '{"status":"ready","warnings":[]}' >"$output"
    printf '200'
else
    printf 'Lightdash-Version: %s\n' "$TEST_RUNNING_VERSION" >"$output"
fi
EOF
    chmod +x "$scenario_dir/bin"/*

    set +e
    output=$(cd "$scenario_dir" && PATH="$scenario_dir/bin:$PATH" \
        TEST_SCENARIO_DIR="$scenario_dir" \
        TEST_RUNNING_VERSION="$running_version" \
        TEST_PINNED_VERSION="$pinned_version" \
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

    if [[ $status -ne $expected_status ]]; then
        printf 'expected %s status for %s, got %s:\n%s\n' "$expected_status" "$test_name" "$status" "$output" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if ! grep -Fq "Outcome: **$expected_outcome**" "$scenario_dir/summary"; then
        printf 'expected %s outcome for %s, got:\n' "$expected_outcome" "$test_name" >&2
        cat "$scenario_dir/summary" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if ! grep -Fq "Last readiness reason: \`$expected_reason\`" "$scenario_dir/summary"; then
        printf 'expected %s as the last readiness reason for %s, got:\n' "$expected_reason" "$test_name" >&2
        cat "$scenario_dir/summary" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if [[ "$expect_issue_create" == "true" ]]; then
        if ! grep -Fq 'issue create' "$scenario_dir/gh.log"; then
            printf 'expected %s to create a freeze issue\n' "$test_name" >&2
            rm -rf "$scenario_dir"
            exit 1
        fi
    elif grep -Fq 'issue create' "$scenario_dir/gh.log"; then
        printf 'expected %s not to create a freeze issue\n' "$test_name" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    printf 'verify %s test passed\n' "$test_name"
    rm -rf "$scenario_dir"
}

run_version_comparison_test 1.2.4 1.2.3 0 superseded superseded:1.2.4 false 'newer version supersession'
run_version_comparison_test 1.2.2 1.2.3 1 failure version_mismatch:1.2.2 true 'older version mismatch'
run_version_comparison_test 1.2.4-beta.1 1.2.3 1 failure version_mismatch:1.2.4-beta.1 true 'prerelease version mismatch'

run_freeze_cleanup_test() {
    local issue_kind=$1
    local expected_issue_number=$2
    local test_name=$3
    local scenario_dir
    scenario_dir=$(mktemp -d)
    mkdir -p "$scenario_dir/bin"
    printf 'image:\n  tag: 1.2.3\n' >"$scenario_dir/values.yml"
    printf '0\n' >"$scenario_dir/time"
    : >"$scenario_dir/gh.log"

    cat >"$scenario_dir/bin/gh" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" >>"$TEST_SCENARIO_DIR/gh.log"

case "$*" in
    *'repos/example/upgrade-test --jq .default_branch'*) printf 'main\n' ;;
    *'api user --jq .login'*) printf 'test-user\n' ;;
    *'repos/example/upgrade-test/pulls?'*) printf '123\t0000000000000000000000000000000000000000\n' ;;
    *'pr view 123'*'--json body --jq .body'*) printf '```json\n{"coveredVersions":["1.2.3"],"direction":"forward","fromVersion":"1.2.2","minPreviousVersion":null,"missingRanges":[],"requiredStops":[],"safe":true,"toVersion":"1.2.3","verdict":true}\n```\n' ;;
    *'pr view 123'*'--json comments'*) printf 'false\n' ;;
    *'pr view 123'*'--json url'*) printf 'https://example.test/pr/123\n' ;;
    *'issue list'*'upgrade-automation:auto-freeze'*)
        if [[ "$TEST_ISSUE_KIND" == 'marked' ]]; then
            printf '17\n'
        fi
        ;;
    *'issue list'*) printf '18\n' ;;
    *'issue close'*) ;;
    *'pr comment 123'*)
        while [[ $# -gt 0 ]]; do
            if [[ "$1" == '--body-file' ]]; then
                cp "$2" "$TEST_SCENARIO_DIR/summary"
                break
            fi
            shift
        done
        ;;
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
EOF
    cat >"$scenario_dir/bin/curl" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

output=
write_out=
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output) output=$2; shift 2 ;;
        --write-out) write_out=$2; shift 2 ;;
        *) shift ;;
    esac
done

if [[ -n "$write_out" ]]; then
    printf '%s\n' '{"status":"ready","warnings":[]}' >"$output"
    printf '200'
else
    printf 'Lightdash-Version: 1.2.3\n' >"$output"
fi
EOF
    chmod +x "$scenario_dir/bin"/*

    set +e
    output=$(cd "$scenario_dir" && PATH="$scenario_dir/bin:$PATH" \
        TEST_SCENARIO_DIR="$scenario_dir" \
        TEST_ISSUE_KIND="$issue_kind" \
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

    if [[ $status -ne 0 ]]; then
        printf 'expected successful verification for %s, got:\n%s\n' "$test_name" "$output" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if ! grep -Fq 'Outcome: **success**' "$scenario_dir/summary"; then
        printf 'expected successful outcome for %s, got:\n' "$test_name" >&2
        cat "$scenario_dir/summary" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if [[ -n "$expected_issue_number" ]]; then
        if ! grep -Fq "issue close $expected_issue_number" "$scenario_dir/gh.log"; then
            printf 'expected %s to close issue %s\n' "$test_name" "$expected_issue_number" >&2
            rm -rf "$scenario_dir"
            exit 1
        fi
        if ! grep -Fq 'Upgrade automation is re-armed after verifying `1.2.3`: https://example.test/run/1' "$scenario_dir/gh.log"; then
            printf 'expected %s to explain the verified version and deployment run\n' "$test_name" >&2
            rm -rf "$scenario_dir"
            exit 1
        fi
    elif grep -Fq 'issue close' "$scenario_dir/gh.log"; then
        printf 'expected %s not to close an unmarked issue\n' "$test_name" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    printf 'verify %s test passed\n' "$test_name"
    rm -rf "$scenario_dir"
}

run_freeze_cleanup_test marked 17 'marked freeze cleanup'
run_freeze_cleanup_test unmarked '' 'unmarked freeze preservation'

run_branch_match_test() {
    local branch_prefix=$1
    local exact_branch=$2
    local other_branch=$3
    local test_name=$4
    local scenario_dir
    scenario_dir=$(mktemp -d)
    mkdir -p "$scenario_dir/bin"
    printf 'image:\n  tag: 1.2.3\n' >"$scenario_dir/values.yml"
    : >"$scenario_dir/gh.log"

    jq -n \
        --arg exact_branch "$exact_branch" \
        --arg other_branch "$other_branch" \
        '[
            {
                number: 123,
                merged_at: "2026-08-19T12:00:00Z",
                head: {ref: $other_branch},
                merge_commit_sha: "3333333333333333333333333333333333333333"
            },
            {
                number: 124,
                merged_at: "2026-08-19T12:01:00Z",
                head: {ref: $exact_branch},
                merge_commit_sha: "4444444444444444444444444444444444444444"
            }
        ]' >"$scenario_dir/pulls.json"

    cat >"$scenario_dir/bin/gh" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" >>"$TEST_SCENARIO_DIR/gh.log"

case "$*" in
    *'repos/example/upgrade-test --jq .default_branch'*) printf 'main\n' ;;
    *'api user --jq .login'*) printf 'test-user\n' ;;
    *'repos/example/upgrade-test/pulls?'*)
        while [[ $# -gt 0 ]]; do
            if [[ "$1" == '--jq' ]]; then
                jq -r "$2" "$TEST_SCENARIO_DIR/pulls.json"
                exit 0
            fi
            shift
        done
        exit 1
        ;;
    *'pr view 123'*'--json body --jq .body'*) printf '```json\n{"coveredVersions":[],"direction":"forward","fromVersion":"1.2.2","minPreviousVersion":null,"missingRanges":[],"requiredStops":[],"safe":true,"toVersion":"1.2.3","verdict":true}\n```\n' ;;
    *'pr view 124'*'--json body --jq .body'*) printf '```json\n{"coveredVersions":[],"direction":"forward","fromVersion":"1.2.2","minPreviousVersion":null,"missingRanges":[],"requiredStops":[],"safe":true,"toVersion":"1.2.3","verdict":true}\n```\n' ;;
    *'pr view 123'*'--json comments'*) printf 'true\n' ;;
    *'pr view 124'*'--json comments'*) printf 'true\n' ;;
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
    chmod +x "$scenario_dir/bin"/*

    set +e
    output=$(cd "$scenario_dir" && PATH="$scenario_dir/bin:$PATH" \
        TEST_SCENARIO_DIR="$scenario_dir" \
        GITHUB_REPOSITORY=example/upgrade-test \
        INSTANCE_URL=https://example.test \
        BUMP_TARGET=values.yml#image.tag \
        BRANCH_PREFIX="$branch_prefix" \
        VERIFY_WINDOW=1s \
        FREEZE_LABEL=upgrade-freeze \
        DEPLOY_RUN_URL=https://example.test/run/1 \
        DEPLOY_CONCLUSION=success \
        DEPLOYED_SHA=5555555555555555555555555555555555555555 \
        GH_TOKEN=test-token \
        "$root/examples/upgrade-automation/scripts/verify.sh" 2>&1)
    status=$?
    set -e

    if [[ $status -ne 0 ]]; then
        printf 'expected %s to verify successfully, got status %s:\n%s\n' "$test_name" "$status" "$output" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if ! grep -Fq 'pr view 124' "$scenario_dir/gh.log"; then
        printf 'expected %s to match the exact branch, gh calls were:\n%s\n' "$test_name" "$(cat "$scenario_dir/gh.log")" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi
    if grep -Fq 'pr view 123' "$scenario_dir/gh.log"; then
        printf 'expected %s not to match the other branch, gh calls were:\n%s\n' "$test_name" "$(cat "$scenario_dir/gh.log")" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    printf 'verify %s test passed\n' "$test_name"
    rm -rf "$scenario_dir"
}

run_branch_match_test staging-upgrade staging-upgrade-1.2.3 production-upgrade-1.2.3 'custom branch prefix match'
run_branch_match_test lightdash-upgrade lightdash-upgrade-1.2.3 lightdash-upgrade-staging-1.2.3 'overlapping branch prefix isolation'
