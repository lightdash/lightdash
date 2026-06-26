#!/usr/bin/env bash
#
# Build the AI-writeback sandbox as a plain local Docker image for the
# DockerSandboxProvider (SANDBOX_PROVIDER=docker). This is the same image E2B
# builds from e2b.Dockerfile, with one tweak: E2B's builder injects a `user`
# account (so /home/user exists and owns the installed skills), but a plain
# python base has none. We create it before `lightdash install-skills` and pin
# HOME so Claude Code discovers the baked skills at runtime regardless of the
# exec user.
#
# Usage: ./build-local-image.sh [image-tag]   (default: lightdash-ai-writeback:local)
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${1:-lightdash-ai-writeback:local}"

# Create the `user` account before the skills install (which writes into
# /home/user/.claude), and set HOME so runtime skill discovery resolves there.
awk '
    /^RUN lightdash install-skills/ && !done {
        print "RUN useradd -m -s /bin/bash user 2>/dev/null || true";
        done = 1;
    }
    { print }
    /^WORKDIR \/home\/user/ { print "ENV HOME=/home/user" }
' e2b.Dockerfile > Dockerfile.local

echo "Building $IMAGE from Dockerfile.local ..."
docker build -t "$IMAGE" -f Dockerfile.local .
echo "Built $IMAGE"
