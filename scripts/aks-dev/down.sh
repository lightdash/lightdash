#!/usr/bin/env bash
# Tear everything down to stop spend. Deletes the sandbox groups, then the whole
# resource group (AKS, ACR, LB, public IP, identity).
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_config
require_azure_identity
API="2026-01-01"

step "delete sandbox group(s) (releases sandbox billing)"
for group in "$DATA_APP_SANDBOX_GROUP" "${WRITEBACK_SANDBOX_GROUP:-}"; do
  [ -n "$group" ] || continue
  arm delete "${RG_SCOPE}/providers/Microsoft.App/sandboxGroups/${group}?api-version=${API}" >/dev/null 2>&1 || true
done
ok "sandbox group deletion requested"

step "delete resource group $RESOURCE_GROUP (AKS, ACR, LB, IP, identity)"
azq group delete -n "$RESOURCE_GROUP" --yes --no-wait >/dev/null
ok "resource group deletion started (async)"
echo "DONE: teardown requested. Verify in the portal that $RESOURCE_GROUP is gone."
