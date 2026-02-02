# Pie Chart Reference

Guide for configuring pie and donut charts in Lightdash charts-as-code.

> **Schema Reference**: For the complete schema definition, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/pieChart`.

## Overview

Pie charts display part-to-whole relationships by dividing a circle into slices proportional to each category's value. Donut charts are the same but with a hollow center, which can make them easier to read when comparing multiple charts.

### When to Use

**Best for:**
- Showing proportions of a whole (percentages that sum to 100%)
- Comparing 3-7 categories
- When exact values are less important than relative proportions

**Avoid when:**
- Comparing many categories (>7 slices)
- Precise comparisons are needed (use bar chart instead)
- Showing changes over time (use line chart instead)

### Pie vs Donut

| Feature | Pie Chart | Donut Chart |
|---------|-----------|-------------|
| Visual | Solid circle | Ring with hole |
| Use case | Single metric focus | Better for comparisons |
| Center space | None | Can display total/summary |

## Basic Structure

Every pie chart requires:
1. `groupFieldIds` - One or more dimension fields to slice by
2. `metricId` - The metric to measure
3. Chart type set to `pie`

```yaml
version: 1
name: "Revenue by Product Category"
slug: revenue-by-category
spaceSlug: sales
tableName: orders

metricQuery:
  exploreName: orders
  dimensions:
    - orders_product_category
  metrics:
    - orders_total_revenue
  sorts:
    - fieldId: orders_total_revenue
      descending: true
  limit: 10

chartConfig:
  type: pie
  config:
    groupFieldIds:
      - orders_product_category
    metricId: orders_total_revenue
```

## Configuration Options

### Core Settings

| Property | Type | Description |
|----------|------|-------------|
| `groupFieldIds` | `string[]` | Array of field IDs for slicing (required) |
| `metricId` | `string` | The metric to display (required) |
| `isDonut` | `boolean` | `true` = donut chart with hollow center |

### Value Labels

| Property | Type | Description |
|----------|------|-------------|
| `valueLabel` | `"hidden" \| "inside" \| "outside"` | Position of labels on slices |
| `showValue` | `boolean` | Show actual numeric values |
| `showPercentage` | `boolean` | Show percentage of total |

### Legend

| Property | Type | Description |
|----------|------|-------------|
| `showLegend` | `boolean` | Show/hide legend |
| `legendPosition` | `"horizontal" \| "vertical"` | Legend orientation |
| `legendMaxItemLength` | `number` | Max characters before truncation |

### Customization

| Property | Type | Description |
|----------|------|-------------|
| `groupLabelOverrides` | `Record<string, string>` | Custom display labels for slices |
| `groupColorOverrides` | `Record<string, string>` | Custom hex colors for slices |
| `groupSortOverrides` | `string[]` | Custom sort order (clockwise from top) |
| `groupValueOptionOverrides` | `Record<string, {...}>` | Per-slice display options |

## Complete Example

Donut chart with custom colors and labels:

```yaml
version: 1
name: "Regional Sales Performance"
slug: regional-sales
spaceSlug: sales
tableName: orders
updatedAt: 2026-01-30T10:00:00Z

metricQuery:
  exploreName: orders
  dimensions:
    - orders_region
  metrics:
    - orders_total_revenue
  sorts:
    - fieldId: orders_total_revenue
      descending: true
  limit: 8

chartConfig:
  type: pie
  config:
    groupFieldIds:
      - orders_region
    metricId: orders_total_revenue

    # Donut chart
    isDonut: true

    # Labels
    valueLabel: inside
    showValue: true
    showPercentage: true

    # Legend
    showLegend: true
    legendPosition: vertical

    # Custom labels for region codes
    groupLabelOverrides:
      "NA": "North America"
      "EMEA": "Europe, Middle East & Africa"
      "APAC": "Asia Pacific"
      "LATAM": "Latin America"

    # Brand colors for regions
    groupColorOverrides:
      "NA": "#3b82f6"
      "EMEA": "#10b981"
      "APAC": "#f59e0b"
      "LATAM": "#ef4444"
      "Other": "#94a3b8"

    # Hide labels for small "Other" slice
    groupValueOptionOverrides:
      "Other":
        valueLabel: hidden

    # Custom sort order
    groupSortOverrides:
      - "NA"
      - "EMEA"
      - "APAC"
      - "LATAM"
      - "Other"
```

## Best Practices

### Data Preparation

1. **Limit categories**: 3-7 slices for best readability
2. **Sort by value**: Largest slice first using `metricQuery.sorts`
3. **Group small values**: Combine small slices into "Other" in your dbt model

### Visual Design

1. **Use donut for modern look**: Set `isDonut: true`
2. **Show percentages over values**: More meaningful for pie charts
3. **Use consistent colors**: Same category = same color across charts
4. **Mute "Other"**: Use gray (`#94a3b8`) for miscellaneous categories

### Label Placement

| Position | Best for |
|----------|----------|
| `inside` | Few slices (3-5), large slices |
| `outside` | Many slices (6-7), long labels |
| `hidden` | 7+ slices, comprehensive legend |

### Color Selection

- **Sequential**: Light to dark for ordered categories
- **Categorical**: Distinct colors for unordered categories
- **Semantic**: Green for good, red for bad, yellow for warning

## Troubleshooting

### Slices Too Small to Read

Hide labels for small slices:
```yaml
groupValueOptionOverrides:
  "Small Category":
    valueLabel: hidden
```

### Colors Not Applying

- Check spelling (case-sensitive)
- Verify hex format (`#RRGGBB`)
- Ensure values match data exactly

### Legend Truncated

```yaml
legendMaxItemLength: 100
legendPosition: vertical
```

## Related Documentation

- [Chart Types Reference](chart-types-reference.md)
- [Metrics Reference](metrics-reference.md)
- [Dimensions Reference](dimensions-reference.md)
