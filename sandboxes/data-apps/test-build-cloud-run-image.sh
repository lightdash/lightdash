#!/usr/bin/env bash
# Exercise image assembly without Docker or registry access.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
export TEST_DIR
mkdir -p "$TEST_DIR/bin" "$TEST_DIR/checkout with spaces" "$TEST_DIR/tmp"
cp "$SCRIPT_DIR/"{build-cloud-run-image.sh,pack-query-sdk.sh,e2b.Dockerfile} "$TEST_DIR/checkout with spaces/"
cp -R "$SCRIPT_DIR/template" "$TEST_DIR/checkout with spaces/"
export TMPDIR="$TEST_DIR/tmp"
export PATH="$TEST_DIR/bin:$PATH"

cat > "$TEST_DIR/bin/pnpm" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [ "$3" = build ]; then
    exit "${BUILD_EXIT_CODE:-0}"
fi
[ "$3" = pack ]
printf 'fresh sdk' > "$5/lightdash-query-sdk-1.0.0.tgz"
MOCK
cat > "$TEST_DIR/bin/npm" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[ "$1" = pack ]
[ "$2" = @computesdk/cloud-run@0.1.8 ]
[ "$3" = --ignore-scripts ]
mkdir -p "$TEST_DIR/gateway/package/dist"
printf 'gateway' > "$TEST_DIR/gateway/package/dist/gateway.mjs"
tar -czf "$5/computesdk-cloud-run-0.1.8.tgz" -C "$TEST_DIR/gateway" package/dist/gateway.mjs
MOCK
cat > "$TEST_DIR/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[ "$1 $2 $3 $4 $5 $6 $7" = 'buildx build --platform linux/amd64 -t test:image --load' ]
STAGE="$8"
[ "$(cat "$STAGE/lightdash-query-sdk.tgz")" = 'fresh sdk' ]
[ "$(cat "$STAGE/gateway.mjs")" = gateway ]
[ -f "$STAGE/template/.npmrc" ]
[ -d "$STAGE/template/.claude" ]
rg -q '^RUN useradd .* && chown -R user:user /app$' "$STAGE/Dockerfile"
rg -q '^CMD \["node", "/gateway/gateway.mjs"\]$' "$STAGE/Dockerfile"
touch "$TEST_DIR/docker-called"
MOCK
chmod +x "$TEST_DIR/bin/"*

# No pre-existing SDK archive; also exercise paths with spaces and cleanup.
bash "$TEST_DIR/checkout with spaces/build-cloud-run-image.sh" test:image --load
[ -f "$TEST_DIR/docker-called" ]
[ -z "$(ls -A "$TMPDIR")" ]
rm "$TEST_DIR/docker-called"

# A failed SDK build must stop before Docker, even with an old archive present.
printf stale > "$TEST_DIR/checkout with spaces/lightdash-query-sdk.tgz"
if BUILD_EXIT_CODE=42 bash "$TEST_DIR/checkout with spaces/build-cloud-run-image.sh" test:image --load; then
    echo 'Expected SDK build failure' >&2
    exit 1
fi
[ ! -f "$TEST_DIR/docker-called" ]
[ -z "$(ls -A "$TMPDIR")" ]

# Repacking replaces an old archive rather than reusing it.
bash "$TEST_DIR/checkout with spaces/pack-query-sdk.sh"
[ "$(cat "$TEST_DIR/checkout with spaces/lightdash-query-sdk.tgz")" = 'fresh sdk' ]
[ -z "$(ls -A "$TMPDIR")" ]
echo 'Cloud Run image assembly tests passed'
