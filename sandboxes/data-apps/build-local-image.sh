#!/usr/bin/env bash
#
# Build the data-app sandbox as a plain local Docker image for the
# DockerSandboxProvider (SANDBOX_PROVIDER=docker). This is the same image E2B
# builds from e2b.Dockerfile, with one tweak: E2B's builder injects a `user`
# account, but a plain `node:22` base has none — so the final `chown user:user`
# would fail. We create the user first.
#
# Usage: ./build-local-image.sh [image-tag]   (default: lightdash-sandbox:local)
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${1:-lightdash-sandbox:local}"

if [ ! -f lightdash-query-sdk.tgz ]; then
    echo "lightdash-query-sdk.tgz missing — run build-sandbox.ts first or pack the SDK." >&2
    exit 1
fi

# Derive a local Dockerfile that creates the `user` account before the chown.
sed 's|^RUN chown -R user:user /app|RUN useradd -m -s /bin/bash user 2>/dev/null \|\| true \&\& chown -R user:user /app|' \
    e2b.Dockerfile > Dockerfile.local

echo "Building $IMAGE from Dockerfile.local ..."
docker build -t "$IMAGE" -f Dockerfile.local .
echo "Built $IMAGE"
