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
