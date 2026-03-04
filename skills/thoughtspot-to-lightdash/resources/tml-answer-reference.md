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
      type: INNER              # INNER, LEFT_OUTER, RIGHT_OUTER, FULL_OUTER
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
        aggregation: SUM
      was_auto_generated: false

  # ThoughtSpot search query (defines what columns are queried)
  search_query: "[City] [State] [Quantity Purchased]"

  # Result columns
  answer_columns:
    - name: City
      custom_name: "City Name"     # Optional display override
      format:                      # Optional formatting
        category: NUMBER
        numberFormatConfig:
          decimals: 2
          toSeparateThousands: true
    - name: Total Quantity Purchased
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
        - City
        "y":
        - Total Quantity Purchased

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

### `formulas`

Calculated fields with ThoughtSpot expression syntax:
- `expr` - the formula expression using `[table_path::column]` references
- `properties.column_type` - MEASURE or ATTRIBUTE
- `properties.aggregation` - aggregation type if MEASURE

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
  exploreName: model_name
  dimensions:
    - model_name_city                    # tableName_dimensionName format
    - model_name_state
  metrics:
    - model_name_total_quantity_purchased
  filters:
    dimensions: []
    metrics: []
    tableCalculations: []
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

ThoughtSpot chart types found in TML:
- `COLUMN` - vertical bar chart
- `BAR` - horizontal bar chart
- `LINE` - line chart
- `AREA` - area chart
- `STACKED_COLUMN` - stacked vertical bar
- `STACKED_BAR` - stacked horizontal bar
- `STACKED_AREA` - stacked area chart
- `PIE` - pie chart
- `DONUT` - donut chart
- `SCATTER` - scatter plot
- `BUBBLE` - bubble chart
- `GEO_AREA` - geographic area/choropleth map
- `GEO_BUBBLE` - geographic bubble map
- `TABLE` - data table
- `KPI` / `HEADLINE` - single number KPI
- `FUNNEL` - funnel chart
- `TREEMAP` - treemap
- `GAUGE` - gauge chart
- `WATERFALL` - waterfall chart
- `PIVOT_TABLE` - pivot table
- `SANKEY` - sankey diagram
- `CANDLESTICK` - candlestick chart
