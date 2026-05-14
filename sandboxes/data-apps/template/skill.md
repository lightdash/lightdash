# Lightdash Data App — Reference

You are building a React data app that queries the Lightdash semantic layer. This file is your reference for the environment, SDK, and data model.

## Environment Constraints

- **Only write files in `src/`** — config files, `package.json`, and everything outside `src/` is locked.
- **Never install packages** — all dependencies are pre-installed. Any `npm install` or `pnpm add` will fail.
- **Only import from approved packages** — anything else will fail at build time.

### Approved packages

`react`, `react-dom`, `@lightdash/query-sdk`, `recharts`, `d3`, `d3-sankey`, `d3-cloud`, `@tanstack/react-query`, `@tanstack/react-table`, `@tanstack/react-virtual`, `react-resizable-panels`, `date-fns`, `lodash-es`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`

### Pre-installed shadcn/ui components

Available at `@/components/ui/<name>`:

`Button`, `Badge`, `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`), `Table` (+ `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`), `Dialog`, `Tabs`, `Select`, `Input`, `Label`, `Popover`, `Tooltip`, `Separator`, `Skeleton`, `DropdownMenu`, `Sheet`, `ScrollArea`, `Switch`, `Checkbox`, `Avatar`, `Alert`, `Progress`, `Resizable` (+ `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`)

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

## Attached images

The user can attach images to a prompt. They land at `/tmp/images/`. Use the
Read tool to view each one before deciding how to use it.

Two kinds, distinguished by filename:

| Filename pattern | Meaning | How to use it |
|---|---|---|
| `screenshot-<uuid>.<ext>` | A live screenshot of the **current** built app — what the user is looking at when they wrote the prompt. | Treat as *context for the request*, not a target. The user's prompt usually says "change X" or "this looks wrong" — the screenshot tells you what the layout actually renders as right now (colors, spacing, missing data, broken charts). Do NOT try to reproduce the screenshot; the existing source files already produce it. |
| `<uuid>.<ext>` (no prefix) | A design reference uploaded by the user — mockup, sketch, screenshot from elsewhere, or a chart they like. | Treat as a *target to approximate* for layout, color, typography, or component choice. Match the spirit, not pixel-perfect. The prompt prepend will also call these "Design reference image N". |

If both are attached, the user is most likely saying "here's what it looks
like now (screenshot) — change it to look more like this (design reference)."

## Element references in iteration prompts

The Lightdash preview pane has an "Inspect" toggle. When the user clicks an
element in the live preview, the chat editor inserts a bracketed reference at
the textarea cursor. Users can stack multiple references in a single prompt
to compose several targeted edits at once:

```
[button "Save" @src/components/Toolbar.tsx:42] make this blue
[div "$2.4M" @src/Dashboard.tsx:88] rename to Net Revenue
[h3 "Q1 Dashboard" @src/Dashboard.tsx:14] tighter spacing
```

Each line targets one element. Resolve each reference, edit only that
component, and move on. The instruction immediately follows the reference
on the same line (a colon between them is optional — users may include
one).

### Format

A reference always starts with the rendered tag, optionally followed by a
visible-text hint, optionally followed by `@<path>:<line>`:

| Form | Example | Meaning |
|---|---|---|
| `[<tag> "<text>" @<path>:<line>]` | `[button "Save" @src/components/Toolbar.tsx:42]` | Build-time loc available — primary case. |
| `[<tag> @<path>:<line>]` | `[svg @src/Dashboard.tsx:88]` | Element had no text (icon button, empty container) but a loc is available — open the file at that line. |
| `[<tag> "<text>"]` *(no `@…`)* | `[button "Save"]` | Loc unavailable (DOM node injected outside JSX, or pre-transform build). Fall back to grepping the text. |

The `<tag>` is the **rendered** HTML tag (`button`, `h3`, `div`, `span`,
`svg`), not the React component name. shadcn `<Button>` renders as `<button>`,
`<CardTitle>` as `<h3>`, `<Card>` as `<div>`. Keep that in mind when reading
references — the source uses the React component name.

### Resolution strategy

1. **`@<path>:<line>` is authoritative.** It's stamped at build time on the
   user-facing call site (props spread through shadcn primitives, so the
   caller's loc wins over the primitive's own loc). Open that file at that
   line — that is the component to edit. No grep needed.
2. **No `@…` segment** — fall back to text:
   - Grep `/app/src/` for the quoted text. It's almost always hardcoded JSX.
     Inner double quotes are normalized to single quotes in the label, so
     grep both forms if needed.
   - Narrow by tag if multiple matches.
3. **Scope edits to the matched component.** Don't refactor neighbors unless
   the requested change requires it.

### When you can't resolve a reference

If grep returns no hits, the file at the given loc doesn't have anything
matching the text/tag, or the matches are too ambiguous to choose between,
say so and ask the user to clarify or re-select. Don't guess and edit the
wrong component — the user will see the wrong thing change and lose trust
in the tool.

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
| `format` | `(row, fieldName) => string` | Server-side formatted value — preserves currency, %, prefix/suffix from the dbt YAML. **Tabular** form (e.g. `2025-03`, `2025-03-17`) — fine in dense table cells, **not** chart-friendly. For dates, chart axes, and human-readable date columns, prefer the `formatField` / `formatDate` / `formatNumber` helpers from `@/lib/format` (see [Formatting](#formatting)). |
| `loading` | `boolean` | True while query is in flight. |
| `error` | `Error \| null` | Query error. |
| `refetch` | `() => void` | Re-run the query on demand. |

### Formatting

Every Lightdash row carries two views of each value:

- `row[fieldName]` — the **raw** value. Numbers are real numbers; **dates and timestamps are full ISO strings** (e.g. `'2025-03-01T00:00:00Z'`) regardless of the truncation grain. Pass these to charts as data, not as axis labels.
- `format(row, fieldName)` — the **server-formatted** value. Preserves dbt YAML formatting (currency, percent, prefix/suffix) but is tabular and zero-padded for dates (e.g. `'2025-03'`, `'2025-Q1'`). Fine in dense table cells, ugly on chart axes.

For chart axes and any human-facing date column, use the helpers in `@/lib/format`:

```tsx
import { formatField, formatDate, formatNumber, getColumn } from '@/lib/format';
```

| Helper | Use for |
|---|---|
| `formatField(row, column, format, variant?)` | Default catch-all for table cells, KPI labels, and tooltip values. Routes dates through human-readable patterns, numbers through compact form on axes, and falls back to the SDK `format()` for currency/% so dbt YAML formatting is preserved. |
| `formatDate(value, column?, variant?, opts?)` | A `tickFormatter` for date X-axes, or any place you have a raw value (no row). Variant is `'cell'` (default) or `'axis'` (compact). Pass `opts.pattern` to override with a custom date-fns pattern. |
| `formatNumber(value, variant?)` | A `tickFormatter` for numeric Y-axes. `variant: 'axis'` returns compact form (`24K`, `$1.2M` style) without currency prefix. |
| `getColumn(columns, name)` | Find a column by short name. Useful for passing column metadata to `formatDate` from a `tickFormatter`. |

`variant: 'axis'` outputs:
- date / timestamp by grain — `2025` (year), `Q1 '25` (quarter), `Jun '25` (month), `Jun 16 '25` (week / day)
- number — compact (`24K`, `1.2M`)
- timestamp without grain — `Jun 16, 14:00`

`variant: 'cell'` outputs:
- date / timestamp by grain — `2025`, `Q1 2025`, `Jun 2025`, `Jun 16, 2025`
- number — server-formatted (currency / % / suffix preserved via the SDK `format()` you pass in)
- timestamp without grain — `Jun 16, 2025 14:00`

**Override** by passing `opts.pattern` to `formatDate`, or by formatting yourself with `date-fns`/`Intl.NumberFormat`:

```tsx
import { format as formatDateFns, parseISO } from 'date-fns';

formatDate(row.order_date_month, getColumn(columns, 'order_date_month'), 'axis', { pattern: 'MMM yyyy' });

// Or fully manual:
formatDateFns(parseISO(row.order_date as string), 'EEEE, MMM d');
```

#### Chart axes

**Every `<XAxis>` and `<YAxis>` in the app must have a `tickFormatter`.** No exceptions — including year axes that "look like they'd be fine" (`race_date_year` is still a full ISO timestamp at the data layer; Recharts will render `2025-01-01T00:00:00Z`, not `2025`).

```tsx
import { XAxis, YAxis } from 'recharts';
import { formatDate, formatNumber, getColumn } from '@/lib/format';

const dateCol = getColumn(columns, 'order_date_month');

<XAxis
    dataKey="order_date_month"
    tickFormatter={(v) => formatDate(v, dateCol, 'axis')}
/>
<YAxis tickFormatter={(v) => formatNumber(v, 'axis')} />
```

**Self-check before declaring done:** grep the generated app for `<XAxis` and `<YAxis`. Every match must have a `tickFormatter` prop. If any axis is missing one, fix it before reporting the build complete — claiming "all axes formatted" without verifying is the most common way this lands broken.

#### Tables

Use `formatField` for cells so dates render `Jun 16, 2025` instead of `2025-06-16`, while currency/percent metrics still flow through the SDK's server format:

```tsx
{columns.map((col) => (
    <TableCell key={col.name}>{formatField(row, col, format, 'cell')}</TableCell>
))}
```

For the action-menu label and clipboard copy on a cell, the same helper applies — pass `format` so the per-field server format wins for currency/percent.

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

The filter context is pre-installed and wraps your app at the root. Import the hook from `@/lib/filters` — never reimplement it:

```tsx
import { useGlobalFilters } from '@/lib/filters';

const { filtersFor, addFilter, removeFilter, clearFilters, allFilters } = useGlobalFilters();
```

| Member | Purpose |
|---|---|
| `filtersFor(explore: string): Filter[]` | Returns plain SDK `Filter[]` for one explore. Pass into `.filters([...])`. |
| `addFilter(filter: ScopedFilter)` | Adds a filter tagged with `explore`. Same-target add toggles (removes if it already exists). |
| `removeFilter(filter: ScopedFilter)` | Removes a specific filter (matches on explore + field + value). |
| `clearFilters()` | Removes all filters. |
| `allFilters: ScopedFilter[]` | All active filters across explores. Use for the active-filters bar. |

`ScopedFilter` is `Filter & { explore: string }` and is also exported from `@/lib/filters`.

**Apply global filters in every component that runs a query, scoped to that component's explore.** Use a per-file `EXPLORE` constant so the chart and its action menu agree on the explore name:

```tsx
import { useMemo } from 'react';
import { query, useLightdash } from '@lightdash/query-sdk';
import { useGlobalFilters } from '@/lib/filters';

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

Render the active filters above the dashboard so the user can see what's applied, dismiss them individually, or clear them all. Read `allFilters` from `useGlobalFilters()` and design the bar to match the app's visual style — `frontend-design` drives the look. Show the explore alongside the field so users can tell which chart contributed each filter, and call `removeFilter(f)` / `clearFilters()` from your dismiss buttons.

### Floating surfaces — chrome is template-managed

**The template owns the visual chrome (background, border, shadow, hover state) of every floating surface.** That covers shadcn's `DropdownMenuContent`, `PopoverContent`, `DialogContent`, plus any custom Recharts tooltip you wrap in `ChartTooltipSurface` (see below). The chrome adapts to whatever theme you design — `chart-overrides.css` mixes `--background` toward `--foreground` to guarantee contrast on both dark and light themes.

What this means for you:

- **Don't add `bg-*`, `border-*`, `shadow-*`, or inline `style={{ background, border, boxShadow }}` to floating surfaces.** Those will be overridden, and trying to fight them just produces inconsistent results across regenerations. The chrome is already correct.
- **Inner padding, font sizes, content layout, accent stripes — all yours.** Design the contents however the app calls for; the wrapper handles the rest.
- **Custom Recharts tooltips must be wrapped in `<ChartTooltipSurface>`** from `@/lib/floating`. Without it, the tooltip is a plain unstyled div and looks transparent over the chart.

Custom tooltip example:

```tsx
import { Tooltip } from 'recharts';
import { ChartTooltipSurface } from '@/lib/floating';

<Tooltip content={({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <ChartTooltipSurface>
            <div className="font-semibold mb-1">{label}</div>
            <div className="font-mono text-sm tabular-nums">
                {payload[0].value}
            </div>
        </ChartTooltipSurface>
    );
}} />
```

Action menus and dialogs use shadcn's components as-is — no className needed for the chrome:

```tsx
<DropdownMenuContent>
    <DropdownMenuItem onClick={...}>Filter by {value}</DropdownMenuItem>
</DropdownMenuContent>
```

**One scope rule still matters:** if you toggle dark mode via the `.dark` class, set it on `<html>`, never on a wrapper `<div>`. Radix portals into `document.body`, so `<div className="dark">` inside `<App />` doesn't contain portaled menus/dialogs/popovers — floating surfaces leak out to light scope. Either:

```js
// main.jsx — set once at boot, applies to <html> and every portal
document.documentElement.classList.add('dark');
```

…or skip `.dark` entirely and put dark values directly in `:root`. Do not write `<div className="dark">` anywhere.

### Data interactions — action menu

**Every chart and table powered by Lightdash data must support a "Filter by &lt;value&gt;" interaction by default.** When a user clicks a data point (bar, slice, row, cell), show an action menu that includes — at minimum — a `Filter by <value>` option. Selecting it calls `addFilter({ field, operator: 'equals', value, explore })` from `useGlobalFilters()`, where `explore` is the chart's own explore name. The filter then applies to every other query that targets the same explore (see [Global filters](#global-filters) above).

Additional contextual options can be added when useful:

- **Drill down** — see this metric broken down by another dimension

Use the `DropdownMenu` component. The menu opens on click; each option triggers its respective action.

```tsx
import { useState, useMemo, useRef } from 'react';
import { query, useLightdash, drillDown } from '@lightdash/query-sdk';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useGlobalFilters } from '@/lib/filters';

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
                    <DropdownMenuContent>
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
                    <DialogContent className="max-w-3xl">
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
        columns.map((c) => `"${formatField(row, c, format, 'cell').replace(/"/g, '""')}"`).join(','),
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
                            onClick={() => copyToClipboard(formatField(row, col, format, 'cell'))}
                        >
                            {formatField(row, col, format, 'cell')}
                        </TableCell>
                    ))}
                </TableRow>
            ))}
        </TableBody>
    </Table>
</ScrollArea>
```

### Resizable panels

Use the pre-installed shadcn `Resizable` component (built on `react-resizable-panels`) when the layout has **two or more sibling areas the user benefits from rebalancing in-place** — typical cases:

- A chart next to a detail/inspector panel ("see the bar I clicked").
- A dashboard split between filters/sidebar and the main grid.
- A table beside a chart that visualizes the same query.
- A document/explanation panel next to a live data view.

**Don't reach for it by default.** If panels have a fixed information ratio (KPI row above a grid, header above content), use plain Tailwind flex/grid. Resizable is for layouts where the user has a real preference between "give me more chart" and "give me more detail."

```tsx
import {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
} from '@/components/ui/resizable';

export function SplitDashboard() {
    return (
        <ResizablePanelGroup
            direction="horizontal"
            className="h-[calc(100vh-3rem)] rounded-md border"
            autoSaveId="dashboard-split"   // remembers user sizing in localStorage
        >
            <ResizablePanel defaultSize={65} minSize={35}>
                <RevenueByMonth />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={35} minSize={20}>
                <SegmentBreakdown />
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
```

Rules:

- **Set `autoSaveId`** so user sizing persists across reloads. The id is the localStorage key — keep it stable per layout.
- **Always set `minSize`** on every panel. Without it, users can collapse a panel to zero and lose the chart inside.
- **Use `withHandle` on `ResizableHandle`** for visible drag affordance. Without it, the divider is a 1-pixel hover target.
- **Nest groups for grid layouts.** A 3-pane "filters | chart | detail" goes one `ResizablePanelGroup direction="horizontal"`. A "chart over table" goes `direction="vertical"`. Combine by nesting.
- **Don't use it inside a card.** Resizable wants a parent with a definite height (`h-screen`, `h-[600px]`, etc.). Inside a `Card` with content-sized height it collapses.
- **Charts inside resizable panels must use `viewBox` or Recharts' `<ResponsiveContainer>`.** Hard-coded pixel widths won't reflow on resize.

When users explicitly ask for "drag to resize" or "let me adjust the panel sizes," that's the trigger. Otherwise prefer fixed proportions.

## When to drop into D3

**Recharts is the default.** Bars, lines, areas, scatter, pie/donut, treemap, radar — use Recharts. It composes with the action menu, color palette, and tooltip patterns above with almost no friction.

**Reach for D3 only when Recharts can't express the chart** — sankey/flow, sunburst/icicle/pack, force-directed networks, chord, arc, hexbin/contour density, geographic projections (`d3-geo`), word clouds (`d3-cloud`), or pixel-precise custom encodings.

If a Recharts component covers it, **use Recharts** — even if a D3 version would be marginally prettier. The cost of D3 is more code, more chances for memory leaks, and harder integration with the action menu.

When you do need D3, **read `/app/d3-reference.md` first.** It contains the React-19 + D3 integration pattern, four worked examples (bar, sankey, sunburst, word cloud), the cross-cutting rules (`CHART_COLORS`, `filtersFor`, action menu, no-cross-refetch animation), and a common-mistakes table. Don't try to wire D3 from memory — load the reference.

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
                                <TableCell key={col.name}>{formatField(row, col, format, 'cell')}</TableCell>
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
| Action menu missing "Filter by &lt;value&gt;" | Default UX requirement violated — users have no way to drill in | Every data-powered chart/table must include the option, calling `addFilter({ field, operator: 'equals', value, explore: EXPLORE })` |
| Using a formatted display value in `addFilter` | Filter never matches raw rows (e.g. `"$1,234"` vs `1234`) | Pass the raw row value into `addFilter`; only use `format()` for the menu label |
| `<XAxis dataKey="order_date_month" />` with no `tickFormatter` | Recharts renders the raw ISO timestamp (e.g. `2025-03-01T00:00:00Z`) as labels | `tickFormatter={(v) => formatDate(v, getColumn(columns, 'order_date_month'), 'axis')}` from `@/lib/format` |
| Skipping `tickFormatter` on a year axis because "year is just a number" | Year dimensions (`*_year`) are still full ISO timestamps at the data layer, so the axis renders `2025-01-01T00:00:00Z` | Apply the same `formatDate(...)` `tickFormatter` to year axes — `formatDate` will collapse to `2025` for year-grain columns |
| Using `format(row, 'order_date')` for a date column in a table cell | Renders `2025-03-17` (zero-padded tabular) — readable but ugly in dashboards | `formatField(row, col, format, 'cell')` from `@/lib/format` — renders `Mar 17, 2025` while still routing currency/% metrics through the server format |
| Treating `row.order_date_month` as a `Date` or short string | It's a full ISO timestamp string (`2025-03-01T00:00:00Z`) for every grain | Pass through `formatDate` / `formatField`, or `parseISO` it before doing date math |
| Building drill query inside render | Infinite re-fetching | Build in onClick handler, store in state |
| Drilling by a dimension already in the source query | Pointless — same grouping | Pick a different, more granular dimension |
| Using `e.chartX`/`e.chartY` for menu position | Chart-relative coords — menu appears at wrong position | Recharts `onClick` has no native event; capture `clientX`/`clientY` from a wrapper `<div onPointerDown>` via `useRef` — pointerdown fires before onClick so the ref is ready (see action menu example) |
