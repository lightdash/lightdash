# CLAUDE.md - CLI Package

This file provides guidance to Claude Code when working with the Lightdash CLI package.

## Package Overview

The Lightdash CLI (`@lightdash/cli`) is a command-line interface for managing dbt projects and integrating with Lightdash. It provides tools for compiling, validating, deploying, and previewing dbt models.

## Architecture

**Core Components:**
- `src/index.ts` - Main CLI entry point with Commander.js
- `src/handlers/` - Command handlers for each CLI operation
- `src/dbt/` - dbt integration utilities and warehouse targets
- `src/warehouse/` - Warehouse client management
- `src/config.ts` - Configuration management
- `src/globalState.ts` - CLI state management

**Key Dependencies:**
- `commander` - CLI framework
- `inquirer` - Interactive prompts
- `execa` - Process execution for dbt commands
- `chalk` - Terminal styling
- `ora` - Loading spinners
- `js-yaml` - YAML parsing for dbt configs

## Development Commands

**Build:**
```bash
pnpm cli-build           # Build CLI package
pnpm build               # Build with TypeScript
```

**Testing:**
```bash
pnpm test                # Run Jest tests
pnpm cli-test            # CLI-specific tests
```

**Code Quality:**
```bash
pnpm lint                # Lint CLI code
pnpm fix-lint            # Auto-fix lint issues
pnpm format              # Check formatting
pnpm fix-format          # Auto-format code
```

## Development Workflow

**Local Development:**
1. Build the CLI: `pnpm cli-build`
2. Run commands via Node.js: `node ./packages/cli/dist/index.js [command]`
3. Test with example projects in `/examples/`

**Common Development Commands:**
```bash
# Login to Lightdash instance
node ./packages/cli/dist/index.js login http://localhost:3000

# Compile dbt project
node ./packages/cli/dist/index.js compile --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles

# Generate Lightdash config
node ./packages/cli/dist/index.js generate --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles

# Preview changes
node ./packages/cli/dist/index.js preview --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
```

## Command Structure

**Main Commands:**
- `login` - Authenticate with Lightdash instance
- `compile` - Compile dbt models and generate Lightdash config
- `generate` - Generate Lightdash YAML files
- `validate` - Validate dbt project structure
- `deploy` - Deploy project to Lightdash
- `preview` - Preview changes before deployment
- `dbt [command]` - Proxy dbt commands

**Handler Pattern:**
Each command has a corresponding handler in `src/handlers/` that:
1. Validates input parameters
2. Loads project configuration
3. Executes the operation
4. Provides user feedback via spinners/logs

## Configuration

**Key Config Files:**
- `lightdash.yml` - Project configuration
- `profiles.yml` - dbt profiles (warehouse connections)
- `.lightdash/` - Local CLI state and auth tokens

**Environment Variables:**
- `LIGHTDASH_API_KEY` - API authentication
- `DBT_PROJECT_DIR` - Default dbt project directory
- `DBT_PROFILES_DIR` - Default dbt profiles directory

## dbt Integration & Warehouse Support

**Core Dependency:**
Deploying or compiling a Lightdash project requires metadata from a dbt project. All this metadata is available in the `target/manifest.json` file produced by dbt. This manifest file is the starting point for everything Lightdash needs to understand the dbt project structure, models, and transformations.

**dbt Execution Strategy:**
- **Default behavior**: The Lightdash CLI usually runs dbt under the hood, passing through flags to ensure the manifest is up-to-date
- **Skip compilation**: Users can use `--skip-dbt-compile` flag to skip any dbt calls when they want to manage dbt compilation themselves
- This is useful when users have their own dbt workflow or when the manifest is already current

**Supported Warehouses:**
- BigQuery (`src/dbt/targets/Bigquery/`)
- Snowflake (`src/dbt/targets/snowflake.ts`)
- Postgres (`src/dbt/targets/postgres.ts`)
- Redshift (`src/dbt/targets/redshift.ts`)
- Databricks (`src/dbt/targets/databricks.ts`)
- Trino (`src/dbt/targets/trino.ts`)

**dbt Integration Details:**
- Executes dbt commands via `execa`
- Parses `target/manifest.json` for model metadata
- Validates dbt project structure
- Supports multiple dbt versions
- Handles dbt compilation lifecycle

## Testing

**Test Structure:**
- Unit tests for core utilities
- Integration tests for dbt operations
- Mock data for warehouse connections

**Test Commands:**
```bash
jest                     # Run all tests
jest --watch            # Watch mode
jest src/dbt/models.test.ts  # Specific test file
```

## Publishing

**Release Process:**
```bash
pnpm cli-build          # Build package
pnpm release            # Publish to npm (with --no-git-checks)
```

**Binary Distribution:**
- Main binary: `dist/index.js`
- Package name: `@lightdash/cli`
- Global install: `npm i -g @lightdash/cli`

## Common Issues

**dbt Version Compatibility:**
- To test different dbt versions, modify `execa` calls to use `dbt${VERSION}` (e.g., `dbt1.8`)
- Version detection in `src/handlers/dbt/getDbtVersion.ts`

**Authentication:**
- Tokens stored in `~/.lightdash/`
- Login required before most operations
- API key can be set via environment variable