#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${1:-lightdash-agent-onboarding:local}"

awk '
    /^RUN lightdash install-skills/ && !done {
        print "RUN useradd -m -s /bin/bash user 2>/dev/null || true";
        done = 1;
    }
    { print }
    /^WORKDIR \/home\/user/ { print "ENV HOME=/home/user" }
' e2b.Dockerfile > Dockerfile.local

echo "Building $IMAGE from Dockerfile.local ..."
docker buildx build --load -t "$IMAGE" -f Dockerfile.local .
echo "Built $IMAGE"
