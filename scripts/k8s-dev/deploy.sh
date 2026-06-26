#!/usr/bin/env bash
# "Code reload", production-style: build this repo's image -> push to ECR -> roll the
# deployment onto the new tag. NOT hot reload — a fresh immutable image each time.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_config
require_tools
require_aws_identity
configure_kubectl

REPO_ROOT="$(cd "$K8S_DEV_DIR/../.." && pwd)"
ECR_URL="$(tf_output ecr_repository_url)"
[ -n "$ECR_URL" ] || fail "ecr -- no ECR repo output; run '/k8s-dev up' first"
REGISTRY="${ECR_URL%/*}"
TAG="$(cd "$REPO_ROOT" && git rev-parse --short HEAD)"

step "ecr login"
aws ecr get-login-password --region "$AWS_REGION" ${AWS_PROFILE:+--profile "$AWS_PROFILE"} \
  | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
ok "logged in to $REGISTRY"

step "build image ($TAG) for linux/amd64"
# Nodes are x86_64; build amd64 explicitly so it runs regardless of laptop arch.
docker buildx build --platform linux/amd64 -t "${ECR_URL}:${TAG}" -f "$REPO_ROOT/Dockerfile" "$REPO_ROOT" --push
ok "pushed ${ECR_URL}:${TAG}"

step "helm upgrade onto new image"
helm upgrade "$HELM_RELEASE" "$HELM_CHART_PATH" \
  --namespace "$K8S_NAMESPACE" \
  --reuse-values \
  --set image.repository="$ECR_URL" \
  --set image.tag="$TAG" \
  --wait --timeout 15m
ok "rolled out ${ECR_URL}:${TAG}"

kubectl -n "$K8S_NAMESPACE" rollout status deploy/"${HELM_RELEASE}-backend" --timeout 5m
echo "READY: deployed image tag $TAG"
