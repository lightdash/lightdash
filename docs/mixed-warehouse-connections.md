# Mixed warehouse types in one project (spike)

Status: spike, October 2026. Branch `spike/mixed-warehouse-trino`.

## Goal

A project can hold extra warehouse connections. Before this spike, every extra
connection had to use the same warehouse type as the original connection, and
only Postgres, Athena and Snowflake projects could hold extras. Customers want
charts from different warehouses side by side on one dashboard, for example
Snowflake with Trino, or BigQuery with Trino. They do not need joins between
the warehouses.

The spike allows any mix of warehouse types behind a feature flag, and makes
each explore use the dialect of its own connection everywhere.

## Summary

The query path already supported mixed types. Each explore is bound to one
connection, and every query builds its SQL with that connection's SQL builder.
The same-type rule existed only in connection management. The spike removes
the rule behind the flag `mixed-warehouse-connections`, opens multiple
connections to every user-connectable warehouse type, and moves the remaining
places that read the original connection's dialect to the explore's own
connection.

Live tests ran on five warehouse types in one project: Postgres, Trino, DuckDB
(DuckLake), BigQuery and Snowflake. A second project with a BigQuery original
connection and Trino, Snowflake and DuckLake extras also passed.

With the flag off, the original allowlist applies exactly: only Postgres,
Athena and Snowflake originals can hold extras, and the extra must have the
same type. Trino is refused even for a Trino original. Existing saved connections
remain readable and queries keep their existing bindings.

## Supported warehouse types

With the flag on, every value of `WarehouseTypes` is eligible, subject to the
DuckDB variant checks. `MULTI_CONNECTION_SUPPORT` and the exported
`MULTI_CONNECTION_WAREHOUSE_TYPES` keep the original allowlist.
`supportsMultipleConnections` requires the resolved mixed-types flag; no caller
gets the wider allowlist by default.

| Type | Original or extra | Mixed with other types | Restricted authentication for an extra | Database listing | Unit tests | Live test |
| --- | --- | --- | --- | --- | --- | --- |
| Postgres | Yes | Yes | None | Yes | Yes | Yes |
| Trino | Yes | Yes | None. An empty password sends only the user header | No | Yes | Yes |
| DuckDB: DuckLake | Yes | Yes | None | No | Yes | Yes (local catalog) |
| DuckDB: MotherDuck | Yes | Yes | None | No | Yes | No (no token) |
| DuckDB: Embedded (Playground) | No | No | Refused: backend-provisioned | No | Yes | No |
| DuckDB: Analytics | No | No | Refused: backend-provisioned | No | Yes | No |
| BigQuery | Yes | Yes | SSO needs personal credentials | No | Yes | Yes (`bigquery` bundle) |
| Snowflake | Yes | Yes | External browser and OAuth code refused. None needs personal credentials | No | Yes | Yes (`snowflake` bundle) |
| Redshift | Yes | Yes | Browser IAM needs personal credentials | No | Yes | No (no credentials) |
| Databricks | Yes | Yes | OAuth U2M resolves its token at save time | No | Yes | No (no credentials) |
| ClickHouse | Yes | Yes | None | No | Yes | No (no credentials) |
| Athena | Yes | Yes | None | Yes | Yes | No (no credentials) |

"Database listing" means the `listAllDatabases` and `additionalDatabases`
settings. Only Postgres and Athena support them. Other types refuse those
settings on an extra connection instead of ignoring them.

## Dialect per connection

| Area | Before | Now |
| --- | --- | --- |
| Field SQL at compile | Each extra group compiled with its own client | Unchanged |
| Metric queries, filters, custom SQL and bin dimensions, table calculations, date zoom | Bound connection | Unchanged |
| Results cache key | Includes the connection | Unchanged |
| SQL runner | Selected connection | Unchanged |
| AI table calculation and custom dimension generators | Original connection | Explore's connection |
| AI agent | Described only the original connection | `getProjectInfo` lists every connection with its type. The run-SQL prompt states each dialect |
| dbt YAML writeback | Original connection | Explore's connection |
| dbt source location check | Original connection | Source's bound connection |
| Pre-aggregate week start at deploy | Original connection | Explore's connection |
| Explore API | No connection data | `warehouseConnection: { warehouseConnectionUuid, warehouseType, startOfWeek }` |
| Explorer SQL display and formula editor gate | Original connection | Explore's connection |
| Week start in explorer filters, chart reference lines, scheduler chart overrides | Original connection | Explore's connection |
| Custom SQL dimension and SQL table calculation editors | No dialect shown | Show "BigQuery SQL", "Trino SQL" and so on |
| Explorer header | Connection name | Connection name and warehouse type |

## Test matrix

Unit tests:

- Every ordered pair of warehouse types, with the flag on and off
  (`warehouseConnections.test.ts`, 107 tests), including the DuckDB variants.
  The flag-off expectation is a separate implementation of the original rule.
- The SQL builder for an explore bound to an extra connection of each type
  under an original of a different type: adapter, quote character and week
  start (`boundConnectionSqlBuilder.test.ts`).
- Authentication rules per type and mode (`extraConnectionAuthentication.test.ts`).
- AI generators, writeback, explore API field, pre-aggregates, dbt source
  location, agent project info and run-SQL prompt.
- Frontend hook that resolves the explore's dialect and week start, with the
  project fallback.

Real-schema integration tests on Postgres: connection service (64), switch
(53), SQL runner (26), credentials (85), connection modes (31) and pre-aggregate
refresh/finalize race (3). These include mixed types with the flag on and off.

The live results below are from the earlier spike. This review pass uses
targeted unit and real-schema tests.

Live tests on a local instance:

| Check | Postgres | Trino | DuckLake | BigQuery | Snowflake |
| --- | --- | --- | --- | --- | --- |
| Connection test on save | Yes | Yes | Yes | Yes | Yes |
| Compile, explore gets its own `targetDatabase` | Yes | Yes | Yes | Yes | Yes |
| Metric query | Yes | Yes | Yes | Yes | Yes |
| Custom SQL dimension in native syntax | `to_char` | `cast(year(...) as varchar)` | `strftime` | `FORMAT` | `IFF` |
| Filter | Relative date | Relative date | Relative date | Number | Number |
| SQL and formula table calculations | Yes | Yes | Yes | Yes | Yes |
| SQL runner on the connection | Yes | Yes | Yes | Yes | Yes |
| Dashboard tile | Yes | Yes | Yes | Yes | Yes |

The BigQuery-original project repeated the metric queries on BigQuery, Trino,
Snowflake and DuckLake.

## Limits and open work

- **AI agent SQL runs on the original connection.** The agent's run-SQL and
  warehouse discovery tools have no connection selector. The prompt says so.
  A connection parameter is the next step.
- **Dashboard-wide filter UI keeps the project week start.** A dashboard
  filter can target fields from several explores, so the filter bar, its
  settings, temporary filter pills and scheduler dashboard filters keep the
  original connection's week start. The backend applies each tile's own week
  start, so a relative-week filter can show a range that differs from the SQL
  when connections set different week starts.
- **The explore API does extra lookups.** `getExploreResponse` now resolves
  the bound connection on each request. Measure it before rollout.
- **Additional dbt sources accept GitHub only.** The live tests attached
  manifest sources with a local edit that is not committed.
- **Not live-tested:** Redshift, Databricks, ClickHouse, Athena and MotherDuck,
  because there are no development credentials for them.

### Not caused by mixed types

- Custom bin dimensions fail on Trino: the base `concatString` emits
  `CONCAT(number, ' - ', number)`, and Trino rejects non-varchar arguments.
  Athena is likely affected too.
- The Trino connection form still requires a password, although the client now
  supports an empty one.

## Guardrails

| Case | Today | Proposed |
| --- | --- | --- |
| Join between models on different connections | Skipped with a warning that names both connections | Keep the warning and partial compilation |
| Explore names that clash across connections | Refused at compile | Keep |
| Backend-provisioned DuckDB (Playground, Analytics) as original or extra | Refused | Keep |
| Interactive sign-in for an extra connection | Refused or personal credentials only | Keep |
| Database listing on types that cannot list | Refused | Keep until each type supports listing |
| Changing an extra connection's type | Refused before testing, under the project lock and under the credential row lock | Add a new connection instead |
| Custom SQL in the wrong dialect | Fails at query time; editor shows the dialect | Keep |
| Combining data across warehouses | Merge queries run each side on its own warehouse and merge in DuckDB | Keep as the supported route |

## Estimate

| Work | Days |
| --- | --- |
| Trino form and `concatString` fixes | 1 to 2 |
| AI agent connection parameter for run-SQL and discovery | 2 to 3 |
| Dashboard filter week start per tile | 1 to 2 |
| Measure and, if needed, cache the explore connection lookup | 1 |
| Live tests on Redshift, Databricks, ClickHouse, Athena, MotherDuck | 2 to 3 |
| Additional dbt sources beyond GitHub, or document the limit | 1 to 2 |
| **Total** | **8 to 13 (2 to 3 weeks)** |

## Credentials and identifier checks

Connection details use `OrganizationWarehouseCredentialsModel.stripSensitiveCredentials`.
It removes top-level authentication fields and DuckLake catalog and storage
secrets. The switch-plan fingerprint uses the same helper. Connection lists,
explore connection metadata and agent project info return explicit metadata
fields. Tests scan serialized responses for sentinel secret values for all nine
warehouse types and all three DuckLake catalogs crossed with all four storage
types. Updates cannot change a connection's warehouse type through project or
organization credentials, with either flag value.

Cross-connection join warnings are rewritten after group compilation. A skipped
join to a model in another successful compile group names the model and both
connections. A genuinely missing model keeps the existing missing-model warning.
Compilation still succeeds when partial compilation allows the skipped join.

Hostile connection names are JSON-encoded in the agent prompt and project-info
text, and rendered as text in frontend connection/dialect badges. Tests include
quotes, backticks, semicolons, SQL comment delimiters, newlines and HTML.

The shared `quoteFieldReference` helper contains hostile field, table and alias
names for every bound SQL builder, including BigQuery backslash escaping.
There are existing gaps in the SQL paths that this spike reuses:
`ExploreCompiler.compileDimensionReference('TABLE')` wraps the table alias
without escaping its delimiter, and `getCustomSqlDimensionSql` does the same
for custom dimension identifiers. `MetricQueryBuilder.getBaseTableFromSQL`
also wraps its FROM alias without escaping. The targeted bound-builder suite
records these as 27 explicit expected failures, one per path and warehouse type. This
spike does not change these older SQL interpolation paths. The same expressions
were verified in the GitHub `main` sources on 16 October 2026. These checks do not
establish that every SQL identifier path is safe.

## Risks

- **AI quality.** Mixed dialects in one project make wrong AI SQL more likely.
  The generators now use the explore's dialect, but the agent's raw SQL stays
  on the original connection.
- **Week start and time zone drift** between connections, as described above.
- **Authentication models differ.** Each type's interactive and personal
  credential modes need their own review; the rules above are a first pass.
- **Untested types.** Five of nine types ran live. The others rely on unit
  tests and the shared SQL builder.
- **Merge queries pull both result sets into DuckDB.** Large sources cost
  memory and time.

## Reproduce

- Trino: [examples/trino-dev/README.md](../examples/trino-dev/README.md).
- BigQuery, Snowflake and DuckLake:
  [examples/mixed-warehouse-dev/README.md](../examples/mixed-warehouse-dev/README.md).
