#!/usr/bin/env bash
# Shared helpers for aks-dev scripts. Source this; don't execute it.
# Contract (mirrors k8s-dev / dev-fast-start.sh): emit STEP:/OK:/SKIP:/FAIL:; idempotent.
set -euo pipefail

AKS_DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step() { echo "STEP: $*"; }
ok()   { echo "OK: $*"; }
skip() { echo "SKIP: $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# az core commands work despite the Homebrew pyexpat breakage; only `az extension`
# (pip) crashes — so we drive Container Apps via `az rest` (no extension needed).
# Filter the noisy SyntaxWarnings the broken Homebrew bottle prints on every call.
azq() { az "$@" 2>&1 | grep -v -i "syntaxwarning\|escape sequence\|_models" || true; }

load_config() {
  if [ -f "$AKS_DEV_DIR/config.env" ]; then
    # shellcheck disable=SC1091
    source "$AKS_DEV_DIR/config.env"
  else
    fail "config -- $AKS_DEV_DIR/config.env not found. Copy config.example.env to config.env and edit it."
  fi
  : "${SUBSCRIPTION_ID:?SUBSCRIPTION_ID not set}"
  : "${LOCATION:?LOCATION not set}"
  : "${RESOURCE_GROUP:?RESOURCE_GROUP not set}"
  : "${ACR_NAME:?ACR_NAME not set}"
  : "${AKS_NAME:?AKS_NAME not set}"
  : "${HELM_CHART_PATH:?HELM_CHART_PATH not set}"
  : "${ACA_LOCATION:=$LOCATION}"
  : "${K8S_NAMESPACE:=lightdash}"
  : "${HELM_RELEASE:=lightdash}"
  export ARM="https://management.azure.com"
  export RG_SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"
}

require_tools() {
  local missing=()
  for t in az kubectl helm openssl envsubst; do
    command -v "$t" >/dev/null 2>&1 || missing+=("$t")
  done
  [ "${#missing[@]}" -eq 0 ] || fail "prereqs -- missing tools: ${missing[*]}"
}

require_azure_identity() {
  az account show >/dev/null 2>&1 || fail "az-auth -- run 'az login' and retry."
  az account set --subscription "$SUBSCRIPTION_ID" >/dev/null 2>&1 \
    || fail "az-auth -- cannot select subscription $SUBSCRIPTION_ID"
}

# The standalone `aca` CLI drives the Sandboxes ADC data plane (sandbox groups +
# disk images). It's independent of the broken `az` extension system. Installed
# on demand; uses the current `az login` credentials.
require_aca_cli() {
  command -v aca >/dev/null 2>&1 && return 0
  step "installing aca CLI"
  curl -fsSL https://aka.ms/aca-cli-install | sh >/dev/null 2>&1 \
    || fail "aca-cli -- install failed (see https://aka.ms/aca/sandboxes/dev)"
  command -v aca >/dev/null 2>&1 || fail "aca-cli -- not on PATH after install (restart shell?)"
}

# REST helpers for Container Apps (no extension). $1=method $2=relative-path $3=body(optional)
arm() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    az rest --method "$method" --url "${ARM}${path}" --body "$body" 2>&1 \
      | grep -v -i "syntaxwarning\|escape sequence\|_models" || true
  else
    az rest --method "$method" --url "${ARM}${path}" 2>&1 \
      | grep -v -i "syntaxwarning\|escape sequence\|_models" || true
  fi
}

configure_kubectl() {
  az aks get-credentials -g "$RESOURCE_GROUP" -n "$AKS_NAME" --overwrite-existing >/dev/null 2>&1
}

ensure_secret() {
  local ns="$1" name="$2"; shift 2
  if kubectl -n "$ns" get secret "$name" >/dev/null 2>&1; then
    skip "secret/$name already exists"
  else
    kubectl -n "$ns" create secret generic "$name" "$@"
    ok "secret/$name created"
  fi
}

rand_hex() { openssl rand -hex 16; }
