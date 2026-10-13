#!/usr/bin/env bash
#
# Build the duckdb-runner sandbox as a plain local Docker image for the
# DockerSandboxProvider (SANDBOX_PROVIDER=docker). Same image E2B builds from
# e2b.Dockerfile, except E2B injects the `user` account and a plain
# node:24-slim base has none, so it is created first.
#
# Usage: ./build-local-image.sh [image-tag]   (default: lightdash-duckdb-runner:local)
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${1:-lightdash-duckdb-runner:local}"

bash ./pack-packages.sh

sed 's|^RUN chown -R user:user /work|RUN useradd -m -s /bin/bash user 2>/dev/null \|\| true \&\& chown -R user:user /work|' \
    e2b.Dockerfile > Dockerfile.local

echo "Building $IMAGE from Dockerfile.local ..."
docker build -t "$IMAGE" -f Dockerfile.local .
echo "Built $IMAGE"
