---
name: lightdash-query-sdk
description: Build custom React data apps with the Lightdash Query SDK (`@lightdash/query-sdk`). Use whenever the user wants to query Lightdash data from code, build a custom dashboard, reporting tool, or analytics app, embed Lightdash metrics in a React frontend, or pull dimensions and metrics from a Lightdash project programmatically. Also triggers on imports from `@lightdash/query-sdk`, references to `createClient`/`useLightdash`/`LightdashProvider`, or phrases like "custom data app", "embed analytics", "query my metrics from React", or "build a frontend on top of Lightdash". This is NOT for managing Lightdash YAML content (charts/dashboards as code) — that's `developing-in-lightdash`.
---

# Lightdash Query SDK

Build custom React data apps powered by a Lightdash semantic layer.

## Environment Constraints

The project is pre-configured — do not attempt to set it up yourself.

- **`npm install` is NOT available** — only use packages already in package.json
- **Only write files inside `src/`** — never touch package.json, vite.config.js, index.html, or main.jsx
- **Write `TODO.md` first** describing what you'll build, then implement
- **Run `npm run build` before finishing** — must succeed with zero errors

## Available Packages

These are pre-installed and ready to import:

| Package | Use for |
|---------|---------|
| `recharts` | Charts — `BarChart`, `LineChart`, `PieChart`, `AreaChart` |
| `@tanstack/react-table` | Tables with sorting, filtering, pagination |
| `@tanstack/react-query` | Already wired in main.jsx |
| `date-fns` | Date formatting |
| `lodash-es` | Data transformation (use named imports) |
| `tailwindcss` | All styling — utility classes only |
| `lucide-react` | Icons (tree-shakeable) |
| `shadcn/ui` | Pre-built components in `src/components/ui/` |
| `@lightdash/query-sdk` | All data access |

## Step 1: Read the Data Model

Before writing any code, read the dbt YAML files at `/workspace/dbt-repo/models/`. These define every model, dimension, metric, and relationship available to you. Use ONLY field names from these files — never guess or hallucinate field names.

### How to read a dbt YAML file

Two patterns exist — the project may use either or a mix:

**Pattern A — `meta:` directly (most common):**
```yaml
models:
  - name: orders
    meta:
      metrics:           # ← model-level metrics
        order_count:
          type: count
    columns:
      - name: status
        meta:
          dimension:     # ← column = dimension
            type: string
          metrics:       # ← column-level metrics
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

| What you need | Where to find it | SDK usage |
|---|---|---|
| Model name | `models[].name` | `.model('orders')` |
| Dimensions | `columns[].name` — every column is a dimension | `.dimensions(['status'])` |
| Column-level metrics | `columns[].meta.metrics.<key>` | `.metrics(['completed_count'])` |
| Model-level metrics | `meta.metrics.<key>` (at model level) | `.metrics(['order_count'])` |
| Field types | `dimension.type` — determines which filter operators to use | `string`, `number`, `date`, `boolean` |
| Field descriptions | `description` — what the field actually measures | Use for UI labels |
| Joins | `meta.joins[]` | Related models you can query |

**Use the metric key name, not the label.** YAML might say `label: "Avg Finish Position"` but the SDK field name is the key: `average_finish_position`.

### Dimensions vs metrics — the critical decision

This is the most important thing to get right. A field's position in the YAML tells you whether it goes in `.dimensions()` or `.metrics()`:

**Decision rule:**
- Defined under `columns[].name` or `columns[].meta.dimension` → use `.dimensions()`
- Defined under `meta.metrics.<key>` or `columns[].meta.metrics.<key>` → use `.metrics()`
- **Never mix them up.** Using `.metrics()` on a dimension adds unwanted aggregation. Using `.dimensions()` on a metric doesn't work.

**The trap: same concept, different classification across models.** A field like `cumulative_points` might be a *dimension* (pre-computed value per row) while `max_cumulative_points` is a *metric* (MAX aggregate) in the same model. For per-row data (e.g., line charts), you want the dimension:

```ts
// CORRECT — per-row values for a line chart:
lightdash.model('fct_championship_progression')
    .dimensions(['driver_name', 'round', 'cumulative_points'])

// WRONG — aggregates with MAX, collapsing the chart to one point:
lightdash.model('fct_championship_progression')
    .metrics(['max_cumulative_points'])
```

**Pre-aggregated models.** Some models have one row per entity (e.g., one row per driver per season) with pre-computed stats as dimensions. Fields like `wins`, `podiums`, `total_points` are *dimensions* here. Query with `.dimensions()` only — no `.metrics()` needed.

How to recognize them: description says "standings" or "one row per X", and numeric fields are defined as `dimension: type: number`.

```ts
// dim_driver_standings — pre-aggregated, .dimensions() only
lightdash.model('dim_driver_standings')
    .dimensions(['driver_name', 'team', 'wins', 'podiums', 'total_points'])
    .sorts([{ field: 'total_points', direction: 'desc' }])
```

**Models with zero metrics.** Some models have no metrics section at all — every field is a dimension. Don't invent `.metrics()` calls; use `.dimensions()` for everything.

### Choosing the right model

When multiple models could answer the same question:

1. **Pre-aggregated tables** when the fields you need are already there — simpler queries, no aggregation errors
2. **Fact tables** when you need metrics that only exist there, or need to slice/filter in ways the pre-aggregated table doesn't support
3. **Specialized models** over general ones — use `fct_constructor_standings` for constructor data, not `fct_race_results`

Use **multiple models** across components. A KPI card queries a fact table for aggregate metrics; a standings table queries a pre-aggregated model for pre-computed rankings.

### Colors metadata

Some dimensions include a `colors` map — use these for chart styling instead of hardcoding:
```yaml
constructor_name:
  meta:
    dimension:
      colors:
        "McLaren": "#FF8700"
        "Red Bull Racing": "#3671C6"
```

## Step 2: Write TODO.md

Before writing any code, create `TODO.md` describing:
- What components you'll build
- Which model and fields each component uses (from Step 1)
- Whether each field is a dimension or metric

This forces you to verify field names and classifications before writing code.

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
    .filters([{ field: 'order_date', operator: 'inThePast', value: 90, unit: 'days' }])
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

Use **short names** like `driver_name`, not qualified names like `fct_race_results_driver_name`. The SDK qualifies them automatically. Results use short names too.

### Query patterns

**KPI cards** — metrics without dimensions gives a single aggregated row:
```ts
const kpiQuery = lightdash.model('orders')
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
    field: string;                         // short field name
    operator: FilterOperator;
    value?: FilterValue | FilterValue[];   // omit for isNull/notNull
    unit?: UnitOfTime;                     // required for date/time operators
};
```

| Category | Operators | Notes |
|----------|-----------|-------|
| Comparison | `equals`, `notEquals`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual` | Multi-value: `value: ['a', 'b']` |
| Null | `isNull`, `notNull` | No `value` needed |
| String | `startsWith`, `endsWith`, `include`, `doesNotInclude` | |
| Date/time | `inThePast`, `notInThePast`, `inTheNext`, `inTheCurrent`, `notInTheCurrent` | Requires `unit`: `'days'`/`'weeks'`/`'months'`/`'quarters'`/`'years'` |
| Range | `inBetween`, `notInBetween` | |

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

| Mistake | Why it breaks | Fix |
|---------|---------------|-----|
| Guessing field names | API returns opaque errors | Read the dbt YAML first — always |
| `.metrics()` on a pre-aggregated model | Re-aggregates already-aggregated values → wrong numbers | If `wins` is a dimension in the YAML, use `.dimensions(['wins'])` |
| `.metrics(['max_cumulative_points'])` instead of `.dimensions(['cumulative_points'])` | Aggregates per-row data into a single value — collapses line charts | Check YAML: is it under `columns[].name` (dimension) or `meta.metrics` (metric)? |
| Unused dimensions in `.dimensions()` | Changes GROUP BY → "results may be incorrect" | Only include dimensions you render |
| Querying hidden fields (`driver_id`) | Leaks internal IDs | Skip fields with `hidden: true` |
| `createClient()` inside a component | New instance per render → infinite loop | Module scope |
| Qualified names like `orders_total_revenue` | Double-qualified → unknown field | Short names only |
| `value: '2025'` for a number column | String won't match number | `value: 2025` |
| Running `npm install` | Not available in this environment | Use only pre-installed packages |

---

## Local Testing Model Summary

When dbt YAML files aren't available (local dev without a cloned repo), use this section as the model reference. Replace or extend with your project's models.

<!--
To generate this summary:
1. Read each .yml file in models/
2. List model name, dimensions (non-hidden), and metrics
3. Note which are pre-aggregated (dimensions only) vs fact tables (dimensions + metrics)
-->

<!-- REPLACE BELOW WITH YOUR PROJECT'S MODELS -->
<!--
### fct_race_results (fact table — one row per race result, needs aggregation)
Dimensions: season, round, race_name, race_date, total_laps, circuit_name, city, country, circuit_type, driver_name, driver_nationality, driver_number, driver_age, constructor_name, constructor_nationality, engine_manufacturer, grid_position, finish_position, points, status, laps_completed, is_winner, is_podium, is_points_finish, is_dnf, positions_gained, qualifying_session, num_pit_stops, distance_completed_km
Metrics: race_count, win_rate, dnf_rate, average_grid_position, average_finish_position, best_finish, total_points, average_points, total_wins, total_podiums, total_points_finishes, total_dnfs, avg_positions_gained, total_distance_km
Colors: constructor_name has team color map

### dim_driver_standings (pre-aggregated — one row per driver per season, .dimensions() only)
Dimensions: season, driver_name, driver_number, nationality, date_of_birth, age, team, engine_manufacturer, championship_position, total_points, races_entered, wins, podiums, p1_count, p2_count, p3_count, points_finishes, dnfs, avg_grid_position, avg_finish_position, avg_positions_gained, avg_points_per_race, podium_percentage, dnf_percentage
Metrics: combined_points, combined_wins, combined_podiums

### fct_constructor_standings (pre-aggregated — one row per constructor per season, .dimensions() only)
Dimensions: season, constructor_name, nationality, engine_manufacturer, championship_position, total_points, races_entered, wins, podiums, dnfs, avg_finish_position, avg_grid_position, points_per_race, podium_rate, dnf_rate
Metrics: combined_points, combined_wins, combined_podiums, combined_dnfs
Colors: constructor_name has team color map

### fct_championship_progression (pre-aggregated — one row per driver per round)
Dimensions: driver_name, team, season, round, race_name, round_points, cumulative_points, championship_position_after_round
Metrics: total_round_points, max_cumulative_points
Colors: driver_name has per-driver color map

### fct_teammate_battles (pre-aggregated — one row per teammate pair per season, ALL dimensions, zero metrics)
Dimensions: season, constructor_name, driver_a, driver_b, total_races, race_wins_a, race_wins_b, quali_wins_a, quali_wins_b
Colors: constructor_name has team color map

### fct_pit_stop_analysis (fact table — one row per pit stop)
Dimensions: season, race_name, race_date, round, circuit_name, country, driver_name, driver_number, team, stop_number, lap, pit_stop_duration_seconds, stationary_time_seconds, pit_stop_category, race_progress_pct
Metrics: pit_stop_count, avg_pit_stop_duration_ms, fastest_pit_stop_ms, slowest_pit_stop_ms, avg_pit_stop_seconds, fastest_pit_stop_seconds, avg_stationary_time_ms, fastest_stationary_ms, avg_stationary_seconds, fastest_stationary_seconds, avg_stop_timing_pct
Colors: team has team color map, pit_stop_category has category colors
-->
