# TML Answer Reference

A ThoughtSpot Answer represents a single chart or table query. It contains the data source references, query columns, and visualization configuration.

## TML Structure

```yaml
guid: <uuid>
answer:
  name: "How many items purchased by state?"
  description: "Optional description"

  # Data sources (Tables or Worksheets)
  tables:
    - id: "Worksheet or Table Name"
      name: "Worksheet or Table Name"
      fqn: "optional-fully-qualified-name"

  # Joins (if querying across tables directly)
  joins:
    - name: join_name
      source: source_table
      destination: dest_table
      type: INNER              # INNER, LEFT_OUTER, RIGHT_OUTER, OUTER
      is_one_to_one: false
      on: "[source.col] = [dest.col]"

  # Table paths (join traversal paths)
  table_paths:
    - id: table_alias_1
      table: actual_table_name
      join_path:
        - join:
          - join_name_1

  # Formulas (calculated fields)
  formulas:
    - id: formula_id
      name: "Formula Name"
      expr: "sum([table_path::column])"
      properties:
        column_type: MEASURE       # MEASURE or ATTRIBUTE
        aggregation: SUM           # SUM, COUNT, AVERAGE, MAX, MIN, COUNT_DISTINCT, NONE, STD_DEVIATION, VARIANCE
        data_type: DOUBLE          # BOOL, VARCHAR, DOUBLE, FLOAT, INT, BIGINT, DATE, DATETIME, TIMESTAMP, TIME
      was_auto_generated: false

  # ThoughtSpot search query (defines what columns are queried)
  search_query: "[City] [State] [Quantity Purchased]"

  # Result columns
  answer_columns:
    - id: City                     # Column identifier
      name: City
      custom_name: "City Name"     # Optional display override
      format:                      # Optional formatting
        category: NUMBER
        numberFormatConfig:
          decimals: 2
          toSeparateThousands: true
    - id: Total Quantity Purchased
      name: Total Quantity Purchased
      sort_info:
        category: CUSTOM_ORDER     # or DEFAULT

  # Table visualization configuration
  table:
    table_columns:
      - column_id: City
        headline_aggregation: COUNT_DISTINCT
      - column_id: Total Quantity Purchased
        headline_aggregation: SUM
    ordered_column_ids:
      - City
      - Total Quantity Purchased

  # Chart visualization configuration
  chart:
    type: COLUMN                   # See chart type enum below
    chart_columns:
      - column_id: City
      - column_id: Total Quantity Purchased
    axis_configs:
      - x:
          - column_id: City
        "y":
          - column_id: Total Quantity Purchased
        color:                     # Optional: columns for color encoding
          - column_id: Category
    locked: false                  # Whether chart config is locked
    client_state: "<json_string>"  # Optional: detailed visual config

  # Display mode
  display_mode: CHART_MODE         # CHART_MODE or TABLE_MODE

  # Parameters (dynamic values)
  parameters:
    - id: param_id
      name: "Parameter Name"
      data_type: VARCHAR
      default_value: "default"
  parameter_values:
    param_id: "current_value"
```

## Key Fields

### `search_query`

ThoughtSpot's search bar syntax. This is the primary way to understand what the Answer queries. Columns are in brackets, and keywords modify the query behavior:

**Column references:**
- `[Column Name]` — a dimension or measure
- `[Table.Column]` — qualified column reference (used when column names are ambiguous)

**Aggregation keywords** (prefix a column):
- `sum [Revenue]`, `count [Orders]`, `average [Price]`, `count distinct [Customer ID]`
- `min [Date]`, `max [Date]`

**Limit/sort keywords:**
- `top 10` or `bottom 5` — maps to Lightdash `metricQuery.limit`
- `sort by [Column] ascending` / `sort by [Column] descending` — maps to `metricQuery.sorts`

**Time granularity keywords:**
- `daily [Date]`, `weekly [Date]`, `monthly [Date]`, `quarterly [Date]`, `yearly [Date]`
- Maps to the dimension's time granularity in Lightdash (e.g., `order_date_month`)

**Filter keywords in search query:**
- `[Status] = 'Active'` — inline filter, maps to `metricQuery.filters`
- `[Date] > '2024-01-01'` — date filter
- `[Region] != 'Other'` — exclusion filter

**Example parsing:**
```
search_query: "[Category] [Revenue] top 10 sort by [Revenue] descending monthly [Order Date]"
```
→ Dimensions: `category`, `order_date` (with month granularity)
→ Metrics: `total_revenue`
→ Limit: 10
→ Sorts: `total_revenue` descending

### `answer_columns`

The columns in the result set. Each has:
- `name` - column identifier
- `custom_name` - optional display label
- `format` - number/currency/percentage formatting
- `sort_info` - sort configuration

### `chart`

Visualization configuration:
- `type` - chart type enum (COLUMN, LINE, PIE, etc.)
- `chart_columns` - columns used in the chart
- `axis_configs` - which columns go on x vs y axis
- Additional config in `client_state_v2` (JSON string with colors, labels, etc.)

### `table`

Table visualization configuration:
- `table_columns` - column specifications with `column_id`, `show_headline` (boolean), `headline_aggregation`
  - `headline_aggregation` values: `COUNT`, `COUNT_DISTINCT`, `SUM`, `MIN`, `MAX`, `AVERAGE`, `TABLE_AGGR`
- `ordered_column_ids` - display sequence of columns
- `client_state` - JSON string for advanced configuration

### `formulas`

Calculated fields with ThoughtSpot expression syntax:
- `id` - optional identifier (defaults to "Untitled Formula")
- `name` - formula display name
- `expr` - the formula expression using `[table_path::column]` references
- `properties.column_type` - MEASURE or ATTRIBUTE
- `properties.aggregation` - aggregation type if MEASURE
- `properties.data_type` - explicit data type (`BOOL`, `VARCHAR`, `DOUBLE`, `FLOAT`, `INT`, `BIGINT`, `DATE`, `DATETIME`, `TIMESTAMP`, `TIME`)
- `was_auto_generated` - boolean indicating if formula was auto-generated

## Translation to Lightdash Chart

```yaml
# Lightdash chart output
version: 1
name: "How many items purchased by state?"
description: "Optional description"
tableName: model_name                    # From table mapping
slug: how-many-items-purchased-by-state
spaceSlug: target-space
updatedAt: "2026-03-04T00:00:00.000Z"
downloadedAt: "2026-03-04T00:00:00.000Z"

metricQuery:
  exploreName: model_name               # Required — same as tableName
  dimensions:
    - model_name_city                    # tableName_dimensionName format
    - model_name_state
  metrics:
    - model_name_total_quantity_purchased
  filters: {}                           # Empty filters — use FilterGroup format if needed:
  # filters:                            # Example with filters:
  #   dimensions:
  #     and:
  #       - target:
  #           fieldId: model_name_status
  #           tableName: model_name
  #         operator: equals
  #         values:
  #           - "Active"
  #         id: filter-1                # Optional in chart-as-code
  sorts:
    - fieldId: model_name_total_quantity_purchased
      descending: true
  limit: 500
  tableCalculations: []

chartConfig:
  type: cartesian                        # Mapped from COLUMN
  config:
    layout:
      xField: model_name_city
      yField:
        - model_name_total_quantity_purchased
    eChartsConfig:
      series:
        - type: bar
          encode:
            xRef:
              field: model_name_city
            yRef:
              field: model_name_total_quantity_purchased

tableConfig:
  columnOrder:
    - model_name_city
    - model_name_state
    - model_name_total_quantity_purchased
```

### Field ID Format

Lightdash field IDs follow the pattern: `tableName_fieldName` where both are snake_case.

For ThoughtSpot columns:
- `City` from table `retail_apparel` → `retail_apparel_city`
- `Total Quantity Purchased` → `retail_apparel_total_quantity_purchased` (if it's a metric)
- Or use the dimension/metric name as defined in the Lightdash model YAML

### Determining Dimensions vs Metrics

From the ThoughtSpot Answer:
1. Check `answer_columns` against the Worksheet's `worksheet_columns`
2. Columns with `column_type: ATTRIBUTE` → dimensions
3. Columns with `column_type: MEASURE` → metrics
4. If no Worksheet is available, infer from `table.table_columns`:
   - Columns with `headline_aggregation` (SUM, COUNT, etc.) are likely measures
   - Others are dimensions

## Chart Type Enum Values

ThoughtSpot chart types found in TML (per official docs):
- `COLUMN` - vertical bar chart
- `BAR` - horizontal bar chart
- `LINE` - line chart
- `AREA` - area chart
- `STACKED_COLUMN` - stacked vertical bar
- `STACKED_BAR` - stacked horizontal bar
- `STACKED_AREA` - stacked area chart
- `PIE` - pie chart
- `SCATTER` - scatter plot
- `BUBBLE` - bubble chart
- `GEO_AREA` - geographic area/choropleth map
- `GEO_BUBBLE` - geographic bubble map
- `GEO_HEATMAP` - geographic heatmap
- `GEO_EARTH_BAR` - 3D earth bar chart
- `GEO_EARTH_AREA` - 3D earth area chart
- `GEO_EARTH_GRAPH` - 3D earth graph
- `GEO_EARTH_BUBBLE` - 3D earth bubble chart
- `GEO_EARTH_HEATMAP` - 3D earth heatmap
- `TABLE` - data table
- `GRID_TABLE` - grid table
- `FUNNEL` - funnel chart
- `TREEMAP` - treemap
- `WATERFALL` - waterfall chart
- `HEATMAP` - heatmap
- `PIVOT_TABLE` - pivot table
- `SANKEY` - sankey diagram
- `SPIDER_WEB` - spider/radar chart
- `WHISKER_SCATTER` - box plot / whisker scatter
- `CANDLESTICK` - candlestick chart
- `LINE_COLUMN` - mixed line + column chart
- `LINE_STACKED_COLUMN` - mixed line + stacked column chart
- `PARETO` - pareto chart

> **Note:** `DONUT`, `GAUGE`, `KPI`, and `HEADLINE` are NOT chart type enum values. Donut is a PIE chart configuration. Headlines/KPIs are Liveboard visualizations with `display_headline_column` set (no `chart` section).
