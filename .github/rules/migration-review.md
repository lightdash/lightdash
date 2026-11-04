# Migration review rules

Applies to new migration files under `packages/backend/src/database/migrations/**/*.ts` and EE migrations under `packages/backend/src/ee/database/migrations/**/*.ts`.

## Allow enough time to acquire DDL locks

- Require a finite `lock_timeout` before DDL in both `up()` and `down()`, defaulting to **one minute (`60s`)**. Any different value needs a reason in the PR. Avoid copying historical 5-second timeouts: customer databases can have 100× more data than ours and heavier concurrent traffic, so even quick schema changes can struggle to acquire locks.
- Use `SET LOCAL lock_timeout = '60s'` inside a transaction. For `transaction: false`, require session-level `SET` and a `RESET` in `finally`, with the settings and DDL on the same explicitly acquired connection.
- Check that `statement_timeout` allows time for the lock wait and statement execution. Keep lock waits finite and review the large-table migration strategy separately. Check deployment request/proxy deadlines too: a 60-second lock timeout does not guarantee application requests will avoid timing out.

See the shared [migration-authoring rules](../../packages/backend/src/database/migrations/AGENTS.md#lock-timeouts-for-ddl) for details.

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
