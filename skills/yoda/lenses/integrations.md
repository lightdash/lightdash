# Integrations

## Review

- **Skip when:** warehouse and dbt adapters (Warehouse), live-source connectors (Live data sources), or outbound allowlists and shared fetch guards such as SSRF protection (Security).
- **Worst case:** breaks for one provider or tenant.
- **Evidence:** look for tests or a run against the integration.
- **providers named:** the change states which services it affects; internal outbound calls (package registries, proxies, link previews) count as services.
- **provider failure:** timeouts, rate limits, expired auth and partial responses are handled and surfaced to the user.
- **tenant variance:** settings that differ per customer (regions, roles, SSO, self-hosted hosts and ports) keep working for existing setups.
- **one-way side effects:** outgoing messages, webhooks and third-party writes are stated in the PR.
- **provider limits:** the provider's payload size and rate limits are respected (Slack message length, API quotas).

## Impact

- **breaking:** working delivery/sign-in fails or recipients must adapt.
- **notable:** new service/capability or changed delivered content.
- **minor:** wording.

## Diff

```ts
type IntegrationDiff = Diff;
```

- **Name:** the service's product name (`Slack`, `Email`, `Microsoft Teams`, `S3`).
- **Note:** what a user of that service now sees.
- **Granularity:** one diff per service whose behaviour changes, even when the change is the same for several.
  A new service is `added`.
- A service with only internal edits (a rename, code moved to shared) gets no diff.

```json
{ "lens": "Integrations", "change": "modified", "impact": "notable", "name": "Slack", "note": "app deliveries list failed and dropped queries" }
```
