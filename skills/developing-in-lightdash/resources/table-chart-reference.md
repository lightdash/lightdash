# Table Chart Reference

## Overview

Table visualizations display your query results in a tabular format with powerful configuration options for customization, conditional formatting, and data presentation. Tables support features like frozen columns, bar visualizations within cells, custom column names, and sophisticated conditional formatting rules.

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/tableChart`.

## Basic YAML Structure

```yaml
contentType: chart
chartConfig:
  type: "table"
  config:
    columns:
      field_id_1:
        frozen: true
        name: "Custom Column Name"
        visible: true
    conditionalFormattings: []
    hideRowNumbers: false
    showColumnCalculation: true
metricQuery:
  exploreName: "my_explore"
  dimensions:
    - field_id_1
  metrics:
    - metric_id_1
name: "My Table Chart"
slug: "my-table-chart"
spaceSlug: "my-space"
tableName: "my_explore"
version: 1
```

## Key Configuration Options

### Display Options

| Property | Type | Description |
|----------|------|-------------|
| `showColumnCalculation` | boolean | Show column totals at the bottom |
| `showRowCalculation` | boolean | Show row totals in an additional column |
| `showTableNames` | boolean | Show table names in column headers (e.g., "users.name" vs "name") |
| `hideRowNumbers` | boolean | Hide the row number column |
| `showResultsTotal` | boolean | Show total count of results |
| `showSubtotals` | boolean | Show subtotal rows for grouped data |
| `metricsAsRows` | boolean | Display metrics as rows instead of columns (pivoted view) |

### Column Configuration

The `columns` object allows per-column customization using the field ID as the key:

| Property | Type | Description |
|----------|------|-------------|
| `visible` | boolean | Whether the column is visible |
| `name` | string | Custom display name for the column |
| `frozen` | boolean | Freeze column to left side when scrolling |
| `displayStyle` | `"text"` \| `"bar"` | How to display cell values |
| `color` | string (hex) | Color for bar display style |

### Conditional Formatting

Conditional formatting highlights cells based on their values. Each rule consists of:

| Property | Type | Description |
|----------|------|-------------|
| `target.fieldId` | string | Field to apply formatting to |
| `color` | string or `{start, end}` | Single color or gradient |
| `rules` | array | Conditions for single-color formatting |
| `rule` | `{min, max}` | Range for gradient formatting (values or `"auto"`) |
| `applyTo` | `"cell"` \| `"text"` | Apply to background or text |

### Conditional Formatting Operators

- **Null checks**: `isNull`, `notNull`
- **Equality**: `equals`, `notEquals`
- **String**: `startsWith`, `endsWith`, `include`, `doesNotInclude`
- **Numeric**: `lessThan`, `lessThanOrEqual`, `greaterThan`, `greaterThanOrEqual`
- **Range**: `inBetween`, `notInBetween`
- **Date**: `inThePast`, `notInThePast`, `inTheNext`, `inTheCurrent`, `notInTheCurrent`

## Example: Full-Featured Table

This example demonstrates frozen columns, bar visualization, and conditional formatting:

```yaml
contentType: chart
chartConfig:
  type: "table"
  config:
    columns:
      orders_region:
        frozen: true
        name: "Region"
      orders_sales_rep:
        frozen: true
        name: "Sales Rep"
      orders_total_revenue:
        color: "#10B981"
        displayStyle: "bar"
        name: "Total Revenue"
      orders_order_count:
        name: "# Orders"
    conditionalFormattings:
      # Gradient based on revenue
      - applyTo: "cell"
        color:
          end: "#10B981"
          start: "#FFFFFF"
        rule:
          max: "auto"
          min: "auto"
        target:
          fieldId: "orders_total_revenue"

      # Highlight low order counts in red
      - applyTo: "cell"
        color: "#EF4444"
        rules:
          - id: "low-volume"
            operator: "lessThan"
            values: [10]
        target:
          fieldId: "orders_order_count"
    hideRowNumbers: false
    showColumnCalculation: true
    showResultsTotal: true
metricQuery:
  exploreName: "orders"
  dimensions:
    - orders_region
    - orders_sales_rep
  metrics:
    - orders_total_revenue
    - orders_order_count
name: "Sales Performance"
slug: "sales-performance"
spaceSlug: "sales"
tableName: "orders"
version: 1
```

## Example: Field-to-Field Comparison

Compare values between fields to highlight over/under budget:

```yaml
chartConfig:
  type: "table"
  config:
    columns:
      orders_actual_spend:
        name: "Actual Spend"
      orders_budget:
        visible: false  # Hide but use for comparison

    conditionalFormattings:
      - target:
          fieldId: "orders_actual_spend"
        color: "#EF4444"
        rules:
          - id: "over-budget"
            operator: "greaterThan"
            values: []
            compareTarget:
              fieldId: "orders_budget"
        applyTo: "cell"
```

## Pivot Tables

Pivot tables cross-tabulate dimensions and metrics. Use `pivotConfig.columns` (a top-level chart property) to specify which dimensions become column headers, and optionally set `metricsAsRows: true` to transpose metrics into rows.

### How Pivoting Works

1. Add **two or more dimensions** to `metricQuery.dimensions`
2. One dimension stays as row headers (displayed in the leftmost columns)
3. The other dimension goes into `pivotConfig.columns` — its unique values become column headers
4. Each metric appears under each pivot column value

**Important:** Every dimension in `metricQuery.dimensions` must appear either as a row dimension (in `columns` config) or in `pivotConfig.columns`. Unused dimensions cause incorrect grouping.

### Example: Revenue by Region Pivoted by Product Category

```yaml
contentType: chart
chartConfig:
  type: "table"
  config:
    columns:
      orders_region:
        frozen: true
        name: "Region"
      orders_total_revenue:
        name: "Revenue"
    showColumnCalculation: true
    showRowCalculation: true
metricQuery:
  exploreName: "orders"
  dimensions:
    - orders_region
    - orders_product_category
  metrics:
    - orders_total_revenue
name: "Revenue by Region × Category"
pivotConfig:
  columns:
    - orders_product_category
slug: "revenue-region-category-pivot"
spaceSlug: "sales"
tableName: "orders"
version: 1
```

This produces a table where rows are regions, columns are product categories, and cells show total revenue. `showRowCalculation: true` adds a "Total" column on the right; `showColumnCalculation: true` adds a totals row at the bottom.

### Example: Metrics as Rows

When comparing many metrics across a single dimension, transpose the table so metrics become rows:

```yaml
contentType: chart
chartConfig:
  type: "table"
  config:
    metricsAsRows: true
    showColumnCalculation: false
metricQuery:
  exploreName: "orders"
  dimensions:
    - orders_region
  metrics:
    - orders_total_revenue
    - orders_order_count
    - orders_avg_order_value
name: "KPIs by Region (Transposed)"
pivotConfig:
  columns:
    - orders_region
slug: "kpis-by-region-transposed"
spaceSlug: "sales"
tableName: "orders"
version: 1
```

Here each region becomes a column header and each metric becomes a row — useful for compact KPI comparison tables.

### Pivot Table Tips

1. **`pivotConfig` is top-level**, not inside `chartConfig`. This is a common mistake.
2. **`showRowCalculation: true`** adds a row total column — useful for seeing totals across pivot columns.
3. **`showSubtotals: true`** adds subtotal rows when you have multiple row dimensions.
4. **Column config still works** — you can set `name`, `frozen`, `visible`, and conditional formatting on pivoted columns using their field IDs.
5. **Limit pivot cardinality** — pivoting on a dimension with 50+ unique values creates an unwieldy table. Filter high-cardinality dimensions or use a cartesian chart instead.

## Tips and Best Practices

1. **Freeze identifier columns**: Keep key columns like IDs or names frozen for easier navigation when scrolling horizontally.

2. **Use bar display for quick visual comparison**: Bar visualization makes it easy to compare values at a glance. Avoid combining bars with conditional formatting on the same column.

3. **Use conditional formatting to show trends or highlight outliers**: Apply single-color rules for threshold-based highlights or gradients for continuous ranges.

4. **Use "auto" for gradient ranges**: When values vary significantly, use `min: "auto"` and `max: "auto"` for gradient rules.

5. **Hide comparison columns**: When using field-to-field comparisons, hide the target field with `visible: false`.

6. **Apply formatting to cell vs text**: Use `applyTo: "cell"` for background highlights and `applyTo: "text"` for text color changes.

7. **Custom column names**: Use the `name` property to make column headers more user-friendly than raw field IDs.
