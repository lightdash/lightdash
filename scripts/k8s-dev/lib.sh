#!/usr/bin/env bash
# Shared helpers for k8s-dev scripts. Source this; don't execute it.
# Contract (mirrors dev-fast-start.sh): emit STEP:/OK:/SKIP:/FAIL: markers; idempotent.

set -euo pipefail

K8S_DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$K8S_DEV_DIR/terraform"

step() { echo "STEP: $*"; }
ok()   { echo "OK: $*"; }
skip() { echo "SKIP: $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

load_config() {
  if [ -f "$K8S_DEV_DIR/config.env" ]; then
    # shellcheck disable=SC1091
    source "$K8S_DEV_DIR/config.env"
  else
    fail "config -- $K8S_DEV_DIR/config.env not found. Copy config.example.env to config.env and edit it."
  fi
  : "${AWS_REGION:?AWS_REGION not set}"
  : "${CLUSTER_NAME:?CLUSTER_NAME not set}"
  : "${HELM_CHART_PATH:?HELM_CHART_PATH not set}"
  : "${HELM_RELEASE:=lightdash}"
  : "${K8S_NAMESPACE:=lightdash}"
  # An exported but EMPTY AWS_PROFILE makes the CLI fail with "config profile () could not be
  # found". Only export when non-empty; otherwise unset so the default credential chain is used.
  if [ -n "${AWS_PROFILE:-}" ]; then export AWS_PROFILE; else unset AWS_PROFILE; fi
  export AWS_REGION
}

# Args passed to terraform so CLI config matches the chart/IRSA expectations.
tf_vars() {
  echo "-var=region=$AWS_REGION -var=cluster_name=$CLUSTER_NAME -var=namespace=$K8S_NAMESPACE -var=service_account_name=lightdash ${AWS_PROFILE:+-var=profile=$AWS_PROFILE}"
}

require_tools() {
  local missing=()
  for t in terraform kubectl helm aws; do
    command -v "$t" >/dev/null 2>&1 || missing+=("$t")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    fail "prereqs -- missing tools: ${missing[*]} (install: brew install ${missing[*]})"
  fi
}

# Bridge `aws login` / SSO credentials into standard AWS_* env vars. The Terraform AWS
# provider's SDK does NOT read the `aws login` cache (~/.aws/login) or SSO token cache the way
# the CLI does, so without this it falls back to EC2 IMDS and fails with "No valid credential
# sources found". `export-credentials` resolves whatever the CLI is using into env creds.
export_aws_creds() {
  local creds
  creds="$(aws configure export-credentials --format env 2>/dev/null)" || true
  [ -n "$creds" ] || fail "aws-creds -- could not export credentials. Run 'aws login' (or set AWS_PROFILE) and retry."
  eval "$creds"
}

require_aws_identity() {
  export_aws_creds
  aws sts get-caller-identity >/dev/null 2>&1 \
    || fail "aws-auth -- 'aws sts get-caller-identity' failed. Run 'aws login' (or your SSO login) and retry."
}

tf_output() {
  terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null
}

# Idempotent kubeconfig refresh for the cluster.
configure_kubectl() {
  aws eks update-kubeconfig --region "$AWS_REGION" --name "$CLUSTER_NAME" ${AWS_PROFILE:+--profile "$AWS_PROFILE"} >/dev/null
}

# Create a k8s secret only if it doesn't already exist (stable across upgrades).
ensure_secret() {
  local name="$1"; shift
  if kubectl -n "$K8S_NAMESPACE" get secret "$name" >/dev/null 2>&1; then
    skip "secret/$name already exists"
  else
    kubectl -n "$K8S_NAMESPACE" create secret generic "$name" "$@"
    ok "secret/$name created"
  fi
}

rand_hex() { openssl rand -hex 16; }
