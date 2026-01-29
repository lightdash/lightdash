# Chart Types Reference

Lightdash supports multiple chart types for visualizing data. This guide covers configuration options and best practices for each type.

## Chart Types Overview

| Type | Use Case | Key Features |
|------|----------|--------------|
| `cartesian` | Bar, line, area, scatter | Multiple series, dual axes |
| `pie` | Part-of-whole relationships | Donut variant, labels |
| `table` | Detailed data display | Conditional formatting, totals |
| `big_number` | Single KPI display | Comparison, trends |
| `funnel` | Conversion flows | Stage progression |
| `treemap` | Hierarchical data | Nested rectangles |

## Cartesian Charts (Bar, Line, Area, Scatter)

### Basic Structure

```yaml
chartConfig:
  type: cartesian
  config:
    layout:
      xField: orders_created_at_month
      yField:
        - orders_total_revenue
      flipAxes: false          # Horizontal bar chart if true

    echartsConfig:
      series:
        - type: bar            # bar, line, area, scatter
          encode:
            xRef:
              field: orders_created_at_month
            yRef:
              field: orders_total_revenue
          yAxisIndex: 0
```

### Series Types

```yaml
# Bar chart
- type: bar
  encode:
    xRef: { field: dimension_field }
    yRef: { field: metric_field }

# Line chart
- type: line
  encode:
    xRef: { field: dimension_field }
    yRef: { field: metric_field }
  smooth: true                 # Curved lines
  showSymbol: false            # Hide data points

# Area chart
- type: area
  encode:
    xRef: { field: dimension_field }
    yRef: { field: metric_field }
  areaStyle:
    opacity: 0.5

# Scatter plot
- type: scatter
  encode:
    xRef: { field: x_metric }
    yRef: { field: y_metric }
  symbolSize: 10
```

### Multiple Series

```yaml
chartConfig:
  type: cartesian
  config:
    layout:
      xField: orders_created_at_month
      yField:
        - orders_total_revenue
        - orders_order_count

    echartsConfig:
      series:
        - type: bar
          name: "Revenue"
          encode:
            xRef: { field: orders_created_at_month }
            yRef: { field: orders_total_revenue }
          yAxisIndex: 0
          color: "#3b82f6"

        - type: line
          name: "Order Count"
          encode:
            xRef: { field: orders_created_at_month }
            yRef: { field: orders_order_count }
          yAxisIndex: 1         # Secondary axis
          color: "#10b981"
```

### Stacked Charts

```yaml
chartConfig:
  type: cartesian
  config:
    layout:
      xField: orders_created_at_month
      yField:
        - orders_total_revenue
      stackGroups:
        - orders_total_revenue   # Fields to stack

    echartsConfig:
      series:
        - type: bar
          stack: "revenue"       # Stack group name
          encode:
            xRef: { field: orders_created_at_month }
            yRef: { field: orders_total_revenue }
```

### Dual Axis Configuration

```yaml
echartsConfig:
  yAxis:
    - name: "Revenue ($)"
      position: left
      axisLabel:
        formatter: "${value}"
    - name: "Count"
      position: right
```

### Bar Chart Best Practices

1. **Limit categories**: 5-15 bars for readability
2. **Sort meaningfully**: By value or chronologically
3. **Use horizontal for long labels**: Set `flipAxes: true`
4. **Color consistently**: Same metric = same color across charts
5. **Add data labels for key values**: When precision matters

### Line Chart Best Practices

1. **Use for time series**: Show trends over time
2. **Limit to 5-7 lines**: Avoid spaghetti charts
3. **Consider area for cumulative data**: Stacked areas show composition
4. **Use smooth lines carefully**: Can distort exact values
5. **Show data points for sparse data**: Hide for dense time series

## Pie Charts

### Basic Configuration

```yaml
chartConfig:
  type: pie
  config:
    groupFieldIds:
      - orders_status
    metricId: orders_order_count
    isDonut: false
    showValue: true
    showPercentage: true
    valueLabel: "inside"       # inside, outside, none
    legendPosition: "right"    # top, right, bottom, left, none
```

### Donut Chart

```yaml
chartConfig:
  type: pie
  config:
    isDonut: true
    innerRadius: 50            # Percentage of outer radius
```

### Label Options

```yaml
config:
  showValue: true              # Show actual values
  showPercentage: true         # Show percentages
  valueLabel: "outside"        # Label position
  showLegend: true
  legendPosition: "right"
```

### Pie Chart Best Practices

1. **Limit to 5-7 slices**: Group small values as "Other"
2. **Sort by size**: Largest slice first (clockwise from top)
3. **Use donut for comparison**: Better for multiple pies
4. **Show percentages**: More meaningful than raw values
5. **Avoid 3D effects**: Distorts perception
6. **Consider alternatives**: Bar charts often clearer for comparison

## Table Charts

### Basic Configuration

```yaml
chartConfig:
  type: table
  config:
    showTableNames: false
    showRowNumbers: false
    showResultsTotal: true
    columns:
      orders_customer_name:
        visible: true
        label: "Customer"
        frozen: true           # Freeze column when scrolling
      orders_total_revenue:
        visible: true
        label: "Revenue"
```

### Conditional Formatting

```yaml
config:
  conditionalFormattings:
    - target:
        fieldId: orders_total_revenue
      color:
        start: "#fee2e2"       # Light red (low)
        end: "#22c55e"         # Green (high)
      rules:
        min: 0
        max: 10000
```

### Cell Formatting

```yaml
config:
  columns:
    orders_total_revenue:
      format:
        type: "currency"
        currency: "USD"
        round: 2
    orders_margin:
      format:
        type: "percent"
        round: 1
```

### Table Best Practices

1. **Limit columns**: 5-8 for readability
2. **Freeze key columns**: Customer name, date, etc.
3. **Use conditional formatting**: Highlight important values
4. **Sort by most important metric**: Usually descending
5. **Add totals row**: For summary metrics
6. **Align numbers right**: Easier to compare

## Big Number Charts

### Basic Configuration

```yaml
chartConfig:
  type: big_number
  config:
    selectedField: orders_total_revenue
    label: "Total Revenue"
    style: "currency"
```

### With Comparison

```yaml
chartConfig:
  type: big_number
  config:
    selectedField: orders_total_revenue
    label: "Total Revenue"
    showComparison: true
    comparisonFormat: "percentage"  # percentage, raw
    comparisonLabel: "vs Last Period"
```

### Styling Options

```yaml
config:
  style: "currency"            # currency, percent, number
  showBigNumberLabel: true
  bigNumberLabel: "MTD Revenue"
```

### Big Number Best Practices

1. **Use for KPIs**: Single important metrics
2. **Add comparisons**: Show period-over-period change
3. **Use clear labels**: What does this number represent?
4. **Format appropriately**: Currency, percentage, etc.
5. **Group related KPIs**: On dashboards

## Funnel Charts

### Basic Configuration

```yaml
chartConfig:
  type: funnel
  config:
    fieldId: events_event_count
    dataInput: "row"           # row or column
    showLabels: true
    labelPosition: "inside"    # inside, outside
    showLegend: true
    legendPosition: "right"
```

### Funnel Best Practices

1. **Order stages logically**: Top to bottom or left to right
2. **Show conversion rates**: Between each stage
3. **Limit stages**: 4-7 for clarity
4. **Use consistent colors**: Stage colors should make sense
5. **Add labels**: Show values and percentages

## Treemap Charts

### Basic Configuration

```yaml
chartConfig:
  type: treemap
  config:
    groupFieldIds:
      - orders_category
      - orders_subcategory
    metricId: orders_total_revenue
    showLabels: true
    maxDepth: 2
```

### Treemap Best Practices

1. **Use for hierarchies**: Categories → subcategories
2. **Limit depth**: 2-3 levels maximum
3. **Size by meaningful metric**: Usually revenue or count
4. **Color by another metric**: Optional second dimension
5. **Add labels**: At least for large rectangles

## Complete Chart Examples

### Revenue Trend with Target

```yaml
version: 1
name: "Revenue vs Target"
slug: revenue-vs-target
spaceSlug: sales
tableName: orders

metricQuery:
  exploreName: orders
  dimensions:
    - orders_created_at_month
  metrics:
    - orders_total_revenue
    - orders_revenue_target
  sorts:
    - fieldId: orders_created_at_month
      descending: false
  limit: 12

chartConfig:
  type: cartesian
  config:
    layout:
      xField: orders_created_at_month
      yField:
        - orders_total_revenue
        - orders_revenue_target

    echartsConfig:
      legend:
        show: true
        top: 0
      series:
        - type: bar
          name: "Actual Revenue"
          encode:
            xRef: { field: orders_created_at_month }
            yRef: { field: orders_total_revenue }
          color: "#3b82f6"

        - type: line
          name: "Target"
          encode:
            xRef: { field: orders_created_at_month }
            yRef: { field: orders_revenue_target }
          color: "#ef4444"
          lineStyle:
            type: "dashed"
```

### Customer Segment Breakdown

```yaml
version: 1
name: "Revenue by Segment"
slug: revenue-by-segment
spaceSlug: sales
tableName: customers

metricQuery:
  exploreName: customers
  dimensions:
    - customers_segment
  metrics:
    - customers_total_revenue
  sorts:
    - fieldId: customers_total_revenue
      descending: true
  limit: 10

chartConfig:
  type: pie
  config:
    groupFieldIds:
      - customers_segment
    metricId: customers_total_revenue
    isDonut: true
    showValue: true
    showPercentage: true
    legendPosition: "right"
```

### Sales Performance Table

```yaml
version: 1
name: "Sales Rep Performance"
slug: sales-rep-performance
spaceSlug: sales
tableName: orders

metricQuery:
  exploreName: orders
  dimensions:
    - sales_rep_name
  metrics:
    - orders_total_revenue
    - orders_order_count
    - orders_average_order_value
  sorts:
    - fieldId: orders_total_revenue
      descending: true
  limit: 25

chartConfig:
  type: table
  config:
    showResultsTotal: true
    columns:
      sales_rep_name:
        visible: true
        label: "Sales Rep"
        frozen: true
      orders_total_revenue:
        visible: true
        label: "Revenue"
      orders_order_count:
        visible: true
        label: "Orders"
      orders_average_order_value:
        visible: true
        label: "Avg Order"
    conditionalFormattings:
      - target:
          fieldId: orders_total_revenue
        color:
          start: "#fef9c3"
          end: "#22c55e"
```

## Choosing the Right Chart

| Data Type | Best Chart |
|-----------|------------|
| Trend over time | Line or Area |
| Category comparison | Bar (horizontal for many categories) |
| Part of whole | Pie or Donut (few categories) |
| Ranking | Horizontal Bar |
| Distribution | Histogram or Scatter |
| Hierarchical | Treemap |
| Single KPI | Big Number |
| Conversion flow | Funnel |
| Detailed data | Table |
| Correlation | Scatter |

## Color Guidelines

1. **Use brand colors**: Consistent with company palette
2. **Semantic colors**: Green = good, Red = bad
3. **Sequential for ranges**: Light to dark for low to high
4. **Diverging for comparisons**: Two colors meeting at midpoint
5. **Categorical for groups**: Distinct colors for each category
6. **Limit to 6-8 colors**: More becomes hard to distinguish
