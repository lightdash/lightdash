#!/usr/bin/env bash
# Build the python-runner Cloud Run sandbox gateway image: e2b.Dockerfile plus
# a node runtime and the ComputeSDK gateway, so one Cloud Run service (deployed
# with --sandbox-launcher) hosts python query sandboxes.
# Usage: ./build-cloud-run-image.sh <image-tag> [docker buildx build options...]
set -euo pipefail

if [ "$#" -eq 0 ]; then
    echo "Usage: $0 <image-tag> [docker buildx build options...]" >&2
    exit 1
fi
IMAGE="$1"
shift
cd "$(dirname "$0")"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

GATEWAY_PKG=@computesdk/cloud-run@0.1.8
GATEWAY_TGZ="$STAGE/computesdk-cloud-run-0.1.8.tgz"
# Pinned sha512 of the registry tarball (npm view <pkg> dist.integrity).
GATEWAY_INTEGRITY="sha512-yDeHr0n1CD7HpHwwxCtLPENqJQ/P0YoqbYlAQ7ouCGzhrsH0wrOP26T9FjiDA3nh0RdwHkAI+HzZ1gt1ahu4zg=="
npm pack "$GATEWAY_PKG" --ignore-scripts --pack-destination "$STAGE" >/dev/null
ACTUAL="sha512-$(openssl dgst -sha512 -binary "$GATEWAY_TGZ" | openssl base64 -A)"
if [ "$ACTUAL" != "$GATEWAY_INTEGRITY" ]; then
    echo "Integrity mismatch for $GATEWAY_PKG: $ACTUAL" >&2
    exit 1
fi
tar -xzf "$GATEWAY_TGZ" \
    -C "$STAGE" package/dist/gateway.mjs
mv "$STAGE/package/dist/gateway.mjs" "$STAGE/gateway.mjs"

# The gateway runs as root and Cloud Run projects its filesystem into the
# sandbox with a writable overlay, so /work stays root-owned (as on data-apps).
sed -e 's|^RUN chown -R user:user /work|RUN useradd -m -s /bin/bash user|' \
    -e '/^USER user$/d' \
    e2b.Dockerfile > "$STAGE/Dockerfile"
cat >> "$STAGE/Dockerfile" <<'DOCKERFILE'

COPY --from=node:24-slim /usr/local/bin/node /usr/local/bin/node
COPY gateway.mjs /gateway/gateway.mjs
ENV NODE_ENV=production
CMD ["node", "/gateway/gateway.mjs"]
DOCKERFILE

docker buildx build --platform linux/amd64 -t "$IMAGE" "$@" "$STAGE"
