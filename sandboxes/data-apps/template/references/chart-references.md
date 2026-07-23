# Referenced metric queries (charts attached to the prompt)

> Read this when the prompt lists referenced charts (files under `/tmp/metric-queries/*.json`).

## Contents

- What the metric-query JSON files contain and how to map them to SDK calls
- Linked vs. copied charts (`savedChart` semantics)
- Linked charts must be data-driven and crash-proof (`ErrorBoundary`)
- Field-id mapping rules (qualified names, joined tables, table calculations)

The user may reference saved charts from their project by pasting chart UUIDs in their
prompt. When they do, structured metric query files are available at
`/tmp/metric-queries/*.json`.

Each file contains:
- `chartName` / `chartDescription` — what the chart shows and why
- `exploreName` — which explore (dbt model) the query targets
- `metricQuery.dimensions` — dimension field IDs used for grouping
- `metricQuery.metrics` — metric field IDs used for aggregation
- `metricQuery.filters` — filter rules applied to the query
- `metricQuery.sorts` — sort order
- `metricQuery.limit` — row limit
- `metricQuery.tableCalculations` — computed columns (may be empty)
- `chartConfig` — the saved visualization config. `chartConfig.type` tells you
  what to render: `big_number` (KPI stat), `cartesian` (bar/line/area/scatter —
  the series type is inside `chartConfig.config.eChartsConfig.series`), `table`,
  `pie`, `funnel`, `treemap`, `gauge`, `map`, `sankey`, or `custom`. Reproduce
  the chart type instead of guessing one from the data shape; deeper styling
  details inside the config are optional inspiration, not a spec.
- `pivotConfig` — pivot dimension field IDs when the saved chart pivots its
  results (`null` otherwise). A pivoted table/bar means one series per value of
  the pivot dimension.

**How to use these:**
1. Read the JSON file(s) to understand what data the user wants in their app
2. Cross-reference the field IDs against the dbt YAML catalog at
   `/tmp/dbt-repo/models/schema.yml` for field descriptions, types, and relationships
   between fields — this helps you understand how the referenced charts connect to the
   user's overall prompt
3. Map fields to SDK calls:
   - `chartName` → `query(exploreName).label(chartName)` — **always set the label**
   - `metricQuery.dimensions` → `.dimensions([...])`
   - `metricQuery.metrics` → `.metrics([...])`
   - `metricQuery.filters` → `.filters([...])`
   - `metricQuery.sorts` → `.sorts([...])`
   - `metricQuery.tableCalculations` → `.tableCalculations([...])` — pass through as-is if present
4. These are starting points — adapt them based on the user's prompt. You may combine
   multiple referenced queries, add/remove fields, or adjust filters as needed.

### Linked vs. copied charts

Each file has a `linked` boolean and a `chartUuid`:

- **`linked: true`** — the user wants this chart **live**. Import `savedChart`
  from `@lightdash/query-sdk` (exactly like `query`) and render with
  `savedChart("<chartUuid>").label("<chartName>")` instead of an inline
  `query(...)`. **There is NO `lightdash` object — call `savedChart(...)` and
  `query(...)` directly; a `lightdash.` prefix is undefined and crashes the app.**
  `savedChart(...)` is chainable like `query(...)` — always `.label()` it. Its
  query SHAPE is **fixed by the saved chart**: `.label()`, `.limit()`,
  `.parameters()` and `.filters()` apply, but `.dimensions()/.metrics()/.sorts()`
  are IGNORED. `.filters()` NARROWS the chart server-side (your filters are
  ANDed onto the chart's own filters — you cannot widen or replace them), so
  interactive filter controls on a LINKED chart work: pass the user's selection
  via `.filters()` and the query re-runs. Filter field ids on a linked chart are
  the QUALIFIED ids exactly as they appear in the result columns (e.g.
  `orders_status`) — do NOT strip the explore prefix like you would for
  `query(...)`. `.filters()` accepts DIMENSION fields only — filtering on a
  metric column fails the whole run with a 400; if the user needs a metric
  threshold, that belongs in the saved chart itself. Never filter a linked chart's rows client-side in JS — the rows
  are limit-truncated, so client-side filtering silently shows wrong data. If
  the user needs a different SHAPE (other dimensions/metrics), build an inline
  `query(...)` instead of linking. Do NOT copy the metricQuery.
  The rows are keyed by the chart's field ids (as listed under
  `metricQuery.dimensions` / `metricQuery.metrics`); read the returned `columns`
  to know what's available. The listing line marks these with "LINKED".
- **`linked: false`** — copy as today: build an inline `query(exploreName)...`
  from the metricQuery.

A linked chart stays in sync with Lightdash and appears in the Queries panel
like any other query. If it can't be run (deleted / no access), the app should
show its normal error state — don't fabricate data.

### Linked charts must be DATA-DRIVEN and crash-proof

A linked chart's query can change in Lightdash *after* the app is generated (the
user swaps the metric, renames a field, etc.). Your generated code MUST survive
that. A `TypeError` here (`row.x` undefined, `.toFixed()` on undefined, a stale
field id) is UNACCEPTABLE — it blanks the whole app.

For every LINKED chart, render from the **runtime data**, never hardcoded field
ids or labels:

- **Discover fields from `columns` by TYPE, not by name — and DON'T assume a
  date.** `useLightdash` returns `columns: { name, label, type }[]`. The
  **category / x-axis is the dimension** — the non-numeric column: a
  `date`/`timestamp` → a time series (line), a `string` → categories (bar /
  ranking / table). The **series are the `number` columns** (the metrics). Pick
  whatever dimension exists — a string dimension (customer, status, region) is
  completely normal, NOT an error. Never hardcode a field id like
  `orders_fulfillment_rate`.
- **Titles / axis labels from `columns[].label`** — do NOT hardcode
  "Fulfillment Rate"; read the metric column's `label` so a metric swap in
  Lightdash relabels the app automatically.
- **Format every value with `format(row, column.name)`** — it renders `%` vs
  `$` vs dates correctly per field, so a units change follows automatically.
- **Guard aggregations; fall back only as a LAST resort.** No `Math.max(values)`
  on a possibly-empty array (yields `-Infinity`), no divide-by-zero, no
  `.toFixed()` on a maybe-undefined value → render a neutral `—` for a single
  missing value. Show a whole-chart "no data / unexpected shape" fallback ONLY
  when the query truly returns **no rows** or **no numeric column at all** — NOT
  because the dimension is a string, or the metric changed. Bailing on valid
  categorical data is a bug, not graceful degradation.

Then WRAP each data/chart component in `<ErrorBoundary>` (from `@/lib/ErrorBoundary`):

```jsx
import { ErrorBoundary } from '@/lib/ErrorBoundary';

<ErrorBoundary>
    <RevenueChart />
</ErrorBoundary>
```

so if a linked chart's shape changed and a component still can't render it, that
ONE card shows a fallback while the rest of the app keeps working.

**What "live" covers:** new data, filter / limit / sort / parameter changes, and
metric swaps that keep the same shape (e.g. a weekly-% metric → a weekly-$
metric) all flow through automatically when you render data-driven. A
fundamentally different shape (different dimensions / a different chart type)
can't reshape a fixed layout — degrade gracefully (the ErrorBoundary fallback)
rather than crash; the user regenerates to get a new layout.

(Copied charts — `linked: false` — don't need this: their shape is frozen at
generation, so author them normally.)

**Important:** The field IDs in metric queries use qualified names (e.g.,
`orders_total_revenue`). When mapping to SDK calls:
- **Base explore fields:** Strip the explore name prefix. `orders_total_revenue` → `total_revenue`
- **Joined table fields:** Convert to dot notation. If the explore is `orders` and the field is
  `customers_customer_name`, that's a joined table field — use `customers.customer_name`.
  **Only strip the prefix if it matches the explore name.** If it doesn't match, it's a joined table.
- **Table calculation names:** Do NOT strip — pass them through as-is.
