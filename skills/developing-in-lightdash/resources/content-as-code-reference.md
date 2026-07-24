# Content as Code Reference

Use content as code to download Lightdash resources into files, make reviewable changes, and upload the desired state. Use `lightdash deploy` separately for semantic-layer changes such as dbt models, metrics, dimensions, and joins.

## Scope and Coverage

Content as code has two separate scopes. A project command never includes organization resources, and `--organization` switches to organization-only mode.

### Project resources

| Resource | Default download | Include explicitly | Location |
|----------|------------------|--------------------|----------|
| Spaces and access | Yes | `--spaces-only` for only spaces | `spaces/**/*.space.yml` |
| Charts | Yes | `--charts <slugs...>` to filter | `charts/**/*.yml` |
| SQL charts | Yes, with charts | Selected through `--charts` | `charts/**/*.sql.yml` |
| Dashboards | Yes | `--dashboards <slugs...>` to filter | `dashboards/**/*.yml` |
| Virtual views | No | `--include-virtual-views` or `--include-all` | `virtual-views/*.yml` |
| AI agents | No | `--include-agents` or `--include-all` | `ai-agents/**/*.yml` |
| Alerts | No | `--include-alerts` or `--include-all` | `alerts/**/*.yml` |
| Scheduled deliveries | No | `--include-scheduled-deliveries` or `--include-all` | `scheduled-deliveries/**/*.yml` |
| Google Sheets syncs | No | `--include-google-sheets` or `--include-all` | `google-sheets/**/*.yml` |
| External connections | No | `--include-external-connections`, `--external-connections <slugs...>`, or `--include-all` | `external-connections/*.yml` |
| Data apps | No | `--include-apps`, `--apps <uuids...>`, or `--include-all` | `apps/<app-folder>/` |

`--include-all` requests every optional project resource available to the caller. Project-wide data-app downloads are capped at 50 by default; raise the cap with `--apps-limit <number>`. Data apps are multi-file bundles rather than YAML resources and remain opt-in during upload with `--include-apps` or `--apps <uuids...>`.

Use `--nested` only when the repository intentionally uses the project/space folder hierarchy. Continue using the repository's existing layout instead of changing layouts during an unrelated edit.

Downloads reuse an existing managed path when the document at that path has the same identity. Stale managed files are removed only after a complete successful fetch; unknown files are preserved. A download can still replace a locally edited managed file, so check the working tree or use a fresh path before downloading.

### Organization resources

`lightdash download --organization` downloads all supported resources for the authenticated user's organization:

| Resource | Identity | Location |
|----------|----------|----------|
| Custom roles | Role name | `custom-roles/*.yml` |
| Users | Case-insensitive email | `users/*.yml` |
| Groups and memberships | Group name | `groups/*.yml` |

Organization upload applies resources in dependency order:

```text
custom roles → users → groups
```

If custom roles fail, dependent users and groups are skipped. If users fail, dependent groups are skipped. User invitation emails are not sent unless `lightdash upload --organization --send-invites` is used intentionally.

Organization documents use their resource folders to determine their type and do not require a `contentType` property. Do not add one merely to make them look like project documents.

## External Connections (Enterprise)

External connections are project-scoped third-party HTTP APIs that data apps fetch from at runtime. Managing them requires Lightdash Enterprise and the admin-only `manage:ExternalConnection` permission — for both download and upload. Under `--include-all` an unavailable server or missing permission is warned about and skipped; the explicit `--external-connections <slugs...>` and `--include-external-connections` flags fail instead.

Each connection is one document in `external-connections/<slug>.yml`:

```yaml
allowedContentTypes:
  - application/json
allowedMethods:
  - GET
  - POST
allowedPathPrefixes:
  - /v1/
apiKeyLocation: header # header | query; only for type api_key
apiKeyName: Authorization
contentType: external_connection
customHeaders: null # static non-secret headers, e.g. anthropic-version
instructions: | # freeform usage guidance injected into app generation
  Use /v1/charges for payments. Paginate with starting_after.
name: Stripe API
oauthScopes: null # only for type google_service_account
origin: https://api.stripe.com # https, bare host, no path
rateLimitPerMinute: null
requestMaxBytes: 262144
responseMaxBytes: 1048576
slug: stripe-api
timeoutMs: 10000
type: api_key # none | api_key | bearer_token | google_service_account
version: 1
```

Identity and behavior rules:

- The project-scoped `slug` is the identity. It is generated from the name at creation and stays stable across renames — renaming via `name` updates the same connection; changing the `slug` creates a new one. Deleting a file never deletes the remote connection.
- `instructions` is the field an agent should invest in: it is injected into data-app generation prompts, so document auth quirks, useful endpoints, pagination, and response caveats there.
- `lightdash lint` does not validate these documents; the server validates on upload (https-only bare-host origin, method/content-type allowlists, per-auth-type requirements) and returns actionable errors.

### Secrets

Secrets never appear in YAML files or downloads. At upload the CLI reads the environment variable `LIGHTDASH_EXTERNAL_CONNECTION_SECRET_<SLUG>` (slug uppercased, hyphens → underscores; e.g. `stripe-api` → `LIGHTDASH_EXTERNAL_CONNECTION_SECRET_STRIPE_API`) and sends its value with the document:

- **Creating** a connection of type `api_key`, `bearer_token`, or `google_service_account` requires the variable to be set — the upload fails otherwise, naming the expected variable. For `google_service_account` the value is the service-account keyfile JSON.
- **Updating** without the variable keeps the stored secret unchanged. With the variable set, an unchanged secret reports no changes; a different value rotates it.
- Clearing a secret is not supported as code — use the settings UI.
- Never write a `secret` key into the YAML. The CLI strips it with a warning rather than uploading it, but it should not be in version control in the first place.

### Authoring a new connection

To wire a data app to a new API, an agent can author the config directly instead of using the settings UI:

1. Read the target API's documentation: base host, auth scheme, useful endpoints, pagination.
2. Write `external-connections/<slug>.yml` with the narrowest `allowedMethods` and `allowedPathPrefixes` the app needs (`GET`-only unless writes are required), and detailed `instructions`.
3. Have the secret exported as `LIGHTDASH_EXTERNAL_CONNECTION_SECRET_<SLUG>` — never pasted into a file.
4. `lightdash upload --external-connections <slug>` and check the action summary.
5. Linking the connection to a specific data app is a separate step done in Lightdash (app builder or API), not through content as code.

## What Is Not Included

Content as code does not manage:

- dbt or Lightdash semantic-layer models, metrics, dimensions, or joins; use `lightdash deploy`;
- warehouse credentials, secrets, or external-service authentication — external connection *configs* are managed, but their secrets travel only through environment variables at upload time (see [External Connections](#external-connections-enterprise));
- general project and organization settings outside the registered resources;
- every data app when the project contains more than the configured apps limit;
- resources that the authenticated user cannot read or that are unavailable on the server edition.

Files can reference integrations such as Google Sheets, but credentials are not portable. Configure the corresponding integration on the target Lightdash instance.

## Complete Download

For bulk changes or tasks that cross content and access control, download both scopes into the same directory with two commands:

```bash
lightdash config get-project
lightdash download --include-all --path ./lightdash
lightdash download --organization --path ./lightdash
```

Do not combine `--organization` with `--include-all` or project filters. Organization mode is a separate command and returns before selecting a project.

Use an explicit project UUID when the active project must not be ambiguous:

```bash
lightdash download --project <project-uuid> --include-all --path ./lightdash
```

The CLI must not be newer than the Lightdash server. A locally built or newly released CLI can call endpoints that an older server does not have. If downloads return endpoint `404` responses, verify the CLI and server versions before treating the content as missing.

## Selective Download

Use filters for small, isolated edits:

```bash
lightdash download --charts revenue-by-month --path ./lightdash
lightdash download --dashboards executive-summary --path ./lightdash
lightdash download --agents sales-agent --path ./lightdash
lightdash download --external-connections stripe-api --path ./lightdash
lightdash download --spaces-only --path ./lightdash
```

Supplying a content filter changes the command into a selective download and skips unselected resource classes. Do not use selective downloads for structural refactors, dependency analysis, access changes, or any task that claims to inspect "all" content.

## Agent-Safe Workflow

Follow this sequence for agent-driven changes:

1. Check for uncommitted content-as-code changes or choose a fresh download path; do not overwrite work that has not been reviewed.
2. Run `lightdash config get-project` and confirm the intended target.
3. Download `--include-all`; also download `--organization` when users, groups, roles, or space access are involved.
4. Inspect structured document fields rather than inferring resource identity or dependencies from filenames. For example, match charts using the top-level `tableName`, not arbitrary text occurrences.
5. Preserve resource identities, slugs, filenames, folder conventions, and unknown fields unless the requested change requires modifying them. Slugs are portable references but are not guaranteed to be unique in every existing project.
6. Make the smallest coherent edit across every affected resource. Update dashboard chart references, scheduled content, space definitions, and access together when applicable.
7. Run `lightdash lint --path ./lightdash` for supported chart and dashboard validation. This is not a complete validator for every content-as-code resource.
8. Review `git diff` and present it before uploading. There is currently no global content-as-code dry-run, transaction, or automatic rollback.
9. Obtain explicit approval before mutating a shared or production Lightdash instance.
10. Upload organization resources first when project access references users or groups, then upload project resources.
11. Inspect every action summary and error. Re-download both scopes when download→upload→download stability must be confirmed.

Never use `--force` merely to make an upload proceed. Use it only when overwriting unchanged-state detection or accepting a documented destructive change is intentional.

## Complete Upload

When organization resources or space access changed, upload in this order:

```bash
lightdash upload --organization --path ./lightdash
lightdash upload --path ./lightdash
```

If data apps should also be uploaded:

```bash
lightdash upload --path ./lightdash --include-apps
```

The first command ensures custom roles, users, and groups exist before project space access is reconciled. The project upload handles the project YAML files found on disk; data-app bundles require the explicit app flag.

For an access-only change:

```bash
lightdash upload --spaces-only --path ./lightdash
```

Filtered content uploads deliberately skip space-access reconciliation. Use an unfiltered project upload or `--spaces-only` when access must change.

## Example: Cross-Scope Content Refactor

For a request such as "move all charts using `orders` into a Billing space, create a billing group, add a user, and restrict access":

```bash
lightdash config get-project
lightdash download --include-all --path ./lightdash
lightdash download --organization --path ./lightdash
```

Then:

1. Find charts whose structured explore/table field identifies `orders`.
2. Create or update the Billing space definition.
3. Move the charts by updating their space reference while preserving identities.
4. Check dashboards and scheduled content that reference those charts.
5. Create or update the user and billing group documents.
6. Add the group to the Billing space access rules without removing required administrator access.
7. Lint supported files and review the complete Git diff.
8. After approval, upload organization content first and project content second.

Do not claim the refactor is complete if only the default project download was inspected: it omits optional project resources and all organization resources.
