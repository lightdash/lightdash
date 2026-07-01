#!/usr/bin/env bash
# "Code reload", production-style: build THIS branch's repo image on ACR (BuildKit
# via `az acr run`, native amd64) -> roll the deployment onto it. No hot reload.
# Required because the Azure sandbox provider is unreleased branch code, so the
# official lightdash/lightdash image can't be used.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_config
require_tools
require_azure_identity
configure_kubectl

REPO_ROOT="$(cd "$AKS_DEV_DIR/../.." && pwd)"
TAG="${1:-$(cd "$REPO_ROOT" && git rev-parse --short HEAD)}"
IMAGE_REF="${ACR_NAME}.azurecr.io/lightdash/lightdash"

# The root Dockerfile uses BuildKit cache mounts (`RUN --mount=type=cache`), so it
# needs DOCKER_BUILDKIT=1 — `az acr build` uses the classic builder, so we use a
# task (`az acr run`) that sets it. `az acr run -f` resolves the task file INSIDE
# the uploaded context, so it must live in the context dir.
step "build app image $IMAGE_REF:$TAG on ACR"
CTX="$(mktemp -d)"; trap 'rm -rf "$CTX"' EXIT
# Lean context. NOTE: bsdtar `--exclude='./scripts'` ALSO matches nested dirs like
# packages/backend/src/ee/repl/scripts (breaks the backend tsc build), so we exclude
# only node_modules/.git universally, then delete the heavy TOP-LEVEL dirs by explicit
# path (nested same-named dirs untouched).
tar cf - -C "$REPO_ROOT" \
  --exclude='./node_modules' --exclude='*/node_modules' --exclude='./.git' \
  --exclude='*.tsbuildinfo' . | tar xf - -C "$CTX"
( cd "$CTX" && rm -rf scripts venv .venv data examples sandboxes thoughts \
    agent-harness logs static .turbo packages/*/dist packages/*/build \
    packages/frontend/sdk/dist packages/sdk/dist 2>/dev/null || true )
# The full monorepo build (pnpm + 7 dbt venvs + frontend) exceeds ACR's default
# 600s step timeout — bump both the per-step and the overall run timeout to 1h.
cat > "$CTX/acr-app-task.yaml" <<YAML
version: v1.1.0
steps:
  - id: build-app
    build: -t {{.Run.Registry}}/lightdash/lightdash:${TAG} -f Dockerfile .
    timeout: 3600
    env: [ "DOCKER_BUILDKIT=1" ]
  - id: push-app
    timeout: 1800
    push: [ "{{.Run.Registry}}/lightdash/lightdash:${TAG}" ]
YAML
( cd "$CTX" && azq acr run --registry "$ACR_NAME" --timeout 3600 -f acr-app-task.yaml . ) \
  || fail "acr-build -- image build failed (see ACR run logs)"
ok "pushed $IMAGE_REF:$TAG"

step "helm upgrade onto new image"
helm upgrade "$HELM_RELEASE" "$HELM_CHART_PATH" --namespace "$K8S_NAMESPACE" \
  --reuse-values --set image.repository="$IMAGE_REF" --set image.tag="$TAG" \
  --wait --timeout 15m
kubectl -n "$K8S_NAMESPACE" rollout status deploy/"${HELM_RELEASE}" --timeout 5m 2>/dev/null \
  || kubectl -n "$K8S_NAMESPACE" rollout status deploy --timeout 5m
echo "READY: deployed image tag $TAG"
