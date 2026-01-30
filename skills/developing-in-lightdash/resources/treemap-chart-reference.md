# Treemap Chart Reference

Treemap charts visualize hierarchical data using nested rectangles. Each rectangle's size represents a quantitative metric (like revenue or count), and the nesting shows hierarchical relationships (like category > subcategory > product).

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

## Configuration Options

### Core Settings

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `groupFieldIds` | array | Field IDs for hierarchical grouping (1-3 levels) | Yes |
| `sizeMetricId` | string | Field ID that determines rectangle size | Yes |
| `colorMetricId` | string | Field ID that determines rectangle color value | No |
| `visibleMin` | number | Minimum size threshold for displaying nodes | No |
| `leafDepth` | number | Depth level to display as leaf nodes | No |

### Color Configuration

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `startColor` | string | Start color for gradient (hex code) | System default |
| `endColor` | string | End color for gradient (hex code) | System default |
| `useDynamicColors` | boolean | Enable dynamic color scaling based on values | false |
| `startColorThreshold` | number | Value threshold for start color | Auto |
| `endColorThreshold` | number | Value threshold for end color | Auto |

## Examples

### Example 1: Basic Single-Level Treemap

Visualize revenue by product category with a simple one-level hierarchy.

```yaml
version: 1
name: "Revenue by Category"
slug: revenue-by-category
spaceSlug: sales
tableName: products

metricQuery:
  exploreName: products
  dimensions:
    - products_category
  metrics:
    - products_total_revenue
  sorts:
    - fieldId: products_total_revenue
      descending: true
  limit: 20

chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - products_category
    sizeMetricId: products_total_revenue
```

**Use case**: Quick overview of which product categories generate the most revenue.

### Example 2: Two-Level Hierarchical Treemap

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

### Example 3: Three-Level Deep Hierarchy

Display category > subcategory > product with maximum depth.

```yaml
version: 1
name: "Product Hierarchy Revenue"
slug: product-hierarchy-revenue
spaceSlug: sales
tableName: products

metricQuery:
  exploreName: products
  dimensions:
    - products_category
    - products_subcategory
    - products_product_name
  metrics:
    - products_total_revenue
  sorts:
    - fieldId: products_total_revenue
      descending: true
  limit: 100

chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - products_category
      - products_subcategory
      - products_product_name
    sizeMetricId: products_total_revenue
    leafDepth: 2               # Show subcategory level as leaves
```

**Use case**: Drill down from high-level categories to individual products. Setting `leafDepth: 2` controls which level shows as final leaf nodes.

### Example 4: Color Gradient Based on Metric

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

### Example 5: Dynamic Color Thresholds

Use specific thresholds to highlight performance ranges.

```yaml
version: 1
name: "Sales Performance by Region"
slug: sales-performance-by-region
spaceSlug: sales
tableName: sales

metricQuery:
  exploreName: sales
  dimensions:
    - sales_region
    - sales_territory
  metrics:
    - sales_total_revenue
    - sales_quota_attainment
  sorts:
    - fieldId: sales_total_revenue
      descending: true
  limit: 40

chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - sales_region
      - sales_territory
    sizeMetricId: sales_total_revenue
    colorMetricId: sales_quota_attainment
    useDynamicColors: true
    startColor: "#fef3c7"      # Light yellow
    endColor: "#166534"        # Dark green
    startColorThreshold: 0     # 0% quota attainment
    endColorThreshold: 150     # 150% quota attainment
```

**Use case**: See both revenue size and quota performance. Territories with large revenue (big rectangles) below quota (yellow/light color) need intervention.

### Example 6: Customer Segmentation Treemap

Visualize customer segments and their sub-segments by customer count.

```yaml
version: 1
name: "Customer Segmentation"
slug: customer-segmentation
spaceSlug: marketing
tableName: customers

metricQuery:
  exploreName: customers
  dimensions:
    - customers_segment
    - customers_subsegment
  metrics:
    - customers_customer_count
    - customers_lifetime_value
  sorts:
    - fieldId: customers_customer_count
      descending: true
  limit: 30

chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - customers_segment
      - customers_subsegment
    sizeMetricId: customers_customer_count
    colorMetricId: customers_lifetime_value
    startColor: "#dbeafe"      # Light blue
    endColor: "#1e3a8a"        # Dark blue
    visibleMin: 5              # Hide segments with fewer than 5 customers
```

**Use case**: Understand customer distribution (count) while identifying high-value segments (color intensity).

## Best Practices

### Hierarchy Design

1. **Limit depth to 2-3 levels**: More levels become unreadable
2. **Order groups logically**: Most important or largest first
3. **Use meaningful groupings**: Natural hierarchies (Geography > State > City)
4. **Ensure complete hierarchy**: All levels should have parent-child relationships

### Size Metric Selection

1. **Choose additive metrics**: Sum, count (not averages or ratios)
2. **Use positive values**: Negative values don't render well
3. **Consider data range**: Very small or very large ranges can be hard to compare
4. **Add `visibleMin`**: Hide tiny rectangles that clutter the view

### Color Strategy

1. **Single color for simple hierarchy**: Let size tell the story
2. **Gradient for performance metrics**: Red-to-green for good/bad ranges
3. **Sequential for magnitude**: Light-to-dark for low-to-high values
4. **Diverging for comparison**: Two colors meeting at a midpoint (target, average)
5. **Set explicit thresholds**: `startColorThreshold` and `endColorThreshold` for clear ranges

### Data Preparation

1. **Limit total rectangles**: 20-100 for readability (use `limit` in metricQuery)
2. **Sort by size metric**: Largest first for visual hierarchy
3. **Filter outliers**: Very small or large values can distort visualization
4. **Use consistent granularity**: All leaf nodes at same hierarchy level

### Labeling

1. **Top levels show labels**: Category names appear in larger rectangles
2. **Small rectangles omit labels**: Below `visibleMin` threshold
3. **Tooltips show details**: Hover for exact values
4. **Keep names concise**: Long names get truncated

## Common Patterns

### Portfolio Analysis

Size by assets under management, color by performance:

```yaml
chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - portfolio_asset_class
      - portfolio_fund
    sizeMetricId: portfolio_aum
    colorMetricId: portfolio_ytd_return
    startColor: "#dc2626"
    endColor: "#16a34a"
```

### Inventory Management

Size by stock quantity, color by days of supply:

```yaml
chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - inventory_warehouse
      - inventory_product_category
    sizeMetricId: inventory_units_on_hand
    colorMetricId: inventory_days_of_supply
    startColor: "#22c55e"      # Green = healthy stock
    endColor: "#ef4444"        # Red = low stock
```

### Website Analytics

Size by page views, color by bounce rate:

```yaml
chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - pages_section
      - pages_page_name
    sizeMetricId: pages_page_views
    colorMetricId: pages_bounce_rate
    startColor: "#10b981"      # Low bounce = good
    endColor: "#f59e0b"        # High bounce = needs attention
```

## Troubleshooting

### Too Many Small Rectangles

**Problem**: Chart is cluttered with tiny rectangles
**Solutions**:
- Increase `visibleMin` to hide small values
- Reduce `limit` in metricQuery
- Add filters to exclude low-value categories
- Aggregate small categories into "Other"

### Hierarchy Not Displaying

**Problem**: Only showing flat categories, not nested
**Solutions**:
- Verify `groupFieldIds` array has multiple fields
- Check that dimensions are in metricQuery
- Ensure parent-child relationships exist in data
- Confirm `leafDepth` setting if specified

### Colors Not Showing

**Problem**: All rectangles same color or unexpected colors
**Solutions**:
- Verify `colorMetricId` is in metricQuery metrics
- Check that color metric has varying values
- Set explicit `startColor` and `endColor`
- Confirm thresholds align with actual data range

### Rectangles Too Large/Small

**Problem**: Size proportions seem off
**Solutions**:
- Check for outliers in size metric
- Use filters to remove extreme values
- Verify `sizeMetricId` uses appropriate aggregation
- Consider log scale for wide value ranges (requires custom config)

## Comparison: Treemap vs Other Charts

| Need | Use Treemap | Alternative |
|------|-------------|-------------|
| Simple part-to-whole | Maybe | Pie/Donut (clearer for 3-7 categories) |
| Hierarchical data | Yes | Sunburst (circular alternative) |
| Precise comparisons | No | Bar chart (easier to compare lengths) |
| Many categories | Yes | Table (for exact values) |
| Dual metrics | Yes | Bubble chart (for 2 metrics + category) |
| Trends over time | No | Line/Area chart |

## Advanced: Dynamic Color Ranges

For metrics where you want precise control over color mapping:

```yaml
chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - products_category
    sizeMetricId: products_sales
    colorMetricId: products_growth_rate
    useDynamicColors: true
    startColor: "#dc2626"      # Red for negative growth
    endColor: "#16a34a"        # Green for high growth
    startColorThreshold: -10   # -10% growth
    endColorThreshold: 20      # +20% growth
```

**How thresholds work:**
- Values below `startColorThreshold` get `startColor`
- Values above `endColorThreshold` get `endColor`
- Values between interpolate along the gradient
- Without `useDynamicColors`, colors map to min/max in dataset

## Performance Considerations

1. **Limit data points**: 100-200 rectangles maximum for performance
2. **Use aggregated data**: Pre-aggregate at appropriate level
3. **Set appropriate `limit`**: Query only what can be displayed
4. **Avoid deep hierarchies**: 3+ levels slow rendering
5. **Cache results**: Treemaps on dashboards with refresh schedules

## Related Documentation

- [Chart Types Reference](./chart-types-reference.md) - Overview of all chart types
- [Dashboard Reference](./dashboard-reference.md) - Using treemaps in dashboards
- [Workflows Reference](./workflows-reference.md) - Charts-as-code workflow
