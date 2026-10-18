<summary>
SQL Runner feature: write a statement, run it, look at the rows, draw them
with the classic chart stack (`ChartConfig` + `@lightdash/visualization`),
and save the result as a saved chart whose pipeline is the statement as one
SQL node.
</summary>

<howToUse>
The page has two tabs over one result set:

- **SQL tab**: `runSqlQuery` (store/thunks.ts) submits the statement through
  `executeSqlQuery` (utils/executeSqlQuery.ts) and the raw rows are read with
  `useInfiniteQueryResults` into `SqlResultsTable`.
- **Chart tab**: `SqlRunnerVisualizationProvider` (viz/) wraps the page in the
  explorer's `VisualizationProvider` with the result columns as the chart's
  fields (`buildSqlRunnerItems`, field ids `sql_<column>`) and the redux
  `chartConfig`. The sidebar renders the explorer's config panel for the
  chosen chart type (`SqlRunnerVizConfigPanel`). A grouped chart re-runs the
  statement pivoted on the warehouse (`useSqlRunnerPivotQuery`).

Saving (`SaveSqlChartModal`) builds a `CreateSavedChart` with
`buildSqlRunnerSavedChartVersion` (viz/sqlRunnerSavedChart.ts) and posts it
to the saved charts endpoint. Editing a saved chart (`/sql-runner/:slug`)
loads the chart with `useSavedQuery` and `getPipelineSqlChartSource`; a chart
whose pipeline is not one SQL node is sent to its chart page instead.
</howToUse>

<codeExample>

```typescript
// Run the statement (SQL tab, and the rows the Chart tab draws)
dispatch(
    runSqlQuery({
        sql: 'SELECT status, amount FROM jaffle.payments',
        limit: 500,
        projectUuid,
        parameterValues,
    }),
);

// The chart config is the explorer's
dispatch(setChartConfig({ type: ChartType.CARTESIAN, config: {...} }));
dispatch(setPivotDimensions(['sql_status']));
```

</codeExample>

<importantToKnow>
- The store (store/index.ts) holds `sqlRunner` plus an empty `explorer`
  slice; the explorer's config panels read the explorer slice and must find
  one even though the SQL runner never writes to it.
- `chartConfig` in the slice is an explorer `ChartConfig`. Share links and
  charts saved before the fold carry the old SQL runner config; it is
  converted on read (`convertLegacyVizChartConfig`, `useSqlRunnerShareUrl`).
- Aggregation lives in the SQL. The chart draws the rows the statement
  returns; there is no per-series aggregation in the config.
- Multi-connection projects bind the statement to a warehouse connection
  (`multiConnection/`); the connection travels with the saved pipeline node.
</importantToKnow>

<links>
- Chart stack: @/packages/frontend/src/features/sqlRunner/viz/
- Redux slice: @/packages/frontend/src/features/sqlRunner/store/sqlRunnerSlice.ts
- Query execution: @/packages/frontend/src/features/sqlRunner/utils/executeSqlQuery.ts
- Saved SQL charts as pipelines: @/packages/common/src/types/sqlChartPipeline.ts
- Migration notes: @/docs/viz-unification/migration.md
</links>
