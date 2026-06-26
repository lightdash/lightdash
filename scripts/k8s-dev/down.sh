#!/usr/bin/env bash
# Tear everything down to stop all spend: helm uninstall -> terraform destroy.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_config
require_tools
require_aws_identity

# Best-effort: uninstall in-cluster releases first so LBs/PVCs are released before destroy.
if configure_kubectl 2>/dev/null && kubectl get nodes >/dev/null 2>&1; then
  step "uninstall helm releases"
  helm -n "$K8S_NAMESPACE" uninstall "$HELM_RELEASE" 2>/dev/null || skip "$HELM_RELEASE not installed"
  # Drop the ingress-nginx Service (NLB) so terraform doesn't trip on a dangling ELB.
  helm -n ingress-nginx uninstall ingress-nginx 2>/dev/null || skip "ingress-nginx not installed"
  # Release postgres PVC so the EBS volume is deleted with the cluster.
  kubectl -n "$K8S_NAMESPACE" delete pvc --all 2>/dev/null || true
  ok "in-cluster resources removed"
  sleep 20  # let the cloud-controller delete the NLB before destroy
else
  skip "cluster unreachable — going straight to terraform destroy"
fi

step "terraform destroy"
terraform -chdir="$TF_DIR" init -input=false >/dev/null
# shellcheck disable=SC2046
terraform -chdir="$TF_DIR" destroy -input=false -auto-approve $(tf_vars)
ok "terraform destroyed"
echo "DOWN: all k8s-dev resources removed. Verify no orphan ELB/EBS in the AWS console."
