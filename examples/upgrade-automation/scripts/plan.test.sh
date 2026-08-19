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

exit 0
EOF

cat >"$test_dir/runner-temp/lightdash-upgrade-cli/node_modules/.bin/lightdash" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

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

if [[ "\$*" == *'git/ref/heads/lightdash-upgrade-'* ]]; then
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

cd "$test_dir"

set +e
output=$(PATH="$test_dir/bin:$PATH" \
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

printf 'plan unknown-verdict hold test passed\n'
