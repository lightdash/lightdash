# TML Worksheet / Model Reference

A ThoughtSpot Worksheet (or Model in v2 schema) defines the semantic layer - joins between tables, calculated columns, and column metadata (attributes vs measures). This maps to the Lightdash model YAML where you define dimensions, metrics, and joins.

> **Worksheet vs Model**: ThoughtSpot is deprecating Worksheets in favor of **Models** (v2 schema). Model TML files use `model:` as the top-level key instead of `worksheet:`, and `model_columns:` instead of `worksheet_columns:`. The structure is otherwise identical. Apply the same translation rules to both.

## TML Structure

```yaml
guid: <uuid>
worksheet:
  name: "(Sample) Retail - Apparel"
  description: "Optional description"

  # Source tables
  tables:
    - name: dim_retapp_products
    - name: dim_retapp_stores
    - name: fact_retapp_sales

  # Join definitions
  joins:
    - name: join_products
      source: fact_retapp_sales
      destination: dim_retapp_products
      type: INNER                    # INNER, LEFT_OUTER, RIGHT_OUTER, FULL_OUTER
      is_one_to_one: false
    - name: join_stores
      source: fact_retapp_sales
      destination: dim_retapp_stores
      type: LEFT_OUTER
      is_one_to_one: false

  # Table paths (how to traverse joins to reach columns)
  table_paths:
    - id: dim_products_1
      table: dim_retapp_products
      join_path:
        - join:
          - join_products
    - id: dim_stores_1
      table: dim_retapp_stores
      join_path:
        - join:
          - join_stores
    - id: fact_sales_1
      table: fact_retapp_sales
      join_path:
        - {}                         # Base table, no join needed

  # Calculated columns / formulas
  formulas:
    - name: "# of Products"
      expr: "count ( [dim_products_1::productid] )"
      was_auto_generated: false
    - name: "Revenue per Unit"
      expr: "[fact_sales_1::sales] / [fact_sales_1::quantitypurchased]"
      properties:
        column_type: MEASURE
        aggregation: SUM

  # Column definitions
  worksheet_columns:
    - name: Product
      column_id: dim_products_1::productname
      properties:
        column_type: ATTRIBUTE
        synonyms:
          - Item
    - name: City
      column_id: dim_stores_1::city
      properties:
        column_type: ATTRIBUTE
    - name: State
      column_id: dim_stores_1::state
      properties:
        column_type: ATTRIBUTE
        geo_config:
          region_name:
            country: UNITED STATES
            region_name: state
    - name: Quantity Purchased
      column_id: fact_sales_1::quantitypurchased
      properties:
        column_type: MEASURE
        aggregation: SUM
    - name: Sales
      column_id: fact_sales_1::sales
      properties:
        column_type: MEASURE
        aggregation: SUM
        synonyms:
          - Revenue
        currency_type:
          iso_code: USD
    - name: "# of Products"
      formula_id: "# of Products"
      properties:
        column_type: MEASURE
        aggregation: SUM

  # Worksheet-level filters
  filters:
    - column:
        - "Status"
      oper: EQ
      values:
        - "Active"

  # Query properties
  properties:
    is_bypass_rls: false
    join_progressive: true

  # Joins defined via joins_with (newer TML format)
  joins_with:
    - name: "Join to Products"
      source:
        name: fact_retapp_sales
      destination:
        name: dim_retapp_products
      on: "[fact_retapp_sales::product_id] = [dim_retapp_products::id]"
      type: LEFT_OUTER
      cardinality: MANY_TO_ONE
```

## Key Fields

### `worksheet_columns`

Each column definition includes:
- `name` - display name
- `column_id` - reference in format `table_path_id::column_name`
- `formula_id` - if this is a calculated column, references a formula by name
- `description` - optional description
- `properties`:
  - `column_type` - `ATTRIBUTE` (dimension) or `MEASURE` (metric)
  - `aggregation` - for measures: `SUM`, `COUNT`, `COUNT_DISTINCT`, `AVG`, `MIN`, `MAX`
  - `index_type` - `DONT_INDEX` means hidden/internal
  - `synonyms` - alternative names for search
  - `is_hidden` - whether column is hidden from users
  - `format_pattern` - display format string
  - `currency_type` - currency formatting with `iso_code`
  - `geo_config` - geographic data type configuration
  - `calendar` - custom calendar configuration
  - `data_type` - explicit data type override
  - `is_mandatory` - required filter

### `formulas`

Calculated fields using ThoughtSpot formula syntax:
- `expr` - expression using `[table_path::column]` references
- `properties.column_type` - whether result is MEASURE or ATTRIBUTE
- `properties.aggregation` - aggregation for measures

### `joins` vs `joins_with`

Two formats exist:
- **`joins`** (older): Simple source/destination/type
- **`joins_with`** (newer): Includes full Identity objects with `on` clause and cardinality

### `table_paths`

Define how to traverse from the base table through joins to reach columns:
- `id` - alias used in `column_id` references (e.g., `dim_products_1`)
- `table` - actual table name
- `join_path` - ordered list of joins to traverse

## Translation to Lightdash Model YAML

### For dbt Projects

```yaml
# models/schema.yml (dbt project with Lightdash meta)
version: 2
models:
  - name: fact_retapp_sales
    meta:
      joins:
        - join: dim_retapp_products
          sql_on: "${fact_retapp_sales.product_id} = ${dim_retapp_products.id}"
          type: left                    # Mapped from LEFT_OUTER
        - join: dim_retapp_stores
          sql_on: "${fact_retapp_sales.store_id} = ${dim_retapp_stores.id}"
          type: inner                   # Mapped from INNER
    columns:
      - name: quantitypurchased
        meta:
          dimension:
            label: "Quantity Purchased"
            type: number
            hidden: true
          metrics:
            total_quantity_purchased:
              type: sum
              label: "Total Quantity Purchased"
      - name: sales
        meta:
          dimension:
            label: "Sales"
            type: number
            hidden: true
          metrics:
            total_sales:
              type: sum
              label: "Total Sales"
              format: usd
              round: 2

  - name: dim_retapp_products
    columns:
      - name: productname
        meta:
          dimension:
            label: "Product"
            type: string
      - name: producttype
        meta:
          dimension:
            label: "Product Type"
            type: string

  - name: dim_retapp_stores
    columns:
      - name: city
        meta:
          dimension:
            label: "City"
            type: string
      - name: state
        meta:
          dimension:
            label: "State"
            type: string
```

### For Pure Lightdash Projects

```yaml
# models/fact_retapp_sales.yml
type: model
name: fact_retapp_sales
sql_from: SCHEMA.FACT_RETAPP_SALES

joins:
  - join: dim_retapp_products
    sql_on: "${fact_retapp_sales.product_id} = ${dim_retapp_products.id}"
    type: left
  - join: dim_retapp_stores
    sql_on: "${fact_retapp_sales.store_id} = ${dim_retapp_stores.id}"
    type: inner

dimensions:
  - name: quantity_purchased
    sql: ${TABLE}.QUANTITYPURCHASED
    type: number
    label: "Quantity Purchased"
    hidden: true

metrics:
  total_quantity_purchased:
    type: sum
    sql: ${TABLE}.QUANTITYPURCHASED
    label: "Total Quantity Purchased"
  total_sales:
    type: sum
    sql: ${TABLE}.SALES
    label: "Total Sales"
    format: usd
    round: 2
  product_count:
    type: count_distinct
    sql: ${dim_retapp_products}.PRODUCTID
    label: "# of Products"
```

## Join Type Mapping

| ThoughtSpot `type` | Lightdash `type` |
|-------------------|-----------------|
| `INNER` | `inner` |
| `LEFT_OUTER` | `left` |
| `RIGHT_OUTER` | `right` |
| `FULL_OUTER` | `full` |

## Column ID Parsing

ThoughtSpot `column_id` format: `table_path_id::column_name`

Example: `dim_products_1::productname`
- `dim_products_1` → look up in `table_paths` to find actual table: `dim_retapp_products`
- `productname` → the column name in that table
- In Lightdash: `${dim_retapp_products}.productname`
