# Mixed warehouse connections

A project with [multiple warehouse connections](https://docs.lightdash.com/workspace-admin/multiple-warehouse-connections)
can hold connections of different warehouse types, for example a Snowflake
primary with Trino and BigQuery extras. Each explore runs on one connection and
uses that connection's SQL dialect everywhere.

`multi-connection-projects` gates multiple connections and mixed types
together, behind the Enterprise multi-connection licence check. The flag is off
by default. The earlier `mixed-warehouse-connections` flag is retired and no
longer read. With the flag off, no project can add a connection or switch;
existing extras of a switched project keep working and follow the original
same-type rules when edited.

## Which types can be mixed

`packages/common/src/types/warehouseConnections.ts` owns the rules:

- `MULTI_CONNECTION_SUPPORT` is a `Record<WarehouseTypes, boolean>` for the
  flag-off allowlist. A new warehouse type does not compile until someone
  decides its value.
- `supportsMultipleConnections(type, mixedTypesEnabled)` and
  `canUseExtraConnectionWarehouseType` take the resolved
  `multi-connection-projects` flag as a required argument. With the flag on,
  every `WarehouseTypes` value is allowed.
- `isUserConnectableWarehouseConnection` refuses the backend-provisioned DuckDB
  variants (`EMBEDDED` Playground and `ANALYTICS`) as a primary or an extra.

The backend gate (`multipleConnectionsGate.ts`), `WarehouseConnectionService`
and `WarehouseConnectionSwitchService` resolve the flag for the requesting user
and the project's organisation, then apply these helpers. The frontend reads the
same flag with `useServerFeatureFlag` to show the type selector in the
add-connection dialog.

## Connection rules

- **Type is fixed after creation.** An update that changes the warehouse type
  is refused before the connection test and again under the credential row
  lock. With the flag off, the same-type rule refuses it first, with the
  existing message. `WarehouseConnectionModel` never writes `warehouse_type`
  on update.
- **Authentication.** `extraConnectionAuthentication.ts` decides per type and
  mode. With the flag on, Snowflake external browser and OAuth authorisation
  code, BigQuery SSO and Redshift browser IAM are refused, because an extra
  connection compiles dbt with its stored shared credentials. With the flag
  off, only Snowflake external browser is refused, as before. Snowflake `None`
  requires personal credentials: on the primary for a Snowflake project, as
  before, or on the extra itself under a primary of another type.
- **Credential inheritance.** A same-type extra inherits the primary's
  "require user credentials" setting, as before. A different-type extra keeps
  its own setting.
- **Database listing.** `listAllDatabases` and `additionalDatabases` stay
  limited to Postgres and Athena. With the flag on, other types refuse these
  settings (`extraConnectionSettings.ts`) instead of ignoring them. With the
  flag off, they are stored and ignored, as before.
- **Secrets.** Connection details pass through
  `OrganizationWarehouseCredentialsModel.stripSensitiveCredentials`, which also
  removes DuckLake catalog passwords and storage keys. The switch plan, the
  explore connection metadata and the agent project info return explicit
  non-secret fields only.

## Dialect per connection

The query path was already bound to one connection per explore:
`WarehouseConnectionRouter` resolves `cached_explore.warehouse_connection_uuid`,
and `getSqlBuilderForExplore` builds the SQL builder from that connection's
credentials. `MultiConnectionCompiler` compiles each connection's dbt sources
with that connection's warehouse client.

Places that used to read the primary's type now read the explore's connection:

| Area | Code |
| --- | --- |
| AI table calculation and custom dimension generators | `AiService` resolves by the canonical `exploreName` in the request. Requests without it fall back to the primary's dialect |
| AI dbt writeback | `AiWritebackService` uses the selected dbt source's bound connection (`ProjectModel.getDbtSourceWarehouseType`) |
| dbt YAML writeback | `GitIntegrationService` builds the SQL builder from the explore's binding |
| dbt source location check | `ProjectDbtSourcesService` validates against the source's bound connection |
| Pre-aggregate week start at deploy | `ProjectService.getDeployStartOfWeekByExplore` uses the week start of an extra connection for its explores when the flag is on; explores on the primary, and every explore with the flag off, keep the project value |
| AI agent | `getProjectInfo` lists every connection with its type, and the run-SQL prompt states each dialect. Raw SQL still runs on the primary |
| Explore API | `ApiExploreResults.warehouseConnection` returns `{ warehouseConnectionUuid, warehouseType, startOfWeek }` |
| Frontend | `useExploreWarehouseConnection` feeds SQL display, the formula editor gate, editor dialect labels, explorer filters, merge-query source filters, reference lines and scheduler chart overrides. The explore's week start applies only with the flag on; with it off, these use the project week start |

## Joins and dbt refs across connections

Each connection compiles as its own group, so a model can only join or `ref`
models compiled on the same connection.

- A join to a model on another connection is skipped by partial compilation.
  `MultiConnectionCompiler` rewrites the warning to name the model and both
  connections. With the multi-connection flag off, the warning is unchanged.
- With [cross-source dbt refs](../examples/cross-source-dbt-refs/README.md)
  on, refs resolve inside one group. When a group fails because it refs a dbt
  project that an earlier, successful group compiled, and both
  `multi-connection-projects` and `cross-source-dbt-refs` are on, the
  compile warning names the project, its dbt source and both connections. The
  failed connection keeps its previous explores. With the multi-connection flag off, the
  message is unchanged.
- Merge queries run each source on its own warehouse and join the results in
  DuckDB, so they are the supported way to combine data across warehouses.

## Limits

- The AI agent's raw SQL and warehouse discovery tools run on the primary
  connection, because they have no connection selector.
- Dashboard-wide filter UI (filter bar, filter settings, temporary filter
  pills and scheduler dashboard filters) uses the primary's week start, since a
  dashboard filter can target fields from several explores. Each tile's query
  uses its own connection's week start.
- `getExploreResponse` resolves the bound connection on each request.
- Additional dbt sources accept GitHub connections. With
  `multi-connection-projects` on, `ProjectDbtSourcesService` also accepts
  `manifest` sources, so an uploaded manifest can run on an extra connection.
  With the flag off, the GitHub-only rule and its message are unchanged.
- Three identifier paths that predate this feature wrap identifiers without
  escaping embedded delimiters: `ExploreCompiler.compileDimensionReference('TABLE')`,
  `MetricQueryBuilder.getBaseTableFromSQL` and `getCustomSqlDimensionSql`.
  `boundConnectionSqlBuilder.test.ts` records them as expected failures for
  every warehouse type.

## Testing

- Unit tests cover every ordered pair of warehouse types with the flag on and
  off, compared against an independent copy of the flag-off rules
  (`warehouseConnections.test.ts`), the SQL builder for an extra of each type
  under a primary of another type (`boundConnectionSqlBuilder.test.ts`),
  authentication per type and mode, secret redaction for every type and every
  DuckLake catalog and storage combination, and cross-connection refs
  (`crossConnectionRefs.test.ts`).
- Real-schema integration tests run the connection service, switch and SQL
  runner flows with the flag on and off.
- [`scripts/mixed-warehouse-scale-test`](../scripts/mixed-warehouse-scale-test/README.md)
  drives a local instance through the API across 20 or more projects: every
  available warehouse as the original with every other as an extra, live
  connection changes, failure cases, cross-source refs, dashboards with a
  scheduled delivery, previews, CLI deploy, and a flag-off pass.
- Local fixtures: [Trino](../examples/trino-dev/README.md), and
  [Postgres, DuckLake, ClickHouse, BigQuery, Snowflake, Athena and a Redshift
  stand-in](../examples/mixed-warehouse-dev/README.md).
