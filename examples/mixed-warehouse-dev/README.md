# Mixed warehouse dev fixtures

Small dbt projects for testing extra connections of different warehouse
types in one Lightdash project. Use them with the Trino fixture in
`examples/trino-dev` and the Postgres Jaffle shop project.

Each project only describes tables that already exist. Lightdash reads the
manifest; dbt never builds anything. Generate the manifests with `dbt parse`,
which does not connect to the warehouse:

```bash
sfw ~/.lightdash/dev-venv-trino/bin/pip install "dbt-bigquery~=1.10.0" "dbt-snowflake~=1.10.0" "dbt-duckdb~=1.10.0" duckdb
for d in bigquery snowflake ducklake; do
  (cd examples/mixed-warehouse-dev/$d && ~/.lightdash/dev-venv-trino/bin/dbt parse --profiles-dir .)
done
```

The BigQuery and Snowflake profiles read their account settings from the
environment: `BIGQUERY_PROJECT` and `BIGQUERY_DATASET`, and `SNOWFLAKE_ACCOUNT`,
`SNOWFLAKE_USER`, `SNOWFLAKE_ROLE` and `SNOWFLAKE_WAREHOUSE`. Take the values
from the delivered credential JSON. Each project has a `generate_schema_name`
macro so the configured schema is used as written.

| Project | Warehouse | Relation | Credentials |
| --- | --- | --- | --- |
| `bigquery` | BigQuery | `bigquery-public-data.samples.shakespeare` | Development bundle `bigquery` |
| `snowflake` | Snowflake | `AGENT_DEMO.PUBLIC.CUSTOMERS` | Development bundle `snowflake` |
| `ducklake` | DuckDB (DuckLake) | `ducklake.main.duck_events` | None, local files |
| `athena` | Athena | `awsdatacatalog.athena_spike.xp_fixture_types` | Development bundle `athena` |
| `clickhouse` | ClickHouse | `analytics.ch_sessions` | None, local Docker (`docker-compose.yml`) |
| `redshift` | Redshift **stand-in** on Postgres | `redshift_standin.public.rs_orders` | ldenv Postgres |
| `postgres` | Postgres | `<jaffle warehouse db>.jaffle.orders` | ldenv Postgres (`PG_WAREHOUSE_DATABASE`) |

## Credentials

Deliver the `bigquery` and `snowflake` development bundles to the worktree's
`.env.development.local` with the encrypted envelope flow
(`bin/dev-credential-envelope` in the laptop repo). They arrive as
`LIGHTDASH_TEST_BIGQUERY_CREDENTIALS` (a service account key) and
`LIGHTDASH_TEST_SNOWFLAKE_CREDENTIALS` (a key-pair identity). Never print them.

- BigQuery: the service account can read one small test dataset and bill
  queries to its own project. A query on the public Shakespeare table scans
  about 4 MB.
- Snowflake: the identity can read only `AGENT_DEMO.PUBLIC.CUSTOMERS` and
  `CUSTOMERS_V`. Use the second allowed warehouse for an extra
  connection. Statements time out after 60 seconds. Leave the `NAME` and
  `PHONE` columns out of screenshots.

## DuckLake fixture

Create a local DuckLake with a DuckDB catalog and a local data path:

```bash
mkdir -p ~/.lightdash/ducklake-dev/data
~/.lightdash/dev-venv-trino/bin/python -I -c "
import duckdb
c = duckdb.connect()
c.execute('INSTALL ducklake; LOAD ducklake;')
c.execute(\"ATTACH 'ducklake:$HOME/.lightdash/ducklake-dev/catalog.duckdb' AS lake (DATA_PATH '$HOME/.lightdash/ducklake-dev/data/')\")
c.execute(\"CREATE OR REPLACE TABLE lake.main.duck_events AS SELECT i AS event_id, (i % 50) AS user_id, CASE i % 4 WHEN 0 THEN 'signup' WHEN 1 THEN 'view' WHEN 2 THEN 'purchase' ELSE 'refund' END AS event_type, DATE '2024-01-01' + CAST(i % 365 AS INTEGER) AS event_date, round((i % 97) * 1.37, 2) AS amount FROM range(1, 5001) t(i)\")
"
```

Connection settings: type DuckDB, connection type DuckLake, catalog type
DuckDB with path `~/.lightdash/ducklake-dev/catalog.duckdb`, data path type
local with path `~/.lightdash/ducklake-dev/data/`, schema `main`. Lightdash
attaches the catalog as `ducklake`. Only one process can hold the catalog
file open for writing.

## Attach the fixtures

Additional dbt sources accept GitHub connections only. For a quick local test,
allow `DbtProjectType.MANIFEST` in the two GitHub-only checks in
`packages/backend/src/services/ProjectDbtSourcesService.ts` and attach each
`target/manifest.json` as a `manifest` source. Do not commit that edit. Then:

1. Enable `multi-connection-projects`
   (`LIGHTDASH_ENABLE_FEATURE_FLAGS`) with an Enterprise licence key.
2. Create each extra connection with
   `POST /api/v1/projects/{projectUuid}/warehouse-connections`. Lightdash tests
   the connection before it saves it.
3. Create a dbt source per fixture and bind it to its connection with
   `PUT /api/v1/projects/{projectUuid}/warehouse-connections/dbt-sources/{sourceUuid}`.
4. Refresh the project and query each explore.

## Athena

The `athena` bundle arrives as `LIGHTDASH_TEST_ATHENA_CREDENTIALS`: client keys
and a role per region. The client keys can only assume the role, so a
Lightdash Athena connection uses the keys with the role as **Assume role
ARN**. Queries run in a workgroup that has its own result location: set the
connection's workgroup, and leave the S3 staging directory empty so the
workgroup setting applies. The fixture tables have a few rows, so queries
scan under 1 KB.

For `dbt parse`, the profile reads `ATHENA_REGION`, `ATHENA_WORKGROUP` and
`ATHENA_S3_STAGING_DIR`; parsing does not connect, so placeholder values work.
Keep the workgroup, bucket, account ID and role ARNs out of commits and
screenshots.

## ClickHouse and the Redshift stand-in

`docker compose -p ld-mixed-dev up -d` starts ClickHouse on HTTP port 18123
(user and password `lightdash`). Seed it with `analytics.ch_sessions`, then
parse the `clickhouse` project.

The Redshift stand-in is a `redshift_standin` database on the ldenv Postgres,
queried through Lightdash's Redshift client. It checks the Redshift code paths
and the Postgres-compatible dialect, not Redshift itself.

