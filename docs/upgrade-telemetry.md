# Upgrade telemetry

The migrate CLI emits lifecycle events for each migration attempt. Events use
`migration_run_uuid` to join to the local `migration_run_ledger` row.

## Events

| Event | Meaning |
| --- | --- |
| `upgrade_started` | A migration attempt created its run-ledger row and began work. |
| `upgrade_completed` | The attempt completed and its run-ledger row was marked `succeeded`. |
| `upgrade_failed` | The attempt was marked `retrying` or `parked`, or escaped without a terminal ledger outcome. |
| `migration_lock_takeover` | A process acquired a lease that was held and expired immediately before its claim. |
| `preflight_blocked` | A preflight command returned `abort`. This can be emitted by `up` or standalone `preflight`. |

There is one `upgrade_started` event for every successful `startRun()` call and
one terminal event for every attempt whose terminal outcome is recorded. If an
error escapes after a run starts but before its terminal ledger update, the
terminal `upgrade_failed` event has a null `outcome`.

## Properties

Every event contains every property. Properties without a value are sent as
explicit nulls.

| Property | Source |
| --- | --- |
| `migration_run_uuid` | UUID returned by `startRun()`; null only for `preflight_blocked`. |
| `to_version` | Running Lightdash application version. |
| `from_version` | Application version from the latest succeeded run-ledger row, or null on a fresh install. |
| `span_migrations` | Pending Knex migration count for an attempt, or the preflight pending-migrations check count. |
| `execution_mode` | Sanitized `LIGHTDASH_MIGRATION_EXECUTION_MODE`, or `unknown`. |
| `duration_seconds` | Rounded elapsed seconds from attempt start to a terminal event. |
| `duration_ms` | Elapsed milliseconds from attempt start to a terminal event; null on non-terminal events. Prefer this for typical-run durations — `duration_seconds` floors sub-second runs to 0. |
| `attempt` | Run-ledger attempt number. Takeover and preflight events use null. |
| `outcome` | `succeeded`, `retrying`, `parked`, or null for non-terminal events and abandoned runs. |
| `failure_class` | Stable failure category below, or null when no failure occurred. |
| `failing_migration` | Migration filename or internal migration stage. |
| `preceded_by_unlock` | Whether the acquired lease records a preceding operator unlock. |
| `preceding_unlock_forced` | Whether that preceding unlock was forced; null when there was no preceding unlock. |
| `preflight_decision` | Preflight decision for `preflight_blocked`. |
| `preflight_red` | Number of failed red preflight checks. |
| `preflight_yellow` | Number of warning preflight checks. |
| `preflight_blocked_checks` | IDs of failed red checks. |

## Failure classes

Classification uses typed errors, PostgreSQL error codes, and internal stage
names. It never matches error-message text.

| Class | Detection |
| --- | --- |
| `preflight_blocked` | Preflight decision is `abort`. |
| `migration_state_invalid` | Failure occurred in the `migration-state` stage. |
| `lease_lost` | `MigrationLeaseLostError`. |
| `lock_timeout` | PostgreSQL `55P03` or `57014`. |
| `db_unreachable` | PostgreSQL `08006` or `08003`, or `KnexTimeoutError`. |
| `constraint_violation` | PostgreSQL `23505`, `23503`, `23502`, or `23514`. |
| `permission_denied` | PostgreSQL `42501`. |
| `resource_exhausted` | PostgreSQL `53100`, `53200`, or `53300`. |
| `graphile_worker_failed` | Failure occurred in the `graphile-worker` stage after code-based checks. |
| `timeout_exceeded` | `MigrationWaitTimeoutError`. |
| `migration_defect` | PostgreSQL `42601`, `42P01`, or `42703`. |
| `unclassified` | No typed, code-based, or stage-based rule matched. |

## Privacy and opt-out

Telemetry sends application versions, migration filenames, internal stage
names, counts, booleans, stable check IDs, execution mode, and run UUIDs. It
never sends raw error messages, failure detail, stack traces, SQL, schema names,
or the operator-supplied unlock actor. The local run ledger continues to store
raw failure detail for operators.

`RUDDERSTACK_ANALYTICS_DISABLED=true` disables these events through the same
RudderStack configuration opt-out as other Lightdash telemetry.

## Execution mode

`LIGHTDASH_MIGRATION_EXECUTION_MODE` is trimmed, lowercased, and accepted only
when it matches `[a-z0-9_-]{1,32}`. Missing or invalid values become `unknown`.

| Value | Set by |
| --- | --- |
| `boot-winner` | Production image entrypoint before the boot-time migration race. |
| `compose` | Root Docker Compose `lightdash` service. |
| `helm-job` | Helm chart migration Job from chart version 2.16.0. |
| `helm-boot` | Helm chart backend pod entrypoint from chart version 2.16.0. |
| `unknown` | Fallback when no valid value is supplied. |
| Other valid value | An external deployment or operator setting the environment variable. |
