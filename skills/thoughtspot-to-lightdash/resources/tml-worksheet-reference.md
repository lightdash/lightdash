# TML Worksheet / Model Reference

A ThoughtSpot Worksheet (or Model in v2 schema) defines the semantic layer - joins between tables, calculated columns, and column metadata (attributes vs measures). This maps to the Lightdash model YAML where you define dimensions, metrics, and joins.

> **Worksheet vs Model**: ThoughtSpot is deprecating Worksheets in favor of **Models** (v2 schema). Model TML files use `model:` as the top-level key instead of `worksheet:`, `model_tables:` instead of `tables:`, and `columns:` instead of `worksheet_columns:`. Model TML also uses a **different join structure** — joins are defined inline within each `model_tables` entry using `with:`, `on:`, and `cardinality:` instead of top-level `joins`/`joins_with` sections. See the "Model TML Structure" section below for details.

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
      type: INNER                    # INNER, LEFT_OUTER, RIGHT_OUTER, OUTER
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

  # Worksheet-level filters (use lowercase symbol operators)
  filters:
    - column:
        - "Status"
      oper: "in"                     # in, not in, between, =<, !=, <=, >=, >, <
      values:
        - "Active"

  # Query properties
  properties:
    is_bypass_rls: false
    join_progressive: true

  # Joins defined via joins_with (newer TML format)
  joins_with:
    - name: "Join to Products"
      description: "Optional join description"
      destination:
        name: dim_retapp_products
      on: "[fact_retapp_sales::product_id] = [dim_retapp_products::id]"
      type: LEFT_OUTER
      is_one_to_one: false           # boolean — true for 1:1, false for 1:many or many:1
```

## Model TML Structure

Model TML uses a different structure from Worksheet TML. Key differences:

```yaml
guid: <uuid>
model:
  name: "Model Name"
  description: "Optional description"

  # Source tables — note: `model_tables` not `tables`
  model_tables:
    - name: dim_products
      # Joins are INLINE within each table entry (not top-level)
      joins:
        - with: fact_sales              # `with` not `destination`
          on: "[dim_products::id] = [fact_sales::product_id]"
          type: LEFT_OUTER
          cardinality: MANY_TO_ONE      # MANY_TO_ONE, ONE_TO_ONE, ONE_TO_MANY
    - name: fact_sales

  formulas:
    - name: "Revenue per Unit"
      expr: "[fact_sales::revenue] / [fact_sales::units_sold]"
      id: formula_1

  filters:
    - column: "Status"
      oper: "in"
      values:
        - "Active"

  # Columns — note: `columns` not `worksheet_columns` or `model_columns`
  columns:
    - name: Product Name
      column_id: dim_products::product_name    # Note: no table_path alias, uses table name directly
      properties:
        column_type: ATTRIBUTE
    - name: Revenue
      column_id: fact_sales::revenue
      properties:
        column_type: MEASURE
        aggregation: SUM

  properties:
    is_bypass_rls: false
    join_progressive: true

  parameters:
    - id: param_1
      name: "Date Range"
      data_type: DATE
      default_value: "2024-01-01"
      range_config:
        range_min: "2020-01-01"
        range_max: "2030-01-01"
        include_min: true
        include_max: true
```

**Key differences from Worksheet TML:**
- Top-level key: `model:` instead of `worksheet:`
- Tables section: `model_tables:` instead of `tables:`
- Columns section: `columns:` instead of `worksheet_columns:`
- No `table_paths` section — Model TML uses table names directly in `column_id` (e.g., `fact_sales::revenue` not `sales_1::revenue`)
- Joins are defined **inline** within each `model_tables` entry using `with:` (destination), `on:`, `type:`, and `cardinality:` — not as top-level `joins` or `joins_with` sections

**Translation impact:** When processing Model TML, parse the inline `joins` within `model_tables` to build Lightdash join definitions. The `column_id` values reference table names directly (no table_path alias lookup needed).

## Key Fields

### `worksheet_columns`

Each column definition includes:
- `name` - display name
- `column_id` - reference in format `table_path_id::column_name`
- `formula_id` - if this is a calculated column, references a formula by name
- `description` - optional description
- `properties`:
  - `column_type` - `ATTRIBUTE` (dimension) or `MEASURE` (metric)
  - `aggregation` - for measures: `SUM`, `COUNT`, `COUNT_DISTINCT`, `AVERAGE`, `MIN`, `MAX`, `NONE`, `STD_DEVIATION`, `VARIANCE`
  - `index_type` - `DONT_INDEX` means hidden/internal
  - `synonyms` - alternative names for search
  - `is_hidden` - whether column is hidden from users
  - `is_attribution_dimension` - boolean, for attribution analysis
  - `is_additive` - boolean, whether measure is additive
  - `format_pattern` - display format string
  - `currency_type` - currency formatting with `iso_code`, `is_browser: true`, or `column: <name>`
  - `geo_config` - geographic data type configuration (latitude, longitude, country, region_name, custom_file_guid)
  - `calendar` - custom calendar configuration (`default` or `<calendar_name>`)
  - `data_type` - explicit data type override (`BOOL`, `VARCHAR`, `DOUBLE`, `FLOAT`, `INT`, `BIGINT`, `DATE`, `DATETIME`, `TIMESTAMP`, `TIME`)
  - `is_mandatory` - required filter
  - `index_priority` - numeric (1-10), search index priority
  - `spotiq_preference` - `EXCLUDE` to exclude from SpotIQ analysis

### `formulas`

Calculated fields using ThoughtSpot formula syntax:
- `expr` - expression using `[table_path::column]` references
- `properties.column_type` - whether result is MEASURE or ATTRIBUTE
- `properties.aggregation` - aggregation for measures

### `joins` vs `joins_with`

Two formats exist for Worksheet TML (Model TML uses a third format — see "Model TML Structure" above):
- **`joins`** (older): Simple source/destination/type — may include the `on` clause and `is_one_to_one`
- **`joins_with`** (newer): Includes `destination` (with `name` and optional `fqn`), `on` clause, `type`, and `is_one_to_one`. Note: `joins_with` does NOT have a `source` field — the source is implied from the worksheet's base table.

**Prefer `joins_with` when available** — it provides the `on` clause which maps directly to Lightdash's `sql_on`. When only `joins` is present without an `on` clause, you'll need to infer or ask for the join condition.

> **Note:** The `cardinality` field (`MANY_TO_ONE`, `ONE_TO_ONE`, `ONE_TO_MANY`) appears in Model TML inline joins, not in Worksheet `joins_with`. Worksheet TML uses `is_one_to_one` (boolean) instead.

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
| `OUTER` | `full` |

### `parameters`

Worksheets/Models can define parameters (dynamic runtime values):
- `id` - parameter identifier
- `name` - display name
- `data_type` - `VARCHAR`, `DOUBLE`, `INT`, `BIGINT`, `DATE`, `DATETIME`, `BOOL`
- `default_value` - default parameter value
- `range_config` - for numeric/date parameters: `range_min`, `range_max`, `include_min`, `include_max`
- `list_config` - for list parameters: `list_choice` values and `display_name` mappings

> **Note:** ThoughtSpot parameters have no direct Lightdash equivalent. During translation, hardcode the `default_value` or suggest using Lightdash dashboard filters as a workaround.

## Column ID Parsing

ThoughtSpot `column_id` format: `table_path_id::column_name`

Example: `dim_products_1::productname`
- `dim_products_1` → look up in `table_paths` to find actual table: `dim_retapp_products`
- `productname` → the column name in that table
- In Lightdash: `${dim_retapp_products}.productname`
