# Mixed warehouse scale test

An exploratory test that drives a local Lightdash instance through the API and
creates 20 or more projects that mix warehouse connections. It reports a
pass/fail matrix with per-scenario timings.

## What it covers

`--mode flag-on` (with `mixed-warehouse-connections` on):

- Every available warehouse as the original connection, with every other
  warehouse as an extra (one project per original, 6 extras each), plus
  two-connection projects.
- For each connection: the explore is bound to its connection and dialect, a
  metric query, a filter, a custom SQL dimension in the warehouse's own syntax,
  SQL and formula table calculations, and the SQL runner.
- A dashboard that mixes a chart from each connection, and a scheduled CSV
  delivery of it (checked in Mailpit).
- Adding, editing, renaming and deleting a live connection. Bad credentials,
  an unreachable warehouse and a type change are refused.
- Cross-source dbt refs through GitHub dbt sources: refs inside one
  connection resolve, a join to a model on another connection is skipped with
  a warning, and a ref across connections fails with the cross-connection
  message.
- A preview project copies every connection, and `lightdash deploy --source`
  deploys into an extra connection.
- Additional dbt sources are manifest sources, which the flag allows.

`--mode flag-off` (restart the API without `mixed-warehouse-connections`):

- Postgres and Snowflake projects can add same-type extras only.
- Trino, BigQuery and ClickHouse projects cannot switch.
- Manifest dbt sources are refused with the existing message.
- Mixed projects created in the flag-on run keep working, but cannot add a
  mixed extra.
- A ref across two Postgres connections keeps the existing message.

## Warehouses

| Warehouse | Where | Notes |
| --- | --- | --- |
| Postgres | ldenv Postgres, the Jaffle shop database | Real |
| Trino | `examples/trino-dev` | Real, local |
| DuckDB (DuckLake) | `~/.lightdash/ducklake-dev` | Real, local |
| BigQuery | `bigquery` development bundle | Real |
| Snowflake | `snowflake` development bundle | Real, read-only; keep queries small |
| ClickHouse | `examples/mixed-warehouse-dev/docker-compose.yml` | Real, local |
| Redshift | A database on the ldenv Postgres, through the Redshift client | **Stand-in**, not Redshift |
| Athena | `athena` development bundle, small fixture tables | Real; set `ATHENA_WORKGROUP` |

Not covered:

- **Databricks** and **MotherDuck** need cloud accounts that the test does not
  have.

## Setup

1. Start Trino (`examples/trino-dev`) and ClickHouse
   (`docker compose -p ld-mixed-dev -f examples/mixed-warehouse-dev/docker-compose.yml up -d`),
   then seed ClickHouse and the DuckLake fixture as described in
   `examples/mixed-warehouse-dev/README.md`.
2. Create the Redshift stand-in database `redshift_standin` with a
   `public.rs_orders` table on the ldenv Postgres.
3. Generate the fixture manifests with `dbt parse` (see the fixture READMEs).
4. Give the instance a `dbt1.10` with every adapter on its `PATH`, so the
   server can run dbt for the GitHub sources: a venv with `dbt-core~=1.10`
   and the postgres, trino, bigquery, snowflake, duckdb, clickhouse and
   redshift adapters, linked as `dbt1.10` in a directory at the front of
   `PATH` in `.env.development.local`.
5. Deliver the `bigquery`, `snowflake` and `athena` development bundles to
   the worktree. For BigQuery, export `BIGQUERY_DATASET` (a dataset the service
   account can use for its default dataset). For Athena, export `ATHENA_WORKGROUP` (the workgroup the
   fixture role may query, with its own result location) and optionally
   `ATHENA_REGION` and `ATHENA_S3_STAGING_DIR`. Athena runs only when the
   bundle and `ATHENA_WORKGROUP` are both present. Its queries read three-row
   fixture tables, so each scans well under 1 KB.
6. Set `LIGHTDASH_ENABLE_FEATURE_FLAGS=multi-connection-projects,mixed-warehouse-connections,multi-dbt-sources,cross-source-dbt-refs`
   with an Enterprise licence key, and restart the instance.
7. Build the CLI: `pnpm -F @lightdash/cli build`.

## Run

```bash
python3 scripts/mixed-warehouse-scale-test/run.py \
  --url http://localhost:<api-port> --pg-database <jaffle-warehouse-db> \
  --branch <branch with the fixtures pushed> --mode flag-on --out /tmp/mixed-scale

# Remove mixed-warehouse-connections from LIGHTDASH_ENABLE_FEATURE_FLAGS and
# add it to LIGHTDASH_DISABLE_FEATURE_FLAGS (dev instances turn preview flags
# on by default), restart the API, then:
python3 scripts/mixed-warehouse-scale-test/run.py ... --mode flag-off --out /tmp/mixed-scale
```

The script waits while the 1-minute load average is 6 or more. Results go to
`<out>/<mode>/results.json` and `summary.md`. Credentials are read from the
env file and never printed. Recorded messages are redacted before they are
truncated: known credential values (project IDs, account identifiers, user
names, keys, the Athena workgroup and bucket), ARNs, S3 paths and 12-digit
account numbers. At start-up the script checks that each known value is
redacted and stops if one is not.
