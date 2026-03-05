---
name: thoughtspot-to-lightdash
description: Translate ThoughtSpot TML (Modeling Language) exports into Lightdash YAML files. Converts Liveboards to dashboards, Answers to charts, and Worksheets to semantic layer definitions.
---

# ThoughtSpot TML to Lightdash Migration

Translate ThoughtSpot TML exports into Lightdash-compatible YAML. This skill handles the conversion of Liveboards, Answers, Worksheets, and table definitions.

## Overview

ThoughtSpot exports metadata as TML (ThoughtSpot Modeling Language) YAML files. Each TML file type maps to a Lightdash concept:

| ThoughtSpot TML | Lightdash Equivalent | Output |
|-----------------|---------------------|--------|
| **Liveboard** (`.liveboard.tml`) | Dashboard | `lightdash/dashboards/<slug>.yml` |
| **Answer** (`.answer.tml`) | Saved Chart | `lightdash/charts/<slug>.yml` |
| **Worksheet** (`.worksheet.tml`) | Model YAML (metrics + dimensions) | `models/<model>.yml` |
| **Model** (`.model.tml`) | Model YAML (metrics + dimensions) | `models/<model>.yml` |
| **Table** (`.table.tml`) | dbt model / source reference | Used for column mapping |
| **View** (`.view.tml`) | Model YAML (derived) | `models/<model>.yml` |

> **Note: Worksheet vs Model TML** — ThoughtSpot is deprecating Worksheets in favor of **Models** (v2 schema). Model TML uses `model:` as the top-level key instead of `worksheet:`, and `model_columns:` instead of `worksheet_columns:`, but the structure is otherwise identical. Newer ThoughtSpot exports will produce `.model.tml` files. This skill handles both formats — apply the same translation rules regardless of which you receive.

> **Note: Liveboard vs Pinboard TML** — Older ThoughtSpot exports use `pinboard:` as the top-level key instead of `liveboard:`. The structure is identical. Handle both by checking for either key.

## Before You Start

1. Have the user's TML files available (they export from ThoughtSpot via **Export TML**)
2. Know the user's dbt project structure - specifically which dbt models correspond to ThoughtSpot tables
3. Refer to the Lightdash chart-as-code types in `packages/common/src/types/coder.ts` for the exact YAML schema

## Translation Workflow

### Step 1: Inventory the TML Files

TML files come in bundles. A single Liveboard export may include dozens of files. Categorize them first:

```bash
# List all TML files by type
find . -name "*.tml" | while read f; do
  type=$(echo "$f" | sed 's/.*\.\(.*\)\.tml/\1/')
  echo "$type: $f"
done | sort
```

**Important:** A Liveboard TML is NOT self-contained. It references Answers, which reference Worksheets, which reference Tables. You need the full dependency chain to translate correctly.

### Step 2: Map ThoughtSpot Tables to dbt Models

Before translating metrics and dimensions, map ThoughtSpot table names to your dbt model names:

```
ThoughtSpot Table Name → dbt Model Name
─────────────────────────────────────────
dim_retapp_products    → products
fact_retapp_sales      → sales
```

This mapping is critical because Lightdash dimensions use `${TABLE}.column` syntax referencing dbt models.

### Step 3: Translate Worksheets → Lightdash Semantic Layer

See [TML Worksheet Reference](./resources/tml-worksheet-reference.md) for the full schema.

**Key mappings:**

| ThoughtSpot Worksheet | Lightdash Model YAML |
|----------------------|---------------------|
| `worksheet_columns` with `column_type: ATTRIBUTE` | `dimensions` |
| `worksheet_columns` with `column_type: MEASURE` | `metrics` |
| `formulas` | `metrics` with `type: sql` or `dimensions` with custom SQL |
| `joins` | `joins` in the model YAML |
| `filters` | `sql_filter` or metric-level `filters` |

### Step 4: Translate Answers → Lightdash Charts

See [TML Answer Reference](./resources/tml-answer-reference.md) for the full schema.

**Key mappings:**

| ThoughtSpot Answer | Lightdash Chart YAML |
|-------------------|---------------------|
| `answer.name` | `name` |
| `answer.search_query` columns | `metricQuery.dimensions` + `metricQuery.metrics` |
| `answer.chart.type` | `chartConfig.type` (see chart type mapping below) |
| `answer.chart.axis_configs` | `chartConfig.config.layout` |
| `answer.answer_columns` sort | `metricQuery.sorts` |
| `answer.display_mode` | Determines if chart or table view |

### Step 5: Translate Liveboards → Lightdash Dashboards

See [TML Liveboard Reference](./resources/tml-liveboard-reference.md) for the full schema.

**Key mappings:**

| ThoughtSpot Liveboard | Lightdash Dashboard YAML |
|----------------------|-------------------------|
| `liveboard.name` | `name` |
| `liveboard.visualizations[]` | `tiles[]` with `type: saved_chart` |
| `liveboard.layout.tiles[]` (x, y, width, height) | `tiles[].x, y, w, h` |
| `liveboard.filters[]` | `filters.dimensions[]` |
| `liveboard.layout.tabs[]` | `tabs[]` |

## Chart Type Mapping

| ThoughtSpot `chart.type` | Lightdash `chartConfig.type` | Notes |
|--------------------------|------------------------------|-------|
| `COLUMN` | `cartesian` (bar) | Set series `type: bar` |
| `BAR` | `cartesian` (horizontal bar) | Set `flipAxes: true`, `type: bar` |
| `LINE` | `cartesian` (line) | Set series `type: line` |
| `AREA` | `cartesian` (area) | Set series `type: area` |
| `STACKED_COLUMN` | `cartesian` (stacked bar) | `type: bar` with `layout.stack: true` |
| `STACKED_BAR` | `cartesian` (stacked horizontal bar) | `type: bar`, `flipAxes: true`, `stack: true` |
| `STACKED_AREA` | `cartesian` (stacked area) | `type: area` with `layout.stack: true` |
| `PIE` | `pie` | Use `config.isDonut: false` |
| `SCATTER` | `cartesian` (scatter) | Set series `type: scatter` |
| `BUBBLE` | `cartesian` (scatter) | Use scatter with size encoding |
| `GEO_AREA` | `map` | Use Lightdash map chart type |
| `GEO_BUBBLE` | `map` | Use Lightdash map chart type |
| `GEO_HEATMAP` | `map` | Use Lightdash map chart type |
| `GEO_EARTH_BAR` | `table` | No direct equivalent — convert to table |
| `GEO_EARTH_AREA` | `table` | No direct equivalent — convert to table |
| `GEO_EARTH_GRAPH` | `table` | No direct equivalent — convert to table |
| `GEO_EARTH_BUBBLE` | `table` | No direct equivalent — convert to table |
| `GEO_EARTH_HEATMAP` | `table` | No direct equivalent — convert to table |
| `TABLE` | `table` | |
| `GRID_TABLE` | `table` | Treat same as TABLE |
| `FUNNEL` | `funnel` | |
| `TREEMAP` | `treemap` | |
| `WATERFALL` | `cartesian` (bar) | Approximate with stacked bar |
| `PIVOT_TABLE` | `table` | Use pivot configuration |
| `SANKEY` | `table` | No Lightdash equivalent — convert to table |
| `SPIDER_WEB` | `table` | No Lightdash equivalent — convert to table |
| `CANDLESTICK` | `table` | No Lightdash equivalent — convert to table |
| `WHISKER_SCATTER` | `cartesian` (scatter) | Use scatter as approximation |
| `LINE_COLUMN` | `cartesian` | Mixed chart — use bar + line series |
| `LINE_STACKED_COLUMN` | `cartesian` | Mixed chart — use stacked bar + line series |
| `HEATMAP` | `table` | No Lightdash equivalent — convert to table |
| `PARETO` | `cartesian` | Use bar + line series as approximation |

> **Note on missing chart types**: ThoughtSpot's chart type enum does NOT include `DONUT`, `GAUGE`, `KPI`, or `HEADLINE` as chart types. Donut is a pie chart configuration, not a separate type. Headlines/KPIs appear in Liveboards as visualizations with `display_headline_column` set (no `chart` section) — see "Headline / KPI Visualizations" below.

### Headline / KPI Visualizations

ThoughtSpot Liveboards often include headline tiles (single-number KPIs). These appear as visualizations with `display_headline_column` set on the visualization object (alongside the `answer` block), NOT as a chart type. When you see `display_headline_column`, translate to a Lightdash `big_number` chart:

```yaml
# ThoughtSpot headline in a Liveboard visualization
- id: Viz_3
  answer:
    name: "Total Revenue"
    tables:
      - name: "Worksheet Name"
    search_query: "[Revenue]"
    answer_columns:
      - name: Total Revenue
    # Note: no `chart` section — this is a headline
  display_headline_column: "Total Revenue"
  viz_guid: <uuid>

# → Lightdash big_number chart
chartConfig:
  type: big_number
  config:
    selectedField: fact_sales_total_revenue
```

## Filter Operator Mapping

ThoughtSpot TML filter `oper` values use **lowercase symbol form** in worksheet/liveboard filters (`=`, `!=`, `in`, `not in`, `between`, `<`, `>`, `<=`, `>=`). Handle these:

| ThoughtSpot `oper` | Lightdash `operator` |
|-------------------|---------------------|
| `=` | `equals` |
| `!=` | `notEquals` |
| `<` | `lessThan` |
| `<=` | `lessThanOrEqual` |
| `>` | `greaterThan` |
| `>=` | `greaterThanOrEqual` |
| `=<` | `lessThanOrEqual` (legacy form, treat same as `<=`) |
| `in` | `equals` (with multiple values) |
| `not in` | `notEquals` (with multiple values) |
| `contains` | `include` |
| `not contains` | `doesNotInclude` |
| `begins with` | `startsWith` |
| `ends with` | `endsWith` |
| `is null` | `isNull` |
| `is not null` | `notNull` |
| `between` | `inBetween` |

> **Note:** The official ThoughtSpot docs list these operators in lowercase symbol form. If you encounter uppercase enum forms (e.g., `EQ`, `NE`, `IN`) in older exports, map them using the same logic.

## Column Type Mapping

| ThoughtSpot `column_type` | Lightdash Usage |
|--------------------------|----------------|
| `ATTRIBUTE` | → `dimension` |
| `MEASURE` | → `metric` |

| ThoughtSpot `aggregation` | Lightdash `metric.type` |
|--------------------------|------------------------|
| `SUM` | `sum` |
| `COUNT` | `count` |
| `COUNT_DISTINCT` | `count_distinct` |
| `AVG` / `AVERAGE` | `average` |
| `MIN` | `min` |
| `MAX` | `max` |
| `UNIQUE_COUNT` | `count_distinct` |
| `NONE` | No aggregation — treat as a dimension or use `type: number` SQL metric |
| `STD_DEVIATION` | Use `type: sql` metric with `STDDEV(${TABLE}.column)` |
| `VARIANCE` | Use `type: sql` metric with `VARIANCE(${TABLE}.column)` |

## ThoughtSpot Formula Translation

ThoughtSpot formulas use a proprietary syntax. Common patterns:

| ThoughtSpot Formula | Lightdash Equivalent |
|--------------------|---------------------|
| `sum([column])` | metric with `type: sum`, `sql: ${TABLE}.column` |
| `count([column])` | metric with `type: count`, `sql: ${TABLE}.column` |
| `count_distinct([column])` | metric with `type: count_distinct`, `sql: ${TABLE}.column` |
| `average([column])` | metric with `type: average`, `sql: ${TABLE}.column` |
| `group_aggregate(sum([col]), [dim1], [dim2])` | Not directly supported - use SQL metric or table calculation |
| `if [col] = 'value' then [col2] else 0` | metric with `sql: CASE WHEN ... END` |
| `[table_path::column]` | `${TABLE}.column` or `${joined_table}.column` |

## File Structure

Always generate files in the correct Lightdash directory structure:

```
your-project/
├── lightdash/
│   ├── charts/
│   │   ├── chart-one.yml           # One file per Answer
│   │   └── chart-two.yml
│   └── dashboards/
│       └── my-dashboard.yml        # One file per Liveboard
└── models/
    └── your_model.yml              # Updated with metrics/dimensions from Worksheets
```

**Critical rules:**
- Charts go in `lightdash/charts/`, dashboards in `lightdash/dashboards/` - never mix them
- Slugs use hyphens, not underscores: `my-chart-name` not `my_chart_name`
- Slug pattern: lowercase alphanumeric and hyphens only (`^[a-z0-9-]+$`)
- Every chart and dashboard YAML needs `version: 1`
- Include `downloadedAt` and `updatedAt` timestamps (ISO 8601 format, use current time). They default to current time if omitted, but including them is good practice.
- Dashboard tiles reference charts by `chartSlug` matching the chart file's `slug` field
- Dashboard tiles also need `tileSlug` (optional identifier) and `uuid` (set to `null` for new tiles)

## Complete Translation Example

See [Full Translation Example](./resources/translation-example.md) for a worked end-to-end example showing TML input and Lightdash YAML output.

## Handling `fqn` References

TML files exported with `export_fqn=true` include `fqn` fields containing ThoughtSpot-internal GUIDs on referenced objects (tables, worksheets, connections). **Ignore these during translation** — they are only meaningful within ThoughtSpot and have no Lightdash equivalent. Use the `name` field instead to identify and map objects.

```yaml
# Example — use `name`, ignore `fqn`
tables:
  - name: "Retail - Apparel"     # ← Use this for mapping
    fqn: "2ea7add9-0ccb-..."     # ← Ignore this
```

## Handling `client_state` / `client_state_v2`

Answer TML may include a `client_state` or `client_state_v2` field containing a JSON string with detailed visual configuration (colors, legend position, data labels, axis labels, number formatting). This is optional but can be a useful source of additional chart styling information. Parse it if you need to extract specific visual settings, but it's not required for basic translation.

## Common Pitfalls

1. **Wrong directory structure**: `lightdash/charts/` and `lightdash/dashboards/` are separate - don't put everything in one folder.
2. **Slug format**: Must be lowercase alphanumeric with hyphens only (`^[a-z0-9-]+$`). Use hyphens (`my-chart`) not underscores (`my_chart`).
3. **Column references**: ThoughtSpot uses `table_path::column_name` syntax. Convert to Lightdash's `${TABLE}.column_name` format.
4. **Nested table relationships**: ThoughtSpot Worksheets can span 20-30 tables. Map each to the correct dbt model before generating metrics.
5. **Formula translation**: ThoughtSpot's `group_aggregate` and LOD functions don't have direct Lightdash equivalents. Use SQL metrics or suggest dbt intermediate models.
6. **Liveboard filters vs chart filters**: ThoughtSpot Liveboard filters apply across visualizations. In Lightdash, dashboard filters target specific fields - map the `column` reference to the correct `fieldId` and `tableName`.
7. **Formula metrics need model-level `meta`**: ThoughtSpot formulas that combine multiple columns (e.g., `revenue / units_sold`) should become model-level `meta.metrics` with custom SQL, NOT column-level metrics on a fake column name.
8. **Chart filter structure**: Chart-level `metricQuery.filters` uses `FilterGroup` objects (`{and: [...]}` or `{or: [...]}`) NOT flat arrays. Dashboard filters use flat arrays of `DashboardFilterRule`.
9. **Dashboard filter IDs**: In dashboard as-code, dimension filter IDs are auto-generated — do NOT include an `id` field. But DO include `label: null` (required field).
10. **Pinboard vs Liveboard key**: Older ThoughtSpot exports use `pinboard:` instead of `liveboard:` — handle both.
11. **Headline visualizations**: ThoughtSpot headlines are NOT a chart type — they are Liveboard visualizations with `display_headline_column` set. Map to `big_number` chart type.

## Known Gaps

These ThoughtSpot features cannot be automatically translated and require manual handling:

| ThoughtSpot Feature | Status | Workaround |
|---------------------|--------|------------|
| `group_aggregate` / LOD functions | Not supported | Use SQL metrics with window functions, or create dbt intermediate models |
| Parameters (dynamic runtime values) | Not supported | Hardcode default values or use Lightdash dashboard filters |
| Row-level security (RLS) rules | Not supported | Configure RLS separately in Lightdash or at the warehouse level |
| Geo charts (`GEO_AREA`, `GEO_BUBBLE`, `GEO_HEATMAP`) | Partial | Use Lightdash `map` chart type where possible; some geo features unsupported |
| GEO_EARTH charts (`GEO_EARTH_BAR`, `GEO_EARTH_AREA`, `GEO_EARTH_GRAPH`, `GEO_EARTH_BUBBLE`, `GEO_EARTH_HEATMAP`) | Not supported | Convert to table view |
| Sankey, Spider Web, Candlestick, Heatmap charts | Not supported | Convert to table or closest alternative chart type |
| ThoughtSpot search syntax keywords (`daily`, `monthly`, `sort by`, `top`) | Partially handled | `top N` maps to `limit`, time granularity maps to date dimension grouping, but complex search expressions need manual interpretation |
| `client_state` / `client_state_v2` visual config | Optional | JSON blob with colors, labels, formatting — can be parsed but not required |
| View TML (`search_query` based) | Partial | The `search_query` must be interpreted and converted to SQL or Lightdash metric definitions |
| SQL View TML | Partial | `sql_query` can map to Lightdash `sql_from` but column definitions need manual mapping |
| R/Python-powered visualizations | Not exportable | ThoughtSpot does not support TML export for R/Python visualizations |
