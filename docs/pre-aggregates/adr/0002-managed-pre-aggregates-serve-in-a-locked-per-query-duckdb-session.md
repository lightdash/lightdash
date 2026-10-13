# Managed pre-aggregates serve in a DuckDB session locked to one materialization

Every materialization in a Lightdash instance lives in one pre-aggregates
bucket under one credential, keyed by its results file name with no tenant
prefix. Serving used a process-wide warm DuckDB instance whose S3 secret
covered the whole bucket, and the SQL it ran carried user-authored fragments
(custom SQL dimensions, custom metrics, table calculations) past a SELECT-only
check that must allow `read_parquet`. On a multi-tenant instance that let a
query in one organization read any other organization's materialization, and
any local file the process could open, by naming it.

We decided a managed pre-aggregate run executes in its own DuckDB instance,
built for that run and closed after it, with three locks:

- the bucket secret is created with `SCOPE` set to the one materialization URI;
- `allowed_paths` lists that URI alone and `enable_external_access` is turned
  off once the extensions and the secret are in place, so the engine refuses
  every other remote object and every local path whatever the SQL asks for;
- the session carries a per-query memory and thread budget
  (`PRE_AGGREGATE_DUCKDB_QUERY_MEMORY_LIMIT`, default 512MB and 2 threads).

The run learns which materialization to lock to from resolution, and the URI
is persisted on the query history row (`pre_aggregate_materialization_uri`),
so a NATS worker rebuilding the run from the row locks the same way. A row
without it (written by an earlier release) is not given a wider session: the
run throws and takes the existing warehouse fallback.

## Considered options

- **Validating user fragments with the file-function deny list** used for raw
  DuckDB SQL — rejected as the primary control; regex deny lists are bypassed
  and the server-built `read_parquet` sits in the same string. The engine lock
  holds regardless of what the SQL says.
- **Scoping the shared instance's secret to the organization** — rejected;
  secrets are instance-wide, so one instance cannot scope per query, and keys
  carry no tenant prefix to scope a directory to.
- **A per-tenant prefix in the bucket layout** — not pursued now; it would only
  narrow a shared secret to an organization, not to the project or the query.

## Consequences

- No warm instance for reads: each query pays instance creation, extension
  load and a cold HTTP metadata and file cache. Compose and external-source
  queries already run this way.
- Memory is now budgeted per query rather than per process; concurrent reads
  multiply it. A per-process or per-organization cap is a follow-up.
- `PRE_AGGREGATE_DUCKDB_QUERY_MEMORY_LIMIT` keeps its name but now caps one
  session.
- The pre-aggregate warm instance (`pre-aggregate-query-instance`) remains
  only for external-source compiles, which never execute on it.
