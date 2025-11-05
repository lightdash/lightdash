# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lightdash is an open-source business intelligence tool (Looker alternative) that connects to dbt projects to enable self-service analytics. It's a TypeScript monorepo built with modern web technologies.

## Architecture

**Monorepo Structure** (pnpm workspaces):

-   `packages/common/` - Shared utilities, types, and business logic
-   `packages/backend/` - Node.js/Express API server with database layer
-   `packages/frontend/` - React web application with Vite build system
-   `packages/warehouses/` - Data warehouse client adapters (BigQuery, Snowflake, Postgres, etc.)
-   `packages/cli/` - Command-line interface for dbt project management
-   `packages/e2e/` - Cypress end-to-end tests

**Key Technologies:**

-   Backend: Express.js, Knex.js ORM, PostgreSQL, TSOA (OpenAPI generation)
-   Frontend: React 19, Mantine v8 UI, Emotion styling, TanStack Query
-   Build: pnpm workspaces, TypeScript project references, Vite

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

Generate OpenAPI specs from TSOA controllers, needs to be run when controllers change

```bash
pnpm generate-api
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
-   Background jobs with node-cron scheduler

**Frontend (`packages/frontend/`):**

-   Vite for fast development and builds
-   Mantine v8 component library with custom theming
-   Monaco Editor for SQL editing
-   TanStack Query for server state management

**Common (`packages/common/`):**

-   Shared types and utilities used across packages
-   Authorization logic with CASL
-   Published as `@lightdash/common`

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

## Testing Memories

-   Use puppeteer mcp to interact with the frontend web app
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

## TypeScript Utilities

-   **Use `assertUnreachable` for exhaustive switch statements**: When handling union types in switch statements, use `assertUnreachable` in the default case to ensure TypeScript catches missing cases
    -   ✅ Good: `default: return assertUnreachable(value, 'Unknown status');`
    -   ❌ Avoid: `default: throw new Error('Unknown status');`
    -   Import from `@lightdash/common`: `import { assertUnreachable } from '@lightdash/common';`
    -   This provides compile-time safety when new union members are added

## Security Best Practices

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
