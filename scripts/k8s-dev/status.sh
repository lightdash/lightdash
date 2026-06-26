#!/usr/bin/env bash
# Read-only status of the testbed. Safe to run anytime.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_config

echo "=== AWS identity ==="
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output table 2>/dev/null \
  || echo "NEED: aws auth (run your SSO login)"

echo "=== Terraform ==="
if terraform -chdir="$TF_DIR" output >/dev/null 2>&1; then
  echo "cluster:  $(tf_output cluster_name)"
  echo "s3:       $(tf_output s3_bucket)"
  echo "ecr:      $(tf_output ecr_repository_url)"
  echo "OK: infra provisioned"
else
  echo "NEED: terraform not applied yet (run '/k8s-dev up')"
  exit 0
fi

if ! configure_kubectl 2>/dev/null; then
  echo "NEED: cannot configure kubectl (cluster may be down)"
  exit 0
fi

echo "=== Helm release ==="
helm -n "$K8S_NAMESPACE" status "$HELM_RELEASE" 2>/dev/null | sed -n '1,6p' || echo "NEED: helm release not installed"

echo "=== Pods ==="
kubectl -n "$K8S_NAMESPACE" get pods 2>/dev/null || true

echo "=== Public URL ==="
HOST="$(kubectl -n "$K8S_NAMESPACE" get ingress -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null || true)"
if [ -n "$HOST" ]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://${HOST}/api/v1/health" || true)"
  echo "https://${HOST}  (health HTTP ${CODE:-000})"
  echo "Cluster is UP and billing — '/k8s-dev down' to stop spend."
else
  echo "no ingress host yet"
fi
