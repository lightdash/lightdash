#!/usr/bin/env bash
#
# Build the OCI image behind an Azure Container Apps **Sandboxes** disk image for
# the Lightdash sandbox provider (SANDBOX_PROVIDER=azure-sandboxes).
#
# Unlike the old dynamic-sessions image, Sandboxes exec/files are native — there
# is NO in-container agent to bake in. The image is just the feature's base
# toolchain image; up.sh registers it as a sandbox-group disk image
# (`aca sandboxgroup disk create --image ...`).
#
# Builds natively on ACR with `az acr build --platform linux/amd64` — Azure nodes
# are x86 and ACR Tasks build amd64 far faster than QEMU on an Apple-silicon Mac.
#
# Usage: ./build-sandbox-image.sh <data-app|writeback>
#   Requires: ACR_NAME (or config.env). Run after up.sh has created the registry.
set -euo pipefail
cd "$(dirname "$0")"
[ -f config.env ] && source config.env

FEATURE="${1:-}"
if [[ "$FEATURE" != "data-app" && "$FEATURE" != "writeback" ]]; then
    echo "usage: $0 <data-app|writeback>" >&2
    exit 1
fi
: "${ACR_NAME:?ACR_NAME not set (source config.env or export it)}"

REPO_ROOT="$(cd ../.. && pwd)"
if [[ "$FEATURE" == "data-app" ]]; then
    SRC_DIR="$REPO_ROOT/sandboxes/data-apps"
else
    SRC_DIR="$REPO_ROOT/sandboxes/ai-writeback"
fi
IMAGE_REPO="lightdash-sandbox"
IMAGE_TAG="${ACR_NAME}.azurecr.io/${IMAGE_REPO}:${FEATURE}"

log() { echo "[build-sandbox-image:${FEATURE}] $*"; }

log "building $IMAGE_TAG from $SRC_DIR/Dockerfile.local (amd64 on ACR; ~several min)"
az acr build --registry "$ACR_NAME" --platform linux/amd64 \
    --image "${IMAGE_REPO}:${FEATURE}" \
    --file "$SRC_DIR/Dockerfile.local" "$SRC_DIR" >/dev/null

echo
echo "============================================================"
echo "Sandbox image ready: $IMAGE_TAG"
echo "  register it as the ${FEATURE} disk image (up.sh reads SANDBOX_IMAGE_${FEATURE})"
echo "============================================================"
