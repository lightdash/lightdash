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

if [[ "\$*" == *'git/ref/heads/'* ]]; then
    exit 1
fi

if [[ "\$*" == *'git/refs'* ]]; then
    printf '{}\n'
    exit 0
fi

if [[ "\$*" == *graphql* ]]; then
    cat >/dev/null
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
