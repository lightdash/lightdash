# Table Chart Reference

## Overview

Table visualizations display your query results in a tabular format with powerful configuration options for customization, conditional formatting, and data presentation. Tables support features like frozen columns, bar visualizations within cells, custom column names, and sophisticated conditional formatting rules.

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/tableChart`.

## Basic YAML Structure

```yaml
version: 1
name: "My Table Chart"
slug: "my-table-chart"
spaceSlug: "my-space"
tableName: "my_explore"
updatedAt: "2024-01-30T12:00:00Z"

metricQuery:
  dimensions:
    - field_id_1
  metrics:
    - metric_id_1

chartConfig:
  type: "table"
  config:
    showColumnCalculation: true
    hideRowNumbers: false
    columns:
      field_id_1:
        visible: true
        name: "Custom Column Name"
        frozen: true
    conditionalFormattings: []
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
version: 1
name: "Sales Performance"
slug: "sales-performance"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-30T12:00:00Z"

metricQuery:
  dimensions:
    - orders_region
    - orders_sales_rep
  metrics:
    - orders_total_revenue
    - orders_order_count

chartConfig:
  type: "table"
  config:
    showColumnCalculation: true
    hideRowNumbers: false
    showResultsTotal: true

    columns:
      orders_region:
        frozen: true
        name: "Region"
      orders_sales_rep:
        frozen: true
        name: "Sales Rep"
      orders_total_revenue:
        name: "Total Revenue"
        displayStyle: "bar"
        color: "#10B981"
      orders_order_count:
        name: "# Orders"

    conditionalFormattings:
      # Gradient based on revenue
      - target:
          fieldId: "orders_total_revenue"
        color:
          start: "#FFFFFF"
          end: "#10B981"
        rule:
          min: "auto"
          max: "auto"
        applyTo: "cell"

      # Highlight low order counts in red
      - target:
          fieldId: "orders_order_count"
        color: "#EF4444"
        rules:
          - id: "low-volume"
            operator: "lessThan"
            values: [10]
        applyTo: "cell"
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

## Tips and Best Practices

1. **Freeze identifier columns**: Keep key columns like IDs or names frozen for easier navigation when scrolling horizontally.

2. **Combine bar visualization with conditional formatting**: Use bar display for quick visual comparison and conditional formatting to highlight outliers.

3. **Use "auto" for gradient ranges**: When values vary significantly, use `min: "auto"` and `max: "auto"` for gradient rules.

4. **Hide comparison columns**: When using field-to-field comparisons, hide the target field with `visible: false`.

5. **Apply formatting to cell vs text**: Use `applyTo: "cell"` for background highlights and `applyTo: "text"` for text color changes.

6. **Custom column names**: Use the `name` property to make column headers more user-friendly than raw field IDs.
