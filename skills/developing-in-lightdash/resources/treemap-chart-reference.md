# Treemap Chart Reference

Treemap charts visualize hierarchical data using nested rectangles. Each rectangle's size represents a quantitative metric (like revenue or count), and the nesting shows hierarchical relationships (like category > subcategory > product).

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/treemapChart`.

## When to Use Treemap Charts

Treemap charts are ideal for:

- **Hierarchical data visualization**: Product categories, organizational structures, file systems
- **Part-to-whole relationships**: Show how subcategories contribute to overall totals
- **Multi-level comparisons**: Compare values across 2-3 levels of hierarchy
- **Space-efficient display**: Show many items in limited space
- **Dual metric visualization**: Size by one metric, color by another

**Use treemaps when:**
- You have 1-3 levels of categorical hierarchy
- You want to show both composition and relative size
- You need to compare values across many categories efficiently

**Avoid treemaps when:**
- You need precise value comparisons (use bar charts)
- Exact proportions matter (use pie/donut charts)
- You have more than 3 hierarchy levels (too complex)
- You need to show trends over time (use line/area charts)

## Basic Structure

```yaml
chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - category_field
    sizeMetricId: size_metric
```

## Key Properties

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `groupFieldIds` | array | Field IDs for hierarchical grouping (1-3 levels) | Yes |
| `sizeMetricId` | string | Field ID that determines rectangle size | Yes |
| `colorMetricId` | string | Field ID that determines rectangle color value | No |
| `visibleMin` | number | Minimum size threshold for displaying nodes | No |
| `maxLeafDepth` | number | Depth level to display as leaf nodes | No |
| `startColor` | string | Start color for gradient (hex code) | No |
| `endColor` | string | End color for gradient (hex code) | No |
| `useDynamicColors` | boolean | Enable dynamic color scaling based on values | No |
| `startColorThreshold` | number | Value threshold for start color | No |
| `endColorThreshold` | number | Value threshold for end color | No |

## Examples

### Example 1: Two-Level Hierarchical Treemap

Show category and subcategory revenue with nested rectangles.

```yaml
version: 1
name: "Category & Subcategory Revenue"
slug: category-subcategory-revenue
spaceSlug: sales
tableName: products

metricQuery:
  exploreName: products
  dimensions:
    - products_category
    - products_subcategory
  metrics:
    - products_total_revenue
  sorts:
    - fieldId: products_total_revenue
      descending: true
  limit: 50

chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - products_category
      - products_subcategory
    sizeMetricId: products_total_revenue
    visibleMin: 1000           # Hide rectangles smaller than $1000
```

**Use case**: Understand revenue composition at both category and subcategory levels. The `visibleMin` setting prevents tiny rectangles from cluttering the view.

### Example 2: Color Gradient Based on Second Metric

Size by revenue, color by profit margin to show profitability.

```yaml
version: 1
name: "Revenue & Margin by Category"
slug: revenue-margin-by-category
spaceSlug: sales
tableName: products

metricQuery:
  exploreName: products
  dimensions:
    - products_category
  metrics:
    - products_total_revenue
    - products_profit_margin
  sorts:
    - fieldId: products_total_revenue
      descending: true
  limit: 25

chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - products_category
    sizeMetricId: products_total_revenue
    colorMetricId: products_profit_margin
    startColor: "#ef4444"      # Red for low margin
    endColor: "#22c55e"        # Green for high margin
```

**Use case**: Quickly identify large revenue categories (big rectangles) with poor margins (red color) that need attention.

## Best Practices

### Hierarchy Design

1. **Limit depth to 2-3 levels**: More levels become unreadable
2. **Order groups logically**: Most important or largest first
3. **Use meaningful groupings**: Natural hierarchies (Geography > State > City)

### Size Metric Selection

1. **Choose additive metrics**: Sum, count (not averages or ratios)
2. **Use positive values**: Negative values don't render well
3. **Add `visibleMin`**: Hide tiny rectangles that clutter the view

### Color Strategy

1. **Single color for simple hierarchy**: Let size tell the story
2. **Gradient for performance metrics**: Red-to-green for good/bad ranges
3. **Set explicit thresholds**: `startColorThreshold` and `endColorThreshold` for clear ranges

### Data Preparation

1. **Limit total rectangles**: 20-100 for readability (use `limit` in metricQuery)
2. **Sort by size metric**: Largest first for visual hierarchy
3. **Filter outliers**: Very small or large values can distort visualization

## Troubleshooting

### Too Many Small Rectangles

**Problem**: Chart is cluttered with tiny rectangles
**Solutions**:
- Increase `visibleMin` to hide small values
- Reduce `limit` in metricQuery
- Add filters to exclude low-value categories

### Hierarchy Not Displaying

**Problem**: Only showing flat categories, not nested
**Solutions**:
- Verify `groupFieldIds` array has multiple fields
- Check that dimensions are in metricQuery
- Confirm `maxLeafDepth` setting if specified

### Colors Not Showing

**Problem**: All rectangles same color or unexpected colors
**Solutions**:
- Verify `colorMetricId` is in metricQuery metrics
- Check that color metric has varying values
- Set explicit `startColor` and `endColor`

## Comparison: Treemap vs Other Charts

| Need | Use Treemap | Alternative |
|------|-------------|-------------|
| Simple part-to-whole | Maybe | Pie/Donut (clearer for 3-7 categories) |
| Hierarchical data | Yes | Sunburst (circular alternative) |
| Precise comparisons | No | Bar chart (easier to compare lengths) |
| Many categories | Yes | Table (for exact values) |
| Dual metrics | Yes | Bubble chart (for 2 metrics + category) |
| Trends over time | No | Line/Area chart |

## Related Documentation

- [Chart Types Reference](./chart-types-reference.md) - Overview of all chart types
- [Dashboard Reference](./dashboard-reference.md) - Using treemaps in dashboards
- [Workflows Reference](./workflows-reference.md) - Charts-as-code workflow
