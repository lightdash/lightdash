# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lightdash is an open-source business intelligence tool (Looker alternative) that connects to dbt projects to enable self-service analytics. It's a TypeScript monorepo built with modern web technologies.

## Architecture

**Monorepo Structure** (pnpm workspaces):
- `packages/common/` - Shared utilities, types, and business logic
- `packages/backend/` - Node.js/Express API server with database layer
- `packages/frontend/` - React web application with Vite build system
- `packages/warehouses/` - Data warehouse client adapters (BigQuery, Snowflake, Postgres, etc.)
- `packages/cli/` - Command-line interface for dbt project management
- `packages/e2e/` - Cypress end-to-end tests

**Key Technologies:**
- Backend: Express.js, Knex.js ORM, PostgreSQL, TSOA (OpenAPI generation)
- Frontend: React 19, Mantine v8 UI, Emotion styling, TanStack Query
- Build: pnpm workspaces, TypeScript project references, Vite

## Common Development Commands

**Development:**
```bash
pnpm dev                    # Start full development environment
pnpm backend-dev           # Backend only
pnpm frontend-dev          # Frontend only
```

**Code Quality:**
```bash
pnpm lint                  # Lint all packages
pnpm fix-lint             # Auto-fix linting issues
pnpm format               # Check code formatting
pnpm fix-format           # Auto-format code
```

**Testing:**
```bash
pnpm test                 # Run all tests
pnpm backend-test         # Backend tests only
pnpm frontend-test        # Frontend tests only
pnpm e2e-run             # E2E tests with Cypress
```

**Build:**
```bash
pnpm build               # Build all packages
pnpm start               # Start production server
```

**API Generation:**
```bash
pnpm generate-api        # Generate OpenAPI specs from TSOA controllers
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
- Express.js with session-based authentication
- Database migrations in `src/database/migrations/`
- Controllers use TSOA decorators for API generation
- Background jobs with node-cron scheduler

**Frontend (`packages/frontend/`):**
- Vite for fast development and builds
- Mantine v8 component library with custom theming
- Monaco Editor for SQL editing
- TanStack Query for server state management

**Common (`packages/common/`):**
- Shared types and utilities used across packages
- Authorization logic with CASL
- Published as `@lightdash/common`

## TypeScript Project References

**Important**: After SDK build changes, packages use TypeScript project references for proper IDE support:
- All packages have `"composite": true` enabled
- Frontend and backend reference common package via `"references"` in tsconfig.json
- Common package builds to multiple targets: ESM (`dist/esm`), CJS (`dist/cjs`), Types (`dist/types`)
- Web workers importing from common should use built ESM paths: `@lightdash/common/dist/esm/[module]`

## Key Configuration Files

- `/tsconfig.json` - TypeScript project references
- `/pnpm-workspace.yaml` - Workspace configuration
- `/.eslintrc.js` - Global linting rules
- `/package.json` - Root scripts and dependency management
- `.env.development.local` - Local development environment variables

## Testing Memories

- Use puppeteer mcp to interact with the frontend web app
- Test user login is demo@lightdash.com and 'demo_password!'
- Use ./scripts/reset-db.sh to reset the database, run migrations, and seed the database with dev data 

## Current Project Status

- Customer support issues are on milestone 184

## Issue Management

- bugs use the label 🐛 bug

## Code Style Memories

- Never use duck typing, don't have parameters that can have different types, make types intentional

## Development Troubleshooting

- If there are issues running dbt, make sure there is a python3 venv in the root of the repo, which has dbt-core and dbt-postgres installed