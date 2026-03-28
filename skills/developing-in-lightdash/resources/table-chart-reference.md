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

## Pivoted Tables

Pivoting transforms dimension values into column headers. For example, instead of a "status" column with rows for each value, each status becomes its own column.

**Important:** `pivotConfig` is a top-level property (sibling of `chartConfig`), not nested inside it. All fields — including pivoted dimensions — must have entries in `chartConfig.config.columns` with `visible: true` for the table to render correctly with proper scrollbars and column behavior.

### Pivot Configuration

| Property | Type | Description |
|----------|------|-------------|
| `pivotConfig.columns` | string[] | Dimension field IDs to pivot into column headers |

### Example: Pivoted Table

Revenue by region, pivoted by product category so each category becomes a column:

```yaml
contentType: chart
chartConfig:
  type: "table"
  config:
    columns:
      orders_region:
        visible: true
        name: "Region"
        frozen: true
      orders_product_category:
        visible: true
      orders_total_revenue:
        visible: true
        name: "Revenue"
    hideRowNumbers: false
    showColumnCalculation: true
metricQuery:
  exploreName: "orders"
  dimensions:
    - orders_region
    - orders_product_category
  metrics:
    - orders_total_revenue
  sorts:
    - fieldId: "orders_region"
      descending: false
  limit: 500
name: "Revenue by Region and Category"
pivotConfig:
  columns:
    - "orders_product_category"
slug: "revenue-by-region-category"
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

Pivot tables cross-tabulate dimensions and metrics. Add two or more dimensions to `metricQuery.dimensions`, then put the dimension you want as column headers into `pivotConfig.columns` (a **top-level** property, not inside `chartConfig`). Set `metricsAsRows: true` to transpose metrics into rows instead.

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
    showColumnCalculation: true  # totals row at bottom
    showRowCalculation: true     # totals column on right
    # metricsAsRows: true        # uncomment to transpose metrics into rows
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

- **`pivotConfig` is top-level**, not inside `chartConfig` — this is a common mistake
- `showSubtotals: true` adds subtotal rows when you have multiple row dimensions
- Column config (`name`, `frozen`, `visible`, conditional formatting) still works on pivoted columns
- Avoid pivoting on dimensions with 50+ unique values — use a cartesian chart instead

## Tips and Best Practices

1. **Freeze identifier columns**: Keep key columns like IDs or names frozen for easier navigation when scrolling horizontally.

2. **Use bar display for quick visual comparison**: Bar visualization makes it easy to compare values at a glance. Avoid combining bars with conditional formatting on the same column.

3. **Use conditional formatting to show trends or highlight outliers**: Apply single-color rules for threshold-based highlights or gradients for continuous ranges.

4. **Use "auto" for gradient ranges**: When values vary significantly, use `min: "auto"` and `max: "auto"` for gradient rules.

5. **Hide comparison columns**: When using field-to-field comparisons, hide the target field with `visible: false`.

6. **Apply formatting to cell vs text**: Use `applyTo: "cell"` for background highlights and `applyTo: "text"` for text color changes.

7. **Custom column names**: Use the `name` property to make column headers more user-friendly than raw field IDs.
