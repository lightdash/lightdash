# Lightdash Data App — Reference

You are building a React data app that queries the Lightdash semantic layer. This file is your reference for the environment, SDK, and data model.

## Environment Constraints

- **Only write files in `src/`** — config files, `package.json`, and everything outside `src/` is locked.
- **Never install packages** — all dependencies are pre-installed. Any `npm install` or `pnpm add` will fail.
- **Only import from approved packages** — anything else will fail at build time.

### Approved packages

`react`, `react-dom`, `@lightdash/query-sdk`, `recharts`, `@tanstack/react-query`, `@tanstack/react-table`, `@tanstack/react-virtual`, `date-fns`, `lodash-es`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`

### Pre-installed shadcn/ui components

Available at `@/components/ui/<name>`:

`Button`, `Badge`, `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`), `Table` (+ `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`), `Dialog`, `Tabs`, `Select`, `Input`, `Label`, `Popover`, `Tooltip`, `Separator`, `Skeleton`, `DropdownMenu`, `Sheet`, `ScrollArea`, `Switch`, `Checkbox`, `Avatar`, `Alert`, `Progress`

`cn()` is available from `@/lib/utils` for merging Tailwind classes.

## Semantic Layer (dbt models)

The available data models are defined in dbt YAML files at **`/tmp/dbt-repo/models/`**. Read these to discover every model, dimension, metric, and join available to you. **Never guess field names** — use only what's in the YAML.

### Reading dbt YAML

Two patterns exist (projects may use either or both):

**Pattern A — `meta:` directly:**
```yaml
models:
    - name: orders
      meta:
          metrics:              # model-level metrics
              order_count:
                  type: count
      columns:
          - name: status
            meta:
                dimension:      # column = dimension
                    type: string
                metrics:        # column-level metrics
                    completed_count:
                        type: count_distinct
```

**Pattern B — nested under `config.meta:`:**
```yaml
columns:
    - name: status
      config:
          meta:
              dimension:
                  type: string
```

### Dimension vs metric — the critical distinction

A field's position in the YAML determines whether it goes in `.dimensions()` or `.metrics()`:

- `columns[].name` or `columns[].meta.dimension` → `.dimensions()`
- `meta.metrics.<key>` or `columns[].meta.metrics.<key>` → `.metrics()`
- **Never mix them up.** `.metrics()` on a dimension adds unwanted aggregation. `.dimensions()` on a metric doesn't work.
- Some models have **zero metrics** — every field is a dimension. Don't invent `.metrics()` calls.

### Field name mapping

| YAML location | SDK usage |
|---|---|
| `models[].name` | `query('orders')` |
| `columns[].name` | `.dimensions(['status'])` |
| `columns[].meta.metrics.<key>` | `.metrics(['completed_count'])` |
| `meta.metrics.<key>` | `.metrics(['order_count'])` |
| `meta.joins[]` | Related models you can query — use dot notation for their fields |

Use the **metric key name**, not the label. YAML `label: "Order Count"` → SDK field name is `order_count`.

### Joined table fields — dot notation

When a model has `joins`, the joined table's dimensions and metrics are available in your query. **Use dot notation** (`table.field`) to reference fields from joined tables:

```ts
// 'orders' joins 'customers' — query fields from both:
query('orders')
    .dimensions(['order_date', 'customers.customer_name'])   // ← dot notation
    .metrics(['total_revenue', 'customers.customer_count'])
    .sorts([{ field: 'customers.customer_name', direction: 'asc' }])
```

| Field belongs to | Syntax | Resolves to |
|---|---|---|
| Base explore (`orders`) | `'status'` | `orders_status` |
| Joined table (`customers`) | `'customers.name'` | `customers_name` |

**This also applies to `.filters()` and `.sorts()`** — any `field` value can use dot notation.

**Never prefix joined table fields with the base explore name.** `'customers.name'` is correct. `'name'` alone would resolve to `orders_name` which doesn't exist.

### Understanding data grain

When designing queries, consider the model's grain — what combination of dimensions produces one unique row. If the grain includes dimensions you aren't selecting, you may need filters to avoid duplicates. Estimate row counts from the grain to set appropriate `.limit()` values.

## Referenced metric queries

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

**Important:** The field IDs in metric queries use qualified names (e.g.,
`orders_total_revenue`). When mapping to SDK calls:
- **Base explore fields:** Strip the explore name prefix. `orders_total_revenue` → `total_revenue`
- **Joined table fields:** Convert to dot notation. If the explore is `orders` and the field is
  `customers_customer_name`, that's a joined table field — use `customers.customer_name`.
  **Only strip the prefix if it matches the explore name.** If it doesn't match, it's a joined table.
- **Table calculation names:** Do NOT strip — pass them through as-is.

## SDK Reference

The client and provider are already set up in `main.jsx`. Import `query` and `useLightdash` — that's it.

```tsx
import { query, useLightdash } from '@lightdash/query-sdk';

// Define queries at module scope — immutable, safe to hoist out of render.
// Always use .label() to describe what the query powers (shown in dev tools).
const revenueQuery = query('orders')
    .label('Revenue by Segment')
    .dimensions(['customer_segment'])
    .metrics(['total_revenue', 'order_count'])
    .filters([
        { field: 'order_date', operator: 'inThePast', value: 90, unit: 'days' },
    ])
    .sorts([{ field: 'total_revenue', direction: 'desc' }])
    .limit(10);

export function RevenueBySegment() {
    const { data, format, loading, error } = useLightdash(revenueQuery);

    if (loading) return <p className="text-gray-500">Loading...</p>;
    if (error) return <p className="text-red-500">Error: {error.message}</p>;

    return (
        <div className="space-y-2">
            {data.map((row, i) => (
                <div key={i} className="flex justify-between">
                    <span>{format(row, 'customer_segment')}</span>
                    <span>{format(row, 'total_revenue')}</span>
                </div>
            ))}
        </div>
    );
}
```

### Field names

Use **short names** like `total_revenue`, not qualified names like `orders_total_revenue`. The SDK qualifies them automatically. For joined table fields, use **dot notation** like `customers.name` (see "Joined table fields" above).

### Query builder

The builder is immutable — you can derive variants from a base:

```ts
const base = query('orders').metrics(['total_revenue']);
const bySegment = base.label('Revenue by Segment').dimensions(['customer_segment']);
const byRegion = base.label('Revenue by Region').dimensions(['region']);
```

KPI cards — metrics without dimensions gives a single aggregated row:
```ts
query('orders').label('KPI Summary').metrics(['total_revenue', 'order_count']).limit(1);
```

**Always add `.label()`** — it describes what the query powers and is shown in the query inspector dev tools. Use a short human-readable name like "Revenue by Month Chart" or "Top Customers Table".

### Table calculations

Table calculations are computed columns evaluated after the warehouse query returns. They can reference dimensions and metrics using `${table.field}` syntax in their SQL expression.

```ts
query('orders')
    .label('Revenue with Running Total')
    .dimensions(['order_date'])
    .metrics(['total_revenue'])
    .tableCalculations([
        {
            name: 'running_total',
            displayName: 'Running Total',
            sql: 'SUM(${orders.total_revenue}) OVER (ORDER BY ${orders.order_date})',
        },
    ])
```

Each table calculation needs:
- `name` — internal field ID (used in results, must be unique within the query)
- `displayName` — human-readable label shown in the UI
- `sql` — SQL expression; reference other fields with `${table.field}` syntax

### Additional metrics

Additional metrics are ad-hoc aggregations defined at query time. Use them when you need a metric that isn't defined in the dbt YAML — for example, a custom aggregation on a joined table column.

```ts
query('orders')
    .label('Revenue with Custom Metric')
    .dimensions(['order_date'])
    .metrics(['total_revenue', 'custom_avg_price'])
    .additionalMetrics([
        {
            name: 'custom_avg_price',
            label: 'Avg Unit Price',
            table: 'order_items',
            type: 'average',
            sql: '${TABLE}.unit_price',
        },
    ])
```

Each additional metric needs:
- `name` — internal field ID (must be referenced in `.metrics()` too)
- `table` — the table it belongs to
- `type` — aggregation type: `average`, `count`, `count_distinct`, `sum`, `min`, `max`, `median`, `percentile`
- `sql` — SQL expression; use `${TABLE}` to reference the table

**When to use additional metrics vs regular `.metrics()`:**
- If the metric exists in the dbt YAML → use `.metrics(['metric_name'])`
- If you need a custom aggregation not in the YAML → define it with `.additionalMetrics()` AND include its name in `.metrics()`

### `useLightdash(query)` return value

| Field | Type | Use for |
|---|---|---|
| `data` | `Row[]` | Flat objects keyed by short field name. Raw values. Use for charts. |
| `columns` | `Column[]` | Field metadata (`name`, `label`, `type`). Use for table headers. |
| `format` | `(row, fieldName) => string` | Formatted display value (currency, %, dates). Use for text. |
| `loading` | `boolean` | True while query is in flight. |
| `error` | `Error \| null` | Query error. |
| `refetch` | `() => void` | Re-run the query on demand. |

### Filters

```ts
type Filter = {
    field: string;
    operator: FilterOperator;
    value?: FilterValue | FilterValue[];
    unit?: UnitOfTime; // required for date/time operators
};
```

| Category | Operators | Notes |
|---|---|---|
| Comparison | `equals`, `notEquals`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual` | Multi-value: `value: ['a', 'b']` |
| Null | `isNull`, `notNull` | No `value` needed |
| String | `startsWith`, `endsWith`, `include`, `doesNotInclude` | |
| Date/time | `inThePast`, `notInThePast`, `inTheNext`, `inTheCurrent`, `notInTheCurrent` | Requires `unit`: `'days'`/`'weeks'`/`'months'`/`'quarters'`/`'years'` |
| Range | `inBetween`, `notInBetween` | |

### User context

```ts
import { useLightdashClient } from '@lightdash/query-sdk';
const client = useLightdashClient();
const user = await client.auth.getUser();
```

## Required UX Patterns

### Loading states

Every component that uses `useLightdash()` **must** show a loading skeleton or spinner while `loading` is true. Never render an empty chart or table while waiting for data.

```tsx
import { Skeleton } from '@/components/ui/skeleton';

const { data, format, loading, error } = useLightdash(myQuery);

if (loading) return <Skeleton className="h-[300px] w-full rounded-xl" />;
if (error) return <p className="text-red-500">Error: {error.message}</p>;
```

Use `<Skeleton>` for charts and cards. Match the skeleton's dimensions to the component it replaces so the layout doesn't shift when data arrives.

### Dashboard cross-filtering

When building a dashboard-style app with multiple charts or cards, **every visualization must act as a cross-filter by default**. Clicking a bar, slice, row, or data point should filter the other components to match the clicked value.

Implementation pattern:
1. Lift a shared `filters` state to the dashboard container
2. On click, extract the dimension value and add/toggle it in the shared filter state
3. Pass the filters into each query via `.filters()`
4. Show active filters as dismissible pills/badges above the dashboard

```tsx
const [activeFilters, setActiveFilters] = useState<Filter[]>([]);

// Each chart query derives from a base with active filters applied
const chartQuery = useMemo(
    () => baseQuery.filters([...baseFilters, ...activeFilters]),
    [activeFilters],
);
```

Skip cross-filtering only if the user explicitly says not to.

### Table interactions

Every table component must include these standard interactions:

1. **Row hover highlight** — highlight the row under the cursor
2. **Copy cell** — clicking a cell copies its formatted value to the clipboard (show a brief toast confirmation)
3. **Copy table as CSV** — a button above the table copies all rows as CSV to the clipboard

```tsx
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
}

function tableToCsv(columns: Column[], data: Row[], format: FormatFn): string {
    const header = columns.map((c) => c.label).join(',');
    const rows = data.map((row) =>
        columns.map((c) => `"${format(row, c.name).replace(/"/g, '""')}"`).join(','),
    );
    return [header, ...rows].join('\n');
}

// Table header area
<div className="flex justify-between items-center mb-2">
    <h3>Results</h3>
    <Button variant="outline" size="sm" onClick={() => copyToClipboard(tableToCsv(columns, data, format))}>
        <Copy className="h-4 w-4 mr-1" /> Copy CSV
    </Button>
</div>

// Table rows — use hover:bg-muted and cursor-pointer on each cell
<TableRow className="hover:bg-muted">
    {columns.map((col) => (
        <TableCell
            key={col.name}
            className="cursor-pointer"
            onClick={() => copyToClipboard(format(row, col.name))}
        >
            {format(row, col.name)}
        </TableCell>
    ))}
</TableRow>
```

## Common Pitfalls

| Mistake | Why it breaks | Fix |
|---|---|---|
| Guessing field names | API returns opaque errors | Read the dbt YAML first — always |
| `.metrics()` on a pre-aggregated model | Re-aggregates already-aggregated values → wrong numbers | If `wins` is a dimension in the YAML, use `.dimensions(['wins'])` |
| `.metrics(['max_cumulative_points'])` instead of `.dimensions(['cumulative_points'])` | Aggregates per-row data into a single value — collapses line charts | Check YAML: is it under `columns[].name` (dimension) or `meta.metrics` (metric)? |
| Unused dimensions in `.dimensions()` | Changes GROUP BY → wrong numbers | Only include dimensions you render |
| Querying hidden fields (`driver_id`) | Leaks internal IDs | Skip fields with `hidden: true` |
| Calling `createClient()` in app code | Not needed — client is set up in `main.jsx` | `import { query, useLightdash } from '@lightdash/query-sdk'` |
| Qualified names like `orders_total_revenue` | Double-qualified → unknown field | Short names only |
| Joined table field without dot notation: `customer_name` | Resolves to `orders_customer_name` → unknown field | Use `customers.customer_name` for joined tables |
| `value: '2025'` for a number column | String won't match number | `value: 2025` |
| Not filtering on grain dimensions you don't render | Duplicates, mixed data, wrong totals | Identify the grain, filter dimensions you don't display |
| `.limit()` too low | Silently truncates rows — charts end early, tables incomplete | Estimate row count from the grain, set limit above that |
| Building queries inside render | Infinite re-fetching | Define queries at module scope or memoize them |
