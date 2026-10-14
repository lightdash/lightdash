# Database transaction observability

Opt-in diagnostics for application transactions on the Lightdash Postgres
database. Everything here is off by default and changes nothing until an
operator enables it. None of it issues extra queries, holds connections longer,
or takes locks: the cost is in-process bookkeeping around transactions that
already run.

## Why

A self-hosted deployment running logical replication may see long-running
application transactions that end in `ROLLBACK`. Lightdash has no deliberate
rollback path: every rollback is Knex rolling back after a thrown error, or
Postgres terminating the session (for example under
`idle_in_transaction_session_timeout`). Without these settings the only trace
is whatever the calling code logs about its own error, and a database
administrator cannot tell API, scheduler and migration connections apart.

## Identify connections: `PGAPPNAME`

`node-postgres` reads the standard libpq variable `PGAPPNAME` and sends it as
`application_name` in the connection startup packet. Set a different value on
each process so `pg_stat_activity` shows which service holds a connection:

```bash
# API pods
PGAPPNAME=lightdash-api
# Scheduler worker pods
PGAPPNAME=lightdash-scheduler
# Migration job
PGAPPNAME=lightdash-migrate
```

This costs nothing per query and needs no Lightdash code. The value can also be
given inside `PGCONNECTIONURI` as `?application_name=lightdash-api`.

## Log rolled-back transactions: `PG_LOG_TRANSACTION_ROLLBACKS`

```bash
PG_LOG_TRANSACTION_ROLLBACKS=true
```

Default `false`. Only the exact value `true` enables it. Set it on the API and
scheduler processes and restart them to reload configuration.

When enabled, every callback-style `database.transaction(...)` that rolls back
logs one line at `warn` level:

```
Knex.transactionRollback - transaction rolled back after 184233.12ms - Context: {"source":"knex","caller":"POST /api/v1/projects/:projectUuid/refresh","error":"terminating connection due to idle-in-transaction timeout","serverVersion":"2.581.0"}
```

- `duration` is wall-clock time from the call to `transaction()` until Knex
  settled the rollback, in milliseconds.
- `caller` is the active tracing span name (HTTP route or scheduler task) or
  `null` when none is active. It is read from the existing tracing context, so
  no stack trace is captured.
- `error` is the message of the error that caused the rollback.

Committed transactions log nothing. Non-callback usages
(`database.transaction()` returning a transaction object) pass through
untouched. The wrapper rethrows the original error unchanged, and a failure
inside the logger never changes the transaction outcome.

## Reading the output

Rollback lines with a long `duration` and an error about idle-in-transaction
or a terminated connection point at a code path that held a transaction open
while doing other work. The project compile lock
(`ProjectModel.tryAcquireProjectLock`) is the known case: it holds a
transaction for the whole compile and shows up with the `refresh` or compile
route as `caller`.

Short `duration` rollbacks with application errors are ordinary failed writes
and are already reported through the calling code's own error logging.
