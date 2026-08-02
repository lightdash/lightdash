#!/usr/bin/env bash
# Idempotent bring-up of the Lightdash AKS testbed with the Azure Container Apps
# **Sandboxes** backend (native suspend/resume). Re-runnable; reconciles drift.
# Exits with `READY: <url>` on success or `FAIL: <step> -- <reason>`.
#
# Sandbox groups + disk images are driven via the standalone `aca` CLI (the
# Sandboxes ADC data plane; `az rest` can't reach it), installed on demand. The
# app image MUST be this branch's code (Azure provider is unreleased) — deploy.sh
# builds it on ACR (BuildKit via `az acr run`).
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_config
require_tools
require_azure_identity
require_aca_cli

# ---------------------------------------------------------------------------
step "resource providers"
for p in Microsoft.App Microsoft.ContainerService Microsoft.ContainerRegistry \
         Microsoft.OperationalInsights Microsoft.ManagedIdentity Microsoft.Network; do
  azq provider register -n "$p" >/dev/null
done
ok "providers registering"

# ---------------------------------------------------------------------------
step "resource group + ACR"
azq group create -n "$RESOURCE_GROUP" -l "$LOCATION" >/dev/null
azq acr show -n "$ACR_NAME" >/dev/null 2>&1 \
  || azq acr create -g "$RESOURCE_GROUP" -n "$ACR_NAME" --sku Basic >/dev/null
ok "rg $RESOURCE_GROUP + acr $ACR_NAME"

# ---------------------------------------------------------------------------
step "AKS (OIDC issuer + workload identity + attach-acr)"
if az aks show -g "$RESOURCE_GROUP" -n "$AKS_NAME" >/dev/null 2>&1; then
  skip "aks $AKS_NAME exists"
else
  # --no-wait disallowed with --attach-acr; this blocks ~5-8 min.
  azq aks create -g "$RESOURCE_GROUP" -n "$AKS_NAME" --location "$LOCATION" \
    --node-count 2 --node-vm-size "${AKS_NODE_SIZE:-Standard_D4s_v3}" \
    --enable-oidc-issuer --enable-workload-identity \
    --attach-acr "$ACR_NAME" --generate-ssh-keys >/dev/null \
    || fail "aks-create -- check VM size availability (az aks create error lists allowed SKUs)"
fi
configure_kubectl
kubectl get nodes >/dev/null 2>&1 || fail "kubectl -- cannot reach AKS API"
OIDC="$(az aks show -g "$RESOURCE_GROUP" -n "$AKS_NAME" --query oidcIssuerProfile.issuerUrl -o tsv 2>/dev/null | tr -d '\r')"
[ -n "$OIDC" ] || fail "aks -- no OIDC issuer URL (is workload identity enabled?)"
ok "aks ready (oidc: $OIDC)"

# ---------------------------------------------------------------------------
step "user-assigned managed identity + federation + AcrPull"
azq identity show -g "$RESOURCE_GROUP" -n "$UAMI_NAME" >/dev/null 2>&1 \
  || azq identity create -g "$RESOURCE_GROUP" -n "$UAMI_NAME" -l "$LOCATION" >/dev/null
UAMI_CLIENT_ID="$(az identity show -g "$RESOURCE_GROUP" -n "$UAMI_NAME" --query clientId -o tsv | tr -d '\r')"
UAMI_PRINCIPAL="$(az identity show -g "$RESOURCE_GROUP" -n "$UAMI_NAME" --query principalId -o tsv | tr -d '\r')"
# Federate the k8s SA (lightdash:lightdash) to the UAMI so the backend's
# DefaultAzureCredential mints data-plane tokens as this identity.
az identity federated-credential show --identity-name "$UAMI_NAME" -g "$RESOURCE_GROUP" \
  --name lightdash-sa-federation >/dev/null 2>&1 \
  || azq identity federated-credential create --name lightdash-sa-federation \
       --identity-name "$UAMI_NAME" --resource-group "$RESOURCE_GROUP" \
       --issuer "$OIDC" --subject "system:serviceaccount:${K8S_NAMESPACE}:${SERVICE_ACCOUNT_NAME}" \
       --audience api://AzureADTokenExchange >/dev/null
ACR_ID="$(az acr show -n "$ACR_NAME" --query id -o tsv | tr -d '\r')"
azq role assignment create --assignee-object-id "$UAMI_PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role AcrPull --scope "$ACR_ID" >/dev/null 2>&1 || true
ok "uami $UAMI_NAME (client $UAMI_CLIENT_ID)"

# ---------------------------------------------------------------------------
step "sandbox images on ACR"
for feat in data-app; do
  repo="lightdash-sandbox"; tag="$feat"
  if az acr repository show-tags -n "$ACR_NAME" --repository "$repo" 2>/dev/null | grep -q "\"$tag\""; then
    skip "sandbox image $repo:$tag exists"
  else
    "$AKS_DEV_DIR/build-sandbox-image.sh" "$feat" >/dev/null || fail "sandbox-image -- build failed for $feat"
  fi
done
ok "sandbox image(s) ready"

# ---------------------------------------------------------------------------
# Sandboxes need NO managed environment (unlike dynamic sessions) — a sandbox
# group is a standalone ARM resource. One group + disk image per feature; the
# group's auto-suspend lifecycle policy (Memory mode) owns idle expiry.
step "sandbox group(s) + disk image(s) + SandboxGroup Data Owner role"
# A fresh, short-lived ACR AAD token (username is the zero-GUID). The disk-image
# pull is server-side; managed-identity pull is preview-flagged, so we pass
# registry credentials explicitly.
ACR_PULL_TOKEN="$(az acr login --name "$ACR_NAME" --expose-token --query accessToken -o tsv 2>/dev/null | tr -d '\r')"
[ -n "$ACR_PULL_TOKEN" ] || fail "acr-token -- could not mint an ACR pull token"
# Ensure MY user can drive the group data plane during provisioning (disk create).
ME_OID="$(az ad signed-in-user show --query id -o tsv 2>/dev/null | tr -d '\r')"

# Register the ACR image as a group disk image and echo its UUID (the id the
# backend references as sourcesRef.diskImage.id). Reuses a Ready disk if present.
create_group_disk() {  # $1=group  $2=acr-image  -> stdout: disk image UUID
  local group="$1" image="$2"
  aca sandboxgroup create -g "$RESOURCE_GROUP" --name "$group" \
    --location "$ACA_LOCATION" -s "$SUBSCRIPTION_ID" >/dev/null 2>&1 \
    || fail "sandbox-group -- '$group' create failed (aca CLI / preview access?)"
  # Grant the backend identity + the operator the Data Owner role on the group.
  local gid="${RG_SCOPE}/providers/Microsoft.App/sandboxGroups/${group}"
  for oid in "$UAMI_PRINCIPAL:ServicePrincipal" "${ME_OID}:User"; do
    azq role assignment create --assignee-object-id "${oid%%:*}" --assignee-principal-type "${oid##*:}" \
      --role "Container Apps SandboxGroup Data Owner" --scope "$gid" >/dev/null 2>&1 || true
  done
  sleep 20  # let the group's data-plane RBAC propagate before the disk PUT
  # Reuse an existing Ready disk image, else create one from the ACR image.
  local existing
  existing="$(aca sandboxgroup disk list --group "$group" --region "$ACA_LOCATION" -o json 2>/dev/null \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);v=d if isinstance(d,list) else d.get("value",[]);r=[x["id"] for x in v if ((x.get("status") or {}).get("state") or x.get("state"))=="Ready"];print(r[0] if r else "")' 2>/dev/null)"
  if [ -n "$existing" ]; then echo "$existing"; return 0; fi
  aca sandboxgroup disk create -g "$RESOURCE_GROUP" --group "$group" --image "$image" \
    --username "00000000-0000-0000-0000-000000000000" --token "$ACR_PULL_TOKEN" >/dev/null 2>&1 \
    || fail "disk -- create failed in '$group' (ACR auth / image exists?)"
  aca sandboxgroup disk list --group "$group" --region "$ACA_LOCATION" -o json 2>/dev/null \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);v=d if isinstance(d,list) else d.get("value",[]);r=[x["id"] for x in v if ((x.get("status") or {}).get("state") or x.get("state"))=="Ready"];print(r[0] if r else "")'
}
DATA_APP_DISK_IMAGE_ID="$(create_group_disk "$DATA_APP_SANDBOX_GROUP" "$SANDBOX_IMAGE_DATA_APP")"
[ -n "$DATA_APP_DISK_IMAGE_ID" ] || fail "disk -- no Ready data-app disk image id"
WRITEBACK_DISK_IMAGE_ID="${WRITEBACK_DISK_IMAGE_ID:-}"
ok "data-app sandbox group: $DATA_APP_SANDBOX_GROUP (disk id: $DATA_APP_DISK_IMAGE_ID)"

# ---------------------------------------------------------------------------
step "in-cluster MinIO (S3 for app file storage)"
kubectl get ns "$K8S_NAMESPACE" >/dev/null 2>&1 || kubectl create ns "$K8S_NAMESPACE"
kubectl get ns minio >/dev/null 2>&1 || kubectl create ns minio
# minio-creds is needed in BOTH namespaces with the SAME value: the `minio` ns
# (the MinIO server's root creds) and the `lightdash` ns (the app + migration job's
# S3 client). Generate once, mirror to both.
if ! kubectl -n minio get secret minio-creds >/dev/null 2>&1; then
  MINIO_SECRET="$(rand_hex)"
  for ns in minio "$K8S_NAMESPACE"; do
    kubectl -n "$ns" create secret generic minio-creds \
      --from-literal=accesskey="lightdash" --from-literal=secretkey="$MINIO_SECRET"
  done
  ok "secret/minio-creds created in minio + $K8S_NAMESPACE"
else
  # Ensure the lightdash-ns copy exists too (mirror the minio-ns value).
  kubectl -n "$K8S_NAMESPACE" get secret minio-creds >/dev/null 2>&1 || \
    kubectl -n minio get secret minio-creds -o json \
      | sed "s/\"namespace\": \"minio\"/\"namespace\": \"$K8S_NAMESPACE\"/" \
      | kubectl apply -f - >/dev/null
  skip "secret/minio-creds already exists"
fi
kubectl apply -f "$AKS_DEV_DIR/manifests/minio.yaml" >/dev/null
ok "minio deployed"

# ---------------------------------------------------------------------------
step "ingress-nginx + public host"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo update ingress-nginx >/dev/null 2>&1 || true
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.externalTrafficPolicy=Local --wait --timeout 8m >/dev/null
LB_IP=""
for _ in $(seq 1 30); do
  LB_IP="$(kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)"
  [ -n "$LB_IP" ] && break; sleep 10
done
[ -n "$LB_IP" ] || fail "lb -- ingress-nginx has no public IP yet (retry 'up')"
if [ "${SITE_HOST_MODE:-sslip}" = "custom" ]; then
  : "${SITE_HOST:?SITE_HOST required when SITE_HOST_MODE=custom}"
  echo "NOTE: point DNS A record  $SITE_HOST  ->  $LB_IP"
else
  SITE_HOST="lightdash.${LB_IP}.sslip.io"
fi
export SITE_HOST
ok "SITE_HOST=$SITE_HOST (LB $LB_IP)"

# ---------------------------------------------------------------------------
step "cert-manager + ClusterIssuer"
helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo update jetstack >/dev/null 2>&1 || true
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace --set crds.enabled=true --wait --timeout 8m >/dev/null
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@example.com}" \
  envsubst < "$AKS_DEV_DIR/manifests/cluster-issuer.yaml.tpl" | kubectl apply -f - >/dev/null
ok "cert-manager + issuer ready"

# ---------------------------------------------------------------------------
step "k8s secrets (postgres + app license/anthropic)"
ensure_secret "$K8S_NAMESPACE" lightdash-pg \
  --from-literal=password="$(rand_hex)" --from-literal=postgres-password="$(rand_hex)"
if kubectl -n "$K8S_NAMESPACE" get secret lightdash-app >/dev/null 2>&1; then
  skip "secret/lightdash-app exists"
else
  LICENSE="$(op item get "${EE_LICENSE_OP_ITEM}" --fields label=password --reveal 2>/dev/null || true)"
  [ -n "$LICENSE" ] || fail "ee-license -- could not read '${EE_LICENSE_OP_ITEM}' from 1Password (op signin?)"
  ANTHROPIC_KEY="$(op item get "${ANTHROPIC_OP_ITEM}" --fields label=credential --reveal 2>/dev/null || true)"
  [ -n "$ANTHROPIC_KEY" ] || ANTHROPIC_KEY="$(op item get "${ANTHROPIC_OP_ITEM}" --fields label=password --reveal 2>/dev/null || true)"
  [ -n "$ANTHROPIC_KEY" ] || fail "anthropic -- could not read '${ANTHROPIC_OP_ITEM}' from 1Password"
  kubectl -n "$K8S_NAMESPACE" create secret generic lightdash-app \
    --from-literal=LIGHTDASH_SECRET="$(rand_hex)" \
    --from-literal=LIGHTDASH_LICENSE_KEY="$LICENSE" \
    --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_KEY"
  ok "secret/lightdash-app created"
fi

# ---------------------------------------------------------------------------
step "render values + helm upgrade --install"
: "${IMAGE_REF:?IMAGE_REF not set — run 'aks-dev deploy' to build+set the branch image, or set IMAGE_REF/IMAGE_TAG in config.env}"
RENDERED="$(mktemp -t aks-dev-values.XXXXXX).yaml"
IMAGE_REF="$IMAGE_REF" IMAGE_TAG="${IMAGE_TAG:-latest}" SITE_HOST="$SITE_HOST" \
UAMI_CLIENT_ID="$UAMI_CLIENT_ID" \
SUBSCRIPTION_ID="$SUBSCRIPTION_ID" RESOURCE_GROUP="$RESOURCE_GROUP" ACA_LOCATION="$ACA_LOCATION" \
DATA_APP_SANDBOX_GROUP="$DATA_APP_SANDBOX_GROUP" WRITEBACK_SANDBOX_GROUP="${WRITEBACK_SANDBOX_GROUP:-}" \
DATA_APP_DISK_IMAGE_ID="$DATA_APP_DISK_IMAGE_ID" WRITEBACK_DISK_IMAGE_ID="${WRITEBACK_DISK_IMAGE_ID:-}" \
SANDBOX_RESOURCE_TIER="${SANDBOX_RESOURCE_TIER:-M}" SANDBOX_API_VERSION="${SANDBOX_API_VERSION:-2026-02-01-preview}" \
  envsubst < "$AKS_DEV_DIR/values.azure.yaml.tpl" > "$RENDERED"
helm dependency build "$HELM_CHART_PATH" >/dev/null 2>&1 || true
helm upgrade --install "$HELM_RELEASE" "$HELM_CHART_PATH" \
  --namespace "$K8S_NAMESPACE" -f "$RENDERED" --wait --timeout 15m
ok "helm release deployed"

# ---------------------------------------------------------------------------
step "verify health"
for _ in $(seq 1 20); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://${SITE_HOST}/api/v1/health" || true)"
  [ "$CODE" = "200" ] && break; sleep 15
done
echo "health HTTP ${CODE:-000} (TLS may take a few min on first issue)"
echo "READY: https://${SITE_HOST}"
echo "ACR: ${ACR_NAME}.azurecr.io  |  data-app sandbox group: ${DATA_APP_SANDBOX_GROUP}"
echo "Cluster + Sandboxes are UP and billing — run '/aks-dev down' when finished."
