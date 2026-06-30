# Pivoting in Lightdash

## Purpose & scope

Pivoting touches five packages and a two-phase architecture, and the detailed
mechanics live in package-level `CLAUDE.md` files. This doc maps the whole
pipeline from one place so you can find your way around, then drill into the
authoritative source for each stage.

Keep this file thin. When the deep mechanics change, update the linked `CLAUDE.md`
— not this overview.

## The one idea: pivoting is two-phase

The most common source of confusion is assuming the SQL "does the pivot". It does
not. Pivoting happens in two distinct phases:

- **Phase 1 — SQL adds index columns.** `PivotQueryBuilder` wraps the base query
  and appends two extra columns to every output row: `row_index` (which pivot row
  the values belong to) and `column_index` (which pivot column), both numbered with
  `DENSE_RANK()` window functions, plus a `total_columns` count. For example, all
  rows for `2026-01-01` get `row_index = 1`, and all `completed` rows get
  `column_index = 1`. These indexes are how Phase 2 knows where each value goes in
  the grid. The query does **not** spread anything — the warehouse still returns
  **flat rows**, now carrying those indexes.
- **Phase 2 — TypeScript spreads, reshapes, and renders.** The backend streaming
  transform groups the flat rows by `row_index` and spreads their values into wide
  columns; `common` reshapes that into a `PivotData` structure; the frontend
  renders it.

Everything below hangs off this split.

## Pipeline at a glance

| Stage                     | What happens                                                                                                        | Key file(s)                                                                                                          | Authoritative deep dive                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1. Config                 | A chart's config becomes a SQL execution spec (`PivotConfiguration`).                                               | `packages/common/src/pivot/derivePivotConfigFromChart.ts`, `packages/common/src/types/pivot.ts`                      | (self-documented in code comments)                                                                                |
| 2. SQL generation         | Wraps the base query; tags each row with `row_index` / `column_index` via `DENSE_RANK()`. Still flat rows out.      | `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts`                                                       | [`QueryBuilder/CLAUDE.md`](../packages/backend/src/utils/QueryBuilder/CLAUDE.md) (three CTE modes, anchor system) |
| 3. Execute + transform    | Streams warehouse rows to S3 as JSONL; **spreads** value columns into wide columns keyed by the group-by values.    | `AsyncQueryService.runQueryAndTransformRows`, `packages/backend/src/services/AsyncQueryService/getPivotedColumns.ts` | [`AsyncQueryService/CLAUDE.md`](../packages/backend/src/services/AsyncQueryService/CLAUDE.md)                     |
| 4. Reshape                | Turns the flat pivoted rows into the `PivotData` matrix, then flattens it for the table.                            | `packages/common/src/pivot/pivotQueryResults.ts` (`convertSqlPivotedRowsToPivotData`, `retrofitData`)                | [`PivotTable/CLAUDE.md`](../packages/frontend/src/components/common/PivotTable/CLAUDE.md)                         |
| 5. Render                 | Renders `PivotData` / `pivotColumnInfo` as a TanStack table.                                                        | `packages/frontend/src/components/common/PivotTable/index.tsx`                                                       | [`PivotTable/CLAUDE.md`](../packages/frontend/src/components/common/PivotTable/CLAUDE.md)                         |
| 6. CSV export (side-path) | Reloads the JSONL and exports CSV using the same pivot metadata — a parallel consumer, not part of the render path. | `packages/backend/src/services/PivotTableService/PivotTableService.ts`                                               | —                                                                                                                 |

**Second config entry point:** the SQL Runner builds a `PivotConfiguration`
directly from its own viz config (`packages/common/src/types/sqlRunner.ts`),
separate from the chart/explore-derived path in Stage 1. Stages 2–6 are shared.

## Worked example

Follow one row end-to-end. Chart: index = `order_date`, pivot (group-by) =
`status` (values `completed`, `shipped`), value = `revenue` aggregated with `sum`.

**Phase 1 — SQL skeleton (simplified).** `PivotQueryBuilder` wraps the base query
and adds the index columns:

```sql
SELECT
  order_date,
  status,
  revenue_sum,
  DENSE_RANK() OVER (ORDER BY order_date) AS row_index,
  DENSE_RANK() OVER (ORDER BY status)     AS column_index,
  ...                                     AS total_columns
FROM base_query
```

**Flat rows returned by the warehouse** (still one row per index×column — nothing
is spread yet):

| order_date | status    | revenue_sum | row_index | column_index | total_columns |
| ---------- | --------- | ----------- | --------- | ------------ | ------------- |
| 2026-01-01 | completed | 100         | 1         | 1            | 2             |
| 2026-01-01 | shipped   | 40          | 1         | 2            | 2             |
| 2026-01-02 | completed | 80          | 2         | 1            | 2             |
| 2026-01-02 | shipped   | 60          | 2         | 2            | 2             |

**Phase 2 — spread (Stage 3).** `runQueryAndTransformRows` groups the rows sharing
a `row_index` and emits one wide row when `row_index` changes. The value column
`revenue_sum` is suffixed with the group-by raw value (`getValueColumnFieldName`
gives `revenue_sum`, then `_<status>`), producing one JSONL row per `row_index`:

```json
{ "order_date": "2026-01-01", "revenue_sum_completed": 100, "revenue_sum_shipped": 40 }
{ "order_date": "2026-01-02", "revenue_sum_completed": 80,  "revenue_sum_shipped": 60 }
```

**Phase 2 — reshape (Stage 4).** `convertSqlPivotedRowsToPivotData` turns those
rows into `PivotData`: each `status` value becomes a column header, each
`order_date` a row index value, and each `revenue_sum_*` value a `dataValues` cell.

**Rendered pivot table (Stage 5).** The frontend renders the pivot values
(`status`) as the column headers:

|                | **completed** | **shipped** |
| -------------- | ------------: | ----------: |
| **2026-01-01** |           100 |          40 |
| **2026-01-02** |            80 |          60 |

## Mini-glossary

Cross-cutting terms only — fuller definitions live in the linked package docs.

- **`row_index` / `column_index`** — extra columns added by `DENSE_RANK()` that
  number a row's pivot row and pivot column. The hook that lets Phase 2 spread flat
  rows into a matrix.
- **`PivotConfig` (UI) vs `PivotConfiguration` (SQL)** — `PivotConfig` is the
  user-facing chart layout; `PivotConfiguration` is the low-level SQL execution
  spec derived from it (column/aggregation/sort specs).
- **`indexColumn` / `groupByColumns` / `valuesColumns`** — the row dimensions, the
  pivot (column) dimensions, and the metrics/aggregations being spread.
- **`sortOnlyColumns` & `sortOnlyDimensions` vs `passthroughDimensions`** — the
  most-confused trio. The first two carry _hidden, sorted_ fields through SQL so
  they influence ordering without being displayed; `passthroughDimensions` carry
  _hidden, non-sorted_ fields through `GROUP BY` so richText/image templates can
  still reference them.
- **`metricsAsRows`** — layout flag; when true, metrics fan out down the rows
  instead of across the columns (affects the column-count math).
- **anchor (column / row)** — the reference column/row used when sorting a pivot by
  a metric value; see `QueryBuilder/CLAUDE.md`.
- **`PivotData` / `pivotColumnInfo`** — the matrix structure (`headerValues`,
  `indexValues`, `dataValues`, totals) and the flattened TanStack column metadata.
- **`NULL_PIVOT_KEY`** — collision-safe placeholder used in a value column's
  suffix when a group-by value is `null`, so it doesn't collide with the base column.

## Related docs

Deep dives (authoritative — update these, not this file):

- [`packages/backend/src/utils/QueryBuilder/CLAUDE.md`](../packages/backend/src/utils/QueryBuilder/CLAUDE.md) — SQL generation, CTE modes, anchors.
- [`packages/frontend/src/components/common/PivotTable/CLAUDE.md`](../packages/frontend/src/components/common/PivotTable/CLAUDE.md) — `PivotData` structure and rendering.
- [`packages/backend/src/services/AsyncQueryService/CLAUDE.md`](../packages/backend/src/services/AsyncQueryService/CLAUDE.md) — async execution and S3 streaming.
