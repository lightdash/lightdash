# Repro: non-admin preview refresh returns 403

This is a repro-only branch. Do not merge it.

## What is reproduced

`lightdash start-preview --name <existing preview>` refreshes an existing preview.
It sends two requests:

1. `PATCH /api/v1/projects/{previewUuid}/preview-expiration` with `{"expiresInHours": <int or omitted>}`.
2. `PATCH /api/v1/projects/{previewUuid}` with `{name, dbtConnection, dbtVersion, warehouseConnection}`.

The report says that a non-admin user gets HTTP 403 on both requests for a preview that the same user created.

## Scenarios

All users are throwaway users with `example.com` addresses in the seeded demo organization.
Each actor calls the API with a personal access token and the CLI request headers.

| Scenario | Actor | Preview created by |
| --- | --- | --- |
| b | Org member with project developer role on the upstream project | Same user |
| b | Org developer with no project role | Same user |
| c | Org member with no project role | Another user |
| c | Org member with project developer role on the upstream project | Another user |
| d | Org admin | Org admin |
| d | Org admin | Non-admin user |
| e | Org member with a custom upstream role that has `create:Project@preview` and `update:Project@self` but not `update:Project` | Same user |

## How to run

```sh
LD_URL=https://<preview-host> \
LD_ADMIN_COOKIE_JAR=<path to a signed-in admin cookie jar> \
OUT=results.json \
node repro/non-admin-preview-refresh-403.mjs
```

The script prints status codes and error messages. It never prints tokens, passwords or cookies.
