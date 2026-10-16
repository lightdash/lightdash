# Mixed warehouse types in one project (spike)

Status: spike, October 2026. Branch `spike/mixed-warehouse-trino`.

## Goal

A project can hold extra warehouse connections. Today every extra connection
must use the same warehouse type as the original connection. Two customers want
a Snowflake project with a Trino connection next to it. They want charts from
each warehouse side by side on one dashboard. They do not need joins between
the two warehouses.

This spike tests a Trino extra connection on a Postgres project. There were no
Snowflake dev credentials. Snowflake and Postgres use the same code paths in
everything below, except where this document says otherwise.

## Summary

The query path already supports mixed types. Each explore is bound to one
connection, and every query builds its SQL with that connection's SQL builder.
The same-type rule exists only in the connection management code. The spike
removes the rule behind a feature flag, and a Trino explore and a Postgres
explore then run side by side on one dashboard.

The remaining work is in places that read the project's original connection
instead of the explore's connection: AI prompts, dbt YAML writeback, a few
frontend displays, and the week start for frontend filters. A join across
connections is already impossible, but its warning message is misleading.

Estimate for a production-ready release: 2 to 3 weeks for one engineer (see
[Estimate](#estimate)).

## What the spike changes

| Change | Where |
| --- | --- |
| New flag `mixed-warehouse-connections`, off by default | `packages/common/src/types/featureFlags.ts` |
| `canUseExtraConnectionWarehouseType`: same type, or both types in Postgres, Athena, Snowflake, Trino when the flag is on | `packages/common/src/types/warehouseConnections.ts` |
| Trino added to the multi-connection types | same file |
| Create, update and switch use the helper, also inside the locked transaction | `WarehouseConnectionService.ts`, `WarehouseConnectionSwitchService.ts` |
| A different-type extra keeps its own "require user credentials" value. A same-type extra still inherits the original's value | `WarehouseConnectionService.ts`, `extraConnectionUserCredentials.ts` |
| Add-connection modal shows a type selector when the flag is on | `ConnectionsPanel.tsx`, `ConnectionFields.tsx`, `WarehouseSettingsForm.tsx` |
| Trino connects without a password: Lightdash sends only the user header. The dbt target uses `method: none` | `TrinoWarehouseClient.ts`, `dbt/targets/trino.ts` |
| Bug fix: the switch plan reported the extra's type as the original's type | `WarehouseConnectionSwitchService.ts` |
| Local Trino warehouse and dbt-trino project | `examples/trino-dev/` |

## What works

Every row was tested on a local instance against a real Trino 479 and the
Postgres Jaffle shop project. "Verified" means the result was observed.

| Area | Result | Evidence |
| --- | --- | --- |
| Switch to multi-connection with a Trino extra | Verified | Preview tests the Trino connection, then switch creates it |
| Compile | Verified | The Trino source compiles with the Trino client. Explores get `targetDatabase: trino`, Trino quoting and `DATE_TRUNC('WEEK', ...)` |
| Explore queries | Verified | Metrics (sum, count distinct, average), joins inside the Trino project, all time intervals |
| Filters | Verified | Relative date ("in the past 60 years"), equals, starts with |
| Custom SQL dimension | Verified | Trino functions (`year()`, `\|\|`, `cast(... as varchar)`) |
| Table calculations | Verified | SQL and formula. The formula compiles to the Trino dialect |
| Date zoom | Verified | On both explores |
| Dashboard | Verified | Trino and Postgres tiles side by side. Each tile shows its connection name |
| Dashboard filters | Verified | A filter on a Trino field applies to Trino tiles only. A filter on a Postgres field applies to Postgres tiles only |
| SQL runner | Verified | Each connection runs its own SQL. A Postgres table queried on Trino fails with a clear warehouse error |
| Merge queries across connections | Verified | Each source runs on its own warehouse and DuckDB merges the results. A full join returns rows from both warehouses |
| Results cache | Code reading | The cache key includes the connection (`QueryHistoryModel.ts`) |

Why it works: `WarehouseConnectionRouter` resolves the explore's
`warehouse_connection_uuid`. `getSqlBuilderForExplore` builds the SQL builder
from that connection's credentials. Field SQL is compiled at deploy time with
the client of the explore's own connection (`MultiConnectionCompiler.compileExtraGroup`).

## What breaks or is wrong

### Caused by mixed types

1. **AI uses the original connection's dialect.** The table calculation
   generator and the custom dimension generator read
   `project.warehouseConnection.type` (`ee/services/AiService/AiService.ts:744`,
   `:801`). On a Trino explore in a Postgres project they ask the model for
   Postgres SQL. The AI agent's run-SQL prompt and `getProjectInfo` tool also
   describe only the original connection (`AiAgentService.ts:15970`,
   `AiAgentToolsService.ts:4876`). Not tested live.
2. **dbt YAML writeback uses the original dialect.**
   `GitIntegrationService.getWarehouseSqlBuilder` asks for the `original`
   binding (`GitIntegrationService.ts:518`). A custom dimension that a user
   writes back from a Trino explore gets Postgres SQL. Not tested live.
3. **Joins across connections fail silently.** Each connection compiles in its
   own group, so a Trino model that joins a Postgres model cannot resolve the
   join. Partial compilation then skips the join with this warning: "the model
   is not available in this project". The model is in the project, on another
   connection. Verified.
4. **The frontend uses the original connection for some displays.**
   - Compiled SQL formatting and highlighting: `SqlCard.tsx:95`, `RenderedSql.tsx:43`.
   - The formula editor gate: `TableCalculationModal.tsx:195`. This is harmless
     today, because all four allowed types support formulas.
   - The week start for frontend relative-date filters: `dashboardFilters`,
     `FiltersCard`, `useDataForFiltersProvider` and others. The backend uses the
     explore's connection, so the UI and the SQL can disagree when the two
     connections set different week starts.
5. **A dbt source location is checked against the original connection**
   (`ProjectDbtSourcesService.ts:160`). A Trino source with a Trino catalog
   location can be refused because Postgres cannot express it. Not tested.
6. **Changing an existing extra connection's type.** The prototype lets an
   update change the type (`WarehouseConnectionModel.ts`). The explores keep
   the old dialect until the next compile. Production should refuse a type
   change on update.
7. **Pre-aggregates and personal credentials.**
   - Pre-aggregate explores generated at deploy use the original connection's
     week start (`ProjectService.ts:5758`, `DeployService.ts:319`).
   - The navbar user-credential switcher keys on the original type
     (`UserCredentialsSwitcher.tsx`).

   Neither was tested.

### Not caused by mixed types

- **Custom bin dimensions fail on Trino.** The base `concatString` emits
  `CONCAT(number, ' - ', number)`, and Trino rejects non-varchar arguments. A
  Trino-only project fails the same way. Athena is likely affected too.
- **Trino needs a password.** Lightdash always sent basic auth, and an
  unauthenticated Trino rejects that over HTTP. The spike fixes the client and
  the dbt target. The connection form still requires a password.
- **Additional dbt sources are GitHub only.** The spike used a local-only edit
  to attach a manifest source. The edit is not committed.

## Proposed design

Keep the current model: one explore, one connection, and a dialect fixed at
compile time. Do not add query federation.

1. **Gate.** Keep `mixed-warehouse-connections` as an organisation-level flag
   on top of the multi-connection flag and licence. Allow
   Postgres, Athena, Snowflake and Trino. Add more types one at a time with a
   test pass each. BigQuery is the next candidate. It is not a multi-connection
   type yet, even for same-type extras, and its OAuth personal credentials
   differ from Trino's user and password.
2. **Connection type is fixed after create.** Refuse a type change on update.
   To change a type, the user creates a new connection and rebinds the source.
3. **Per-explore dialect everywhere.** Add one helper that returns the bound
   connection's type and SQL builder for an explore (the router already
   resolves this). Use it in:
   - the AI table calculation and custom dimension generators;
   - dbt writeback;
   - the AI agent, which should list each connection with its dialect and
     route run-SQL to a named connection.
4. **Frontend dialect from the explore.** Return the bound connection type on
   the explore summary. Use it for SQL display, the formula gate and the week
   start. Show the connection type next to the connection name in the explore
   header and the custom SQL editors.
5. **Join guardrail.** At compile time, when a join target exists in a
   different compile group, give an explicit error:
   `Join "customers" targets a model on connection "Postgres". Joins across connections are not supported. Use a merge query or move the model.`
   Make it an error, not a skipped join, so the explore does not silently lose
   fields.
6. **Custom SQL guardrail.** Do not block custom SQL. It runs on one connection
   and fails with a warehouse error when it uses the wrong dialect or table. Add
   these instead:
   - show the dialect in the custom SQL dimension, SQL table calculation and
     SQL runner editors;
   - refuse a virtual view (a SQL runner query saved as an explore) unless it
     binds to the connection it ran on;
   - keep merge queries as the supported way to combine data across
     connections.
7. **Trino as a first-class extra.**
   - Make the password optional in the form.
   - Mirror the extra-connection credential handling from `PostgresForm`.
   - Fix `concatString` for Trino and Athena.
   - Decide whether additional dbt sources stay GitHub only.

## Guardrails to block

| Case | Today | Proposed |
| --- | --- | --- |
| Join between models on different connections | Join skipped with a misleading warning | Explicit compile error that names both connections |
| Explore names that clash across connections | Refused at compile (`MultiConnectionCompiler.groupExplores`) | Keep |
| Changing an extra connection's type | Allowed in the prototype | Refuse |
| Custom SQL in the wrong dialect | Fails at query time | Keep the failure. Show the dialect in the editor |
| Virtual view saved from the SQL runner | Not tested | Bind to the connection it ran on |
| Types outside Postgres, Athena, Snowflake, Trino | Refused | Keep until each type is tested |

## Estimate

| Work | Days |
| --- | --- |
| Harden the gate, refuse type changes, tests | 1 |
| Per-explore dialect helper, AI generators, dbt writeback | 2 to 3 |
| AI agent: list connections with their dialects, route run-SQL | 2 |
| Frontend: explore dialect, SQL display, week start, editor dialect hints | 2 |
| Join guardrail as an explicit compile error | 1 |
| Trino polish: optional password, form handling, `concatString` | 1 to 2 |
| Snowflake plus Trino test pass with real credentials, API tests | 2 |
| **Total** | **11 to 13 (2 to 3 weeks)** |

## Risks

- **AI quality.** Mixed dialects in one project make AI-generated SQL more
  likely to be wrong. This risk is the largest, because users see the error
  only at query time.
- **Week start and time zone drift.** Two connections can set different week
  starts and data time zones. Dashboards with relative-date filters can then
  show different date ranges for tiles that look alike.
- **Credential models differ.** Snowflake OAuth, Trino LDAP or JWT, and
  personal credentials have different shapes. The prototype stops a mixed-type
  extra from inheriting "require user credentials". User-credential screens
  that assume one type need a review.
- **Snowflake specifics are untested.** Snowflake upper-cases identifiers and
  uses OAuth. These were not tested with a Trino extra.
- **Server-side dbt for Trino.** A GitHub source on a Trino connection runs
  dbt-trino on the server. Production images include it, but this path was
  not run locally.
- **Merge queries pull both result sets into DuckDB.** Large legs cost memory
  and time. This is the existing behaviour, but mixed projects will use merges
  more.

## Reproduce

See [examples/trino-dev/README.md](../examples/trino-dev/README.md).
