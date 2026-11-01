# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Agent skills

### Issue tracker

Linear (internal, default) + GitHub Issues (public, customer-facing). See `docs/agents/issue-tracker.md`.

### Triage labels

Use the repository's mapped triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a multi-context repository rooted at `CONTEXT-MAP.md`. See `docs/agents/domain.md`.

## Area guides

These live next to the code and load when Claude works there. Read the linked file before working in that area.

- **Formula package**: never read files in `packages/formula-tests/`; dev loop in `packages/formula/AGENTS.md`.
- **Release safety**: `Release-safety preview` is required on `main`; before declaring a break, read `docs/release-safety.md`.
- **Merge freeze**: agents never freeze or unfreeze merges; ask a human. Details in `docs/merge-freeze.md`.
- **dbt YAML schemas**: two schemas must stay in sync when field types change; see `packages/common/src/dbt/AGENTS.md`.
- **Warehouse credentials**: new sensitive credential fields go in `sensitiveCredentialsFieldNames`; see `packages/common/src/types/AGENTS.md`.
- **LIGHTDASH_SECRET-derived state** must register for rotation; see `packages/backend/AGENTS.md`.
- **Slugs and uuid-or-slug params**: rules in `packages/backend/AGENTS.md`.

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
pnpm -F visualization lint
pnpm -F backend lint
pnpm -F frontend lint
pnpm -F common typecheck
pnpm -F visualization typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck
pnpm -F warehouses typecheck
```

**Testing:**

```bash
pnpm -F common test
pnpm -F visualization test
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

## Feature flags

Before adding or changing a feature flag, read [docs/feature-flags.md](docs/feature-flags.md).
Use `FeatureFlagModel.get` / `FeatureFlagService.get` in backend services and
`useServerFeatureFlag` in the frontend. Do not create an ENV-only or `NODE_ENV`
rollout gate: the shared resolver supports Console database overrides and
self-hosted ENV configuration. Keep resource authorization separate.
Verify Console-only enablement with ENV enable unset and preview defaults off,
including the backend action, not just UI visibility. Document scope, precedence,
refresh/restart behavior, and remove temporary ENV overrides after rollout.

## Development Workflow

1. **Package Management**: Use `pnpm` (pinned via `packageManager` in the root `package.json`, which pnpm reads directly). Install pnpm directly; do not use Corepack, npm, or yarn for workspace commands.
2. **Database**: Uses Knex.js for migrations and query building
3. **API**: TSOA generates OpenAPI specs from TypeScript controllers
4. **Authentication**: CASL-based authorization with multiple auth providers

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

**Visualization (`packages/visualization/`):**

-   The headless chart engine every Lightdash chart draws through (web app, SDK, embedding, Desktop)
-   Published as `@lightdash/visualization`; the frontend's chart hooks are thin wrappers over it
-   Changes must leave the web app's charts identical: run `pnpm -F visualization test:regression` (see `packages/visualization/AGENTS.md`)

## Authorization & Custom Roles

**When adding or changing a permission scope, use the `ld-permissions` skill** — it has the full checklist of ability layers to update (forgetting `serviceAccountAbility.ts` breaks CI/CD pipelines).

**Important behavior:**

-   CASL abilities are **additive** - org-level permissions cannot be revoked by project-level custom roles
-   If a permission should be restrictable via custom roles, do NOT add it to org-level developer/editor abilities
-   **Changing the scope vocabulary (rename / split / merge / remove) requires a Knex migration against `scoped_roles`** — custom roles persist scope names as strings and do not auto-update. See the `ld-permissions` skill for the migration checklist and patterns.
-   **Embed capabilities are scopes, not JWT flags**: gate new embedded features with an embed scope on the embed's write actor (user or service account), never a new boolean on the JWT `content`. See `packages/common/src/authorization/AGENTS.md`.

## TypeScript Project References

**Important**: After SDK build changes, packages use TypeScript project references for proper IDE support:

-   All packages have `"composite": true` enabled
-   Frontend and backend reference common package via `"references"` in tsconfig.json
-   Common package builds to multiple targets: ESM (`dist/esm`), CJS (`dist/cjs`), Types (`dist/types`)
-   Web workers importing from common should use built ESM paths: `@lightdash/common/dist/esm/[module]`

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
`packages/frontend/src/components/common/Filters/AGENTS.md` — it generalizes
beyond filters. English strings for those surfaces live only in the registry,
never inline. Do not add an i18n framework; host apps own locale state.

## White-label copy — no "Lightdash" in errors or embeddable UI

Lightdash is embedded (iframe/SDK), and errors from any service can surface
in an embed. Never write "Lightdash" meaning "this app" in error messages
(backend errors, API/validation messages, error toasts and states), or in
labels of embeddable pages and components (dashboards, charts, Explore, data
apps, the AI agent and the shared components they render). Rewrite neutrally
(`the server`, `this instance`, or drop the word). Scope, exceptions and
examples are in [docs/white-label-copy.md](docs/white-label-copy.md).

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

## Cursor Cloud specific instructions

Lightdash is a pnpm/Turbo monorepo (backend API, Vite frontend, `common`/`visualization`/`warehouses`/`formula` build-dep packages) that runs on Postgres + MinIO + a headless browser, all started via Docker.

Cloud Agent `start` runs `/home/ubuntu/.lightdash/cloud-agent-start.sh` on boot. That script starts `dockerd` (no systemd in this VM) and then `./scripts/dev-fast-start.sh`. `install` refreshes Node dependencies, the package builds, and the dbt virtualenvs. Read `/tmp/cursor/start-user/start-user.log` for the boot log; a missing `/tmp/cursor/start-user/` directory means `start` did not run.

### Bringing the stack up (do this at the start of a session)

If `GET /api/v1/health` is not already 200, run the same boot path by hand. It is safe to repeat.

1. Start the Docker daemon when `docker info` fails:
   ```bash
   sudo nohup dockerd > /tmp/dockerd.log 2>&1 &
   ```
   Wait until `docker info` succeeds. `docker` works without `sudo` once `/var/run/docker.sock` is group-accessible (`sudo chmod 666 /var/run/docker.sock` if the current shell is not in the `docker` group). Docker is configured with the `fuse-overlayfs` storage driver and `containerd-snapshotter` disabled (`/etc/docker/daemon.json`) — required for Docker 29 in this nested-container VM.
2. Run the canonical, idempotent bootstrap:
   ```bash
   bash /home/ubuntu/.lightdash/cloud-agent-start.sh
   ```
   That claims a port slot, starts the shared + instance Docker services (Postgres, MinIO, headless-browser, mailpit, nats), reconciles `.env.development.local`, runs migrations, seeds Lightdash + the jaffle-shop dbt demo, starts PM2, and blocks until `GET /api/v1/health` returns 200. On a snapshotted VM the DB bootstraps from a base volume, so it finishes in a few minutes. It ends with a `READY:` line listing the URLs. If the first seed fails because `organization_homepage_settings` is missing (that table is created by an enterprise migration), the start script creates the table and retries once.

Default instance URLs: frontend http://localhost:3000, API http://localhost:8080. Test login: `demo@lightdash.com` / `demo_password!` (seeded "Jaffle shop" project). Mailpit UI: http://localhost:8025.

### Process management

App processes run under PM2, namespaced by `LD_INSTANCE_ID` (default `workspace`). PM2 is a local devDependency — invoke it as `pnpm exec pm2` (there is no global `pm2`):
```bash
pnpm exec pm2 status
pnpm exec pm2 logs workspace-api --lines 80 --nostream
pnpm exec pm2 restart workspace-api      # manual recovery if auto-reload fails
```
Processes: `<instance>-api`, `-api-routes-watch`, `-scheduler`, `-frontend`, `-common-watch`, `-visualization-watch`, `-formula-watch`, `-warehouses-watch`, `-spotlight`. PM2 watches backend source files and restarts the API, while `api-routes-watch` regenerates TSOA artifacts after controller changes. Backend and generated-route changes reload automatically; the other `*-watch` processes rebuild `common`/`visualization`/`warehouses`/`formula` on change.

### Non-obvious caveats

- Node: use Node 24.18.1 (pinned by `.nvmrc`). `/exec-daemon/node` is Node 22 and comes before `/usr/local/bin`. Install puts Node 24.18.1 symlinks in `/usr/local/cargo/bin`, which precedes `/exec-daemon`, and `install`/`start` also prepend `$HOME/.nvm/versions/node/v24.18.1/bin`. `node -v` must print `v24.18.1` before `pnpm install` — native modules are built against it.
- dbt 1.7 must use Python 3.11 (`distutils`). The shared venv is `$HOME/.lightdash/dev-venv`, created with `python3.11`, and `./venv` is a symlink to it. dbt 1.12 lives in `$HOME/.lightdash/dev-venv-1.12` (Python 3.12) and is shimmed as `venv/bin/dbt1.12`. `scripts/dev-fast-start.sh` recreates a missing `./venv` with `python3` only when the shared cache is absent — do not delete `$HOME/.lightdash/dev-venv`. Python 3.11 comes from the deadsnakes PPA because Ubuntu 24.04's default is 3.12.
- Custom data-app chart types need local sandbox images. `dev-fast-start.sh` builds those only when `SANDBOX_PROVIDER=docker`. Standard charts and SQL queries work without them.
- Backend lint runs out of heap with the default Node memory limit and aborts (exit 134). Run it with a larger heap: `NODE_OPTIONS="--max-old-space-size=8192" pnpm -F backend lint`.
