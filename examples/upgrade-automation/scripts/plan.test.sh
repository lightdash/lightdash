#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/bin" "$test_dir/runner-temp/lightdash-upgrade-cli/node_modules/.bin"

printf 'image:\n  tag: 1.0.0\n' >"$test_dir/values.yml"

cat >"$test_dir/index.json" <<'EOF'
{
  "schemaVersion": "1",
  "entries": [
    {"version": "1.0.0"},
    {"version": "1.0.1"},
    {"version": "1.0.2"}
  ]
}
EOF

cat >"$test_dir/bin/curl" <<EOF
#!/usr/bin/env bash

set -euo pipefail

if [[ "\$*" == *release-safety-index.json* ]]; then
    out=
    prev=
    for arg in "\$@"; do
        if [[ "\$prev" == "--output" ]]; then out="\$arg"; fi
        prev="\$arg"
    done
    cp "$test_dir/index.json" "\$out"
    exit 0
fi

if [[ "\$*" == *slack.test* ]]; then
    printf '%s\n' "\$*" >>"$test_dir/slack.log"
    exit 0
fi

printf 'unexpected curl invocation: %s\n' "\$*" >&2
exit 1
EOF

cat >"$test_dir/bin/npm" <<'EOF'
#!/usr/bin/env bash

printf '%s\n' "$*" >>"$TEST_SCENARIO_DIR/npm.log"
exit 0
EOF

cat >"$test_dir/runner-temp/lightdash-upgrade-cli/node_modules/.bin/lightdash" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" >>"$TEST_SCENARIO_DIR/gate.log"

from=
to=
prev=
for arg in "$@"; do
    case "$prev" in
        --from) from=$arg ;;
        --to) to=$arg ;;
    esac
    prev=$arg
done

printf '{"coveredVersions":["%s"],"direction":"upgrade","fromVersion":"%s","minPreviousVersion":null,"missingRanges":[],"requiredStops":[],"safe":false,"toVersion":"%s","verdict":"unknown"}\n' \
    "$to" "$from" "$to"
exit 1
EOF

cat >"$test_dir/bin/gh" <<EOF
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "\$*" >>"$test_dir/gh.log"

if [[ "\$*" == "issue list"* ]]; then
    printf '0\n'
    exit 0
fi

if [[ "\$*" == *'repos/example/upgrade-test --jq .default_branch'* ]]; then
    printf 'main\n'
    exit 0
fi

if [[ "\$*" == *'git/ref/heads/main'* ]]; then
    printf '1111111111111111111111111111111111111111\n'
    exit 0
fi

if [[ "\$*" == *'contents/values.yml?ref='* ]]; then
    base64 <"$test_dir/values.yml" | tr -d '\n'
    exit 0
fi

if [[ "\$*" == *'git/ref/heads/'* ]]; then
    exit 1
fi

if [[ "\$*" == *'git/refs'* ]]; then
    printf '{}\n'
    exit 0
fi

if [[ "\$*" == *graphql* ]]; then
    cat >"$test_dir/graphql-input"
    printf '{"data":{"createCommitOnBranch":{"commit":{"oid":"2222222222222222222222222222222222222222","url":"https://example.test/c"}}}}\n'
    exit 0
fi

if [[ "\$*" == "pr list"* ]]; then
    exit 0
fi

if [[ "\$*" == "pr create"* ]]; then
    while [[ \$# -gt 0 ]]; do
        if [[ "\$1" == '--body-file' ]]; then
            cp "\$2" "$test_dir/pr-body"
            break
        fi
        shift
    done
    printf 'https://example.test/pr/1\n'
    exit 0
fi

if [[ "\$*" == "pr view"* ]]; then
    printf '{"number":1,"url":"https://example.test/pr/1"}\n'
    exit 0
fi

if [[ "\$*" == "pr comment"* ]]; then
    exit 0
fi

printf 'unexpected gh invocation: %s\n' "\$*" >&2
exit 1
EOF

chmod +x "$test_dir/bin/curl" "$test_dir/bin/npm" "$test_dir/bin/gh" \
    "$test_dir/runner-temp/lightdash-upgrade-cli/node_modules/.bin/lightdash"

: >"$test_dir/slack.log"
: >"$test_dir/gh.log"
: >"$test_dir/gate.log"
: >"$test_dir/npm.log"

cd "$test_dir"

set +e
output=$(PATH="$test_dir/bin:$PATH" \
    TEST_SCENARIO_DIR="$test_dir" \
    RUNNER_TEMP="$test_dir/runner-temp" \
    GITHUB_REPOSITORY=example/upgrade-test \
    BUMP_TARGET=values.yml#image.tag \
    FREEZE_LABEL=upgrade-freeze \
    ESCALATION=https://slack.test/webhook \
    GH_TOKEN=test-token \
    "${BASH:-bash}" "$root/examples/upgrade-automation/scripts/plan.sh" 2>&1)
status=$?
set -e

if [[ $status -ne 0 ]]; then
    printf 'expected an unknown verdict to plan successfully, got status %s:\n%s\n' "$status" "$output" >&2
    exit 1
fi

if ! grep -q 'pr create' "$test_dir/gh.log"; then
    printf 'expected an unknown verdict to open a held pull request, gh calls were:\n%s\n' \
        "$(cat "$test_dir/gh.log")" >&2
    exit 1
fi

if ! grep -q '\[upgrade-hold\]' "$test_dir/slack.log"; then
    printf 'expected an unknown verdict to escalate to Slack, slack calls were:\n%s\n' \
        "$(cat "$test_dir/slack.log")" >&2
    exit 1
fi

if ! grep -q 'gate: unknown' "$test_dir/slack.log"; then
    printf 'expected the escalation to name the unknown verdict, slack calls were:\n%s\n' \
        "$(cat "$test_dir/slack.log")" >&2
    exit 1
fi

if grep -q 'could not determine' "$test_dir/slack.log"; then
    :
else
    printf 'expected the escalation to distinguish unknown from red, slack calls were:\n%s\n' \
        "$(cat "$test_dir/slack.log")" >&2
    exit 1
fi

if ! grep -q 'ref=refs/heads/lightdash-upgrade-1.0.1' "$test_dir/gh.log"; then
    printf 'expected the default branch prefix, gh calls were:\n%s\n' "$(cat "$test_dir/gh.log")" >&2
    exit 1
fi

if [[ ! -s "$test_dir/gate.log" ]]; then
    printf 'expected the default safety gate to run\n' >&2
    exit 1
fi

printf 'plan unknown-verdict hold test passed\n'
printf 'plan default inputs test passed\n'

printf 'image:\n  tag: 1.0.0\n' >"$test_dir/values.yml"
: >"$test_dir/gh.log"
: >"$test_dir/gate.log"

set +e
output=$(PATH="$test_dir/bin:$PATH" \
    TEST_SCENARIO_DIR="$test_dir" \
    RUNNER_TEMP="$test_dir/runner-temp" \
    GITHUB_REPOSITORY=example/upgrade-test \
    BUMP_TARGET=values.yml#image.tag \
    BRANCH_PREFIX=staging-upgrade \
    FREEZE_LABEL=upgrade-freeze \
    GH_TOKEN=test-token \
    "${BASH:-bash}" "$root/examples/upgrade-automation/scripts/plan.sh" 2>&1)
status=$?
set -e

if [[ $status -ne 0 ]]; then
    printf 'expected a custom branch prefix to plan successfully, got status %s:\n%s\n' "$status" "$output" >&2
    exit 1
fi

if ! grep -q 'ref=refs/heads/staging-upgrade-1.0.1' "$test_dir/gh.log"; then
    printf 'expected the custom branch prefix, gh calls were:\n%s\n' "$(cat "$test_dir/gh.log")" >&2
    exit 1
fi

printf 'plan custom branch prefix test passed\n'

printf 'image:\n  tag: 1.0.0\n' >"$test_dir/values.yml"
: >"$test_dir/gh.log"
: >"$test_dir/gate.log"
: >"$test_dir/npm.log"
rm -f "$test_dir/pr-body"

set +e
output=$(PATH="$test_dir/bin:$PATH" \
    TEST_SCENARIO_DIR="$test_dir" \
    RUNNER_TEMP="$test_dir/runner-temp" \
    GITHUB_REPOSITORY=example/upgrade-test \
    BUMP_TARGET=values.yml#image.tag \
    SAFETY_GATE=false \
    FREEZE_LABEL=upgrade-freeze \
    GH_TOKEN=test-token \
    "${BASH:-bash}" "$root/examples/upgrade-automation/scripts/plan.sh" 2>&1)
status=$?
set -e

if [[ $status -ne 0 ]]; then
    printf 'expected planning without the safety gate to succeed, got status %s:\n%s\n' "$status" "$output" >&2
    exit 1
fi

if [[ -s "$test_dir/gate.log" || -s "$test_dir/npm.log" ]]; then
    printf 'expected safety_gate=false not to install or call the gate CLI\n' >&2
    exit 1
fi

if ! grep -q 'ref=refs/heads/lightdash-upgrade-1.0.2' "$test_dir/gh.log"; then
    printf 'expected safety_gate=false to select the newest candidate, gh calls were:\n%s\n' "$(cat "$test_dir/gh.log")" >&2
    exit 1
fi

verdict_json=$(awk '/^```json$/ { capture=1; next } /^```$/ && capture { exit } capture' "$test_dir/pr-body")
if ! printf '%s' "$verdict_json" | (source "$root/examples/upgrade-automation/scripts/common.sh"; validate_verdict_json); then
    printf 'expected the synthesized verdict to pass validation, got:\n%s\n' "$verdict_json" >&2
    exit 1
fi

if ! jq -e '
    keys_unsorted == [
        "coveredVersions",
        "direction",
        "fromVersion",
        "minPreviousVersion",
        "missingRanges",
        "requiredStops",
        "safe",
        "toVersion",
        "verdict"
    ] and
    .coveredVersions == [] and
    .direction == "forward" and
    .fromVersion == "1.0.0" and
    .minPreviousVersion == null and
    .missingRanges == [] and
    .requiredStops == [] and
    .safe == true and
    .toVersion == "1.0.2" and
    .verdict == true
' <<<"$verdict_json" >/dev/null; then
    printf 'expected the synthesized verdict to describe the newest candidate, got:\n%s\n' "$verdict_json" >&2
    exit 1
fi

if ! grep -Fq 'The release-safety gate was not run for this instance.' "$test_dir/pr-body"; then
    printf 'expected the pull request body to say the safety gate was not run, got:\n%s\n' "$(cat "$test_dir/pr-body")" >&2
    exit 1
fi

printf 'plan disabled safety gate test passed\n'

set +e
output=$(PATH="$test_dir/bin:$PATH" \
    TEST_SCENARIO_DIR="$test_dir" \
    GITHUB_REPOSITORY=example/upgrade-test \
    BUMP_TARGET=values.yml#image.tag \
    BRANCH_PREFIX='invalid prefix' \
    FREEZE_LABEL=upgrade-freeze \
    GH_TOKEN=test-token \
    "${BASH:-bash}" "$root/examples/upgrade-automation/scripts/plan.sh" 2>&1)
status=$?
set -e

if [[ $status -eq 0 ]]; then
    printf 'expected an invalid branch prefix to fail planning\n' >&2
    exit 1
fi

if [[ "$output" != *'branch_prefix must match ^[A-Za-z0-9][A-Za-z0-9._-]*$'* ]]; then
    printf 'expected a clear invalid branch prefix message, got:\n%s\n' "$output" >&2
    exit 1
fi

printf 'plan invalid branch prefix test passed\n'

run_transaction_test() {
    local scenario=$1
    local test_name=$2
    local expected_status=$3
    local scenario_dir
    local output
    local status
    local committed_target
    local committed_unrelated
    local graphql_count
    local bump_filename=values.yml
    local fresh_suffix=yml

    if [[ "$scenario" == "json_round_trip" ]]; then
        bump_filename=values.json
        fresh_suffix=json
    fi

    scenario_dir=$(mktemp -d)
    mkdir -p "$scenario_dir/bin"
    if [[ "$scenario" == "json_round_trip" ]]; then
        cat >"$scenario_dir/$bump_filename" <<'EOF'
{
  "image": {"tag": "1.0.0"},
  "unrelated": {"tag": "old"}
}
EOF
    else
        cat >"$scenario_dir/$bump_filename" <<'EOF'
image:
  tag: 1.0.0
unrelated:
  tag: old
EOF
    fi
    cp "$scenario_dir/$bump_filename" "$scenario_dir/fresh-1.$fresh_suffix"
    cp "$scenario_dir/$bump_filename" "$scenario_dir/fresh-2.$fresh_suffix"

    case "$scenario" in
        stale_checkout)
            sed 's/tag: old/tag: new/' "$scenario_dir/$bump_filename" >"$scenario_dir/fresh-1.$fresh_suffix"
            ;;
        already_pinned)
            sed 's/tag: 1.0.0/tag: 1.0.2/' "$scenario_dir/$bump_filename" >"$scenario_dir/fresh-1.$fresh_suffix"
            ;;
        never_lower)
            sed 's/tag: 1.0.0/tag: 1.0.5/' "$scenario_dir/$bump_filename" >"$scenario_dir/fresh-1.$fresh_suffix"
            ;;
        key_moved)
            sed 's/tag: 1.0.0/tag: 1.0.1/' "$scenario_dir/$bump_filename" >"$scenario_dir/fresh-1.$fresh_suffix"
            ;;
        retry_rederive)
            sed 's/tag: old/tag: first/' "$scenario_dir/$bump_filename" >"$scenario_dir/fresh-1.$fresh_suffix"
            sed 's/tag: old/tag: second/' "$scenario_dir/$bump_filename" >"$scenario_dir/fresh-2.$fresh_suffix"
            ;;
        json_round_trip)
            sed 's/"old"/"new"/' "$scenario_dir/$bump_filename" >"$scenario_dir/fresh-1.$fresh_suffix"
            ;;
        freeze_mid_run | retry_exhaustion)
            ;;
        *)
            printf 'unknown transaction test scenario: %s\n' "$scenario" >&2
            rm -rf "$scenario_dir"
            exit 1
            ;;
    esac

    cat >"$scenario_dir/index.json" <<'EOF'
{
  "schemaVersion": "1",
  "entries": [
    {"version": "1.0.0"},
    {"version": "1.0.2"}
  ]
}
EOF
    : >"$scenario_dir/gh.log"

    cat >"$scenario_dir/bin/curl" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

out=
prev=
for arg in "$@"; do
    if [[ "$prev" == "--output" ]]; then out=$arg; fi
    prev=$arg
done
cp "$TEST_SCENARIO_DIR/index.json" "$out"
EOF

    cat >"$scenario_dir/bin/gh" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" >>"$TEST_SCENARIO_DIR/gh.log"

next_count() {
    local count_file=$1
    local count=0
    if [[ -f "$count_file" ]]; then
        count=$(<"$count_file")
    fi
    count=$((count + 1))
    printf '%s\n' "$count" >"$count_file"
    printf '%s\n' "$count"
}

if [[ "$*" == "issue list"* ]]; then
    issue_count=$(next_count "$TEST_SCENARIO_DIR/issue-count")
    if [[ "$GH_SCENARIO" == "freeze_mid_run" && "$issue_count" -gt 1 ]]; then
        printf '1\n'
    else
        printf '0\n'
    fi
    exit 0
fi

if [[ "$*" == *'repos/example/upgrade-test --jq .default_branch'* ]]; then
    printf 'main\n'
    exit 0
fi

if [[ "$*" == *'git/ref/heads/main'* ]]; then
    base_count=$(next_count "$TEST_SCENARIO_DIR/base-count")
    case "$base_count" in
        1) printf '1111111111111111111111111111111111111111\n' ;;
        2) printf '3333333333333333333333333333333333333333\n' ;;
        *) printf '5555555555555555555555555555555555555555\n' ;;
    esac
    exit 0
fi

if [[ "$*" == *"contents/$GH_BUMP_FILE?ref="* ]]; then
    content_count=$(next_count "$TEST_SCENARIO_DIR/content-count")
    fresh_file="$TEST_SCENARIO_DIR/fresh-1.$GH_FRESH_SUFFIX"
    if [[ "$GH_SCENARIO" == "retry_rederive" && "$content_count" -gt 1 ]]; then
        fresh_file="$TEST_SCENARIO_DIR/fresh-2.$GH_FRESH_SUFFIX"
    fi
    base64 <"$fresh_file" | tr -d '\n'
    exit 0
fi

if [[ "$*" == *'git/ref/heads/'* ]]; then
    if [[ -f "$TEST_SCENARIO_DIR/branch-created" ]]; then
        printf '{}\n'
        exit 0
    fi
    exit 1
fi

if [[ "$*" == *'git/refs'* ]]; then
    : >"$TEST_SCENARIO_DIR/branch-created"
    printf '{}\n'
    exit 0
fi

if [[ "$*" == *graphql* ]]; then
    graphql_count=$(next_count "$TEST_SCENARIO_DIR/graphql-count")
    cat >"$TEST_SCENARIO_DIR/graphql-input-$graphql_count"
    if [[ "$GH_SCENARIO" == "retry_exhaustion" || ( "$GH_SCENARIO" == "retry_rederive" && "$graphql_count" == "1" ) ]]; then
        exit 1
    fi
    printf '{"data":{"createCommitOnBranch":{"commit":{"oid":"2222222222222222222222222222222222222222","url":"https://example.test/c"}}}}\n'
    exit 0
fi

if [[ "$*" == "pr list"* ]]; then
    exit 0
fi

if [[ "$*" == "pr create"* ]]; then
    printf 'https://example.test/pr/1\n'
    exit 0
fi

if [[ "$*" == "pr view"* ]]; then
    printf '{"number":1,"url":"https://example.test/pr/1"}\n'
    exit 0
fi

if [[ "$*" == "pr comment"* ]]; then
    exit 0
fi

printf 'unexpected gh invocation: %s\n' "$*" >&2
exit 1
EOF

    chmod +x "$scenario_dir/bin/curl" "$scenario_dir/bin/gh"

    set +e
    output=$(cd "$scenario_dir" && \
        PATH="$scenario_dir/bin:$PATH" \
        TEST_SCENARIO_DIR="$scenario_dir" \
        GH_SCENARIO="$scenario" \
        GH_BUMP_FILE="$bump_filename" \
        GH_FRESH_SUFFIX="$fresh_suffix" \
        GITHUB_REPOSITORY=example/upgrade-test \
        BUMP_TARGET="$bump_filename#image.tag" \
        SAFETY_GATE=false \
        FREEZE_LABEL=upgrade-freeze \
        GH_TOKEN=test-token \
        "${BASH:-bash}" "$root/examples/upgrade-automation/scripts/plan.sh" 2>&1)
    status=$?
    set -e

    if [[ $status -ne $expected_status ]]; then
        printf 'expected %s to exit %s, got %s:\n%s\n' "$test_name" "$expected_status" "$status" "$output" >&2
        printf 'gh calls were:\n%s\n' "$(cat "$scenario_dir/gh.log")" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    if find "$scenario_dir" -maxdepth 1 -name 'plan-fresh.*' -print -quit | grep -q .; then
        printf 'expected %s to clean up its temporary bump file\n' "$test_name" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    case "$scenario" in
        stale_checkout)
            jq -r '.variables.input.fileChanges.additions[0].contents' "$scenario_dir/graphql-input-1" \
                | base64 --decode >"$scenario_dir/committed.yml"
            committed_target=$(cd "$scenario_dir" && python3 "$root/examples/upgrade-automation/scripts/bump-target.py" read committed.yml#image.tag)
            committed_unrelated=$(cd "$scenario_dir" && python3 "$root/examples/upgrade-automation/scripts/bump-target.py" read committed.yml#unrelated.tag)
            if [[ "$committed_target" != "1.0.2" || "$committed_unrelated" != "new" ]]; then
                printf 'expected the fresh blob to preserve unrelated=new and bump image.tag=1.0.2, got:\n%s\n' "$(cat "$scenario_dir/committed.yml")" >&2
                rm -rf "$scenario_dir"
                exit 1
            fi
            ;;
        json_round_trip)
            jq -r '.variables.input.fileChanges.additions[0].contents' "$scenario_dir/graphql-input-1" \
                | base64 --decode >"$scenario_dir/committed.json"
            if ! jq -e '.image.tag == "1.0.2" and .unrelated.tag == "new"' "$scenario_dir/committed.json" >/dev/null; then
                printf 'expected valid fresh JSON with image.tag=1.0.2 and unrelated.tag=new, got:\n%s\n' "$(cat "$scenario_dir/committed.json")" >&2
                rm -rf "$scenario_dir"
                exit 1
            fi
            ;;
        already_pinned)
            if grep -Eq -- '--method (POST|PATCH) repos/example/upgrade-test/git/refs|api graphql|pr create' "$scenario_dir/gh.log"; then
                printf 'expected fresh main already-pinned handling to avoid branch, commit, and PR mutations, gh calls were:\n%s\n' "$(cat "$scenario_dir/gh.log")" >&2
                rm -rf "$scenario_dir"
                exit 1
            fi
            ;;
        never_lower)
            if [[ "$output" != *'not lowering it'* ]] || grep -Eq -- '--method (POST|PATCH) repos/example/upgrade-test/git/refs|api graphql' "$scenario_dir/gh.log"; then
                printf 'expected never-lower handling without a commit, got:\n%s\ngh calls were:\n%s\n' "$output" "$(cat "$scenario_dir/gh.log")" >&2
                rm -rf "$scenario_dir"
                exit 1
            fi
            ;;
        key_moved)
            if [[ "$output" != *'a replan is required'* ]] || grep -Eq -- '--method (POST|PATCH) repos/example/upgrade-test/git/refs|api graphql' "$scenario_dir/gh.log"; then
                printf 'expected a moved key to require a replan without a commit, got:\n%s\ngh calls were:\n%s\n' "$output" "$(cat "$scenario_dir/gh.log")" >&2
                rm -rf "$scenario_dir"
                exit 1
            fi
            ;;
        retry_rederive)
            graphql_count=$(<"$scenario_dir/graphql-count")
            jq -r '.variables.input.fileChanges.additions[0].contents' "$scenario_dir/graphql-input-2" \
                | base64 --decode >"$scenario_dir/committed.yml"
            committed_target=$(cd "$scenario_dir" && python3 "$root/examples/upgrade-automation/scripts/bump-target.py" read committed.yml#image.tag)
            committed_unrelated=$(cd "$scenario_dir" && python3 "$root/examples/upgrade-automation/scripts/bump-target.py" read committed.yml#unrelated.tag)
            if [[ "$graphql_count" != "2" || "$committed_target" != "1.0.2" || "$committed_unrelated" != "second" ]] \
                || ! jq -e '.variables.input.expectedHeadOid == "3333333333333333333333333333333333333333"' "$scenario_dir/graphql-input-2" >/dev/null; then
                printf 'expected retry two to rebuild from the second base, got target=%s unrelated=%s graphql_count=%s\n' "$committed_target" "$committed_unrelated" "$graphql_count" >&2
                rm -rf "$scenario_dir"
                exit 1
            fi
            ;;
        freeze_mid_run)
            if grep -Eq -- '--method (POST|PATCH) repos/example/upgrade-test/git/refs|api graphql|pr create|pr merge' "$scenario_dir/gh.log"; then
                printf 'expected a mid-run freeze to prevent branch, commit, PR, and merge mutations, gh calls were:\n%s\n' "$(cat "$scenario_dir/gh.log")" >&2
                rm -rf "$scenario_dir"
                exit 1
            fi
            ;;
        retry_exhaustion)
            graphql_count=$(<"$scenario_dir/graphql-count")
            if [[ "$graphql_count" != "3" || "$output" != *'failed to commit values.yml after 3 attempts'* ]] || grep -q '^pr create' "$scenario_dir/gh.log"; then
                printf 'expected three failed commits and no PR, got:\n%s\ngh calls were:\n%s\n' "$output" "$(cat "$scenario_dir/gh.log")" >&2
                rm -rf "$scenario_dir"
                exit 1
            fi
            ;;
    esac

    rm -rf "$scenario_dir"
    printf '%s test passed\n' "$test_name"
}

run_transaction_test stale_checkout 'plan stale-checkout clobber' 0
run_transaction_test json_round_trip 'plan JSON bump target round-trip' 0
run_transaction_test already_pinned 'plan already pinned on fresh main' 0
run_transaction_test never_lower 'plan never-lower' 0
run_transaction_test key_moved 'plan key moved mid-plan' 0
run_transaction_test retry_rederive 'plan retry re-derives from a fresh base' 0
run_transaction_test freeze_mid_run 'plan freeze armed mid-run' 0
run_transaction_test retry_exhaustion 'plan retry exhaustion' 1

run_auto_merge_test() {
    local test_name=$1
    local auto_merge=$2
    local auto_merge_result=$3
    local merge_state=$4
    local expected_status=$5
    local expected_auto_merge=$6
    local expected_state_view=$7
    local expected_plain_merge=$8
    local expected_error=$9
    local freeze_before_merge=${10}
    local scenario_dir
    local output
    local status
    local auto_merge_call
    local state_view_call
    local plain_merge_call
    local auto_merge_env=()

    scenario_dir=$(mktemp -d)
    mkdir -p "$scenario_dir/bin"
    printf 'image:\n  tag: 1.0.0\n' >"$scenario_dir/values.yml"
    cat >"$scenario_dir/index.json" <<'EOF'
{
  "schemaVersion": "1",
  "entries": [
    {"version": "1.0.0"},
    {"version": "1.0.1"}
  ]
}
EOF
    : >"$scenario_dir/gh.log"

    cat >"$scenario_dir/bin/curl" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

out=
prev=
for arg in "$@"; do
    if [[ "$prev" == "--output" ]]; then out=$arg; fi
    prev=$arg
done
cp "$TEST_SCENARIO_DIR/index.json" "$out"
EOF

    cat >"$scenario_dir/bin/gh" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" >>"$TEST_SCENARIO_DIR/gh.log"

if [[ "$*" == "issue list"* ]]; then
    issue_count=0
    if [[ -f "$TEST_SCENARIO_DIR/issue-count" ]]; then
        issue_count=$(<"$TEST_SCENARIO_DIR/issue-count")
    fi
    issue_count=$((issue_count + 1))
    printf '%s\n' "$issue_count" >"$TEST_SCENARIO_DIR/issue-count"
    if [[ "$GH_FREEZE_BEFORE_MERGE" == "true" && "$issue_count" -gt 2 ]]; then
        printf '1\n'
    else
        printf '0\n'
    fi
    exit 0
fi

if [[ "$*" == *'repos/example/upgrade-test --jq .default_branch'* ]]; then
    printf 'main\n'
    exit 0
fi

if [[ "$*" == *'git/ref/heads/main'* ]]; then
    printf '1111111111111111111111111111111111111111\n'
    exit 0
fi

if [[ "$*" == *'contents/values.yml?ref='* ]]; then
    base64 <"$TEST_SCENARIO_DIR/values.yml" | tr -d '\n'
    exit 0
fi

if [[ "$*" == *'git/ref/heads/'* ]]; then
    exit 1
fi

if [[ "$*" == *'git/refs'* ]]; then
    printf '{}\n'
    exit 0
fi

if [[ "$*" == *graphql* ]]; then
    cat >"$TEST_SCENARIO_DIR/graphql-input"
    printf '{"data":{"createCommitOnBranch":{"commit":{"oid":"2222222222222222222222222222222222222222","url":"https://example.test/c"}}}}\n'
    exit 0
fi

if [[ "$*" == "pr list"* ]]; then
    exit 0
fi

if [[ "$*" == "pr create"* ]]; then
    printf 'https://example.test/pr/1\n'
    exit 0
fi

if [[ "$*" == "pr view"*'--json mergeStateStatus'* ]]; then
    printf '%s\n' "$GH_MERGE_STATE"
    exit 0
fi

if [[ "$*" == "pr view"* ]]; then
    printf '{"number":1,"url":"https://example.test/pr/1"}\n'
    exit 0
fi

if [[ "$*" == "pr comment"* ]]; then
    exit 0
fi

if [[ "$*" == "pr merge"*'--auto --squash'* ]]; then
    if [[ "$GH_AUTO_MERGE_RESULT" == "failure" ]]; then
        printf 'GraphQL: original auto merge error\n' >&2
        exit 1
    fi
    exit 0
fi

if [[ "$*" == "pr merge"*'--squash'* ]]; then
    exit 0
fi

printf 'unexpected gh invocation: %s\n' "$*" >&2
exit 1
EOF

    chmod +x "$scenario_dir/bin/curl" "$scenario_dir/bin/gh"

    if [[ "$auto_merge" == "true" ]]; then
        auto_merge_env=(AUTO_MERGE=true)
    fi

    set +e
    output=$(cd "$scenario_dir" && env -u AUTO_MERGE \
        PATH="$scenario_dir/bin:$PATH" \
        TEST_SCENARIO_DIR="$scenario_dir" \
        GH_AUTO_MERGE_RESULT="$auto_merge_result" \
        GH_MERGE_STATE="$merge_state" \
        GH_FREEZE_BEFORE_MERGE="$freeze_before_merge" \
        "${auto_merge_env[@]}" \
        GITHUB_REPOSITORY=example/upgrade-test \
        BUMP_TARGET=values.yml#image.tag \
        SAFETY_GATE=false \
        FREEZE_LABEL=upgrade-freeze \
        GH_TOKEN=test-token \
        "${BASH:-bash}" "$root/examples/upgrade-automation/scripts/plan.sh" 2>"$scenario_dir/stderr")
    status=$?
    set -e

    if [[ $status -ne $expected_status ]]; then
        printf 'expected %s to exit %s, got %s:\n%s\n' "$test_name" "$expected_status" "$status" "$output" >&2
        cat "$scenario_dir/stderr" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    auto_merge_call='pr merge https://example.test/pr/1 --auto --squash'
    state_view_call='pr view https://example.test/pr/1 --json mergeStateStatus --jq .mergeStateStatus'
    plain_merge_call='pr merge https://example.test/pr/1 --squash'

    if [[ "$expected_auto_merge" == "true" ]] && ! grep -Fxq "$auto_merge_call" "$scenario_dir/gh.log"; then
        printf 'expected %s to attempt auto merge, gh calls were:\n%s\n' "$test_name" "$(cat "$scenario_dir/gh.log")" >&2
        rm -rf "$scenario_dir"
        exit 1
    elif [[ "$expected_auto_merge" == "false" ]] && grep -Fxq "$auto_merge_call" "$scenario_dir/gh.log"; then
        printf 'expected %s not to attempt auto merge, gh calls were:\n%s\n' "$test_name" "$(cat "$scenario_dir/gh.log")" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    if [[ "$expected_state_view" == "true" ]] && ! grep -Fxq "$state_view_call" "$scenario_dir/gh.log"; then
        printf 'expected %s to read merge state, gh calls were:\n%s\n' "$test_name" "$(cat "$scenario_dir/gh.log")" >&2
        rm -rf "$scenario_dir"
        exit 1
    elif [[ "$expected_state_view" == "false" ]] && grep -Fxq "$state_view_call" "$scenario_dir/gh.log"; then
        printf 'expected %s not to read merge state, gh calls were:\n%s\n' "$test_name" "$(cat "$scenario_dir/gh.log")" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    if [[ "$expected_plain_merge" == "true" ]] && ! grep -Fxq "$plain_merge_call" "$scenario_dir/gh.log"; then
        printf 'expected %s to merge directly, gh calls were:\n%s\n' "$test_name" "$(cat "$scenario_dir/gh.log")" >&2
        rm -rf "$scenario_dir"
        exit 1
    elif [[ "$expected_plain_merge" == "false" ]] && grep -Fxq "$plain_merge_call" "$scenario_dir/gh.log"; then
        printf 'expected %s not to merge directly, gh calls were:\n%s\n' "$test_name" "$(cat "$scenario_dir/gh.log")" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    if [[ "$expected_error" == "true" ]] && ! grep -Fq 'GraphQL: original auto merge error' "$scenario_dir/stderr"; then
        printf 'expected %s to preserve the original error, stderr was:\n%s\n' "$test_name" "$(cat "$scenario_dir/stderr")" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    if [[ "$freeze_before_merge" == "true" && "$output" != *'disarming auto-merge'* ]]; then
        printf 'expected %s to explain that auto-merge was disarmed, got:\n%s\n' "$test_name" "$output" >&2
        rm -rf "$scenario_dir"
        exit 1
    fi

    rm -rf "$scenario_dir"
    printf '%s test passed\n' "$test_name"
}

run_auto_merge_test 'plan auto merge success' true success CLEAN 0 true false false false false
run_auto_merge_test 'plan clean auto merge fallback' true failure CLEAN 0 true true true false false
run_auto_merge_test 'plan non-clean auto merge failure' true failure DIRTY 1 true true false true false
run_auto_merge_test 'plan auto merge disabled' false success CLEAN 0 false false false false false
run_auto_merge_test 'plan freeze before auto merge' true success CLEAN 0 false false false false true
