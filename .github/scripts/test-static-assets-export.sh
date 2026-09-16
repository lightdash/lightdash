#!/usr/bin/env bash
set -euo pipefail

fixture=$(mktemp -d)
image="lightdash-assets-export-test:$(date +%s)-$$"
cleanup() {
    docker image rm "$image" >/dev/null 2>&1 || true
    rm -rf "$fixture"
}
trap cleanup EXIT
mkdir -p "$fixture/source/assets/nested"
printf '%s' 'export default 1; //# debugId=fixture-sentry-id' > "$fixture/source/assets/chunk.js"
printf '%s' 'body { color: red; }' > "$fixture/source/assets/nested/style.css"
printf '%s' 'backend must not be exported' > "$fixture/source/backend.js"
cat > "$fixture/source/Dockerfile" <<'DOCKERFILE'
FROM scratch
COPY assets /usr/app/packages/frontend/build/assets
COPY backend.js /usr/app/packages/backend/backend.js
DOCKERFILE

docker build --tag "$image" "$fixture/source"
docker build --file docker/static-assets.Dockerfile \
    --build-arg "RELEASE_IMAGE=$image" \
    --output "type=local,dest=$fixture/export" ./docker

cmp "$fixture/source/assets/chunk.js" "$fixture/export/assets/chunk.js"
cmp "$fixture/source/assets/nested/style.css" "$fixture/export/assets/nested/style.css"
test "$(find "$fixture/export" -type f | wc -l | tr -d ' ')" = 2
test ! -e "$fixture/export/usr"
echo 'Export contains only assets, with identical bytes including the Sentry marker.'
