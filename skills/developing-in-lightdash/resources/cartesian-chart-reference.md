# Cartesian Chart Reference

## Overview

Cartesian charts in Lightdash provide flexible visualization options for displaying relationships between dimensions and metrics on X and Y axes. They support four series types:

- **Bar charts**: Compare values across categories with vertical or horizontal bars
- **Line charts**: Show trends and changes over time with connected data points
- **Area charts**: Display cumulative values and trends with filled areas under lines
- **Scatter charts**: Reveal correlations and distributions with individual data points

Cartesian charts support:
- Multiple series with different visualization types
- Stacking (for bar and area charts)
- Dual Y-axes for comparing metrics with different scales
- Reference lines for highlighting thresholds or targets
- Flexible axis configuration and styling

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/cartesianChart`.

## Basic Structure

```yaml
version: 1
name: "My Cartesian Chart"
slug: "my-cartesian-chart"
spaceSlug: "analytics"
tableName: "my_explore"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "my_explore_category"
  metrics:
    - "my_explore_total_sales"
  filters: {}
  sorts: []
  limit: 500

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "my_explore_category"
      yField:
        - "my_explore_total_sales"
    eChartsConfig:
      series:
        - type: "bar"
          encode:
            xRef:
              field: "my_explore_category"
            yRef:
              field: "my_explore_total_sales"
```

## Key Configuration Properties

### `layout`

- **`xField`**: Field ID for the X axis (typically a dimension)
- **`yField`**: Array of field IDs for the Y axis
- **`flipAxes`**: Swap X and Y axes for horizontal bar charts (default: `false`)
- **`showGridX`** / **`showGridY`**: Show grid lines
- **`stack`**: Stack series together (`true` or stack group name)

### `eChartsConfig`

- **`series`**: Array of series configurations (required)
- **`xAxis`** / **`yAxis`**: Axis configuration arrays
- **`legend`**: Legend display and positioning
- **`grid`**: Chart area padding
- **`tooltip`** / **`tooltipSort`**: Tooltip behavior

### Series Configuration

Each series requires:
- **`type`**: `"bar"`, `"line"`, `"area"`, or `"scatter"`
- **`encode`**: Field references with `xRef` and `yRef`

Optional properties:
- **`name`**: Display name in legend
- **`color`**: Hex color code
- **`yAxisIndex`**: Which Y axis (0 or 1)
- **`stack`**: Stack group name
- **`smooth`**: Smooth curves for line/area
- **`areaStyle`**: Presence indicates area chart
- **`markLine`**: Reference line configuration

## Examples

### Bar Chart

```yaml
version: 1
name: "Sales by Partner"
slug: "sales-by-partner"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_partner_name"
  metrics:
    - "orders_total_sales"
  filters: {}
  sorts:
    - fieldId: "orders_total_sales"
      descending: true
  limit: 10

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "orders_partner_name"
      yField:
        - "orders_total_sales"
    eChartsConfig:
      series:
        - type: "bar"
          encode:
            xRef:
              field: "orders_partner_name"
            yRef:
              field: "orders_total_sales"
```

### Line Chart with Trend

```yaml
version: 1
name: "Monthly Revenue Trend"
slug: "monthly-revenue-trend"
spaceSlug: "finance"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_order_date_month"
  metrics:
    - "orders_total_revenue"
  filters: {}
  sorts:
    - fieldId: "orders_order_date_month"
      descending: false
  limit: 500

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "orders_order_date_month"
      yField:
        - "orders_total_revenue"
      showGridY: true
    eChartsConfig:
      xAxis:
        - name: "Month"
      yAxis:
        - name: "Revenue ($)"
      series:
        - type: "line"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_revenue"
          smooth: true
          showSymbol: true
```

### Stacked Area Chart

```yaml
version: 1
name: "Revenue by Category"
slug: "revenue-by-category"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_order_date_month"
    - "orders_product_category"
  metrics:
    - "orders_total_revenue"
  filters: {}
  sorts:
    - fieldId: "orders_order_date_month"
      descending: false
  limit: 500

pivotConfig:
  columns:
    - "orders_product_category"

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "orders_order_date_month"
      yField:
        - "orders_total_revenue"
    eChartsConfig:
      legend:
        show: true
      series:
        - type: "line"
          stack: "total"
          areaStyle: {}
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_revenue"
              pivotValues:
                - field: "orders_product_category"
                  value: "Electronics"
```

### Scatter Chart

```yaml
version: 1
name: "Order Value vs Profit"
slug: "order-value-vs-profit"
spaceSlug: "analytics"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_order_id"
  metrics:
    - "orders_basket_total"
    - "orders_profit"
  filters: {}
  sorts: []
  limit: 1000

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "orders_basket_total"
      yField:
        - "orders_profit"
    eChartsConfig:
      xAxis:
        - name: "Order Value ($)"
      yAxis:
        - name: "Profit ($)"
      series:
        - type: "scatter"
          encode:
            xRef:
              field: "orders_basket_total"
            yRef:
              field: "orders_profit"
```

### Dual Y-Axis Chart

```yaml
version: 1
name: "Revenue & Profit Margin"
slug: "revenue-profit-margin"
spaceSlug: "finance"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_order_date_month"
  metrics:
    - "orders_total_revenue"
  tableCalculations:
    - name: "profit_margin"
      displayName: "Profit Margin %"
      sql: "${orders.profit}/${orders.total_revenue} * 100"
  filters: {}
  sorts:
    - fieldId: "orders_order_date_month"
      descending: false
  limit: 500

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "orders_order_date_month"
      yField:
        - "orders_total_revenue"
        - "profit_margin"
    eChartsConfig:
      yAxis:
        - name: "Revenue ($)"
        - name: "Profit Margin (%)"
      series:
        - type: "bar"
          name: "Revenue"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_revenue"
          yAxisIndex: 0
        - type: "line"
          name: "Profit Margin"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "profit_margin"
          yAxisIndex: 1
          smooth: true
```

## Tips

1. **Choose the right chart type**:
   - Bar: Comparing discrete categories
   - Line: Showing trends over time
   - Area: Emphasizing cumulative totals or composition
   - Scatter: Exploring correlations between variables

2. **Stacking**: Use the same `stack` value for series you want stacked. Only bar and area charts support stacking.

3. **Dual Y-axis**: Use `yAxisIndex: 0` for left axis, `yAxisIndex: 1` for right axis.

4. **Horizontal bars**: Set `flipAxes: true` in layout.

5. **Pivot data**: Use `pivotValues` in `yRef` to create series from pivoted dimensions.

6. **Reference lines**: Add `markLine` to series for targets or thresholds.

7. **Grid spacing**: Use `grid.containLabel: true` to prevent label clipping.
