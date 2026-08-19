# Backend

Table of contents:

## Getting started

This package shouldn't be run directly. Instead, you should follow the instruction from
the [Setup development environment](../../.github/CONTRIBUTING.md#setup-development-environment)
section from the contribution file.

## Key technologies/libraries

- [Node.js](https://nodejs.org/en/)
- [Express](https://expressjs.com/)
- [Knex](http://knexjs.org/)
- [PostgreSQL](https://www.postgresql.org/)

## Architecture

**Overview**

- ~~routers~~ (legacy)
- controllers
- services
- models
- database
    - migrations
    - seeds
    - entities
- clients
- projectAdapters
- dbt

### ~~Routers~~

Legacy folder. Should be refactored to controllers.

### Controllers

Controllers are responsible for handling the request and response from the API. They should
be as thin as possible, delegating the business logic to services.

When making changes to a controller or the types used in a controller, you should also generate the
corresponding HOA files. You can do it by running `pnpm generate-api`.

Guidelines:

- Should call 1 service action per endpoint
- Define params and body type with HOA definitions

Restrictions:

- Can only import services

### Services

Services are responsible for handling the business logic and tracking. They tend to be the biggest and most complex part
of the backend.

Guidelines:

- add tracking to all public methods
- add permission checks to all public methods

Restrictions:

- Cannot import controllers, and other services
- Can import models, clients and projectAdapters

### Models

Models are responsible for handling the database logic. They should be as thin as possible.

Guidelines:

- `get` methods should error if there are no results
- `find` methods should NOT error if there are no results
- `create` and `update` methods should return the created entity uuid
- should only use static methods from other models

Restrictions:

- Can only import entities and use other models

### Database

#### Entities

Entities are responsible for typing the latest database schema.

#### Migrations

Migrations are responsible for handling the database schema changes.

Guidelines:

- they should not export constants or functions beside the `up` and `down` methods

Restrictions:

- Can't import anything

Useful Development Scripts:

- migrate database - `pnpm -F backend migrate`
- rollback database - `pnpm -F backend rollback`
- rollback last migration - `pnpm -F backend rollback-last`
- create a new migration file - `pnpm -F backend create-migration <migration-name>`

##### Migration preflight

Run `pnpm -F backend migrate preflight` to inspect upgrade safety without changing the database. `migrate up` runs the same checks before claiming the migration lease. Use `--strict` to treat yellow checks as blocking, `--force` to proceed with an explicit override warning, and `--json` on the standalone command for automation.

PostgreSQL does not expose filesystem free space. Set `MIGRATION_PREFLIGHT_DISK_HEADROOM_BYTES` from an external capacity signal to compare available space with the 5 GiB warning threshold; when an applicable migration is pending and the variable is unset, disk headroom is reported as unavailable yellow.

The JSON payload has `schemaVersion: "1"` and fixed top-level fields: `decision`, `force`, `strict`, `summary`, and `checks`. Decisions are `proceed`, `proceed-with-warnings`, `abort`, or `force-proceed`. Checks are emitted in this order: version path, migration privileges, PostgreSQL version, held locks, long transactions, disk headroom, and pending migration inventory. Every check includes an `id`, `severity`, `outcome`, `message`, and strictly shaped `data`; red checks use `pass` or `fail`, yellow checks use `pass` or `warn`, and the inventory uses `info`.

The command writes one JSON line to standard output. An `abort` decision exits through the migration CLI error path with a non-zero status and `--force` guidance. Override warnings and command errors are written to standard error.

#### Seeds

Seeds are responsible for populating the database with initial data.
This data is used for development and testing purposes.

### Clients

Clients are responsible for handling the communication with external services.

Restrictions:

- Can't import anything

### Project adapters

Project adapters are responsible for handling the communication with external services with the intent to fetch dbt
project files.

Restrictions:

- Can't import anything

### dbt

dbt is responsible for handling the communication with dbt.

Restrictions:

- Can't import anything

## Utility Scripts

### Database Migration and Rollback Tool (Development and Disposable Previews Only)

**File:** `packages/backend/src/migrateOrRollbackDatabase.ts`

This script is for development and disposable preview environments only. It provides automated database migration and
rollback capabilities, particularly when dealing with missing migration files during rollbacks. Production recovery is
forward-only: apply a fix-forward migration or roll back the application code. Never run automatic down-migrations in
production.

#### ⚠️ IMPORTANT DISCLAIMER

**CRITICAL WARNING**: This script modifies your database and may cause irreversible data loss.

- **ALWAYS create a complete database backup** before proceeding with any database operations
- Test the process in a development environment first
- **We are not responsible for any issues, data corruption, or data loss** that may occur from using this script
- Use this tool at your own risk and responsibility
- Ensure you have the necessary permissions and authority to modify the database

#### Usage

**Development:**

```bash
pnpm -F backend migrate-or-rollback-database:dev
```

**Built preview images:**

```bash
pnpm -F backend migrate-or-rollback-database
```

#### What it does

1. **Checks Migration Status**: Analyzes current database migration state
2. **Handles Missing Files**: Resolves missing migration files from the local image first, falling back to downloading and transpiling the TypeScript source from GitHub
3. **Executes Operations**: Runs migrations forward or rollbacks as required
4. **Cleanup**: Removes temporary downloaded files

### User Password Override Tool

**File:** `packages/backend/src/overrideUserPassword.ts`

This script allows administrators to reset a user's password directly via the command line.

#### ⚠️ IMPORTANT DISCLAIMER

**SECURITY WARNING**: This script modifies user authentication data.

- **ALWAYS ensure you have database backups** before modifying user data
- Only use this for legitimate administrative purposes
- Verify the target user email before execution
- **We are not responsible for any security issues or data loss** that may occur
- Use this tool at your own risk and responsibility

#### Usage

**Development:**

```bash
cd packages/backend
npx tsx src/overrideUserPassword.ts <user-email> <new-password>
```

**Production:**

```bash
cd packages/backend
node dist/overrideUserPassword.js <user-email> <new-password>
```

#### Parameters

- `<user-email>`: The email address of the user whose password will be changed
- `<new-password>`: The new password to set for the user

#### Example

```bash
npx tsx src/overrideUserPassword.ts user@example.com newSecurePassword123
```
