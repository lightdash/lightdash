# Trusted provisioner

Lets one trusted workload create organizations without a browser sign-up or a
stored secret. The workload proves who it is with a short-lived identity token
from any OpenID Connect issuer, such as Google Cloud, GitHub Actions or Render.
Off unless all four settings below are set.

## Settings

| Variable | Meaning |
| --- | --- |
| `TRUSTED_PROVISIONER_ISSUER` | The issuer to trust, as an https URL. Its signing keys are found through `/.well-known/openid-configuration`. For Google service accounts use `https://accounts.google.com`. |
| `TRUSTED_PROVISIONER_AUDIENCE` | The audience the identity token must be minted for. Use this instance's provisioning URL. |
| `TRUSTED_PROVISIONER_SUBJECTS` | Comma-separated `sub` values of the trusted workloads. For a Google service account this is its numeric unique ID, not its email, so a recreated account is not trusted. |
| `TRUSTED_PROVISIONER_OWNER_EMAIL_DOMAIN` | The only domain owners can be created on. Use a domain you control that nobody signs up with. |

The instance must also run with `ALLOW_MULTIPLE_ORGS=true`.

## Request

```
POST /api/v1/provisioning/organizations
Authorization: Bearer <identity token>

{ "organizationName": "Acme", "ownerEmail": "acme@demos.example.com" }
```

The response holds `organizationUuid`, `userUuid`, a personal access token for
the owner and its expiry (90 days, or the instance maximum if lower).

## Checks

1. The token is signed by the configured issuer, has the configured audience,
   and was issued in the last 5 minutes.
2. Its `sub` is in the trusted list.
3. The token has not been used before. Mint a new one for every call.
4. The owner email is on the configured domain and not already registered.

The owner is created with a verified email and no password. Add people to the
organization by inviting them with the returned token.

## Errors

| Status | Meaning |
| --- | --- |
| 401 | The token is missing or failed a check. The reason is in the server log only. |
| 404 | The feature is not configured. |
| 409 | The owner email already exists. An earlier call may have stopped part-way; clean up before retrying. |

The steps do not run in one transaction, so a failure after the owner is
created leaves that user behind.
