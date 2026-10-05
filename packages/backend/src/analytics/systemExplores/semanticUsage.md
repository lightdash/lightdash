# Semantic usage

`semantic_usage` shows direct metric and dimension references from completed
semantic query attempts. Select **Field label**, **Explore name**, **Role**, and
**Total queries** to see what gets used. Add **Workload origin**, app/chart names,
user name or day to break usage down. Counts are distinct queries, not sums of
field-reference rows: selecting and filtering the same field counts once.

Example body for `POST /api/v2/projects/{analyticsProjectUuid}/query/metric-query`:

```json
{
  "context": "api",
  "query": {
    "exploreName": "semantic_usage",
    "dimensions": ["semantic_usage_explore_name", "semantic_usage_field_label", "semantic_usage_field_id", "semantic_usage_workload_origin"],
    "metrics": ["semantic_usage_total_queries", "semantic_usage_unique_users", "semantic_usage_unique_charts"],
    "filters": {},
    "sorts": [{"fieldId": "semantic_usage_total_queries", "descending": true}],
    "limit": 100,
    "tableCalculations": []
  }
}
```

## Capture and compatibility

- Capture runs after successful compilation on the normal execution path, only
  with `USAGE_EVENTS_ENABLED`. Metadata browsing and compile-only requests do
  not count. Preview projects remain excluded by the existing usage sink.
- The same server-owned metadata is persisted for background workers. Result
  cache hits and execution errors after compilation count as observed use.
  Attempts that never emit `query.completed` are outside this model.
- Field IDs are project-scoped model/table identifiers. A display-label rename
  retains identity; renaming an identifier creates a new identity. Definition
  hashes version the captured field expression/type/filters without storing SQL
  in the usage stream. They are not a transitive dependency or deployment hash.
  Custom metrics/dimensions are distinguished from modeled fields.
- Selected/group/filter/sort references are direct runtime references, not the
  dependency graph inside metric expressions, raw SQL, table calculations or
  access-policy predicates. App, agent and MCP attribution uses the existing
  server-owned query context; SQL execution on those surfaces still has unknown
  semantic lineage.
- `captured` means the direct references were captured; `partial` means some were
  unsupported or omitted at the 500-reference / 64-KiB per-query limit.
  `unavailable` covers SQL-only queries and telemetry failures; `not_captured`
  identifies older records. Null-field rows retain these queries in totals.
  No rows for a field do **not** establish that it is unused or safe to delete.

References are two additive columns on `query_events`; there is no new event
stream, compaction job, database migration, model-version invalidation or
historical backfill. The existing nightly job writes new columns for incoming
raw files. Existing Parquet files read as null through the typed manifest, and
unchanged user summaries stay unchanged. The Explore expands references only
when queried and deduplicates repeated query delivery. Existing Query events
and User activity metric definitions remain unchanged.

Field metadata is stripped before RudderStack and Prometheus event metrics.
No query SQL, result rows or filter values are included. Existing analytics
project access checks and organization-scoped manifests govern reads. Name
joins are organization-scoped; app joins also include project identity.

Install/sync the managed analytics project to expose the new Explore. Dashboard
definitions are deliberately unchanged in this PR.

## Focused verification

```sh
pnpm -F backend exec vitest run \
  src/utils/QueryBuilder/semanticQueryUsage.test.ts \
  src/analytics/systemExplores/semanticUsage.test.ts
```

The native test runs projected events through the production compaction SQL
into real Parquet, mixes a legacy file without the new columns, and executes
compiled Explore queries. It checks distinct totals, roles, cache hits, errors,
anonymous users, organization-scoped name joins and repeat compaction.
