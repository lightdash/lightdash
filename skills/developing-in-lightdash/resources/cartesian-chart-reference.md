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

## Configuration Options

### `layout` (object)

Core layout configuration for chart axes and orientation.

- **`xField`** (string): Field ID to use for the X axis. Typically a dimension.

- **`yField`** (array of strings): Field IDs to use for the Y axis. Can include metrics, dimensions, or table calculations.

- **`flipAxes`** (boolean): Swap X and Y axes to create horizontal bar charts. Default: `false`.

- **`showGridX`** (boolean): Show vertical grid lines. Default varies by chart type.

- **`showGridY`** (boolean): Show horizontal grid lines. Default varies by chart type.

- **`showXAxis`** (boolean): Show the X axis. Default: `true`.

- **`showYAxis`** (boolean): Show the Y axis. Default: `true`.

- **`stack`** (boolean | string): Stack series together. Use `true` for default stacking, or a string for a specific stack group name.

### `eChartsConfig` (object)

ECharts-specific configuration for advanced customization.

#### `series` (array of objects, required)

Array of series configurations. Each series represents a visualization layer. See [Series Configuration](#series-configuration) below.

#### `xAxis` (array of objects)

X axis configuration array. See [X Axis Configuration](#x-axis-configuration).

#### `yAxis` (array of objects)

Y axis configuration array. See [Y Axis Configuration](#y-axis-configuration).

#### `legend` (object)

Legend configuration. See [Legend Configuration](#legend-configuration).

#### `grid` (object)

Grid (chart area) configuration. See [Grid Configuration](#grid-configuration).

#### `tooltip` (string)

Tooltip formatter template string.

#### `tooltipSort` (enum)

How to sort tooltip items. Options:
- `"default"`: Default sorting
- `"alphabetical"`: Sort alphabetically by series name
- `"value_ascending"`: Sort by value (lowest to highest)
- `"value_descending"`: Sort by value (highest to lowest)

#### `showAxisTicks` (boolean)

Show tick marks on axes.

#### `axisLabelFontSize` (number)

Font size for axis labels in pixels.

#### `axisTitleFontSize` (number)

Font size for axis titles in pixels.

### `metadata` (object)

Metadata for series configuration, keyed by field ID.

```yaml
metadata:
  my_field_id:
    color: "#FF6B6B"
```

## Series Configuration

Each series in the `series` array represents a data visualization layer.

### Required Properties

- **`type`** (enum, required): Series visualization type. Options: `"bar"`, `"line"`, `"area"`, `"scatter"`.

- **`encode`** (object, required): Field references for this series.
  - **`xRef`** (object, required): X axis field reference. See [Pivot Reference](#pivot-reference).
  - **`yRef`** (object, required): Y axis field reference. See [Pivot Reference](#pivot-reference).

### Optional Properties

- **`name`** (string): Display name for the series in the legend.

- **`color`** (string): Color for the series as a hex code (e.g., `"#FF6B6B"`).

- **`yAxisIndex`** (number): Index of Y axis to use (0 or 1 for dual Y-axis charts). Default: `0`.

- **`hidden`** (boolean): Hide this series from the chart. Default: `false`.

- **`stack`** (string): Stack group name. Series with the same stack name are stacked together.

- **`stackLabel`** (object): Stack total label configuration.
  - **`show`** (boolean): Show stack total labels above stacked bars/areas.

- **`label`** (object): Data label configuration.
  - **`show`** (boolean): Show data labels on points.
  - **`position`** (enum): Label position. Options: `"left"`, `"top"`, `"right"`, `"bottom"`, `"inside"`.
  - **`showOverlappingLabels`** (boolean): Show labels even when they overlap.

- **`areaStyle`** (object): Area fill style. Presence of this object (even empty `{}`) indicates an area chart.

- **`showSymbol`** (boolean): Show symbols/markers on data points (for line/area charts).

- **`smooth`** (boolean): Use smooth curves for line/area charts. Default: `false`.

- **`markLine`** (object): Reference line configuration. See [Mark Line Configuration](#mark-line-configuration).

### Pivot Reference

References a field, optionally with pivot values for pivoted data.

```yaml
encode:
  xRef:
    field: "dimension_field_id"
  yRef:
    field: "metric_field_id"
    pivotValues:
      - field: "pivot_dimension_id"
        value: "Category A"
```

- **`field`** (string, required): Field ID being referenced.

- **`pivotValues`** (array): Array of pivot value objects for pivoted data.
  - **`field`** (string, required): Pivot field ID.
  - **`value`** (any, required): Pivot value to filter for this series.

## X Axis Configuration

Extends basic axis configuration with X-axis-specific options.

```yaml
xAxis:
  - name: "Month"
    rotate: 45
    sortType: "default"
    enableDataZoom: false
```

- **`name`** (string): Axis title.

- **`min`** (string): Minimum value (or `"dataMin"` for auto).

- **`max`** (string): Maximum value (or `"dataMax"` for auto).

- **`minOffset`** (string): Offset from minimum value.

- **`maxOffset`** (string): Offset from maximum value.

- **`inverse`** (boolean): Reverse the axis direction.

- **`rotate`** (number): Rotation angle for axis labels in degrees (e.g., `45` for diagonal labels).

- **`sortType`** (enum): How to sort the X axis. Options:
  - `"default"`: Default sorting (as data appears)
  - `"category"`: Sort alphabetically by category
  - `"bar_totals"`: Sort by bar totals (descending)

- **`enableDataZoom`** (boolean): Enable data zoom slider for this axis. Allows users to pan/zoom the X axis.

## Y Axis Configuration

Basic axis configuration for Y axes.

```yaml
yAxis:
  - name: "Revenue ($)"
    min: "0"
    max: "dataMax"
```

- **`name`** (string): Axis title.

- **`min`** (string): Minimum value (or `"dataMin"` for auto).

- **`max`** (string): Maximum value (or `"dataMax"` for auto).

- **`minOffset`** (string): Offset from minimum value.

- **`maxOffset`** (string): Offset from maximum value.

- **`inverse`** (boolean): Reverse the axis direction.

- **`rotate`** (number): Rotation angle for axis labels in degrees.

## Legend Configuration

Controls the display and positioning of the chart legend.

```yaml
legend:
  show: true
  type: "scroll"
  orient: "horizontal"
  top: "10px"
  left: "center"
```

- **`show`** (boolean): Show the legend. Default: `true`.

- **`type`** (enum): Legend type. Options:
  - `"plain"`: Standard legend
  - `"scroll"`: Scrollable legend (for many series)

- **`orient`** (enum): Legend orientation. Options: `"horizontal"`, `"vertical"`.

- **`top`** (string): Top position (e.g., `"10px"`, `"10%"`).

- **`right`** (string): Right position.

- **`bottom`** (string): Bottom position.

- **`left`** (string): Left position.

- **`width`** (string): Legend width.

- **`height`** (string): Legend height.

- **`align`** (enum): Legend alignment. Options: `"auto"`, `"left"`, `"right"`.

- **`icon`** (enum): Legend icon shape. Options: `"circle"`, `"rect"`, `"roundRect"`, `"triangle"`, `"diamond"`, `"pin"`, `"arrow"`, `"none"`.

## Grid Configuration

Controls the chart area padding and positioning.

```yaml
grid:
  containLabel: true
  top: "60px"
  right: "40px"
  bottom: "60px"
  left: "40px"
```

- **`containLabel`** (boolean): Whether the grid area contains axis labels. Set to `true` to prevent label clipping.

- **`top`** (string): Top padding.

- **`right`** (string): Right padding.

- **`bottom`** (string): Bottom padding.

- **`left`** (string): Left padding.

- **`width`** (string): Grid width.

- **`height`** (string): Grid height.

## Mark Line Configuration

Reference lines to highlight thresholds, targets, or averages.

```yaml
markLine:
  data:
    - uuid: "unique-id-1"
      name: "Target"
      yAxis: "1000"
      lineStyle:
        color: "#FF0000"
      label:
        formatter: "Target: {c}"
        position: "end"
  symbol: "none"
  lineStyle:
    type: "dashed"
    color: "#000000"
    width: 2
```

### `markLine` Properties

- **`data`** (array): Array of reference line data points.
  - **`uuid`** (string, required): Unique identifier for this mark line.
  - **`name`** (string): Name of the reference line.
  - **`yAxis`** (string): Y axis value for horizontal line.
  - **`xAxis`** (string): X axis value for vertical line.
  - **`value`** (string): Value to display.
  - **`type`** (string): Point type (e.g., `"average"`).
  - **`dynamicValue`** (enum): Dynamic value type. Options: `"average"`.
  - **`lineStyle`** (object):
    - **`color`** (string): Line color.
  - **`label`** (object):
    - **`formatter`** (string): Label text formatter.
    - **`position`** (enum): Label position. Options: `"start"`, `"middle"`, `"end"`.

- **`symbol`** (string): Symbol at line endpoints (e.g., `"none"`, `"circle"`).

- **`lineStyle`** (object): Default line style for all mark lines.
  - **`color`** (string): Line color.
  - **`width`** (number): Line width in pixels.
  - **`type`** (string): Line style (e.g., `"solid"`, `"dashed"`).

- **`label`** (object): Default label configuration.
  - **`formatter`** (string): Label text formatter.

## Examples

### Example 1: Simple Bar Chart

Basic vertical bar chart comparing values across categories:

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
          yAxisIndex: 0
```

### Example 2: Line Chart with Trend

Line chart showing a trend over time with smooth curves:

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
          yAxisIndex: 0
```

### Example 3: Stacked Area Chart

Area chart with multiple series stacked together:

```yaml
version: 1
name: "Revenue by Product Category"
slug: "revenue-by-product-category"
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
      xAxis:
        - name: "Month"
      yAxis:
        - name: "Revenue ($)"
      legend:
        show: true
        type: "scroll"
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
          yAxisIndex: 0
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
                  value: "Clothing"
          yAxisIndex: 0
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
                  value: "Home Goods"
          yAxisIndex: 0
```

### Example 4: Stacked Bar Chart with Stack Labels

Stacked bar chart showing monthly revenue by partner with total labels:

```yaml
version: 1
name: "Monthly Revenue by Partner"
slug: "monthly-revenue-by-partner"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_order_date_month"
    - "orders_partner_name"
  metrics:
    - "orders_total_revenue"
  filters: {}
  sorts:
    - fieldId: "orders_order_date_month"
      descending: false
  limit: 500

pivotConfig:
  columns:
    - "orders_partner_name"

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "orders_order_date_month"
      yField:
        - "orders_total_revenue"
    eChartsConfig:
      xAxis:
        - name: "Month"
      yAxis:
        - name: "Total Revenue ($)"
      legend:
        show: true
      grid:
        containLabel: true
      series:
        - type: "bar"
          stack: "revenue_stack"
          stackLabel:
            show: true
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_revenue"
              pivotValues:
                - field: "orders_partner_name"
                  value: "Partner A"
          yAxisIndex: 0
        - type: "bar"
          stack: "revenue_stack"
          stackLabel:
            show: true
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_revenue"
              pivotValues:
                - field: "orders_partner_name"
                  value: "Partner B"
          yAxisIndex: 0
```

### Example 5: Dual Y-Axis Chart (Bar + Line)

Combine bars and lines with different Y-axis scales:

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
      xAxis:
        - name: "Month"
      yAxis:
        - name: "Revenue ($)"
          type: "value"
        - name: "Profit Margin (%)"
          type: "value"
      legend:
        show: true
      series:
        - type: "bar"
          name: "Revenue"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_revenue"
          yAxisIndex: 0
          color: "#3B82F6"
        - type: "line"
          name: "Profit Margin"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "profit_margin"
          yAxisIndex: 1
          color: "#10B981"
          smooth: true
          showSymbol: true
          label:
            show: true
            position: "top"
```

### Example 6: Scatter Chart

Scatter chart showing correlation between two metrics:

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
          yAxisIndex: 0
```

### Example 7: Horizontal Bar Chart

Horizontal bar chart using `flipAxes`:

```yaml
version: 1
name: "Top 10 Products by Sales"
slug: "top-10-products"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_product_name"
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
      xField: "orders_product_name"
      yField:
        - "orders_total_sales"
      flipAxes: true
    eChartsConfig:
      xAxis:
        - name: "Product"
      yAxis:
        - name: "Sales ($)"
      series:
        - type: "bar"
          encode:
            xRef:
              field: "orders_product_name"
            yRef:
              field: "orders_total_sales"
          yAxisIndex: 0
```

### Example 8: Chart with Reference Lines

Bar chart with target threshold reference line:

```yaml
version: 1
name: "Weekly Sales with Target"
slug: "weekly-sales-target"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_order_date_week"
  metrics:
    - "orders_total_sales"
  filters: {}
  sorts:
    - fieldId: "orders_order_date_week"
      descending: true
  limit: 52

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "orders_order_date_week"
      yField:
        - "orders_total_sales"
    eChartsConfig:
      xAxis:
        - name: "Week"
      yAxis:
        - name: "Sales ($)"
      series:
        - type: "bar"
          encode:
            xRef:
              field: "orders_order_date_week"
            yRef:
              field: "orders_total_sales"
          yAxisIndex: 0
          markLine:
            data:
              - uuid: "target-line"
                name: "Weekly Target"
                yAxis: "50000"
                lineStyle:
                  color: "#DC2626"
                label:
                  formatter: "Target: $50k"
                  position: "end"
            symbol: "none"
            lineStyle:
              type: "dashed"
              color: "#DC2626"
              width: 2
```

### Example 9: Mixed Chart Types

Combine multiple series types in one chart:

```yaml
version: 1
name: "Sales Performance Overview"
slug: "sales-performance-overview"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_order_date_month"
  metrics:
    - "orders_total_sales"
    - "orders_total_profit"
    - "orders_order_count"
  filters: {}
  sorts:
    - fieldId: "orders_order_date_month"
      descending: false
  limit: 12

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "orders_order_date_month"
      yField:
        - "orders_total_sales"
        - "orders_total_profit"
        - "orders_order_count"
    eChartsConfig:
      xAxis:
        - name: "Month"
      yAxis:
        - name: "Sales & Profit ($)"
          type: "value"
        - name: "Order Count"
          type: "value"
      legend:
        show: true
      series:
        - type: "bar"
          name: "Sales"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_sales"
          yAxisIndex: 0
          color: "#3B82F6"
        - type: "bar"
          name: "Profit"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_total_profit"
          yAxisIndex: 0
          color: "#10B981"
        - type: "line"
          name: "Orders"
          encode:
            xRef:
              field: "orders_order_date_month"
            yRef:
              field: "orders_order_count"
          yAxisIndex: 1
          color: "#F59E0B"
          smooth: true
          showSymbol: true
```

### Example 10: Advanced Styling and Customization

Chart with custom fonts, rotated labels, and custom legend positioning:

```yaml
version: 1
name: "Quarterly Revenue Analysis"
slug: "quarterly-revenue-analysis"
spaceSlug: "finance"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_order_date_quarter"
  metrics:
    - "orders_total_revenue"
  filters: {}
  sorts:
    - fieldId: "orders_order_date_quarter"
      descending: false
  limit: 500

chartConfig:
  type: "cartesian"
  config:
    layout:
      xField: "orders_order_date_quarter"
      yField:
        - "orders_total_revenue"
      showGridY: true
    eChartsConfig:
      xAxis:
        - name: "Quarter"
          rotate: 0
          sortType: "default"
      yAxis:
        - name: "Revenue ($)"
          min: "0"
      legend:
        show: true
        type: "plain"
        orient: "horizontal"
        top: "10px"
        left: "center"
      grid:
        containLabel: true
        top: "60px"
        right: "40px"
        bottom: "60px"
        left: "60px"
      series:
        - type: "bar"
          encode:
            xRef:
              field: "orders_order_date_quarter"
            yRef:
              field: "orders_total_revenue"
          yAxisIndex: 0
          label:
            show: true
            position: "top"
          color: "#6366F1"
      axisLabelFontSize: 12
      axisTitleFontSize: 14
      tooltipSort: "value_descending"
      showAxisTicks: true
```

## Common Patterns

### Time Series Line Chart

For tracking metrics over time:

```yaml
layout:
  xField: "date_dimension"
  yField:
    - "metric_field"
  showGridY: true
eChartsConfig:
  series:
    - type: "line"
      smooth: true
      showSymbol: false
      encode:
        xRef:
          field: "date_dimension"
        yRef:
          field: "metric_field"
```

### Comparison Bar Chart

For comparing categories side-by-side:

```yaml
layout:
  xField: "category_dimension"
  yField:
    - "metric_1"
    - "metric_2"
eChartsConfig:
  series:
    - type: "bar"
      encode:
        xRef:
          field: "category_dimension"
        yRef:
          field: "metric_1"
    - type: "bar"
      encode:
        xRef:
          field: "category_dimension"
        yRef:
          field: "metric_2"
```

### Stacked Percentage Area Chart

For showing composition over time:

```yaml
layout:
  xField: "date_dimension"
  yField:
    - "metric_field"
eChartsConfig:
  series:
    - type: "line"
      stack: "total"
      areaStyle: {}
      encode:
        xRef:
          field: "date_dimension"
        yRef:
          field: "metric_field"
          pivotValues:
            - field: "category_dimension"
              value: "Category A"
```

## Tips

1. **Choose the right chart type**:
   - Bar: Comparing discrete categories
   - Line: Showing trends over continuous data (especially time)
   - Area: Emphasizing cumulative totals or stacked composition
   - Scatter: Exploring correlations between two continuous variables

2. **Stacking considerations**:
   - Use the same `stack` value for all series you want to stack
   - Only bar and area charts support stacking
   - Stacked charts work best when showing parts of a whole

3. **Dual Y-axis guidelines**:
   - Use when comparing metrics with vastly different scales
   - Set `yAxisIndex: 0` for left axis, `yAxisIndex: 1` for right axis
   - Clearly label both axes with units
   - Limit to 2 Y-axes for readability

4. **Performance optimization**:
   - Limit data points for line/scatter charts (use `limit` in `metricQuery`)
   - For many series, use `legend.type: "scroll"`
   - Disable `showSymbol` on dense line charts for better performance

5. **Accessibility**:
   - Use high-contrast colors for series
   - Enable axis labels and titles
   - Consider color-blind-friendly palettes
   - Add descriptive series names

6. **Pivot data handling**:
   - When pivoting dimensions, each pivot value becomes a separate series
   - Use `pivotValues` in `yRef` to specify which pivot value each series represents
   - Pivot columns are defined in `pivotConfig.columns`

7. **Reference lines**:
   - Use for targets, thresholds, or averages
   - Set `dynamicValue: "average"` for auto-calculated averages
   - Position labels carefully to avoid overlapping data

8. **Grid and spacing**:
   - Use `grid.containLabel: true` to prevent axis labels from being cut off
   - Adjust grid padding for long axis labels or titles
   - Increase `bottom` padding if X-axis labels are rotated

9. **Sorting data**:
   - Use `metricQuery.sorts` to control data order
   - Use `xAxis.sortType` for additional X-axis sorting options
   - For bar charts showing rankings, sort by the metric in descending order

10. **Label positioning**:
    - Use `label.show: true` and `label.position` to show data values
    - For stacked bars, use `stackLabel.show: true` for totals
    - Be cautious with labels on dense data (may overlap)
