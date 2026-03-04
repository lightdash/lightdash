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
| **Table** (`.table.tml`) | dbt model / source reference | Used for column mapping |
| **View** (`.view.tml`) | Model YAML (derived) | `models/<model>.yml` |

## Before You Start

1. Ensure Lightdash Skills (`developing-in-lightdash`) is installed - you need it for the chart/dashboard YAML format
2. Have the user's TML files available (they export from ThoughtSpot via **Export TML**)
3. Know the user's dbt project structure - specifically which dbt models correspond to ThoughtSpot tables

```bash
# Verify skills are installed
ls .claude/skills/developing-in-lightdash/SKILL.md 2>/dev/null && echo "Skills ready" || echo "Run: lightdash install-skills"
```

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
| `BAR` | `cartesian` (horizontal bar) | Swap x/y axes, `type: bar` |
| `LINE` | `cartesian` (line) | Set series `type: line` |
| `AREA` | `cartesian` (area) | Set series `type: area` |
| `STACKED_COLUMN` | `cartesian` (stacked bar) | `type: bar` with stacking |
| `STACKED_AREA` | `cartesian` (stacked area) | `type: area` with stacking |
| `PIE` | `pie` | |
| `DONUT` | `pie` | Same type, Lightdash auto-renders |
| `SCATTER` | `cartesian` (scatter) | Set series `type: scatter` |
| `BUBBLE` | `cartesian` (scatter) | Use scatter with size encoding |
| `GEO_AREA` / `GEO_BUBBLE` | `cartesian` | Map charts not directly supported as-is; use table or cartesian |
| `TABLE` | `table` | |
| `KPI` / `HEADLINE` | `big_number` | |
| `FUNNEL` | `funnel` | |
| `TREEMAP` | `treemap` | |
| `GAUGE` | `gauge` | |
| `WATERFALL` | `cartesian` (bar) | Approximate with stacked bar |
| `PIVOT_TABLE` | `table` | Use pivot configuration |

## Filter Operator Mapping

| ThoughtSpot `oper` | Lightdash `operator` |
|-------------------|---------------------|
| `EQ` | `equals` |
| `NE` | `notEquals` |
| `LT` | `lessThan` |
| `LE` | `lessThanOrEqual` |
| `GT` | `greaterThan` |
| `GE` | `greaterThanOrEqual` |
| `IN` | `equals` (with multiple values) |
| `NOT_IN` | `notEquals` (with multiple values) |
| `CONTAINS` | `include` |
| `NOT_CONTAINS` | `doesNotInclude` |
| `BEGINS_WITH` | `startsWith` |
| `ENDS_WITH` | `endsWith` |
| `IS_NULL` | `isNull` |
| `IS_NOT_NULL` | `notNull` |
| `BW_INC` / `BW` | `inBetween` |

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
- Every chart YAML needs a `downloadedAt` timestamp (ISO 8601 format, use current time)
- Every chart YAML needs `version: 1`
- Dashboard tiles reference charts by `chartSlug` matching the chart file's `slug` field

## Complete Translation Example

See [Full Translation Example](./resources/translation-example.md) for a worked end-to-end example showing TML input and Lightdash YAML output.

## Common Pitfalls

1. **Missing `downloadedAt`**: Charts without this field fail on upload. Always include it.
2. **Wrong directory structure**: `lightdash/charts/` and `lightdash/dashboards/` are separate - don't put everything in one folder.
3. **Slug format**: Use hyphens (`my-chart`) not underscores (`my_chart`).
4. **Column references**: ThoughtSpot uses `table_path::column_name` syntax. Convert to Lightdash's `${TABLE}.column_name` format.
5. **Nested table relationships**: ThoughtSpot Worksheets can span 20-30 tables. Map each to the correct dbt model before generating metrics.
6. **Formula translation**: ThoughtSpot's `group_aggregate` and LOD functions don't have direct Lightdash equivalents. Use SQL metrics or suggest dbt intermediate models.
7. **Liveboard filters vs chart filters**: ThoughtSpot Liveboard filters apply across visualizations. In Lightdash, dashboard filters target specific fields - map the `column` reference to the correct `fieldId` and `tableName`.
