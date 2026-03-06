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

> **Note: Worksheet vs Model TML** — ThoughtSpot is deprecating Worksheets in favor of **Models** (v2 schema). Model TML uses `model:` as the top-level key instead of `worksheet:`, `model_tables:` instead of `tables:`, and `columns:` instead of `worksheet_columns:`. Model TML also uses a different join structure within `model_tables` (inline `joins` with `with:`, `on:`, `cardinality:`) instead of the top-level `joins`/`joins_with` sections. Newer ThoughtSpot exports will produce `.model.tml` files. This skill handles both formats — see the [Worksheet Reference](./resources/tml-worksheet-reference.md) for details on both structures.

> **Note: Liveboard vs Pinboard TML** — ThoughtSpot TML exports use `pinboard:` as the top-level key (the original name). Some newer ThoughtSpot versions may also export with `liveboard:` as the top-level key. The structure is identical. Handle both by checking for either key.

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
| `PIE` | `pie` | Use `config.isDonut: false`, include `groupFieldIds` and `metricId` |
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
| `TABLE` | `table` | Direct mapping |
| `GRID_TABLE` | `table` | Treat same as TABLE |
| `FUNNEL` | `funnel` | |
| `TREEMAP` | `treemap` | |
| `WATERFALL` | `cartesian` (bar) | Approximate with stacked bar |
| `PIVOT_TABLE` | `table` | Set `pivotConfig.columns` at chart root level AND `metricQuery.pivotDimensions` |
| `SANKEY` | `table` | No Lightdash equivalent — convert to table |
| `SPIDER_WEB` | `table` | No Lightdash equivalent — convert to table |
| `CANDLESTICK` | `table` | No Lightdash equivalent — convert to table |
| `WHISKER_SCATTER` | `cartesian` (scatter) | Use scatter as approximation |
| `LINE_COLUMN` | `cartesian` | Mixed chart — use bar + line series |
| `LINE_STACKED_COLUMN` | `cartesian` | Mixed chart — use stacked bar + line series |
| `HEATMAP` | `table` | No Lightdash equivalent — convert to table |
| `PARETO` | `cartesian` | Use bar + line series as approximation |

> **Lightdash chart types:** `cartesian`, `table`, `big_number`, `pie`, `funnel`, `treemap`, `gauge`, `map`, `custom`. The `gauge` type can be used for single-metric displays similar to ThoughtSpot KPI gauges. The `custom` type is for custom visualizations and is generally not used in translation.

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
    selectedField: fact_sales_total_revenue   # Optional — field to display
    label: "Total Revenue"                    # Optional — custom label
```

## Filter Operator Mapping

ThoughtSpot TML filter `oper` values use **lowercase symbol form** in worksheet/model/liveboard filters. The official ThoughtSpot documentation lists these operators: `in`, `not in`, `between`, `=<`, `!=`, `<=`, `>=`, `>`, `<`.

| ThoughtSpot `oper` | Lightdash `operator` | Notes |
|-------------------|---------------------|-------|
| `!=` | `notEquals` | |
| `<` | `lessThan` | |
| `<=` | `lessThanOrEqual` | |
| `>` | `greaterThan` | |
| `>=` | `greaterThanOrEqual` | |
| `=<` | `lessThanOrEqual` | Legacy form of `<=` |
| `in` | `equals` | Lightdash `equals` with an array acts as IN |
| `not in` | `notEquals` | With multiple values |
| `between` | `inBetween` | |

> **Note:** The ThoughtSpot docs do not list `=` (equals) as a TML filter operator — single-value equality uses `in` with one value. If you encounter `=` in an export, map it to `equals`. Similarly, string operators like `contains`, `begins with`, `ends with`, `is null`, `is not null` are ThoughtSpot **search query** keywords, not TML filter `oper` values. If you encounter them in TML (e.g., from custom exports), map them as: `contains` → `include`, `not contains` → `doesNotInclude`, `begins with` → `startsWith`, `ends with` → `endsWith`, `is null` → `isNull`, `is not null` → `notNull`.

> **Lightdash additional operators:** Lightdash also supports date-specific operators not used in TML: `inThePast`, `notInThePast`, `inTheNext`, `inTheCurrent`, `notInTheCurrent`, `notInBetween`. These may be useful when translating ThoughtSpot date filters with search query keywords like `last 30 days`.

## Column Type Mapping

| ThoughtSpot `column_type` | Lightdash Usage |
|--------------------------|----------------|
| `ATTRIBUTE` | → `dimension` |
| `MEASURE` (default) | → `metric` |

| ThoughtSpot `aggregation` | Lightdash `metric.type` |
|--------------------------|------------------------|
| `SUM` | `sum` |
| `COUNT` | `count` |
| `COUNT_DISTINCT` | `count_distinct` |
| `AVERAGE` | `average` |
| `MIN` | `min` |
| `MAX` | `max` |
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
- **Required chart fields:** `version`, `name`, `slug`, `spaceSlug`, `tableName`, `metricQuery`, `chartConfig`
- **Required metricQuery fields:** `exploreName`, `dimensions`, `metrics`, `filters`, `sorts`, `limit`, `tableCalculations` — use `filters: {}` for no filters, `tableCalculations: []` for none
- **Required dashboard fields:** `version`, `name`, `slug`, `spaceSlug`, `tiles`, `tabs`
- **Optional chart fields:** `description`, `updatedAt`, `downloadedAt`, `dashboardSlug`, `tableConfig`, `pivotConfig`, `parameters`
- **Optional dashboard fields:** `description`, `updatedAt`, `downloadedAt`, `filters`
- Dashboard tiles reference charts by `chartSlug` matching the chart file's `slug` field
- Dashboard tiles require: `type`, `x`, `y`, `w`, `h`. Optional: `uuid` (omit for new tiles — auto-generated), `tileSlug` (omit for new tiles), `tabUuid` (set to `null` for default tab)
- Dashboard tile types: `saved_chart`, `sql_chart`, `markdown`, `loom`, `heading`

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
9. **Dashboard filter fields**: In dashboard as-code, dimension filters require `operator` and `target` (with `fieldId` and `tableName`). The `id` field is optional (auto-generated). `label`, `values`, `settings`, `tileTargets`, `disabled`, `required`, and `singleValue` are all optional.
10. **Pinboard vs Liveboard key**: Older ThoughtSpot exports use `pinboard:` instead of `liveboard:` — handle both.
11. **Headline visualizations**: ThoughtSpot headlines are NOT a chart type — they are Liveboard visualizations with `display_headline_column` set. Map to `big_number` chart type.
12. **`is_mandatory` filter mapping**: ThoughtSpot `is_mandatory: true` on a filter maps to Lightdash `required: true` on the dashboard filter rule.
13. **`excluded_visualizations` mapping**: ThoughtSpot `excluded_visualizations` on a Liveboard filter maps to Lightdash `tileTargets`. Set excluded tiles to `false` in the `tileTargets` object (keyed by tile slug). Example: `tileTargets: { "excluded-chart-slug": false }`.
14. **Pie chart config**: Lightdash pie chart `config` has many optional fields beyond `isDonut`. The fields `groupFieldIds` (dimension field IDs) and `metricId` (metric field ID) help Lightdash render the pie correctly — include them when translating.
15. **`metricQuery.filters` is required**: Even when there are no filters, you must include `filters: {}` in the metricQuery. Omitting it entirely will fail schema validation. Similarly, `tableCalculations: []` is required even when empty.
16. **Tile `uuid` and `tileSlug`**: For new tiles, **omit** `uuid` and `tileSlug` entirely (don't set to `null`). They are auto-generated. Only include `tabUuid: null` when explicitly assigning to the default tab.

## After Translation

Once all YAML files are generated, validate them locally:

```bash
lightdash lint
```

Fix any errors before proceeding. Do **not** upload automatically — let the user review the generated files and upload when ready:

```bash
lightdash upload --charts <chart-slug>
lightdash upload --dashboards <dashboard-slug>
```

### Report Limitations

After generating all files, **always** provide the user with a summary of anything that could not be fully translated. Track limitations as you go and present them at the end. Include:

- **Charts converted to tables** — list which charts were originally a different type (e.g., Sankey, Heatmap, Candlestick) and were converted to table views because Lightdash doesn't support that chart type
- **Dropped features** — any ThoughtSpot-specific features that were skipped (e.g., `lesson_plans`, `spotiq_preference`, `index_priority`)
- **Formulas requiring manual work** — metrics using `group_aggregate`, LOD functions, or complex ThoughtSpot formulas that couldn't be directly translated
- **Parameters hardcoded** — any ThoughtSpot parameters that were replaced with static default values
- **Partial translations** — anything translated with best-effort mapping that the user should verify (e.g., geo charts, search query-based views)

Example output:

```
## Translation Summary

✅ Translated: 8 charts, 1 dashboard, 3 models
⚠️ Limitations:
  - "sales-by-region" was a Sankey chart → converted to table (Lightdash doesn't support Sankey)
  - "pipeline-heatmap" was a Heatmap → converted to table
  - Metric "rolling_avg_revenue" uses group_aggregate → needs manual SQL rewrite
  - Parameter "date_range" hardcoded to "last 12 months" → consider replacing with a dashboard filter
```

Do not skip this step. The user needs to know what requires manual attention.

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
| ThoughtSpot `lesson_plans` (Search Assist Coach) | Not supported | No Lightdash equivalent — drop during translation |
| ThoughtSpot `range_config` / `list_config` parameters | Not supported | Lightdash does not have parameter types with range/list constraints — use dashboard filters as a workaround |
| ThoughtSpot `index_type` / `index_priority` | Not applicable | These are ThoughtSpot search index settings with no Lightdash equivalent — drop during translation |
| ThoughtSpot `spotiq_preference` | Not applicable | SpotIQ is ThoughtSpot-specific — drop during translation |
| ThoughtSpot `is_attribution_dimension` / `is_additive` | Not applicable | These are ThoughtSpot-specific column properties — drop during translation |
| Pie chart detailed config (`groupFieldIds`, `metricId`, value labels) | Partial | Lightdash pie charts support `groupFieldIds`, `metricId`, `valueLabel`, `showValue`, `showPercentage`, `showLegend`, `legendPosition`, `groupColorOverrides`, `groupLabelOverrides`, `groupSortOverrides`. Only `isDonut` is shown in examples — include `groupFieldIds` and `metricId` for proper rendering |
| Cartesian chart `metadata` (series colors) | Not documented | Lightdash cartesian charts support a `metadata` field for per-series colors. ThoughtSpot `client_state` color settings could map here but the structure is not documented in this skill |
| Dashboard filter `tileTargets` structure | Partial | Keyed by tile slug; value is `false` (exclude tile) or `{fieldId, tableName}` (map to different field). Maps from ThoughtSpot `excluded_visualizations` |
| Dashboard filter `disabled`, `singleValue` fields | Not mapped | Lightdash supports `disabled` and `singleValue` on dashboard filters but ThoughtSpot TML has no direct equivalent |
| Big number chart additional config | Partial | Lightdash `big_number` supports `selectedField`, `label`, `style`, `showBigNumberLabel`, `showTableNamesInLabel`, `showComparison`, `comparisonField`, `comparisonFormat`, `comparisonLabel`, `flipColors`, `conditionalFormattings` — only `selectedField` and `label` are shown in examples |
| Heading tile `showDivider` | Not documented | Lightdash heading tiles support `showDivider?: boolean` — not mapped from ThoughtSpot TML |
| `pivotConfig` and `pivotDimensions` | Partial | PIVOT_TABLE charts need both `pivotConfig.columns` (chart root) and `metricQuery.pivotDimensions` (array of field IDs to pivot on). No example provided |
