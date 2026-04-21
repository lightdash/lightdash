# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lightdash is an open-source business intelligence tool (Looker alternative) that connects to dbt projects to enable self-service analytics. It's a TypeScript monorepo built with modern web technologies.

## Formula Package Development

The `packages/formula/` package contains a Peggy-based parser that compiles Google Sheets-like formulas to SQL for each warehouse dialect (Postgres, BigQuery, Snowflake, DuckDB).

**Never read files in `packages/formula-tests/`.** This package contains black-box integration tests. Use the following commands for feedback:

```bash
pnpm formula:test:fast     # DuckDB only — sub-second feedback loop
pnpm formula:test:tier1    # DuckDB + Postgres
pnpm formula:test:tier2    # BigQuery + Snowflake
pnpm formula:test:all      # Everything
```

The development loop is:
1. Edit code in `packages/formula/`
2. `pnpm formula:build`
3. `pnpm formula:test:fast` (or tier1/tier2) — read the feedback output
4. Fix issues and repeat

Unit tests in `packages/formula/tests/` CAN be read and edited (grammar and AST tests).

## Architecture

### Monorepo Structure (pnpm workspaces)

-   `packages/common/` - Shared utilities, types, and business logic
-   `packages/backend/` - Node.js/Express API server, scheduler worker, and all backend services
-   `packages/frontend/` - React web application with Vite build system
-   `packages/warehouses/` - Data warehouse client adapters (BigQuery, Snowflake, Postgres, etc.)
-   `packages/cli/` - Command-line interface for dbt project management
-   `packages/e2e/` - Playwright end-to-end tests

### Key Technologies

-   Backend: Express.js, Knex.js ORM, PostgreSQL, TSOA (OpenAPI generation)
-   Frontend: React 19, Mantine v8 UI, Emotion styling, TanStack Query
-   Build: pnpm workspaces, TypeScript project references, Vite

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

## Common Development Commands

-   Assume the dev-server is always running
-   Always use package-specific commands for faster linting/typechecking/testing.

**Code Quality:**

```bash
pnpm -F common lint
pnpm -F backend lint
pnpm -F frontend lint
pnpm -F common typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck
```

**Testing:**

```bash
pnpm -F common test
pnpm -F backend test:dev:nowatch # runs only tests for modified files
```

**API Generation:**

Generate OpenAPI specs from TSOA controllers. Always run this when:

- controllers change
- return signatures of service functions called by controllers change
- types returned by those controllers/services change

```bash
pnpm generate-api
```

Chart-as-code JSON schema is generated from backend OpenAPI:

```bash
pnpm generate:chart-as-code-schema
pnpm check:chart-as-code-schema
```

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

1. **Package Management**: Use `pnpm` (v9.15.5+) - never use npm or yarn
2. **TypeScript**: All packages use TypeScript with project references for type checking
3. **Linting**: ESLint with Airbnb config, enforces `no-floating-promises`
4. **Pre-commit**: Husky + lint-staged runs linting/formatting on staged files
5. **Database**: Uses Knex.js for migrations and query building
6. **API**: TSOA generates OpenAPI specs from TypeScript controllers
7. **Authentication**: CASL-based authorization with multiple auth providers

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

**When adding a new permission scope**, you must update all the relevant ability layers:

1. **`packages/common/src/authorization/types.ts`** - Add the new CASL subject name to `CaslSubjectNames`
2. **`packages/common/src/authorization/scopes.ts`** - Define the scope (name, description, group, conditions)
3. **`packages/common/src/authorization/projectMemberAbility.ts`** - Add to the appropriate system role function (e.g., `developer`, `admin`)
4. **`packages/common/src/authorization/organizationMemberAbility.ts`** - Add to org-level roles if needed (note: org-level abilities are additive and **cannot** be restricted by project-level custom roles)
5. **`packages/common/src/authorization/roleToScopeMapping.ts`** - Add to the appropriate system role in `BASE_ROLE_SCOPES` (must stay in sync with `projectMemberAbility.ts`)
6. **`packages/common/src/authorization/serviceAccountAbility.ts`** - Add to `ORG_ADMIN` (or other service account scopes) if service accounts need this permission. **Forgetting this breaks CI/CD pipelines.**

**Key files:**

-   `projectMemberAbility.ts` - System role abilities at project level
-   `organizationMemberAbility.ts` - System role abilities at org level
-   `serviceAccountAbility.ts` - Service account abilities (enterprise, used for CI/CD)
-   `roleToScopeMapping.ts` - Maps system roles to scopes (used by custom roles system and parity tests)
-   `scopeAbilityBuilder.ts` - Builds CASL abilities from scope lists (custom roles path)
-   `index.ts` - Main ability builder that chooses between system role vs custom role path

**Important behavior:**

-   CASL abilities are **additive** - org-level permissions cannot be revoked by project-level custom roles
-   If a permission should be restrictable via custom roles, do NOT add it to org-level developer/editor abilities
-   The parity test (`roleToScopeParity.test.ts`) ensures `projectMemberAbility.ts` and `roleToScopeMapping.ts` stay in sync

## TypeScript Project References

**Important**: After SDK build changes, packages use TypeScript project references for proper IDE support:

-   All packages have `"composite": true` enabled
-   Frontend and backend reference common package via `"references"` in tsconfig.json
-   Common package builds to multiple targets: ESM (`dist/esm`), CJS (`dist/cjs`), Types (`dist/types`)
-   Web workers importing from common should use built ESM paths: `@lightdash/common/dist/esm/[module]`

## Key Configuration Files

-   `/tsconfig.json` - TypeScript project references
-   `/pnpm-workspace.yaml` - Workspace configuration
-   `/.eslintrc.js` - Global linting rules
-   `/package.json` - Root scripts and dependency management
-   `.env.development.local` - Local development environment variables

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

## Slugs — Not Unique Identifiers

**WARNING: Slugs are NOT guaranteed to be unique.** Do not treat them as reliable identifiers for lookups, deduplication, or foreign key relationships. Always use UUIDs for uniqueness guarantees.

Slugs are human-readable URL identifiers for charts, dashboards, and spaces (e.g., `weekly-sales-report`). They are generated from the entity name via `generateSlug()` (`packages/common/src/utils/slugs.ts`), and uniqueness is enforced at creation time by `generateUniqueSlug*` functions (`packages/backend/src/utils/SlugUtils.ts`). However, **multiple code paths bypass these uniqueness checks**, resulting in duplicate slugs in production.

**How slugs get duplicated:**

1. **Content-as-code (`lightdash upload`)**: The `CoderService` uses `forceSlug: true` when creating charts and dashboards, which skips the `generateUniqueSlug` call entirely and inserts the slug from the YAML file as-is. If two YAML files with the same slug are uploaded, or a slug already exists in the target project, duplicates are created.

2. **Promotion**: The `PromoteService` also uses `forceSlug: true` when creating content in the upstream project. Promoting the same content from multiple downstream projects, or re-promoting after manual creation in upstream, can create duplicates.

3. **Lossy slug generation**: `generateSlug()` strips all non-alphanumeric characters to hyphens, so different names produce identical slugs. Examples:
   - `"Sales Report (2024)"` and `"Sales Report 2024"` → `sales-report-2024`
   - `"Q1 / Q2 Summary"` and `"Q1 - Q2 Summary"` → `q1-q2-summary`

   The uniqueness check at creation time handles this by appending `-1`, `-2`, etc., but `forceSlug: true` paths bypass this.

4. **Ltree path conversion is also lossy**: `getLtreePathFromSlug` converts hyphens to underscores, so `"my-space"` and `"my_space"` map to the same ltree path. This can cause space resolution collisions.

**No database-level uniqueness constraint** exists for slugs on `saved_queries`, `dashboards`, or `spaces` tables. Only `saved_sql` has a `UNIQUE(project_uuid, slug)` DB constraint. All other uniqueness enforcement is application-level only.

**What this means in practice:**

- **API resolution picks first match**: `getByIdOrSlug()` queries use `LIMIT 1` — when duplicates exist, the result is non-deterministic. No error is thrown.
- **Promotion fails on duplicates**: `PromoteService` throws an explicit error (`"There are multiple charts with the same identifier {slug}"`) when it finds duplicate slugs in the upstream project.
- **Never use slugs as unique keys** in new code. Use UUIDs for any operation that requires uniqueness. Slugs are for URL display only.
- **A REPL script exists** to fix duplicates: `packages/backend/src/ee/repl/scripts/fixDuplicateSlugs.ts`

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
