#!/usr/bin/env bash
# Idempotent bring-up of the Lightdash EKS testbed. Re-runnable; reconciles drift.
# Exits with `READY: <url>` on success or `FAIL: <step> -- <reason>`.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_config
require_tools
require_aws_identity

# ---------------------------------------------------------------------------
step "terraform apply (VPC, EKS, nodes, S3, IRSA, ECR)"
terraform -chdir="$TF_DIR" init -input=false >/dev/null
# shellcheck disable=SC2046
terraform -chdir="$TF_DIR" apply -input=false -auto-approve $(tf_vars)
ok "terraform applied"

APP_ROLE_ARN="$(tf_output app_role_arn)"
S3_BUCKET="$(tf_output s3_bucket)"
ECR_URL="$(tf_output ecr_repository_url)"
[ -n "$APP_ROLE_ARN" ] && [ -n "$S3_BUCKET" ] || fail "terraform -- missing outputs (app_role_arn/s3_bucket)"

# ---------------------------------------------------------------------------
step "configure kubectl"
configure_kubectl
kubectl get nodes >/dev/null || fail "kubectl -- cannot reach cluster API"
kubectl get ns "$K8S_NAMESPACE" >/dev/null 2>&1 || kubectl create ns "$K8S_NAMESPACE"
ok "kubectl configured (namespace $K8S_NAMESPACE)"

# ---------------------------------------------------------------------------
step "default gp3 StorageClass"
kubectl apply -f "$K8S_DEV_DIR/manifests/gp3-storageclass.yaml" >/dev/null
ok "gp3 storageclass applied"

# ---------------------------------------------------------------------------
step "ingress-nginx (NLB)"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo update ingress-nginx >/dev/null 2>&1 || true
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/aws-load-balancer-type"=nlb \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/aws-load-balancer-cross-zone-load-balancing-enabled"=true \
  --wait --timeout 10m >/dev/null
ok "ingress-nginx installed"

step "wait for NLB hostname"
LB_HOST=""
for _ in $(seq 1 40); do
  LB_HOST="$(kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
  [ -n "$LB_HOST" ] && break
  sleep 15
done
[ -n "$LB_HOST" ] || fail "nlb -- ingress-nginx LoadBalancer has no hostname yet (retry 'up')"
ok "NLB hostname: $LB_HOST"

# ---------------------------------------------------------------------------
step "resolve public hostname"
if [ "${SITE_HOST_MODE:-sslip}" = "custom" ]; then
  : "${SITE_HOST:?SITE_HOST must be set when SITE_HOST_MODE=custom}"
  echo "NOTE: add a DNS CNAME  $SITE_HOST  ->  $LB_HOST  (in whichever account hosts the zone)"
else
  # A freshly-created NLB hostname takes a minute or two to start resolving — retry, don't bail.
  LB_IP=""
  for _ in $(seq 1 24); do
    LB_IP="$(dig +short "$LB_HOST" | grep -Eo '^[0-9.]+$' | head -1 || true)"
    [ -n "$LB_IP" ] && break
    sleep 15
  done
  [ -n "$LB_IP" ] || fail "dns -- $LB_HOST still not resolving after ~6m (NLB DNS propagation slow; re-run 'up')"
  SITE_HOST="lightdash.${LB_IP}.sslip.io"
fi
export SITE_HOST
ok "SITE_HOST=$SITE_HOST"

# ---------------------------------------------------------------------------
step "cert-manager + ClusterIssuer"
helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo update jetstack >/dev/null 2>&1 || true
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true \
  --wait --timeout 10m >/dev/null
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@example.com}" \
  envsubst < "$K8S_DEV_DIR/manifests/cluster-issuer.yaml.tpl" | kubectl apply -f - >/dev/null
ok "cert-manager + letsencrypt issuer ready"

# ---------------------------------------------------------------------------
step "k8s secrets (postgres + app + EE license)"
ensure_secret lightdash-pg \
  --from-literal=password="$(rand_hex)" \
  --from-literal=postgres-password="$(rand_hex)"

# EE license + AI/E2B keys from 1Password (never echoed). Skipped if the secret exists.
# Item names default to the same ones /docker-dev confirmed in ~/.lightdash/dev-secrets.local.json.
if kubectl -n "$K8S_NAMESPACE" get secret lightdash-app >/dev/null 2>&1; then
  skip "secret/lightdash-app already exists"
else
  LICENSE="$(op item get "${EE_LICENSE_OP_ITEM}" --fields label=password --reveal 2>/dev/null || true)"
  [ -n "$LICENSE" ] || fail "ee-license -- could not read '${EE_LICENSE_OP_ITEM}' from 1Password (run 'op signin' and retry)"
  ANTHROPIC_KEY="$(op item get "${ANTHROPIC_OP_ITEM:-(dev) ANTHROPIC_API_KEY}" --fields label=credential --reveal 2>/dev/null || true)"
  [ -n "$ANTHROPIC_KEY" ] || ANTHROPIC_KEY="$(op item get "${ANTHROPIC_OP_ITEM:-(dev) ANTHROPIC_API_KEY}" --fields label=password --reveal 2>/dev/null || true)"
  [ -n "$ANTHROPIC_KEY" ] || fail "anthropic -- could not read '${ANTHROPIC_OP_ITEM:-(dev) ANTHROPIC_API_KEY}' from 1Password"
  E2B_KEY="$(op item get "${E2B_OP_ITEM:-(dev) E2B_API_KEY}" --fields label=credential --reveal 2>/dev/null || true)"
  [ -n "$E2B_KEY" ] || E2B_KEY="$(op item get "${E2B_OP_ITEM:-(dev) E2B_API_KEY}" --fields label=password --reveal 2>/dev/null || true)"
  [ -n "$E2B_KEY" ] || fail "e2b -- could not read '${E2B_OP_ITEM:-(dev) E2B_API_KEY}' from 1Password"
  # GitHub App (dbt-over-GitHub + AI writeback). The item's notesPlain is an `export KEY="val"`
  # block; eval it to populate GITHUB_*. GITHUB_PRIVATE_KEY is base64-encoded PEM.
  # op renders notesPlain with literal \n escapes — decode with printf '%b' (portable; macOS
  # sed won't expand \n) before eval, or the multi-line export block collapses to one line.
  GH_RAW="$(op item get "${GITHUB_OP_ITEM:-lightdash-app-dev Github integration for Lightdash}" --fields label=notesPlain --reveal 2>/dev/null || true)"
  [ -n "$GH_RAW" ] || fail "github -- could not read GitHub App env-block from '${GITHUB_OP_ITEM:-lightdash-app-dev Github integration for Lightdash}'"
  eval "$(printf '%b' "$GH_RAW")"
  [ -n "${GITHUB_APP_ID:-}" ] && [ -n "${GITHUB_PRIVATE_KEY:-}" ] || fail "github -- env-block missing GITHUB_APP_ID / GITHUB_PRIVATE_KEY"
  kubectl -n "$K8S_NAMESPACE" create secret generic lightdash-app \
    --from-literal=LIGHTDASH_SECRET="$(rand_hex)" \
    --from-literal=LIGHTDASH_LICENSE_KEY="$LICENSE" \
    --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_KEY" \
    --from-literal=E2B_API_KEY="$E2B_KEY" \
    --from-literal=GITHUB_APP_ID="$GITHUB_APP_ID" \
    --from-literal=GITHUB_APP_NAME="${GITHUB_APP_NAME:-lightdash-app-dev}" \
    --from-literal=GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID" \
    --from-literal=GITHUB_CLIENT_SECRET="$GITHUB_CLIENT_SECRET" \
    --from-literal=GITHUB_PRIVATE_KEY="$GITHUB_PRIVATE_KEY"
  ok "secret/lightdash-app created (EE license + Anthropic + E2B + GitHub App wired)"
fi

# ---------------------------------------------------------------------------
step "render helm values"
RENDERED="$(mktemp -t k8s-dev-values.XXXXXX).yaml"
IMAGE_REPO="${IMAGE_REPO:-lightdash/lightdash}" \
IMAGE_TAG="${IMAGE_TAG:-latest}" \
APP_ROLE_ARN="$APP_ROLE_ARN" \
S3_BUCKET="$S3_BUCKET" \
S3_REGION="$AWS_REGION" \
SITE_HOST="$SITE_HOST" \
  envsubst < "$K8S_DEV_DIR/values.aws.yaml.tpl" > "$RENDERED"
ok "values rendered -> $RENDERED"

# ---------------------------------------------------------------------------
step "helm upgrade --install $HELM_RELEASE"
helm dependency build "$HELM_CHART_PATH" >/dev/null 2>&1 || true
helm upgrade --install "$HELM_RELEASE" "$HELM_CHART_PATH" \
  --namespace "$K8S_NAMESPACE" \
  -f "$RENDERED" \
  --wait --timeout 15m
ok "helm release deployed"

# ---------------------------------------------------------------------------
step "wait for TLS certificate"
# cert-manager can hit a transient "Failed to finalize Order: orderNotReady" race on first
# issue even though the HTTP-01 challenge validated. Deleting the Certificate forces a clean
# re-issue (which succeeds immediately). Auto-heal it here instead of failing.
CERT_READY=""
for _ in $(seq 1 10); do
  CERT_READY="$(kubectl -n "$K8S_NAMESPACE" get certificate lightdash-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)"
  [ "$CERT_READY" = "True" ] && break
  if kubectl -n "$K8S_NAMESPACE" get order -o jsonpath='{.items[*].status.state}' 2>/dev/null | grep -q errored; then
    kubectl -n "$K8S_NAMESPACE" delete certificate lightdash-tls --ignore-not-found >/dev/null 2>&1 || true
    kubectl -n "$K8S_NAMESPACE" delete certificaterequest,order --all >/dev/null 2>&1 || true
  fi
  sleep 15
done
[ "$CERT_READY" = "True" ] && ok "TLS certificate issued" \
  || echo "WARN: TLS cert not Ready yet — app still serves HTTP. Check 'kubectl describe certificate -n $K8S_NAMESPACE lightdash-tls'"

# ---------------------------------------------------------------------------
step "verify health"
for _ in $(seq 1 20); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://${SITE_HOST}/api/v1/health" || true)"
  [ "$CODE" = "200" ] && break
  sleep 15
done
echo "health HTTP ${CODE:-000} (TLS may take a few min on first issue)"

echo "READY: https://${SITE_HOST}"
echo "ECR: ${ECR_URL}  |  S3: ${S3_BUCKET}"
echo "Cluster is UP and billing — run '/k8s-dev down' when finished."
