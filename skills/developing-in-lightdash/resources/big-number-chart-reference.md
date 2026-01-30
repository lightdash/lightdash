# Big Number Chart Reference

## Overview

Big number charts (also called KPI displays) in Lightdash provide a prominent display of a single metric value, making them ideal for:

- **Key Performance Indicators (KPIs)**: Display critical business metrics at a glance (e.g., monthly revenue, active users)
- **Dashboards**: Create executive dashboards with headline numbers
- **Period-over-period comparison**: Show how a metric has changed compared to a previous period
- **Alert monitoring**: Highlight important metrics with color-coded change indicators
- **Compact displays**: Show large numbers in readable formats (e.g., 1.2M instead of 1,234,567)

Big number charts display a single numeric value prominently, with optional comparison to show change over time and customizable number formatting.

## Schema Reference

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/bigNumber`.

## Basic Structure

```yaml
version: 1
name: "My Big Number"
slug: "my-big-number"
spaceSlug: "analytics"
tableName: "my_explore"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "my_explore_total_revenue"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    selectedField: "my_explore_total_revenue"
    label: "Total Revenue"
    showBigNumberLabel: true
```

## Key Configuration Properties

The `config` object supports these key properties:

| Property | Type | Description |
|----------|------|-------------|
| `selectedField` | string | Field ID to display as the big number (should be a metric from your `metricQuery`) |
| `label` | string | Custom label for the big number (defaults to field name if not provided) |
| `showBigNumberLabel` | boolean | Whether to show the label above the number |
| `showTableNamesInLabel` | boolean | Whether to include the table name in the label |
| `style` | string | Number formatting style: `"K"`, `"M"`, `"B"`, `"T"` (or `"thousands"`, `"millions"`, `"billions"`, `"trillions"`) |
| `showComparison` | boolean | Whether to show comparison with a previous value |
| `comparisonFormat` | string | Format for comparison: `"raw"` (absolute change) or `"percentage"` |
| `comparisonLabel` | string | Custom label for the comparison value (e.g., "vs. Last Month") |
| `flipColors` | boolean | Reverse color scheme (red for increase, green for decrease) |

## Examples

### Example 1: Basic KPI with Compact Formatting

Simple big number showing total revenue in millions:

```yaml
version: 1
name: "Total Revenue"
slug: "total-revenue"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "orders_total_revenue"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    selectedField: "orders_total_revenue"
    label: "Total Revenue"
    style: "M"  # Display as millions (e.g., 2.5M)
    showBigNumberLabel: true
```

### Example 2: Period-over-Period Comparison with Flipped Colors

Show costs with percentage change where increases are highlighted as negative (red):

```yaml
version: 1
name: "Infrastructure Costs"
slug: "infrastructure-costs"
spaceSlug: "finance"
tableName: "expenses"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "expenses_total_cost"
  filters:
    - target:
        fieldId: "expenses_date"
      operator: "inThePast"
      values: [30]
      settings:
        unitOfTime: "days"
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    selectedField: "expenses_total_cost"
    label: "Monthly Infrastructure Costs"
    style: "K"
    showBigNumberLabel: true
    showComparison: true
    comparisonFormat: "percentage"
    comparisonLabel: "vs. Last Month"
    flipColors: true  # Red for increase, green for decrease
```

## Common Patterns

### Executive Dashboard KPI

```yaml
config:
  selectedField: "revenue_total"
  label: "Total Revenue"
  style: "M"
  showBigNumberLabel: true
  showComparison: true
  comparisonFormat: "percentage"
  comparisonLabel: "vs. Last Month"
```

### Cost Monitoring

```yaml
config:
  selectedField: "costs_total"
  label: "Monthly Cloud Costs"
  style: "K"
  showBigNumberLabel: true
  showComparison: true
  comparisonFormat: "percentage"
  flipColors: true  # Red for increase
```

### Simple Metric Display

```yaml
config:
  selectedField: "users_count"
  label: "Total Users"
  showBigNumberLabel: true
```

## Tips

1. **Limit to 1 row**: Big number charts display a single value, so always use `limit: 1` in your `metricQuery`.

2. **Use aggregated metrics**: Big numbers work best with aggregated values (totals, counts, averages).

3. **Choose the right style**: Use compact notation for large numbers:
   - Revenue in millions? Use `"M"`
   - User counts in thousands? Use `"K"`
   - Market cap in billions? Use `"B"`

4. **Flip colors appropriately**: Use `flipColors: true` for metrics where increases are negative (costs, errors, response times, churn rate).

5. **Comparison context**: Always provide a `comparisonLabel` when using `showComparison` to make the context clear.

6. **Percentage vs. raw**: Choose comparison format based on your audience:
   - **Percentage**: Better for understanding relative change
   - **Raw**: Better when absolute numbers matter

## Quick Reference Tables

### Number Format Styles

| Style | Example Input | Example Output | Use Case |
|-------|---------------|----------------|----------|
| `"K"` | 1500 | 1.5K | Small numbers in thousands |
| `"M"` | 1500000 | 1.5M | Revenue, large user counts |
| `"B"` | 1500000000 | 1.5B | Market cap, large financials |
| `"T"` | 1500000000000 | 1.5T | National economies |

### Color Scheme

| flipColors | Increase | Decrease | Use For |
|------------|----------|----------|---------|
| `false` (default) | Green | Red | Revenue, users, signups |
| `true` | Red | Green | Costs, errors, churn |
