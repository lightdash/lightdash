# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent skills

### Issue tracker

Linear (internal, default) + GitHub Issues (public, customer-facing). See `docs/agents/issue-tracker.md`.

### Triage labels

Use the repository's mapped triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a multi-context repository rooted at `CONTEXT-MAP.md`. See `docs/agents/domain.md`.

## Formula Package Development

The `packages/formula/` package contains a Peggy-based parser that compiles Google Sheets-like formulas to SQL for each warehouse dialect (Postgres, BigQuery, Snowflake, DuckDB).

**Never read files in `packages/formula-tests/`.** This package contains black-box integration tests. Use the following commands for feedback:

```bash
pnpm formula:test:duckdb   # DuckDB only — sub-second feedback loop
pnpm formula:test:tier1    # DuckDB + Postgres
pnpm formula:test:tier2    # BigQuery + Snowflake
pnpm formula:test:all      # Everything
```

The development loop is:
1. Edit code in `packages/formula/`
2. `pnpm formula:build`
3. `pnpm formula:test:duckdb` (or tier1/tier2) — read the feedback output
4. Fix issues and repeat

Unit tests in `packages/formula/tests/` CAN be read and edited (grammar and AST tests).

## Architecture

### Runtime Services

The backend, scheduler worker, and headless browser run as separate services that may be on different pods/containers. They do not share a local filesystem. When working with files that are produced by one service and consumed by another, consider how that file will be accessible across service boundaries:

-   **Dynamic/generated files** (screenshots, PDFs, CSVs): Upload to S3 via `FileStorageClient` and retrieve by S3 key. See `packages/backend/src/clients/FileStorage/FileStorageClient.ts`.
-   **Static files** (templates, assets): Commit to the repo and use a `postbuild` step in `package.json` to copy them into the build output so they're available in the container image.

| Service | Purpose | Key Files |
|---------|---------|-----------|
| **Backend API** | Express.js REST server, handles all HTTP endpoints | `packages/backend/src/` |
| **Scheduler Worker** | Graphile Worker — processes background jobs (emails, Slack, exports) | `SchedulerWorker.ts`, `SchedulerTask.ts` |
| **Headless Browser** | Separate Chromium container, takes screenshots/PDFs via CDP | `docker/Dockerfile.headless-browser`, `UnfurlService.ts` |
| **PostgreSQL** | All application state + Graphile Worker job queue | Knex migrations in `src/database/migrations/` |
| **S3 / MinIO** | Object storage for screenshots, PDFs, CSVs, result caching, app images | `FileStorageClient.ts`, `S3Client.ts` |
| **NATS** | Optional message queue for async query processing | `NatsClient.ts` |

### S3 Endpoints: Internal vs Public

The backend uses two S3 endpoint settings:

-   `S3_ENDPOINT` — internal endpoint the backend uses for all server-side S3 operations (e.g. `http://minio:9000` inside Docker).
-   `S3_PUBLIC_ENDPOINT` — browser-facing endpoint used when minting presigned URLs that the browser fetches directly (e.g. presigned PUT for app image uploads). In local dev, the Docker hostname `minio` is unreachable from the browser, so this must be set to `http://localhost:9000`. In production with real S3/GCS, omit this — the internal endpoint is already publicly resolvable.

When the backend creates a presigned URL for browser-direct upload, it uses `S3_PUBLIC_ENDPOINT` (falling back to `S3_ENDPOINT`) as the signing endpoint. See `parseBaseS3Config()` in `packages/backend/src/config/parseConfig.ts`.

## Domain Glossaries

`CONTEXT-MAP.md` lists per-feature glossaries of canonical domain terms (e.g.
pre-aggregates). Before writing code, docs, or UI copy for a feature area that
has a glossary, read it and use the canonical terms — never the `_Avoid_`
aliases.

## Common Development Commands

-   Assume the dev-server is always running and watching source files; a separate `api-routes-watch` process regenerates TSOA routes when controllers change, so backend and generated-route changes reload the API automatically.
-   Always use package-specific commands for faster linting/typechecking/testing.

**Code Quality:**

```bash
pnpm -F common lint
pnpm -F backend lint
pnpm -F frontend lint
pnpm -F common typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck
pnpm -F warehouses typecheck
```

**Testing:**

```bash
pnpm -F common test
pnpm -F backend test:dev:nowatch # runs only tests for modified files
```

When running a specific Vitest file in any package, pass the path directly to
the package test script:

```bash
pnpm -F <package> test path/to/file.test.ts
```

Never insert `--` before the file path. Vitest can ignore the file filter and
run the entire package test suite:

```bash
# Wrong — can run every test in the package
pnpm -F <package> test -- path/to/file.test.ts
```

For a single-file run, verify the Vitest summary reports one test file. If
unrelated test files appear, stop the command immediately and correct it.

**API Generation:**

OpenAPI artifacts are generated from TSOA controllers in PR CI for compatibility
checks and again by the release workflow. Feature PRs must not commit changes to
`packages/backend/src/generated/routes.ts` or
`packages/backend/src/generated/swagger.json`; the pre-commit hook unstages them
and the release workflow commits the generated artifacts.

Run generation locally when validating changes to any of the following, or when
local generated routes are stale:

- controllers change
- return signatures of service functions called by controllers change
- types returned by those controllers/services change

```bash
pnpm generate-api
```

The generated files (`packages/backend/src/generated/*`) are regenerated on main per build, so the committed `routes.ts` may be stale after you pull or rebase main — it can still import controllers that main has already deleted. If the backend crash-loops with `MODULE_NOT_FOUND` pointing at `generated/routes.ts`, run `pnpm generate-api` and restart the dev-server.

Chart-as-code JSON schema is generated from backend OpenAPI:

```bash
pnpm generate:chart-as-code-schema
pnpm check:chart-as-code-schema
```

**MCP Tool Snapshot:**

The committed `packages/common/src/schemas/json/mcp-tools-1.0.json` snapshot
represents the stable/default MCP tool surface used by release-safety checks.
Run the generator and commit the snapshot whenever a change affects an MCP
tool's membership, name, title, description, annotations, input schema, or
output schema, including changes to imported schemas:

```bash
pnpm generate:mcp-tools-snapshot
```

Do not regenerate it solely for a temporary runtime-selected rollout variant.
Regenerate it when that variant becomes the default contract. If unsure whether
a change affects the snapshot, run `pnpm check:mcp-tools-snapshot`. Running
`pnpm generate-api` also regenerates the MCP tool snapshot through its post-hook.

**Database Migrations:**

```bash
# Create new migration
pnpm -F backend create-migration migration_name_with_underscores

# Run migrations
pnpm -F backend migrate

# Rollback last migration
pnpm -F backend rollback-last
```

## Development Workflow

1. **Package Management**: Use `pnpm` (pinned via `packageManager` in the root `package.json`, which pnpm reads directly). Install pnpm directly; do not use Corepack, npm, or yarn for workspace commands.
2. **Database**: Uses Knex.js for migrations and query building
3. **API**: TSOA generates OpenAPI specs from TypeScript controllers
4. **Authentication**: CASL-based authorization with multiple auth providers

## Release-safety declarations

`Release-safety preview` is a required check on `main`. It protects self-hosted upgrades: `unknown` means we could not confirm the change is safe, while `breaking` means we know it is incompatible. Both hold the upgrade, for different reasons.

- For migration breaks, follow the detailed [migration release-safety declarations](packages/backend/src/database/migrations/CLAUDE.md#release-safety-declarations).
- For API or type breaks, add a stable ID to `release-safety.declarations.json` with `reason` and `requiredStop`. The reason must be at least 24 characters, use more than one word, describe what breaks and for whom, and not use placeholder text. Omit `migration` for these entries.

A declaration is active only for a Git range that adds its ID. The release generator compares the last release tag with the target ref. The pull request preview compares the merge base with the head. This makes the declaration expire after the release that first contains it. Do not remove it after release.

The registry is append-only. Never edit, remove, rename, or reuse an existing ID. Add a new ID for every new break, even when it affects the same file or has similar reason text. A release may add `releasedIn` for documentation, but that value never controls activation.

Never declare a break merely to make CI pass. Declaring a break advises every self-hosted customer to use the Recreate strategy. A release that ships as `breaking` or `unknown` stops the internal analytics instance upgrading. The declaration does not reactivate in later Git ranges.

## Merge Freeze — Holding `main` While a Release Is Cut

`release.yml` fires on every push to `main`, so the release that goes out is whatever `main` contains at that moment. When something needs to reach a release on its own — a fix someone is waiting on — hold merges rather than asking people in Slack not to merge:

-   **Freeze**: `gh workflow run merge-freeze.yml -f action=freeze`. This adds a `merge-freeze` required status check to the `main` ruleset. Nothing ever reports that check, so merges into `main` are blocked for everyone without a ruleset bypass.
-   **Unfreeze**: the same workflow with `action=unfreeze`. Do it as soon as the release is cut — a freeze left on blocks the whole team, and there is no auto-expiry.
-   **Only the person who froze can unfreeze it** from the Actions tab. If they're unavailable, a repo admin can remove the `merge-freeze` check from the `main` ruleset by hand.
-   **There is no free-text reason, deliberately** — this repo is public, and a reason box invites someone to name a customer in it. Blocked PRs show who froze it so people know who to ask, and `#engineering` gets the same on both directions. Say why in Slack.
-   **Only `main` is affected.** Stacked PRs merging into their parent branch are untouched.
-   **Check the current state**: the `MERGE_FREEZE` repo variable (`true`/`false`), and `MERGE_FREEZE_ACTOR` for who froze it — `gh variable list -R lightdash/lightdash`. The authority is the ruleset itself: `merge-freeze` in the `main` ruleset's required status checks (`gh api repos/lightdash/lightdash/rulesets`). The variables are a mirror, so trust the ruleset if they ever disagree.
-   **Agents: never freeze or unfreeze on your own initiative.** It blocks every engineer in the repo. Ask, and let a human dispatch it.

Freezing analytics/customer *deployments* is a different mechanism in a different repo — see the `lightdash-cloud` CLAUDE.md.

## Package-Specific Notes

**Backend (`packages/backend/`):**

-   Express.js with session-based authentication
-   Database migrations in `src/database/migrations/`
-   Controllers use TSOA decorators for API generation
-   Background jobs via Graphile Worker (PostgreSQL-based job queue, not node-cron)
-   Scheduler enabled/disabled via `SCHEDULER_ENABLED` env var
-   File storage through `FileStorageClient` → S3/MinIO (never local filesystem for cross-service sharing)

**Frontend (`packages/frontend/`):**

-   Vite for fast development and builds
-   Mantine v8 component library with custom theming
-   Monaco Editor for SQL editing
-   TanStack Query for server state management

**Common (`packages/common/`):**

-   Shared types and utilities used across packages
-   Authorization logic with CASL
-   Published as `@lightdash/common`

## Authorization & Custom Roles

**When adding or changing a permission scope, use the `ld-permissions` skill** — it has the full checklist of ability layers to update (forgetting `serviceAccountAbility.ts` breaks CI/CD pipelines).

**Important behavior:**

-   CASL abilities are **additive** - org-level permissions cannot be revoked by project-level custom roles
-   If a permission should be restrictable via custom roles, do NOT add it to org-level developer/editor abilities
-   **Changing the scope vocabulary (rename / split / merge / remove) requires a Knex migration against `scoped_roles`** — custom roles persist scope names as strings and do not auto-update. See the `ld-permissions` skill for the migration checklist and patterns.

## TypeScript Project References

**Important**: After SDK build changes, packages use TypeScript project references for proper IDE support:

-   All packages have `"composite": true` enabled
-   Frontend and backend reference common package via `"references"` in tsconfig.json
-   Common package builds to multiple targets: ESM (`dist/esm`), CJS (`dist/cjs`), Types (`dist/types`)
-   Web workers importing from common should use built ESM paths: `@lightdash/common/dist/esm/[module]`

## dbt YAML Validation Schemas

There are **two** JSON schemas that define valid Lightdash metadata in dbt YAML files. They must stay in sync:

| Schema | Path | Used by |
|--------|------|---------|
| `lightdashMetadata.json` | `packages/common/src/dbt/schemas/lightdashMetadata.json` | Compile-time validation (`exploreCompiler`) |
| `lightdash-dbt-2.0.json` | `packages/common/src/schemas/json/lightdash-dbt-2.0.json` | CLI `lightdash generate` (`DbtSchemaEditor`) |

**When adding or modifying field types (metric types, dimension types, additional dimension types), you MUST update both schemas.** The `lightdash-dbt-2.0.json` schema has two copies of the metric enum — one under `$defs/modelMeta` (model-level metrics) and one under `$defs/columnMeta` (column-level metrics). Both must be updated.

The canonical source of truth for field types is `packages/common/src/types/field.ts` (e.g., `MetricType` enum).

## Testing Memories

-   Use Chrome DevTools MCP to interact with the frontend web app
-   Test user login is demo@lightdash.com and 'demo_password!'
-   Use ./scripts/reset-db.sh to reset the database, run migrations, and seed the database with dev data

## Current Project Status

-   Customer support issues are on milestone 184

## Issue Management

-   bugs use the label 🐛 bug

## Code Style Memories

-   Never use duck typing, don't have parameters that can have different types, make types intentional
-   **Prefer strict object shapes**: Start with required properties and make them optional only when truly needed
    -   ✅ Good: `{ charts: Chart[] }` - can be empty array
    -   ❌ Avoid: `{ charts?: Chart[] }` - unclear if missing or empty
-   **Use null for absent values**: When a value might not exist, prefer explicit null over optional properties
    -   ✅ Good: `{ createdBy: User | null }` - explicitly absent
    -   ❌ Avoid: `{ createdBy?: User }` - ambiguous presence
-   **When optional properties are acceptable**:
    -   Backwards compatibility requirements
    -   API design patterns where omission has semantic meaning
    -   Configuration objects with sensible defaults
-   **Always wrap `JSON.parse` in try/catch**: Parse errors crash the app. On failure, considering showing a warning toast or falling back to a sensible default.
-   **Keep code comments minimal**: 1–2 lines at most, only when the code isn't self-explanatory. No long explanatory blocks, no ticket references (PROD-XXXX, #issue) in comments.

## TypeScript Utilities

-   **Use `assertUnreachable` for exhaustive switch statements**: When handling union types in switch statements, use `assertUnreachable` in the default case to ensure TypeScript catches missing cases
    -   ✅ Good: `default: return assertUnreachable(value, 'Unknown status');`
    -   ❌ Avoid: `default: throw new Error('Unknown status');`
    -   Import from `@lightdash/common`: `import { assertUnreachable } from '@lightdash/common';`
    -   This provides compile-time safety when new union members are added

## Security Best Practices

### Installing Dependencies — Always Use `sfw`

Prefix every package-manager install with [Socket Firewall Free](https://github.com/SocketDev/sfw-free) (`sfw`) to block confirmed-malicious packages before they hit disk. Install once with `npm i -g sfw`, then use:

```bash
sfw pnpm install
sfw pnpm add <package>
sfw npm install -g @lightdash/cli
```

This applies to any install Claude runs in this repo — lockfile regeneration, Snyk fixes, debug snippets, global CLI installs. CI workflows already wrap installs via `socketdev/action@<SHA>`.

### Dependency Install Scripts — Blocked by Default

Dependency lifecycle scripts (`preinstall`/`install`/`postinstall`) are blocked by pnpm and enforced in CI via `strictDepBuilds: true` in `pnpm-workspace.yaml`. With it set, `pnpm install` (which every CI job runs) **fails** if any dependency has a build script that isn't reviewed in the `allowBuilds` map in `pnpm-workspace.yaml`:

- `allowBuilds: { <package>: true }` — allowed to run its build script (native addons we depend on).
- `allowBuilds: { <package>: false }` — build script we intentionally do NOT run (each entry documents why).

This matters because these scripts also run on `npm install` for downstream consumers of our published packages (e.g. `@lightdash/cli`). When CI fails on an unreviewed build script, either remove/replace the dependency, add it as `false` (with a reason) if its script is safe to skip, or `true` if the script must run.

### Warehouse Credentials Protection

**CRITICAL**: When adding new credential fields to warehouse configurations, always check if they contain sensitive data that should NOT be exposed via API responses.

**Location**: `packages/common/src/types/projects.ts`

The `sensitiveCredentialsFieldNames` array controls which fields are stripped from API responses:

```typescript
export const sensitiveCredentialsFieldNames = [
    'user',
    'password',
    'keyfileContents',
    'personalAccessToken',
    'privateKey',
    'privateKeyPass',
    'sshTunnelPrivateKey',
    'sslcert',
    'sslkey',
    'sslrootcert',
    'token',
    'refreshToken',
    'oauthClientId',
    'oauthClientSecret',
    // Add any new sensitive fields here!
] as const;
```

**When adding new warehouse authentication methods:**

1. **Identify sensitive fields**: Any field containing passwords, tokens, keys, secrets, or identifiers that could be used for authentication
2. **Add to sensitiveCredentialsFieldNames**: This ensures the field is stripped via `Omit<CreateXxxCredentials, SensitiveCredentialsFieldNames>`
3. **Test API responses**: Verify the sensitive data doesn't appear in GET /api/v1/projects/{uuid} responses
4. **Examples of sensitive fields**:
    - OAuth client secrets (equivalent to passwords)
    - Refresh tokens (can be used to obtain access tokens)
    - Access tokens (direct authentication)
    - Private keys, certificates
    - Database passwords
    - Personal access tokens
5. **Examples of potentially sensitive fields** (use judgment):
    - OAuth client IDs (less sensitive but best practice to hide)
    - Usernames (often considered PII)

**How it works**:

-   `CreateXxxCredentials` types contain ALL fields including sensitive ones (used for creation/updates)
-   `XxxCredentials` types are `Omit<CreateXxxCredentials, SensitiveCredentialsFieldNames>` (used for API responses)
-   `ProjectModel.get()` filters credentials using this array before returning to API controllers
-   `ProjectModel.getWithSensitiveFields()` returns unfiltered data for internal use only

### LIGHTDASH_SECRET-Derived State Must Register for Rotation

Anything persisted or verified using `LIGHTDASH_SECRET` must be covered by the `rotate-lightdash-secret` maintenance command (`packages/backend/src/scripts/rotate-lightdash-secret/`), or secret rotation strands it. When adding:

-   **A new encrypted DB column** (`EncryptionUtil` ciphertext): add it to `CIPHERTEXT_REGISTRY` in `registry.ts` (table, primary key column, column) so the command re-encrypts it.
-   **A new deterministic token-hash table** (`hashWithSecret`): add it to `TOKEN_HASH_TABLES` in `rotation.ts` so hashes are classified and reported as removal blockers. Token hashes are one-way and can never be migrated by the command: lookup verifies against every configured secret, but a credential hashed under a fallback must be reissued or revoked before that fallback is removed.
-   **A new signed or secret-derived artifact** (JWT, HMAC, signed cookie): sign with `lightdashConfig.lightdashSecrets.active`, verify against `lightdashSecrets.all`, and document its lifetime in the removal gates of `docs/lightdash-secret-rotation.md` (short-lived artifacts break once their signing secret leaves the configured secrets; the runbook's waiting periods must cover them).

Tests in `rotation.test.ts` pin the registry contents — update them together with the registry.

## Slugs — Project-Scoped Portable Identifiers

Slugs are unique per project and resource type for charts, dashboards, SQL Runner charts, spaces, and data apps. Database constraints are authoritative and include soft-deleted rows, so a deleted resource reserves its slug for a safe restore. The same slug may be used in a different project.

Use `generateUniqueSlugScopedToProject()` (`packages/backend/src/utils/SlugUtils.ts`) for normal creation. It derives the base with `generateSlug()`, probes exact indexed candidates, and appends `-1`, `-2`, and so on for conflicts. Explicit slugs used by content-as-code and promotion must be inserted exactly; same-project conflicts return an actionable conflict or resolve the intended active upsert, never overwrite another resource.

UUIDs remain the canonical internal identity. Use them for foreign keys, durable relationships, and references without an explicit project scope. Slugs are appropriate for project-scoped URLs and portable content-as-code selectors.

`getLtreePathFromSlug` is lossy: hyphens and underscores map to the same ltree label. Space hierarchy and access logic must use `parent_space_uuid`; path-based resolution must reject ambiguity rather than selecting an arbitrary row.

### Make uuid vs uuid-or-slug explicit (endpoints & service args)

A whole class of bug comes from a param named `*Uuid` that actually carries a
uuid *or* a slug (routes that accept either resolve via `getByIdOrSlug`), then
using the raw value as a real UUID downstream (DB write, FK, comparison). Make
the contract explicit instead of relying on the name:

- **Path params that accept either** must be typed `UuidOrSlug` and named
  `*UuidOrSlug` (e.g. `@Path() dashboardUuidOrSlug: UuidOrSlug`). This documents
  the dual contract in the OpenAPI spec.
- **Uuid-only path params** must be typed `UUID` (e.g. `@Path() versionUuid: UUID`).
  TSOA emits the uuid pattern validator for `UUID`, so non-uuid values are
  rejected at the request boundary (422). Both types live in
  `packages/common/src/types/api/uuid.ts`.
- **Service args** mirror the same names: a `UuidOrSlug` arg must be resolved to
  `entity.uuid` (via `getByIdOrSlug`) before being used as a key, FK, or in any
  comparison — never pass the raw arg downstream.

## Translation — deliberately limited to embeds

There is no i18n framework and no full-app localization (that is PROD-3774,
not built). Two embed-scoped mechanisms exist, with a strict boundary:

-   **Content** (chart/dashboard names, tile titles, labels): `LanguageMap` /
    the SDK `contentOverrides` prop — slug-keyed, schema-derived.
-   **UI chrome** (filter operators/inputs, date zoom, tile menus, filter
    bar): the SDK `uiOverrides` prop — a flat key→string map. The registry
    `DEFAULT_UI_STRINGS` in `packages/common/src/utils/i18n/uiStrings.ts` is
    the single source of truth; components render `override ?? English
    default` via `useUiStrings()`. Shipped keys are a public SDK contract:
    additive only, never rename or remove.

When adding user-visible strings to embed-reachable surfaces (anything a
dashboard viewer sees), follow the mandate in
`packages/frontend/src/components/common/Filters/CLAUDE.md` — it generalizes
beyond filters. English strings for those surfaces live only in the registry,
never inline. Do not add an i18n framework; host apps own locale state.

## Development Troubleshooting

-   If there are issues running dbt, make sure there is a python3 venv in the root of the repo, which has dbt-core and dbt-postgres installed

## Checking the local database for debugging

You can connect directly to the local development database using `psql`:

**Examples:**

```bash
# View schema of a table
psql -c "\d cached_explores"

# Query projects
psql -c "SELECT project_uuid, name FROM projects LIMIT 5;"
```

## API Access with Personal Access Token

You can use `curl` to debug local API endpoints

**Examples:**

```bash
# List all spaces in a project
curl -H "Authorization: ApiKey $LDPAT" "$SITE_URL/api/v1/projects/PROJECT_UUID/spaces"

# List projects in organization
curl -H "Authorization: ApiKey $LDPAT" "$SITE_URL/api/v1/org/projects"

# Get root-level spaces only (using v2 content API)
curl -H "Authorization: ApiKey $LDPAT" "$SITE_URL/api/v2/content?contentTypes=space&projectUuids=PROJECT_UUID&page=1&pageSize=25"
```
