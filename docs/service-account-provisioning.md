# Automating service account provisioning

For integrations provisioning many Lightdash instances: use the setup admin token
to create one scoped account per integration, then give the integration only its
own token. See [service accounts](./service-accounts.md) for the permission model.

## Bootstrap and inputs

Requires a running, licensed instance with service accounts enabled, `curl`, `jq`,
and Bash. Inject `LIGHTDASH_URL`, `LD_SETUP_SERVICE_ACCOUNT_TOKEN`, `PROJECT_UUID`,
and a future ISO timestamp in `EXPIRES_AT` from your deployment job.

After initialization, remove the one-time `LD_SETUP_*` settings, including
`LD_SETUP_SERVICE_ACCOUNT_TOKEN`, from the **instance's** configuration; retain
the token in the provisioning job's secret store. Startup
setup recreates the bootstrap account and also deletes matching accounts, including
custom organization-role accounts with empty scopes. Do not leave that setup
reconciliation enabled when managing these accounts through the API.

## Create, persist, and use

This create-only template provisions a Viewer on one project. Serialize jobs per
instance/integration and restore saved credentials before deciding whether to create.
Reuse the credential on later deployments. The exclusive file guard protects only
runs sharing the same file; it does not coordinate separate CI runners.

```bash
set -euo pipefail
umask 077
: "${LIGHTDASH_URL:?Set the instance base URL}"
: "${LD_SETUP_SERVICE_ACCOUNT_TOKEN:?Inject the admin token}"
: "${PROJECT_UUID:?Set the target project UUID}"
: "${EXPIRES_AT:?Set a future ISO timestamp}"
CREDENTIALS_FILE="${CREDENTIALS_FILE:-./lightdash-service-account.json}"

admin_api() {
  local path="$1"; shift
  curl --fail-with-body --silent --show-error \
    -H "Authorization: Bearer $LD_SETUP_SERVICE_ACCOUNT_TOKEN" \
    -H 'Content-Type: application/json' \
    "${LIGHTDASH_URL%/}/api/v1/$path" "$@"
}

if ! (set -o noclobber; : > "$CREDENTIALS_FILE") 2>/dev/null; then
  echo 'Credential file exists; reuse it instead of creating another account.' >&2
  exit 1
fi

jq -n --arg project "$PROJECT_UUID" --arg expiry "$EXPIRES_AT" \
  '{description: "reporting-bot", expiresAt: $expiry,
    scopes: ["system:member"],
    projectAccess: [{projectUuid: $project, role: "viewer"}]}' |
  admin_api service-accounts -X POST --data-binary @- --output "$CREDENTIALS_FILE"
jq -e '.results | (.uuid | type == "string") and (.token | type == "string")' \
  "$CREDENTIALS_FILE" >/dev/null

SERVICE_ACCOUNT_UUID="$(jq -er '.results.uuid' "$CREDENTIALS_FILE")"
SERVICE_ACCOUNT_TOKEN="$(jq -er '.results.token' "$CREDENTIALS_FILE")"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_TOKEN" \
  "${LIGHTDASH_URL%/}/api/v1/projects/$PROJECT_UUID" | jq '{status}'
```

Import the response into your secret store before an ephemeral runner exits.
Persist **both** `results.uuid` and `results.token`; only creation and rotation
return a token. Never log the credential file or run these commands with `set -x`.

Creation is not an upsert: descriptions are not unique and there is no idempotency
key. Do not automatically retry a timed-out POST. Preserve the response/error file
and inspect the account list before deciding whether to revoke and recreate it.

Other permission shapes use the same POST:

- **Organization-wide:** use `scopes: ["system:viewer"]` and omit `projectAccess`.
- **Custom organization role:** use `roleUuid` instead of `scopes`, without project grants.
- **Custom project role:** replace a grant's `role` with `roleUuid`.

Roles must belong to the same organization. Managing accounts requires
`manage:Organization`; delegated grants cannot exceed the caller's organization
permissions. An ordinary scoped integration token cannot provision more accounts.

## Inspect and update

These templates reuse `admin_api` and the variables above. On another runner, load
the saved UUID and token from your secret store first.

```bash
admin_api service-accounts | jq '.results[] | {uuid, description, projectAccessCount}'
admin_api "service-accounts/$SERVICE_ACCOUNT_UUID/projects"

jq -n --arg project "$PROJECT_UUID" \
  '{description: "reporting-bot", projectAccess: [
    {projectUuid: $project, role: "interactive_viewer"}]}' |
  admin_api "service-accounts/$SERVICE_ACCOUNT_UUID" -X PATCH --data-binary @-
```

PATCH requires `description`; project grants replace the entire set and must
include at least one project. Switching to an organization role removes project
grants. The token is unchanged: do not replace the stored credential with the
token-free PATCH or list response.

## Rotate or revoke

Only expiring accounts can rotate, at most once per hour. Rotation invalidates the
old token immediately; coordinate the consumer update. For overlapping credentials,
create a replacement account and revoke the old one after switching consumers.

```bash
: "${NEW_EXPIRES_AT:?Set a future ISO expiry for the replacement token}"
jq -n --arg expiry "$NEW_EXPIRES_AT" '{expiresAt: $expiry}' |
  admin_api "service-accounts/$SERVICE_ACCOUNT_UUID/rotate" -X PATCH \
    --data-binary @- --output "${CREDENTIALS_FILE}.next"
jq -e '.results.token | type == "string"' "${CREDENTIALS_FILE}.next" >/dev/null
mv "${CREDENTIALS_FILE}.next" "$CREDENTIALS_FILE"
SERVICE_ACCOUNT_TOKEN="$(jq -er '.results.token' "$CREDENTIALS_FILE")"
```

Persist and distribute the replacement token through the secret store. To revoke:

```bash
admin_api "service-accounts/$SERVICE_ACCOUNT_UUID" -X DELETE
```

Deletion returns HTTP 200 with `{"status":"ok"}`; the revoked token returns 401.
A second deletion returns 404. Authentication failures return 401; insufficient
permissions return 403; invalid permission shapes or cross-organization grants
return 400.

## Implementation and verification

- [Controller and public contract](../packages/backend/src/ee/controllers/serviceAccountsController.ts)
- [Permission checks](../packages/backend/src/ee/services/ServiceAccountService/ServiceAccountService.ts)
- [Bootstrap reconciliation](../packages/backend/src/services/InstanceConfigurationService/InstanceConfigurationService.ts)
- [API regression coverage](../packages/api-tests/tests/serviceAccounts.test.ts): admin
  bearer provisioning, project Viewer/Admin grants, non-admin rejection, and revocation.
