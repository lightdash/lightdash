# Full Translation Example

This shows a complete end-to-end translation from ThoughtSpot TML to Lightdash YAML.

## Input: ThoughtSpot TML Files

### 1. Worksheet TML (`retail_apparel.worksheet.tml`)

```yaml
guid: 2ea7add9-0ccb-4ac1-90bb-231794ebb377
worksheet:
  name: "Retail - Apparel"
  tables:
    - name: dim_products
    - name: dim_stores
    - name: fact_sales
  joins:
    - name: join_products
      source: fact_sales
      destination: dim_products
      type: LEFT_OUTER
      is_one_to_one: false
    - name: join_stores
      source: fact_sales
      destination: dim_stores
      type: LEFT_OUTER
      is_one_to_one: false
  table_paths:
    - id: products_1
      table: dim_products
      join_path:
        - join:
          - join_products
    - id: stores_1
      table: dim_stores
      join_path:
        - join:
          - join_stores
    - id: sales_1
      table: fact_sales
      join_path:
        - {}
  formulas:
    - name: "Revenue per Unit"
      expr: "[sales_1::revenue] / [sales_1::units_sold]"
      properties:
        column_type: MEASURE
        aggregation: SUM
  worksheet_columns:
    - name: Product Name
      column_id: products_1::product_name
      properties:
        column_type: ATTRIBUTE
    - name: Category
      column_id: products_1::category
      properties:
        column_type: ATTRIBUTE
    - name: Store Name
      column_id: stores_1::store_name
      properties:
        column_type: ATTRIBUTE
    - name: City
      column_id: stores_1::city
      properties:
        column_type: ATTRIBUTE
    - name: State
      column_id: stores_1::state
      properties:
        column_type: ATTRIBUTE
    - name: Revenue
      column_id: sales_1::revenue
      properties:
        column_type: MEASURE
        aggregation: SUM
        currency_type:
          iso_code: USD
    - name: Units Sold
      column_id: sales_1::units_sold
      properties:
        column_type: MEASURE
        aggregation: SUM
    - name: "Revenue per Unit"
      formula_id: "Revenue per Unit"
      properties:
        column_type: MEASURE
```

### 2. Answer TML (`revenue_by_state.answer.tml`)

```yaml
guid: d00f3754-15a9-4a7a-a3d5-3248ad19aa9d
answer:
  name: "Revenue by State"
  tables:
    - name: "Retail - Apparel"
  search_query: "[State] [Revenue]"
  answer_columns:
    - name: State
    - name: Total Revenue
  table:
    table_columns:
      - column_id: State
        headline_aggregation: COUNT_DISTINCT
      - column_id: Total Revenue
        headline_aggregation: SUM
    ordered_column_ids:
      - State
      - Total Revenue
  chart:
    type: COLUMN
    chart_columns:
      - column_id: State
      - column_id: Total Revenue
    axis_configs:
      - x:
        - State
        "y":
        - Total Revenue
  display_mode: CHART_MODE
```

### 3. Answer TML (`top_categories.answer.tml`)

```yaml
guid: a1b2c3d4-e5f6-7890-abcd-ef1234567890
answer:
  name: "Top Categories by Revenue"
  tables:
    - name: "Retail - Apparel"
  search_query: "[Category] [Revenue] top 10"
  answer_columns:
    - name: Category
    - name: Total Revenue
  chart:
    type: PIE
    chart_columns:
      - column_id: Category
      - column_id: Total Revenue
  display_mode: CHART_MODE
```

### 4. Liveboard TML (`sales_overview.liveboard.tml`)

```yaml
guid: 4c6e8502-1695-4dc4-b0b0-215dae7a6d71
liveboard:
  name: "Sales Overview"
  description: "Key sales metrics and breakdowns"
  visualizations:
    - id: Viz_1
      answer:
        name: "Revenue by State"
        tables:
          - name: "Retail - Apparel"
        search_query: "[State] [Revenue]"
        answer_columns:
          - name: State
          - name: Total Revenue
        chart:
          type: COLUMN
          chart_columns:
            - column_id: State
            - column_id: Total Revenue
          axis_configs:
            - x:
              - State
              "y":
              - Total Revenue
        display_mode: CHART_MODE
      viz_guid: viz-guid-1
    - id: Viz_2
      answer:
        name: "Top Categories by Revenue"
        tables:
          - name: "Retail - Apparel"
        search_query: "[Category] [Revenue] top 10"
        answer_columns:
          - name: Category
          - name: Total Revenue
        chart:
          type: PIE
          chart_columns:
            - column_id: Category
            - column_id: Total Revenue
        display_mode: CHART_MODE
      viz_guid: viz-guid-2
  filters:
    - column:
        - State
      oper: IN
      values:
        - "California"
        - "New York"
  layout:
    tiles:
      - visualization_id: Viz_1
        x: 0
        y: 0
        width: 12
        height: 6
      - visualization_id: Viz_2
        x: 12
        y: 0
        width: 12
        height: 6
```

---

## Output: Lightdash YAML Files

### 1. Model YAML (`models/schema.yml` - dbt project)

```yaml
version: 2
models:
  - name: fact_sales
    meta:
      joins:
        - join: dim_products
          sql_on: "${fact_sales.product_id} = ${dim_products.id}"
          type: left
        - join: dim_stores
          sql_on: "${fact_sales.store_id} = ${dim_stores.id}"
          type: left
      # Revenue per Unit - from ThoughtSpot formula
      # Original: [sales_1::revenue] / [sales_1::units_sold]
      # Model-level metric (not column-level) because it combines multiple columns
      metrics:
        revenue_per_unit:
          type: number
          label: "Revenue per Unit"
          sql: "SUM(${TABLE}.revenue) / NULLIF(SUM(${TABLE}.units_sold), 0)"
    columns:
      - name: revenue
        meta:
          dimension:
            type: number
            label: "Revenue"
            hidden: true
          metrics:
            total_revenue:
              type: sum
              label: "Total Revenue"
              format: usd
              round: 2
      - name: units_sold
        meta:
          dimension:
            type: number
            label: "Units Sold"
            hidden: true
          metrics:
            total_units_sold:
              type: sum
              label: "Total Units Sold"

  - name: dim_products
    columns:
      - name: product_name
        meta:
          dimension:
            type: string
            label: "Product Name"
      - name: category
        meta:
          dimension:
            type: string
            label: "Category"

  - name: dim_stores
    columns:
      - name: store_name
        meta:
          dimension:
            type: string
            label: "Store Name"
      - name: city
        meta:
          dimension:
            type: string
            label: "City"
      - name: state
        meta:
          dimension:
            type: string
            label: "State"
```

### 2. Chart YAML (`lightdash/charts/revenue-by-state.yml`)

```yaml
version: 1
name: "Revenue by State"
slug: revenue-by-state
spaceSlug: sales
tableName: fact_sales
description: null
updatedAt: "2026-03-04T20:00:00.000Z"
downloadedAt: "2026-03-04T20:00:00.000Z"
dashboardSlug: null

metricQuery:
  exploreName: fact_sales
  dimensions:
    - dim_stores_state
  metrics:
    - fact_sales_total_revenue
  filters:
    dimensions: []
    metrics: []
    tableCalculations: []
  sorts:
    - fieldId: fact_sales_total_revenue
      descending: true
  limit: 500
  tableCalculations: []

chartConfig:
  type: cartesian
  config:
    layout:
      xField: dim_stores_state
      yField:
        - fact_sales_total_revenue
    eChartsConfig:
      series:
        - type: bar
          encode:
            xRef:
              field: dim_stores_state
            yRef:
              field: fact_sales_total_revenue

tableConfig:
  columnOrder:
    - dim_stores_state
    - fact_sales_total_revenue
```

### 3. Chart YAML (`lightdash/charts/top-categories-by-revenue.yml`)

```yaml
version: 1
name: "Top Categories by Revenue"
slug: top-categories-by-revenue
spaceSlug: sales
tableName: fact_sales
description: null
updatedAt: "2026-03-04T20:00:00.000Z"
downloadedAt: "2026-03-04T20:00:00.000Z"
dashboardSlug: null

metricQuery:
  exploreName: fact_sales
  dimensions:
    - dim_products_category
  metrics:
    - fact_sales_total_revenue
  filters:
    dimensions: []
    metrics: []
    tableCalculations: []
  sorts:
    - fieldId: fact_sales_total_revenue
      descending: true
  limit: 10
  tableCalculations: []

chartConfig:
  type: pie
  config: {}

tableConfig:
  columnOrder:
    - dim_products_category
    - fact_sales_total_revenue
```

### 4. Dashboard YAML (`lightdash/dashboards/sales-overview.yml`)

```yaml
version: 1
name: "Sales Overview"
slug: sales-overview
spaceSlug: sales
description: "Key sales metrics and breakdowns"
updatedAt: "2026-03-04T20:00:00.000Z"
downloadedAt: "2026-03-04T20:00:00.000Z"

tabs: []

tiles:
  - type: saved_chart
    x: 0
    y: 0
    w: 18
    h: 9
    properties:
      chartSlug: revenue-by-state
      title: "Revenue by State"
      hideTitle: false
  - type: saved_chart
    x: 18
    y: 0
    w: 18
    h: 9
    properties:
      chartSlug: top-categories-by-revenue
      title: "Top Categories by Revenue"
      hideTitle: false

filters:
  dimensions:
    - id: "filter-state-1"
      target:
        fieldId: dim_stores_state
        tableName: fact_sales
      operator: equals
      values:
        - "California"
        - "New York"
  metrics: []
  tableCalculations: []
```

## Translation Notes

1. **Grid scaling**: ThoughtSpot used a 24-column grid (width 12 + x 12 = 24). Lightdash uses 36 columns. Each tile was scaled: `12/24 * 36 = 18`.

2. **Field IDs**: Lightdash field IDs are `tableName_fieldName` in snake_case. Dimensions from joined tables use the join table name: `dim_stores_state` (not `fact_sales_state`).

3. **Formula translation**: ThoughtSpot's `[sales_1::revenue] / [sales_1::units_sold]` became a model-level SQL metric: `SUM(${TABLE}.revenue) / NULLIF(SUM(${TABLE}.units_sold), 0)`. Note: this is defined under model-level `meta.metrics` (not on a column) because it combines multiple columns. Added `SUM()` aggregation wrappers and `NULLIF` to avoid division by zero.

4. **Filter translation**: ThoughtSpot `oper: IN` with multiple values → Lightdash `operator: equals` with multiple values (Lightdash `equals` with an array acts as IN).

5. **Chart type**: ThoughtSpot `COLUMN` → Lightdash `cartesian` with `series[].type: bar`.

6. **Limit from search query**: ThoughtSpot `top 10` in search query → Lightdash `metricQuery.limit: 10`.

7. **downloadedAt**: Every chart and dashboard file needs this timestamp or upload will fail.
