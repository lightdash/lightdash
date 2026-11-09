# QueryHistoryModel

`compiled_sql` and `fields` are the columns a visibility rule protects (a chart the viewer cannot open, an embed that hides SQL). Their consumers:

- `mapQueryHistoryRowToListItem`: title and subline via `getSqlQueryTitle`, `getSqlFirstLine`, `getSemanticQuerySummary`, plus `compiledSql` on the list item.
- `buildUserHistoryQuery` search predicates: `compiled_sql` and `fields::text` ILIKE, an oracle over the same columns.
- Both count queries in `getUserHistoryCounts` (trigger and window) build on `buildUserHistoryQuery`, so they inherit its predicates.
- Embed `redactFieldSql` in `utils/embedCompiledSql.ts` strips field SQL for embed viewers.

Rule: a row-visibility rule over query history is written once, as a predicate shared by the Knex builder (`buildUserHistoryQuery`) and the row mapper (`mapQueryHistoryRowToListItem`), so a new provenance kind (`chartUuid`, `documentSource`, `underlyingDataSourceQueryUuid`, next `composerChartSource`) touches one place and search, counts and projection agree.
