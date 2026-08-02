# Migration review rules

Applies to new migration files under `packages/backend/src/database/migrations/**/*.ts` and EE migrations under `packages/backend/src/ee/database/migrations/**/*.ts`.

## New migrations must support old code

If a PR contains a new migration file: the migration must be able to run **before** any code changes. In other words, after your migration the existing code should still run. Only once the migration is safe in isolation can you update the code to use the newly created tables/columns.

### ✅ Allowed operations in migrations

- Creating new columns
- Creating new tables
- Making columns nullable
- Changing / removing / adding indices
- Adding extensions

### ❌ Dangerous operations in migrations

- Deleting columns
- Deleting tables
- Making existing columns not-nullable
- Changing column types
- Removing extensions
- Altering data in existing columns
- Copying data from one column to another
