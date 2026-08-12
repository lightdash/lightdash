# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Opt-in Agent Okteto Development Environment

This workflow is enabled only when
`LIGHTDASH_OKTETO_TOKEN` is set. If it is not set, skip this section and
follow the normal development workflow.

When it is set, the Okteto development environment is started automatically by
the `SessionStart` hook (`agent-okteto-dev.sh hook-start`). The hook captures
the session ID, starts synchronization, and waits for the environment to become
healthy before the first prompt reaches Claude. Do not start it yourself or
replace it with a local Docker environment.

If setup fails, do not make code changes. Follow the reported error and
`docs/agent-okteto.md`, then resume the session after fixing the setup.
The prompt guard reports whether setup is still running or the specific startup
failure recorded by the SessionStart gate.

After making and validating code changes, run
`./scripts/agent-okteto-dev.sh wait` before the final response. Include the URL
from its `READY:` line in the final response. The `Stop` hook verifies readiness
again and prevents a final response that omits the URL.

Leave the Okteto namespace and sync process running so the user can test the
changes.

## Formula Package Development

**Never read files in `packages/formula-tests/`** — black-box integration tests; use the `pnpm formula:test:*` commands for feedback. Full dev loop: `packages/formula/CLAUDE.md`.

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

## Common Development Commands

-   Assume the dev-server is always running. PM2 watches backend source files and restarts the API, and a separate `api-routes-watch` process regenerates TSOA routes when controllers change; backend and generated-route changes reload the API automatically.
-   Always use package-specific commands for faster linting/typechecking/testing.

**Testing:**

```bash
pnpm -F common test
pnpm -F backend test:dev:nowatch # runs only tests for modified files
```

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

The generated files (`packages/backend/src/generated/*`) are regenerated on main per build, so the committed `routes.ts` may be stale after you pull or rebase main — it can still import controllers that main has already deleted. If the backend crash-loops with `MODULE_NOT_FOUND` pointing at `generated/routes.ts`, regenerate and restart:

```bash
pnpm generate-api
# processes are named <LD_INSTANCE_ID>-api / -scheduler (LD_INSTANCE_ID defaults to "lightdash")
pm2 restart "${LD_INSTANCE_ID:-lightdash}-api" "${LD_INSTANCE_ID:-lightdash}-scheduler"
```

Chart-as-code JSON schema is generated from backend OpenAPI:

```bash
pnpm generate:chart-as-code-schema
pnpm check:chart-as-code-schema
```

**Database Migrations:**

Backend package scripts: `create-migration` / `migrate` / `rollback-last`. Migration names use underscores.

## Development Workflow

-   **Package Management**: Use `pnpm` (v11.17.0+, pinned via `packageManager` in the root `package.json` — let Corepack pick it up) - never use npm or yarn

## Package-Specific Notes

**Backend (`packages/backend/`):**

-   Background jobs via Graphile Worker (PostgreSQL-based job queue, not node-cron)
-   Scheduler enabled/disabled via `SCHEDULER_ENABLED` env var

## Authorization & Custom Roles

**When adding or changing a permission scope, use the `ld-permissions` skill** — it has the full checklist of ability layers to update (forgetting `serviceAccountAbility.ts` breaks CI/CD pipelines).

**Important behavior:**

-   CASL abilities are **additive** - org-level permissions cannot be revoked by project-level custom roles
-   If a permission should be restrictable via custom roles, do NOT add it to org-level developer/editor abilities
-   **Changing the scope vocabulary (rename / split / merge / remove) requires a Knex migration against `scoped_roles`** — custom roles persist scope names as strings and do not auto-update. See the `ld-permissions` skill for the migration checklist and patterns.

## TypeScript Project References

-   Web workers importing from common must use built ESM paths: `@lightdash/common/dist/esm/[module]`

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

New warehouse credential fields must be reviewed for API exposure — see `.claude/rules/warehouse-credentials.md` (auto-loads when touching credential types).

### LIGHTDASH_SECRET-Derived State Must Register for Rotation

Anything persisted or verified using `LIGHTDASH_SECRET` (encrypted columns, token hashes, signed artifacts) must register with the `rotate-lightdash-secret` command — use the `ld-secret-rotation` skill for the checklist.

## Development Troubleshooting

-   If there are issues running dbt, make sure there is a python3 venv in the root of the repo, which has dbt-core and dbt-postgres installed
-   Local DB/API debugging: relevant env (`$LIGHTDASH_API_KEY`, `$LIGHTDASH_URL`, psql vars) lives in `.env.development.local`; `psql` directly and `curl -H "Authorization: ApiKey $LIGHTDASH_API_KEY" "$LIGHTDASH_URL/api/v1/..."`
