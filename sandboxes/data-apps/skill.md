# Data App Scaffold — Claude Code Skill

You are building a Lightdash data app. This is a standalone React + Vite project with Tailwind CSS and shadcn/ui components.

## Rules

1. **Only write files in `src/`** — never modify config files, `package.json`, or anything outside `src/`.
2. **Never run `npm install`, `pnpm add`, or any package install command** — all dependencies are pre-installed and locked.
3. **Only import from approved packages** — see list below. Any other import will fail at build time.

## Approved Packages

- `react`, `react-dom`
- `@lightdash/query-sdk` — Lightdash semantic layer SDK
- `recharts` — charting library
- `@tanstack/react-query` — data fetching
- `@tanstack/react-table` — headless data tables
- `@tanstack/react-virtual` — virtualised rendering for large lists/tables
- `date-fns` — date manipulation (tree-shakeable)
- `lodash-es` — utility functions (tree-shakeable, use named imports)
- `lucide-react` — icons (tree-shakeable)
- `clsx`, `tailwind-merge`, `class-variance-authority` — styling utilities

## Pre-baked shadcn/ui Components

These are already available in `src/components/ui/`:

- `Button`, `Badge`, `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`)
- `Table` (`TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`)
- `Dialog`, `Tabs`, `Select`, `Input`, `Label`, `Popover`, `Tooltip`, `Separator`

Import them from `@/components/ui/<name>`.

## Utility

`cn()` is available from `@/lib/utils` for merging Tailwind classes.

## Step 1: Read the Data Model

Before writing any code, read the dbt YAML files at `/workspace/dbt-repo/models/`. These define every model, dimension, metric, and relationship available to you. Use ONLY field names from these files — never guess or hallucinate field names.

### How to read a dbt YAML file

Two patterns exist — the project may use either or a mix:

**Pattern A — `meta:` directly (most common):**

```yaml
models:
    - name: orders
      meta:
          metrics: # ← model-level metrics
              order_count:
                  type: count
      columns:
          - name: status
            meta:
                dimension: # ← column = dimension
                    type: string
                metrics: # ← column-level metrics
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

### Extracting field names

| What you need        | Where to find it                                            | SDK usage                             |
| -------------------- | ----------------------------------------------------------- | ------------------------------------- |
| Model name           | `models[].name`                                             | `.model('orders')`                    |
| Dimensions           | `columns[].name` — every column is a dimension              | `.dimensions(['status'])`             |
| Column-level metrics | `columns[].meta.metrics.<key>`                              | `.metrics(['completed_count'])`       |
| Model-level metrics  | `meta.metrics.<key>` (at model level)                       | `.metrics(['order_count'])`           |
| Field types          | `dimension.type` — determines which filter operators to use | `string`, `number`, `date`, `boolean` |
| Field descriptions   | `description` — what the field actually measures            | Use for UI labels                     |
| Joins                | `meta.joins[]`                                              | Related models you can query          |

**Use the metric key name, not the label.** YAML might say `label: "Order Count"` but the SDK field name is the key: `order_count`.

### Dimensions vs metrics — the critical decision

This is the most important thing to get right. A field's position in the YAML tells you whether it goes in `.dimensions()` or `.metrics()`:

**Decision rule:**

- Defined under `columns[].name` or `columns[].meta.dimension` → use `.dimensions()`
- Defined under `meta.metrics.<key>` or `columns[].meta.metrics.<key>` → use `.metrics()`
- **Never mix them up.** Using `.metrics()` on a dimension adds unwanted aggregation. Using `.dimensions()` on a metric doesn't work.

**Models with zero metrics.** Some models have no metrics section at all — every field is a dimension. Don't invent `.metrics()` calls; use `.dimensions()` for everything.

## Step 2: Write TODO.md

Before writing any code, create `TODO.md` describing each query you plan to make:

- What component uses it
- Which model and fields it uses (from Step 1)
- Whether each field is a dimension or metric
- **The grain** — what combination of dimensions produces one unique row (e.g., "one row per driver per season per round"). Look at ALL dimensions in the model to figure this out. If the grain includes a dimension you aren't selecting, you likely need a filter on it, otherwise you'll get duplicates or mixed data.
- **Filters needed** — based on the grain analysis, decide what filters are required to get the right slice of data (e.g., filter to a specific date range, or category)
- **Estimated row count** — calculate from the grain: `unique values of dim A × unique values of dim B × ...`. This determines your `.limit()`. Setting limit too low silently truncates data.

This forces you to understand the shape of the data before writing code, not just the field names.

## Step 3: Build Components

### SDK usage

```tsx
import { createClient, useLightdash } from '@lightdash/query-sdk';

const lightdash = createClient();

// Define queries at module scope — immutable, safe to hoist out of render
const revenueQuery = lightdash
    .model('orders')
    .dimensions(['customer_segment'])
    .metrics(['total_revenue', 'order_count'])
    .filters([
        { field: 'order_date', operator: 'inThePast', value: 90, unit: 'days' },
    ])
    .sorts([{ field: 'total_revenue', direction: 'desc' }])
    .limit(10);

export function RevenueBySegment() {
    const { data, loading, error } = useLightdash(revenueQuery);

    if (loading) return <p className="text-gray-500">Loading...</p>;
    if (error) return <p className="text-red-500">Error: {error.message}</p>;

    // data is Row[] — flat objects keyed by short field names
    // Types preserved: numbers are numbers, strings are strings, null for missing
    return (
        <div className="space-y-2">
            {data.map((row, i) => (
                <div key={i} className="flex justify-between">
                    <span>{String(row.customer_segment)}</span>
                    <span>{Number(row.total_revenue).toFixed(2)}</span>
                </div>
            ))}
        </div>
    );
}
```

### Field names

Use **short names** like `total_revenue`, not qualified names like `orders_total_revenue`. The SDK qualifies them automatically. Results use short names too.

### Query patterns

**KPI cards** — metrics without dimensions gives a single aggregated row:

```ts
const kpiQuery = lightdash
    .model('orders')
    .metrics(['total_revenue', 'order_count'])
    .limit(1);
```

**Tables** — use `@tanstack/react-table` with the flat `data` array from `useLightdash`.

**Charts** — use `recharts`. The `data` array works directly as the data prop.

**Reusing queries** — the builder is immutable, so you can derive views from a base:

```ts
const base = lightdash.model('orders').metrics(['total_revenue']);
const bySegment = base.dimensions(['customer_segment']);
const byRegion = base.dimensions(['region']);
```

### Filters

```ts
type Filter = {
    field: string; // short field name
    operator: FilterOperator;
    value?: FilterValue | FilterValue[]; // omit for isNull/notNull
    unit?: UnitOfTime; // required for date/time operators
};
```

| Category   | Operators                                                                                 | Notes                                                                 |
| ---------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Comparison | `equals`, `notEquals`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual` | Multi-value: `value: ['a', 'b']`                                      |
| Null       | `isNull`, `notNull`                                                                       | No `value` needed                                                     |
| String     | `startsWith`, `endsWith`, `include`, `doesNotInclude`                                     |                                                                       |
| Date/time  | `inThePast`, `notInThePast`, `inTheNext`, `inTheCurrent`, `notInTheCurrent`               | Requires `unit`: `'days'`/`'weeks'`/`'months'`/`'quarters'`/`'years'` |
| Range      | `inBetween`, `notInBetween`                                                               |                                                                       |

### Results

`useLightdash(query)` returns `{ data, loading, error, refetch }`:

- `data`: `Row[]` — flat objects keyed by short field name. Types preserved.
- `loading`: true while query is in flight.
- `error`: `Error | null`.
- `refetch`: `() => void` to re-run on demand.

### User context

```ts
const user = await lightdash.auth.getUser();
// { name: 'Jane Doe', email: '...', role: 'editor', orgId: '...', attributes: {} }
```

## Debugging

**Query returns empty data:**

- Check filter values match the field type. `value: '2025'` (string) won't match `type: number`. Use `value: 2025`.
- If using a pre-aggregated model, make sure you're not accidentally adding `.metrics()`.

**API error: "Unknown field":**

- Field name doesn't exist in the model. Check the YAML — use the key, not the label.
- Wrong model. Check `models[].name`.

**API error after field name looks correct:**

- Using a qualified name (`orders_total_revenue`) — the SDK qualifies again. Use short name (`total_revenue`).

**Numbers look wrong:**

- Unused dimensions in `.dimensions()` change the GROUP BY. Only include dimensions you render.

**Infinite loading / re-fetching:**

- `createClient()` inside a component. Move to module scope.

**Build fails:**

- Check imports — only use packages listed in Available Packages above.

## Common Mistakes

| Mistake                                                                               | Why it breaks                                                                           | Fix                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Guessing field names                                                                  | API returns opaque errors                                                               | Read the dbt YAML first — always                                                   |
| `.metrics()` on a pre-aggregated model                                                | Re-aggregates already-aggregated values → wrong numbers                                 | If `wins` is a dimension in the YAML, use `.dimensions(['wins'])`                  |
| `.metrics(['max_cumulative_points'])` instead of `.dimensions(['cumulative_points'])` | Aggregates per-row data into a single value — collapses line charts                     | Check YAML: is it under `columns[].name` (dimension) or `meta.metrics` (metric)?   |
| Unused dimensions in `.dimensions()`                                                  | Changes GROUP BY → "results may be incorrect"                                           | Only include dimensions you render                                                 |
| Querying hidden fields (`driver_id`)                                                  | Leaks internal IDs                                                                      | Skip fields with `hidden: true`                                                    |
| `createClient()` inside a component                                                   | New instance per render → infinite loop                                                 | Module scope                                                                       |
| Qualified names like `orders_total_revenue`                                           | Double-qualified → unknown field                                                        | Short names only                                                                   |
| `value: '2025'` for a number column                                                   | String won't match number                                                               | `value: 2025`                                                                      |
| Not filtering on grain dimensions you don't render                                    | Duplicates, mixed data, wrong totals — the query returns every combination of the grain | Identify the model's grain in Step 2, filter any grain dimension you don't display |
| `.limit()` too low                                                                    | Silently truncates rows — charts end early, tables are incomplete                       | Estimate row count from the grain in Step 2, set limit above that                  |
| Running `npm install`                                                                 | Not available in this environment                                                       | Use only pre-installed packages                                                    |
