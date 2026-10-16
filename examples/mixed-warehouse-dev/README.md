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

1. Enable `multi-connection-projects` and `mixed-warehouse-connections`
   (`LIGHTDASH_ENABLE_FEATURE_FLAGS`) with an Enterprise licence key.
2. Create each extra connection with
   `POST /api/v1/projects/{projectUuid}/warehouse-connections`. Lightdash tests
   the connection before it saves it.
3. Create a dbt source per fixture and bind it to its connection with
   `PUT /api/v1/projects/{projectUuid}/warehouse-connections/dbt-sources/{sourceUuid}`.
4. Refresh the project and query each explore.
