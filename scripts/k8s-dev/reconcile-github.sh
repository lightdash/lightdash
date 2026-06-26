#!/usr/bin/env bash
# Write a GitHub App installation straight into github_app_installations, bypassing the broken
# shared-dev-App proxy OAuth flow (see the GitHub section in .claude/commands/k8s-dev.md).
#
# Usage: ./scripts/k8s-dev/reconcile-github.sh <installation_id>
#   <installation_id> comes from the failed OAuth callback URL (?installation_id=...) or from
#   the GitHub App's "Install App" settings. The App must already be installed on your org/repo
#   and its creds must be in the lightdash-app secret (GITHUB_APP_ID / GITHUB_PRIVATE_KEY).
#
# Encrypts the id with the RUNNING LIGHTDASH_SECRET (read from the cluster secret) so the
# backend decrypts it; uses the real first user (not the seeded demo). Idempotent.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

INSTALLATION_ID="${1:?usage: reconcile-github.sh <installation_id>}"
load_config
require_tools
require_aws_identity
configure_kubectl

export RUNNING_SECRET="$(kubectl -n "$K8S_NAMESPACE" get secret lightdash-app -o jsonpath='{.data.LIGHTDASH_SECRET}' | base64 -d)"
export PGPASSWORD="$(kubectl -n "$K8S_NAMESPACE" get secret lightdash-pg -o jsonpath='{.data.password}' | base64 -d)"
export PGUSER=lightdash PGDATABASE=lightdash PGHOST=localhost PGPORT=5433 INSTALLATION_ID
export NODE_PATH="$(cd "$K8S_DEV_DIR/../.." && pwd)/packages/backend/node_modules"   # for `pg`

step "port-forward postgres :5433"
kubectl -n "$K8S_NAMESPACE" port-forward svc/lightdash-postgresql 5433:5432 >/tmp/k8s-dev-pf.log 2>&1 &
PF=$!
trap 'kill $PF 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do nc -z localhost 5433 2>/dev/null && break; sleep 0.5; done
nc -z localhost 5433 2>/dev/null || fail "pg -- port-forward to lightdash-postgresql never came up ($(cat /tmp/k8s-dev-pf.log))"

step "reconcile github_app_installations (installation $INSTALLATION_ID)"
node "$K8S_DEV_DIR/reconcile-github.cjs"
ok "github installation reconciled — writeback can now mint installation tokens"
