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

    if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
    if (error) return <p className="text-sm text-destructive">Error: {error.message}</p>;

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

The query inspector shows for each query: the label, status, row count, duration, explore name, dimensions, and metrics. If present, it also shows table calculations and additional metrics. Write clear labels so users can match each inspector entry to the component it powers.

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

Filter syntax for the `.filters([...])` builder method. For how filters propagate across the app (global filter context, "Filter by &lt;value&gt;" interactions), see [Global filters](#global-filters).

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

## Visual Design

**Invoke the `frontend-design` skill before writing any UI code** (auto-loaded from `.claude/skills/frontend-design/`). It drives the aesthetic direction — pick a distinctive look for *this* app rather than defaulting to generic shadcn-on-dark-mode. This guide does not prescribe layout, typography, color, or composition; that's `frontend-design`'s job.

Lightdash-specific constraints that apply on top of `frontend-design`'s direction:

- **Chart series colors must come from `CHART_COLORS` in `@/lib/theme`** — the canonical Lightdash palette, so generated apps' charts visually match native Lightdash dashboards. Cycle by index for multi-series (`CHART_COLORS[i % CHART_COLORS.length]`). `frontend-design`'s chosen accent/background/typography colors are independent of this.
- **Use semantic shadcn tokens for UI chrome** — `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `border`, etc. Don't hardcode hex values for surfaces, text, or borders. (`frontend-design` may direct you to redefine the underlying CSS variables for a chosen theme — that's fine; the rule is no inline hex, not "use only the default token values".)
- **Commit to one theme; don't design for dark while rendering light.** The template's `:root` defaults to white (light tokens). If your design needs a dark background, you must do *one* of: (a) apply `className="dark"` to your top-level `<div>` so Tailwind activates the dark token values, or (b) override the CSS variables on `:root` directly to match your chosen theme. **Never** author colors that assume a dark background without ensuring the page actually loads dark — the symptom is invisible secondary text (faint red/gray on white). Before declaring done, check: does the page background actually look the way you described it? If not, you have a theme-wiring bug.

## Required UX Patterns

### Loading states

Every component that uses `useLightdash()` **must** show a loading spinner while `loading` is true. Never render an empty chart or table while waiting for data.

**Keep the surrounding UI stable during loading.** Cards, headings, and layout should always render — only the data-driven content (chart, table body, KPI value) should be replaced with a spinner. This prevents the page from flashing or reflowing when data arrives.

```tsx
import { Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function RevenueCard() {
    const { data, format, loading, error } = useLightdash(revenueQuery);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Revenue</CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center h-[300px]">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <Alert variant="destructive">
                        <AlertDescription>{error.message}</AlertDescription>
                    </Alert>
                ) : (
                    /* render chart / table / KPI here */
                )}
            </CardContent>
        </Card>
    );
}
```

Use `<Loader2 className="animate-spin" />` from `lucide-react`, not skeletons. Give the spinner container the same height as the content it replaces so layout doesn't shift.

### Global filters

**Charts share a global filter set, scoped per explore.** When the user activates "Filter by &lt;value&gt;" from a chart's action menu (see [Data interactions](#data-interactions--action-menu) below), the filter applies to every other query in the app **that targets the same explore as the chart they clicked**.

**Filters never cross-apply between explores.** Different explores have different field sets — a `status` dimension on `marketing_touchpoints` doesn't exist on `orders` or `regional_sales`. Sending `{ field: 'status' }` into a query against the wrong explore produces a `FieldReferenceError` (the SDK qualifies it to `<wrong_explore>_status`, which doesn't exist). The `explore` tag on every filter is what prevents this.

> **Limitation by design:** A field that legitimately exists on multiple explores (e.g. `region` joined into both `orders` and `regional_sales`) won't cross-filter under this rule. That's the safe default. If the user explicitly asks for cross-explore linking on a shared dimension, you can call `addFilter` once per explore — but never broadcast a filter to all explores blindly.

Set this up once in `src/filters/FilterContext.tsx`:

```tsx
import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import type { Filter } from '@lightdash/query-sdk';

// A scoped filter is a regular Filter tagged with the explore it was created
// from. We never apply a scoped filter to a query against a different explore.
export type ScopedFilter = Filter & { explore: string };

type FilterContextValue = {
    addFilter: (filter: ScopedFilter) => void;
    removeFilter: (filter: ScopedFilter) => void;
    clearFilters: () => void;
    filtersFor: (explore: string) => Filter[];
    allFilters: ScopedFilter[]; // for the active-filters bar only
};

const FilterContext = createContext<FilterContextValue | null>(null);

const sameTarget = (a: ScopedFilter, b: ScopedFilter) =>
    a.explore === b.explore &&
    a.field === b.field &&
    JSON.stringify(a.value) === JSON.stringify(b.value);

export function FilterProvider({ children }: { children: ReactNode }) {
    const [filters, setFilters] = useState<ScopedFilter[]>([]);

    const addFilter = useCallback((filter: ScopedFilter) => {
        setFilters((prev) => {
            // Toggle: same explore + field + value → remove. Otherwise add.
            const exists = prev.some((f) => sameTarget(f, filter));
            return exists ? prev.filter((f) => !sameTarget(f, filter)) : [...prev, filter];
        });
    }, []);

    const removeFilter = useCallback((filter: ScopedFilter) => {
        setFilters((prev) => prev.filter((f) => !sameTarget(f, filter)));
    }, []);

    const clearFilters = useCallback(() => setFilters([]), []);

    const filtersFor = useCallback(
        (explore: string): Filter[] =>
            filters
                .filter((f) => f.explore === explore)
                // Strip the explore tag — the SDK's .filters() takes plain Filter values.
                .map(({ explore: _e, ...rest }) => rest),
        [filters],
    );

    const value = useMemo(
        () => ({ addFilter, removeFilter, clearFilters, filtersFor, allFilters: filters }),
        [addFilter, removeFilter, clearFilters, filtersFor, filters],
    );

    return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useGlobalFilters() {
    const ctx = useContext(FilterContext);
    if (!ctx) throw new Error('useGlobalFilters must be used inside FilterProvider');
    return ctx;
}
```

Wrap the entire app in `<FilterProvider>` once at the root (in `App.tsx`):

```tsx
import { FilterProvider } from '@/filters/FilterContext';

export default function App() {
    return (
        <FilterProvider>
            <ActiveFiltersBar />
            <Dashboard />
        </FilterProvider>
    );
}
```

**Apply global filters in every component that runs a query, scoped to that component's explore.** Use a per-file `EXPLORE` constant so the chart and its action menu agree on the explore name:

```tsx
import { useMemo } from 'react';
import { query, useLightdash } from '@lightdash/query-sdk';
import { useGlobalFilters } from '@/filters/FilterContext';

const EXPLORE = 'orders';

const baseRevenueQuery = query(EXPLORE)
    .label('Revenue by Segment')
    .dimensions(['customer_segment'])
    .metrics(['total_revenue']);

export function RevenueBySegment() {
    const { filtersFor } = useGlobalFilters();
    const q = useMemo(
        () => baseRevenueQuery.filters(filtersFor(EXPLORE)),
        [filtersFor],
    );
    const { data, format, loading } = useLightdash(q);
    // ...
}
```

**This applies to every `useLightdash()` call — no exceptions.** A chart that ignores `filtersFor(EXPLORE)` silently shows stale or contradictory data after the user filters.

#### Active filters bar

Render the active global filters above the dashboard so the user can see what's applied, dismiss them individually, or clear them all. Show the explore alongside the field so users can tell which chart contributed each filter:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useGlobalFilters } from '@/filters/FilterContext';

export function ActiveFiltersBar() {
    const { allFilters, removeFilter, clearFilters } = useGlobalFilters();
    if (allFilters.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/30">
            <span className="text-sm text-muted-foreground">Filters:</span>
            {allFilters.map((f, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                    <span className="text-muted-foreground">{f.explore}.</span>
                    {f.field} {f.operator}{' '}
                    {Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}
                    <button
                        onClick={() => removeFilter(f)}
                        className="ml-1 hover:text-destructive"
                        aria-label={`Remove filter on ${f.field}`}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
            </Button>
        </div>
    );
}
```

### Floating surfaces — always set a background

**Every floating UI surface must have an explicit, opaque background and a visible border.** This is non-negotiable — without it, dropdown menus, dialogs, and popovers render transparent over charts and tables, the underlying data bleeds through, text is unreadable, and click targets are ambiguous.

The rule applies to every component that floats above page content:

| Component | Required classes |
|---|---|
| `DropdownMenuContent` | `bg-white border shadow-md` |
| `DialogContent` | `bg-white border shadow-lg` |
| `PopoverContent` | `bg-white border shadow-md` |
| `SheetContent` | `bg-white border shadow-lg` |
| `TooltipContent` | `bg-white border shadow-sm` |

```tsx
<DropdownMenuContent className="bg-white border shadow-md">
    {/* ... */}
</DropdownMenuContent>

<DialogContent className="bg-white border shadow-lg max-w-3xl">
    {/* ... */}
</DialogContent>

<PopoverContent className="bg-white border shadow-md">
    {/* ... */}
</PopoverContent>
```

**Do not rely on shadcn defaults like `bg-popover` or `bg-background`.** Those classes resolve through CSS variables (`--popover`, `--background`) that may not be populated in the sandbox theme, leaving the surface transparent. Hard-code `bg-white` so the background renders regardless of theme state. For dark-mode support, use `bg-white dark:bg-zinc-900`.

This rule covers every code example below — every floating component you render must include these classes.

### Data interactions — action menu

**Every chart and table powered by Lightdash data must support a "Filter by &lt;value&gt;" interaction by default.** When a user clicks a data point (bar, slice, row, cell), show an action menu that includes — at minimum — a `Filter by <value>` option. Selecting it calls `addFilter({ field, operator: 'equals', value, explore })` from `useGlobalFilters()`, where `explore` is the chart's own explore name. The filter then applies to every other query that targets the same explore (see [Global filters](#global-filters) above).

Additional contextual options can be added when useful:

- **Drill down** — see this metric broken down by another dimension

Use the `DropdownMenu` component. The menu opens on click; each option triggers its respective action.

```tsx
import { useState, useMemo, useRef } from 'react';
import { query, useLightdash, drillDown } from '@lightdash/query-sdk';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useGlobalFilters } from '@/filters/FilterContext';

const EXPLORE = 'orders';

const baseQuery = query(EXPLORE)
    .label('Revenue by Segment')
    .dimensions(['customer_segment'])
    .metrics(['total_revenue']);

function RevenueChart() {
    const { filtersFor, addFilter } = useGlobalFilters();
    const chartQuery = useMemo(
        () => baseQuery.filters(filtersFor(EXPLORE)),
        [filtersFor],
    );
    const { data, format, loading } = useLightdash(chartQuery);
    const [menuState, setMenuState] = useState(null); // { row, x, y }
    const [drillState, setDrillState] = useState(null); // { query, title }
    // Capture click position on pointerdown — this fires BEFORE Recharts'
    // onClick, so the coordinates are ready when the chart handler runs.
    // Recharts onClick does NOT expose the native MouseEvent.
    const lastClick = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    return (
        <>
            <div onPointerDown={(e) => { lastClick.current = { x: e.clientX, y: e.clientY }; }}>
            <BarChart data={data} onClick={(e) => {
                if (e?.activePayload?.[0]) {
                    setMenuState({
                        row: e.activePayload[0].payload,
                        x: lastClick.current.x,
                        y: lastClick.current.y,
                    });
                }
            }}>
                {/* ... bars, axes, etc. */}
            </BarChart>
            </div>

            {menuState && (
                <DropdownMenu open onOpenChange={() => setMenuState(null)}>
                    <DropdownMenuTrigger asChild>
                        <div style={{ position: 'fixed', left: menuState.x, top: menuState.y, width: 1, height: 1 }} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-white border shadow-md">
                        <DropdownMenuItem onClick={() => {
                            // Tagged with EXPLORE so it only applies to other queries against
                            // the same explore — never broadcast across explores.
                            addFilter({
                                field: 'customer_segment',
                                operator: 'equals',
                                value: menuState.row['customer_segment'],
                                explore: EXPLORE,
                            });
                            setMenuState(null);
                        }}>
                            Filter by {format(menuState.row, 'customer_segment')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                            const row = menuState.row;
                            setDrillState({
                                query: drillDown({
                                    sourceQuery: chartQuery,
                                    metric: 'total_revenue',
                                    dimension: 'order_date',
                                    row,
                                }),
                                title: `Revenue for ${format(row, 'customer_segment')}`,
                            });
                            setMenuState(null);
                        }}>
                            Drill into revenue
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {drillState && (
                <Dialog open onOpenChange={() => setDrillState(null)}>
                    <DialogContent className="bg-white border shadow-lg max-w-3xl">
                        <DialogHeader><DialogTitle>{drillState.title}</DialogTitle></DialogHeader>
                        <DrillResults query={drillState.query} />
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
```

**This is the default for every chart and table that renders Lightdash query data.** The "Filter by &lt;value&gt;" option is mandatory; "Drill into …" and other options are encouraged where they make sense.

If the user explicitly asks for a different interaction (e.g., "clicking should always filter without showing a menu" or "no drill-down needed"), follow their instructions. Otherwise, every data-powered chart and table gets the action menu — at minimum with the "Filter by &lt;value&gt;" option wired into the global filter context.

#### Filtering from table cells

Tables follow the same pattern: clicking a cell opens the action menu, and "Filter by &lt;value&gt;" calls `addFilter({ field: column.name, operator: 'equals', value: row[column.name], explore: EXPLORE })`. The field is the column the user clicked, the value is the cell's raw (unformatted) value, and the explore is the table component's own explore constant. Display the formatted value in the menu label: `Filter by {format(row, column.name)}`.

### Table interactions

Every table component must include these standard interactions:

1. **Row hover highlight** — highlight the row under the cursor
2. **Copy cell** — clicking a cell copies its formatted value to the clipboard (show a brief toast confirmation)
3. **Copy table as CSV** — a button above the table copies all rows as CSV to the clipboard
4. **Scrollable with max height** — tables should be at most ~600px tall and scroll vertically within that. Use `ScrollArea` for the table body. Unless the user specifies a different height, default to `max-h-[600px]`.

```tsx
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
    <h3 className="text-base font-medium">Results</h3>
    <Button variant="outline" size="sm" onClick={() => copyToClipboard(tableToCsv(columns, data, format))}>
        <Copy className="h-4 w-4 mr-1" /> Copy CSV
    </Button>
</div>

// Scrollable table with sticky header
<ScrollArea className="max-h-[600px] rounded-md border">
    <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
            {/* header row */}
        </TableHeader>
        <TableBody>
            {data.map((row, i) => (
                <TableRow key={i} className="hover:bg-muted">
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
            ))}
        </TableBody>
    </Table>
</ScrollArea>
```

## `drillDown()` Reference

`drillDown()` builds a new query from a clicked row. Import it alongside `query` and `useLightdash`:

```ts
import { query, useLightdash, drillDown } from '@lightdash/query-sdk';
```

### API

```ts
drillDown({
    sourceQuery,   // The QueryBuilder that produced the clicked data
    metric,        // Which metric to drill into (string)
    dimension,     // Which dimension to drill by (string)
    row,           // The clicked row from useLightdash data
    label,         // Optional label for query inspector
}) // → QueryBuilder
```

**Do not pass a `label`** — the default label is automatically prefixed with `[Drill down]` (e.g., `[Drill down] total_revenue by order_date`), which makes drill queries easy to identify in the query inspector.

The returned `QueryBuilder` has:
- The drill-by dimension as the sole dimension
- The drilled metric
- Equality filters from every dimension value in the clicked row
- All existing filters from the source query preserved

Pass the result to `useLightdash()` to execute it.

### Choosing the drill dimension

Pick a dimension that gives meaningful detail for the metric:
- Revenue by month → drill by day or by product
- Total by segment → drill by individual customer
- Summary by region → drill by city

The agent decides the drill dimension at build time from the dbt YAML. For user-selectable drill dimensions, use a `<Select>` populated with dimension options:

```tsx
const [drillDim, setDrillDim] = useState('order_date');
// In the menu item onClick:
setDrillQuery(drillDown({ sourceQuery, metric: 'total_revenue', dimension: drillDim, row }));
```

### Displaying drill results

**Always show the filtered value in the dialog title** — e.g., "Revenue for Enterprise" or "Orders for 2024-01". This tells the user what they clicked. Store both the drill query and a descriptive title together in state (as `{ query, title }`).

Show drill results in a `Dialog`. Use a separate component so `useLightdash` runs only when the dialog is open:

```tsx
function DrillResults({ query: q }) {
    const { data, columns, format, loading, error } = useLightdash(q);

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    if (error) return <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>;
    if (data.length === 0) return <p className="text-sm text-muted-foreground">No results</p>;

    return (
        <ScrollArea className="max-h-[400px]">
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((col) => <TableHead key={col.name}>{col.label}</TableHead>)}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, i) => (
                        <TableRow key={i}>
                            {columns.map((col) => (
                                <TableCell key={col.name}>{format(row, col.name)}</TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </ScrollArea>
    );
}
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
| Forgetting to apply global filters to a query | Chart shows unfiltered data while the rest of the page is filtered → contradictory results | Every `useLightdash()` call must pass `filtersFor(EXPLORE)` into `.filters([...])` via `useMemo` |
| Calling `addFilter` without an `explore` tag | Filter has no explore → the `filtersFor(otherExplore)` lookup never returns it, or (worse) you broadcast it everywhere → `FieldReferenceError` like `regional_sales_status` not found | Always include `explore: EXPLORE` on every `addFilter` call |
| Using `filters` (raw) instead of `filtersFor(EXPLORE)` | Sends filters from other explores into this query → SDK qualifies the field name to the wrong explore → `FieldReferenceError` | Always select via `filtersFor(EXPLORE)`; never pass `allFilters` into `.filters()` |
| Hard-coding the explore string in two places | Chart and its action menu disagree → filter sets but never applies | Define `const EXPLORE = '...'` at the top of the file and reuse it for both `query(EXPLORE)` and `addFilter({ ..., explore: EXPLORE })` |
| Building the filtered query inline (not memoized) | New query identity every render → infinite re-fetch | `useMemo(() => baseQuery.filters(filtersFor(EXPLORE)), [filtersFor])` |
| Local `useState` for cross-filter state | Other components on the page can't see or react to it | Use `<FilterProvider>` at the app root and `useGlobalFilters()` everywhere |
| Action menu missing "Filter by &lt;value&gt;" | Default UX requirement violated — users have no way to drill in | Every data-powered chart/table must include the option, calling `addFilter({ field, operator: 'equals', value, explore: EXPLORE })` |
| Using a formatted display value in `addFilter` | Filter never matches raw rows (e.g. `"$1,234"` vs `1234`) | Pass the raw row value into `addFilter`; only use `format()` for the menu label |
| Building drill query inside render | Infinite re-fetching | Build in onClick handler, store in state |
| Transparent popover/dialog/dropdown backgrounds | Content unreadable over charts; clicks pass through ambiguously | Hard-code `bg-white border shadow-md` (or `shadow-lg` for dialogs) on every `DropdownMenuContent`, `DialogContent`, `PopoverContent`, `SheetContent`, and `TooltipContent`. Never rely on shadcn defaults like `bg-popover` — the underlying CSS variables aren't reliably populated. See [Floating surfaces](#floating-surfaces--always-set-a-background) |
| Drilling by a dimension already in the source query | Pointless — same grouping | Pick a different, more granular dimension |
| Using `e.chartX`/`e.chartY` for menu position | Chart-relative coords — menu appears at wrong position | Recharts `onClick` has no native event; capture `clientX`/`clientY` from a wrapper `<div onPointerDown>` via `useRef` — pointerdown fires before onClick so the ref is ready (see action menu example) |
