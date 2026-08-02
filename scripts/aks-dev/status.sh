#!/usr/bin/env bash
# Quick status of the AKS testbed + Azure sandbox resources.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_config
API="2026-01-01"

echo "== Azure =="
az aks show -g "$RESOURCE_GROUP" -n "$AKS_NAME" --query "{aks:name,state:provisioningState,k8s:currentKubernetesVersion}" -o tsv 2>/dev/null | tr -d '\r' || echo "aks: (none)"
echo "acr: ${ACR_NAME}.azurecr.io"
az rest --method get --url "${ARM}${RG_SCOPE}/providers/Microsoft.App/sandboxGroups/${DATA_APP_SANDBOX_GROUP}?api-version=${API}" \
  --query "{group:name,state:properties.provisioningState}" -o tsv 2>/dev/null | tr -d '\r' || echo "data-app sandbox group: (none)"

echo "== Kubernetes =="
configure_kubectl
kubectl -n "$K8S_NAMESPACE" get deploy,pods 2>/dev/null | head -20 || true
echo "-- ingress host --"
kubectl -n "$K8S_NAMESPACE" get ingress -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null; echo
echo "-- TLS cert --"
kubectl -n "$K8S_NAMESPACE" get certificate lightdash-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null; echo
