# Security

## Review

- **Worst case:** an attacker reads another organisation's or project's data, runs code, reaches internal systems, or gets a secret sent to a host it was not issued for.
- **Evidence:** trace each user input to where it lands, and read the code.
- **scoped lookups:** a lookup by any id other than the one the route authorised proves in the query that the row belongs to the authorised parent and organisation.
  A new `GET` or `PATCH` with no CASL check is the same bug. Fix.
- **second-step permission:** a multi-step flow (an install, a finalize step, an agent tool) re-checks at the step that acts, with the same ability the UI uses, and a new query path applies user-attribute explore filtering (`getFilteredExplore`). Fix.
- **credential destination:** a secret goes only to the host that issued it, compared after `normalizeCredentialHost` (`utils/credentialDestination.ts`).
  Secrets are never empty or substituted. Fix.
- **SSRF:** a user URL (webhook, MCP server, registry, data-app connection) is fetched only after `validatePublicHttpUrl` (`utils/ssrfProtection.ts`) and through the DNS-pinned `secureFetch`: https only, no userinfo, private ranges and redirects refused, body size and timeout bounded. Fix.
  A flag that allows private hosts still keeps https and pinning (Heads-up).
- **SQL engines:** user input reaches Postgres, a warehouse, HogQL, GAQL or DuckDB without parameters or quoting, or a user SQL engine runs outside its per-project sandbox. Fix.
  A path that runs user SQL is behind the SQL runner or custom SQL permission.
- **OAuth and tokens:** redirect URIs match scheme and host exactly, revoked tokens fail at once, new bearer routes honour token scope, and authorize pages have no reflected input or open redirect. Fix.
- **XSS and URLs:** user text rendered as HTML goes through `sanitizeSvg`, `sanitize-html` or an escaped React node (profile and credential names included); stored URLs are relative or http(s), never `javascript:`. Fix.
- **secrets out:** keys and tokens never reach logs (request headers are allowlisted; a new token format gets a pattern in `logging/scrubSecrets.ts`), API responses, `/health` or the bundle.
  A new warehouse secret is in `sensitiveCredentialsFieldNames` and `stripSensitiveWarehouseCredentials`; a new encrypted column is in `rotate-lightdash-secret/registry.ts`; server secrets are never handed to users. Missing is Fix.
- **shared caches:** keyed by owner, project, scope and credential generation, never served across identities. Fix.
- **bounded input:** user expressions (formulas), uploads and fetched bodies have size and time limits.
  Heads-up; Fix when an unauthenticated or low-role user can block the event loop.
- **public routes:** an unauthenticated route returns no config, emails or ids, is rate-limited, and trusts the client IP only through the configured proxy. Heads-up.
- **advisories:** a diff that pins or downgrades a package below a `[security]` bump. Heads-up.

## Impact

- **breaking:** allowlist/TLS tightening or redaction blocks legitimate use.
- **notable:** attacker reach changes.
- **minor:** hardening/bounds no legitimate setup hits.

## Diff

```ts
type SecurityDiff = Diff;
```

- **Name:** what is exposed or protected (`webhook URLs`, `share-link tokens`).
- **Note:** what an attacker can or can no longer do.
- **Granularity:** one diff per exposure that changes.

```json
{ "lens": "Security", "change": "modified", "impact": "notable", "name": "webhook URLs", "note": "can no longer reach internal hosts" }
```
