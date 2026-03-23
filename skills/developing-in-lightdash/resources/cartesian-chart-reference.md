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
contentType: chart
chartConfig:
  type: "cartesian"
  config:
    eChartsConfig:
      series:
        - type: "bar"
          encode:
            xRef:
              field: "my_explore_category"
            yRef:
              field: "my_explore_total_sales"
    layout:
      xField: "my_explore_category"
      yField:
        - "my_explore_total_sales"
metricQuery:
  exploreName: "my_explore"
  dimensions:
    - "my_explore_category"
  filters: {}
  limit: 500
  metrics:
    - "my_explore_total_sales"
  sorts: []
name: "My Cartesian Chart"
slug: "my-cartesian-chart"
spaceSlug: "analytics"
tableName: "my_explore"
version: 1
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
contentType: chart
chartConfig:
  type: "cartesian"
  config:
    eChartsConfig:
      series:
        - type: "bar"
          encode:
            xRef:
              field: "orders_partner_name"
            yRef:
              field: "orders_total_sales"
    layout:
      xField: "orders_partner_name"
      yField:
        - "orders_total_sales"
metricQuery:
  exploreName: "orders"
  dimensions:
    - "orders_partner_name"
  filters: {}
  limit: 10
  metrics:
    - "orders_total_sales"
  sorts:
    - fieldId: "orders_total_sales"
      descending: true
name: "Sales by Partner"
slug: "sales-by-partner"
spaceSlug: "sales"
tableName: "orders"
version: 1
```

### Line Chart with Trend

```yaml
contentType: chart
chartConfig:
  type: "cartesian"
  config:
    eChartsConfig:
      series:
        - type: "line"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_revenue"
          showSymbol: true
          smooth: true
      xAxis:
        - name: "Month"
      yAxis:
        - name: "Revenue ($)"
    layout:
      showGridY: true
      xField: "orders_order_date_month"
      yField:
        - "orders_total_revenue"
metricQuery:
  exploreName: "orders"
  dimensions:
    - "orders_order_date_month"
  filters: {}
  limit: 500
  metrics:
    - "orders_total_revenue"
  sorts:
    - fieldId: "orders_order_date_month"
      descending: false
name: "Monthly Revenue Trend"
slug: "monthly-revenue-trend"
spaceSlug: "finance"
tableName: "orders"
version: 1
```

### Stacked Area Chart

```yaml
contentType: chart
chartConfig:
  type: "cartesian"
  config:
    eChartsConfig:
      legend:
        show: true
      series:
        - type: "line"
          areaStyle: {}
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_revenue"
              pivotValues:
                - field: "orders_product_category"
                  value: "Electronics"
          stack: "total"
    layout:
      xField: "orders_order_date_month"
      yField:
        - "orders_total_revenue"
metricQuery:
  exploreName: "orders"
  dimensions:
    - "orders_order_date_month"
    - "orders_product_category"
  filters: {}
  limit: 500
  metrics:
    - "orders_total_revenue"
  sorts:
    - fieldId: "orders_order_date_month"
      descending: false
name: "Revenue by Category"
pivotConfig:
  columns:
    - "orders_product_category"
slug: "revenue-by-category"
spaceSlug: "sales"
tableName: "orders"
version: 1
```

### Scatter Chart

```yaml
contentType: chart
chartConfig:
  type: "cartesian"
  config:
    eChartsConfig:
      series:
        - type: "scatter"
          encode:
            xRef:
              field: "orders_basket_total"
            yRef:
              field: "orders_profit"
      xAxis:
        - name: "Order Value ($)"
      yAxis:
        - name: "Profit ($)"
    layout:
      xField: "orders_basket_total"
      yField:
        - "orders_profit"
metricQuery:
  exploreName: "orders"
  dimensions:
    - "orders_order_id"
  filters: {}
  limit: 1000
  metrics:
    - "orders_basket_total"
    - "orders_profit"
  sorts: []
name: "Order Value vs Profit"
slug: "order-value-vs-profit"
spaceSlug: "analytics"
tableName: "orders"
version: 1
```

### Dual Y-Axis Chart

```yaml
contentType: chart
chartConfig:
  type: "cartesian"
  config:
    eChartsConfig:
      series:
        - type: "bar"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_revenue"
          name: "Revenue"
          yAxisIndex: 0
        - type: "line"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "profit_margin"
          name: "Profit Margin"
          smooth: true
          yAxisIndex: 1
      yAxis:
        - name: "Revenue ($)"
        - name: "Profit Margin (%)"
    layout:
      xField: "orders_order_date_month"
      yField:
        - "orders_total_revenue"
        - "profit_margin"
metricQuery:
  exploreName: "orders"
  dimensions:
    - "orders_order_date_month"
  filters: {}
  limit: 500
  metrics:
    - "orders_total_revenue"
  sorts:
    - fieldId: "orders_order_date_month"
      descending: false
  tableCalculations:
    - name: "profit_margin"
      displayName: "Profit Margin %"
      sql: "${orders.profit}/${orders.total_revenue} * 100"
name: "Revenue & Profit Margin"
slug: "revenue-profit-margin"
spaceSlug: "finance"
tableName: "orders"
version: 1
```

## Tips

1. **Match `metricQuery.dimensions` to chart config — no extras.** Every dimension in `metricQuery.dimensions` must appear in exactly one of: `layout.xField`, `layout.yField`, or `pivotConfig.columns`. An unused dimension silently adds a GROUP BY clause to the SQL, inflating row counts and producing incorrect metric values. Lightdash flags this as a "Results may be incorrect" warning.

   ```yaml
   # BAD — orders_status is queried but not used in the chart
   metricQuery:
     dimensions:
       - orders_order_date_month
       - orders_status            # not on any axis or pivot!
     metrics:
       - orders_total_revenue
   chartConfig:
     type: cartesian
     config:
       layout:
         xField: orders_order_date_month
         yField:
           - orders_total_revenue

   # GOOD — every dimension has a job
   metricQuery:
     dimensions:
       - orders_order_date_month
       - orders_status
     metrics:
       - orders_total_revenue
   pivotConfig:
     columns:
       - orders_status          # used as pivot
   chartConfig:
     type: cartesian
     config:
       layout:
         xField: orders_order_date_month
         yField:
           - orders_total_revenue

   # ALSO GOOD — just remove the dimension you don't need
   metricQuery:
     dimensions:
       - orders_order_date_month
     metrics:
       - orders_total_revenue
   ```

2. **Choose the right chart type**:
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
